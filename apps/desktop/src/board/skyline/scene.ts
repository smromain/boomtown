import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFSoftShadowMap,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from 'three';
import type { TileId } from '@boomtown/engine';
import { STOREY, buildingKey, type Building, type SkylinePlan } from './skylineModel.js';
import type { SkylineLighting, SkylineTrouble } from '../boardPrefs.js';

/**
 * Skyline's painter: plain three.js, imperative, mounted from one effect (#70).
 *
 * The scene is small — a hundred-odd lots and at most seven towers — and it
 * changes once per command, so it renders **on demand**: on a change, while an
 * animation or a drag is running, and on resize. At rest nothing is drawn and
 * the table idles at zero GPU.
 *
 * The camera is orthographic, which is the whole trick behind the DOM grid laid
 * over it: an orthographic projection maps the ground plane to the screen by a
 * 2D affine transform, so after every frame `onFrame` hands the caller one CSS
 * `matrix()` that puts every cell of the ordinary board grid exactly on its
 * lot. Clicks, focus and the accessible tree come from that real DOM, and the
 * canvas never needs to know where the pointer is.
 */

export interface SceneOptions {
  /** The positioned element that holds the canvas and the grid; drags are read from it. */
  readonly stage: HTMLElement;
  /** Where the canvas goes. */
  readonly host: HTMLElement;
  readonly lighting: SkylineLighting;
  readonly reducedMotion: boolean;
  /** Skip the software-renderer and slow-frame checks (`?forceSkyline=1`). */
  readonly forced: boolean;
  /** Side of one overlay grid cell, in CSS px, before the transform. */
  readonly cellPx: number;
  /** A CSS transform that pins the overlay grid onto the ground, after every frame. */
  readonly onFrame: (transform: string) => void;
  /** Skyline cannot carry on here; the caller drops to Board View. */
  readonly onTrouble: (reason: SkylineTrouble) => void;
}

export interface SkylineScene {
  /** Draw `plan`. Changes rise, sink and recolour outward from `origin` unless `animate` is false. */
  show(plan: SkylinePlan, origin: TileId | null, animate: boolean): void;
  setLighting(lighting: SkylineLighting): void;
  setHighlight(hover: TileId | null, focus: TileId | null): void;
  /** Swing to the next quarter from wherever the camera is, left (-1) or right (1). */
  turn(direction: -1 | 1): void;
  resetView(): void;
  dispose(): void;
}

/** The view every game opens at. */
const BASE_AZIMUTH = 0.38;
const BASE_ELEVATION = 0.66;
const MIN_ELEVATION = 0.3;
const MAX_ELEVATION = 1.4;
const QUARTER = Math.PI / 2;
/** A press that moves less than this is a click on the cell under it, not a drag. */
const DRAG_SLOP_PX = 5;
/** Median frame time past which an animation counts as too slow to keep. */
const SLOW_FRAME_MS = 50;
const SLOW_SAMPLE = 12;
/** Ground texture resolution, px per lot. */
const LOT_PX = 96;
const MARGIN = 0.3;

const PALETTE = {
  day: {
    background: '#efe6d9',
    plate: '#d9ccb9',
    ground: '#e7dccb',
    lot: '#f8f2e8',
    text: '#8a7f72',
    uninc: '#c9c2b7',
    corpMix: 0.7,
    playable: '#fff3cf',
    ring: '#c98d12',
    dead: '#f1e0da',
    cross: '#b3412f',
    highlight: '#1c1917',
    hemi: { sky: '#fff8ee', ground: '#8a7a66', intensity: 1.9 },
    sun: { color: '#ffffff', intensity: 2.2 },
    windows: 0,
  },
  night: {
    background: '#10141f',
    plate: '#1a2030',
    ground: '#222a3b',
    lot: '#34405a',
    text: '#aab3c8',
    uninc: '#5a606c',
    corpMix: 0.55,
    playable: '#4a4128',
    ring: '#e2a92a',
    dead: '#4a2c2c',
    cross: '#e0664d',
    highlight: '#f1ebe2',
    hemi: { sky: '#9fb0e0', ground: '#2a2f3c', intensity: 1.3 },
    sun: { color: '#b3c4ff', intensity: 1.4 },
    windows: 0.95,
  },
} as const;

/** A CPU rasteriser posing as a GPU: SwiftShader, llvmpipe, Microsoft's basic renderer. */
function isSoftwareRenderer(renderer: WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

/** Construct the scene, or report why this machine cannot. */
export function createSkylineScene(options: SceneOptions): SkylineScene | { trouble: SkylineTrouble } {
  const { stage, host, reducedMotion, forced, cellPx, onFrame, onTrouble } = options;
  let lighting = options.lighting;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  let renderer: WebGLRenderer;
  try {
    // `failIfMajorPerformanceCaveat` refuses a software renderer outright: a
    // board that draws at four frames a second is worse than the flat one.
    renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'low-power',
      failIfMajorPerformanceCaveat: !forced,
    });
  } catch {
    return { trouble: 'no-webgl' };
  }
  // `failIfMajorPerformanceCaveat` is a hint some browsers ignore — headless
  // Chromium hands out a SwiftShader context with it set — so ask the context
  // what it actually is, too.
  if (!forced && isSoftwareRenderer(renderer)) {
    renderer.dispose();
    renderer.forceContextLoss();
    return { trouble: 'software' };
  }
  host.appendChild(canvas);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const hemi = new HemisphereLight();
  const sun = new DirectionalLight();
  sun.position.set(-6, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
  sun.shadow.bias = -0.0008;
  scene.add(hemi, sun);

  // ---------------------------------------------------------------- the plate
  let cols = 0;
  let rows = 0;
  let plan: SkylinePlan | null = null;
  const plateMat = new MeshStandardMaterial({ roughness: 0.9 });
  const groundCanvas = document.createElement('canvas');
  const gctx = groundCanvas.getContext('2d')!;
  const groundTex = new CanvasTexture(groundCanvas);
  groundTex.colorSpace = SRGBColorSpace;
  groundTex.anisotropy = 8;
  const groundMat = new MeshStandardMaterial({ map: groundTex, roughness: 0.95 });
  let plate: Mesh | null = null;
  let ground: Mesh | null = null;

  function sizeBoard(nextCols: number, nextRows: number): void {
    if (nextCols === cols && nextRows === rows) return;
    cols = nextCols;
    rows = nextRows;
    for (const mesh of [plate, ground]) {
      if (!mesh) continue;
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
    plate = new Mesh(new BoxGeometry(cols + 2 * MARGIN, 0.35, rows + 2 * MARGIN), plateMat);
    plate.position.y = -0.18;
    plate.receiveShadow = true;
    groundCanvas.width = (cols + 2 * MARGIN) * LOT_PX;
    groundCanvas.height = (rows + 2 * MARGIN) * LOT_PX;
    ground = new Mesh(new PlaneGeometry(cols + 2 * MARGIN, rows + 2 * MARGIN), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.001;
    ground.receiveShadow = true;
    scene.add(plate, ground);
  }

  // --------------------------------------------------------------- facades
  // A white facade with window panes, multiplied by the industry colour; its
  // emissive twin lights some of those panes at night.
  const facadeSource = (() => {
    const make = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      return [c, c.getContext('2d')!] as const;
    };
    const [wall, x] = make();
    const [lit, y] = make();
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 64, 64);
    y.fillStyle = '#000000';
    y.fillRect(0, 0, 64, 64);
    [
      [8, 14],
      [36, 14],
    ].forEach(([px, py], i) => {
      x.fillStyle = '#5b6470';
      x.fillRect(px!, py!, 20, 26);
      x.fillStyle = 'rgba(255,255,255,0.35)';
      x.fillRect(px! + 2, py! + 2, 6, 22);
      y.fillStyle = i === 0 ? '#ffd98a' : '#b98d45';
      y.fillRect(px!, py!, 20, 26);
    });
    x.fillStyle = 'rgba(0,0,0,0.18)';
    x.fillRect(0, 60, 64, 4);
    return { wall, lit };
  })();
  const facades = new Map<string, { map: CanvasTexture; emissiveMap: CanvasTexture }>();
  function facade(across: number, up: number) {
    const key = `${across}x${up}`;
    let found = facades.get(key);
    if (!found) {
      const map = new CanvasTexture(facadeSource.wall);
      const emissiveMap = new CanvasTexture(facadeSource.lit);
      for (const t of [map, emissiveMap]) {
        t.colorSpace = SRGBColorSpace;
        t.wrapS = t.wrapT = RepeatWrapping;
        t.repeat.set(across, up);
      }
      found = { map, emissiveMap };
      facades.set(key, found);
    }
    return found;
  }

  const litMaterials = new Set<MeshStandardMaterial>();
  function facadeMaterial(color: string, across: number, up: number): MeshStandardMaterial {
    const f = facade(across, up);
    const mat = new MeshStandardMaterial({
      color,
      roughness: 0.62,
      metalness: 0.05,
      map: f.map,
      emissiveMap: f.emissiveMap,
      emissive: 0xffd98a,
      emissiveIntensity: PALETTE[lighting].windows,
    });
    litMaterials.add(mat);
    return mat;
  }
  const plain = (color: string, extra: Partial<ConstructorParameters<typeof MeshStandardMaterial>[0]> = {}) =>
    new MeshStandardMaterial({ color, roughness: 0.7, ...extra });
  /** Facades on the four walls only; the roof is a plain slab of the same colour. */
  const walls = (wall: Material, roof: Material) => [wall, wall, roof, roof, wall, wall];
  function box(w: number, h: number, d: number, material: Material | Material[], y: number): Mesh {
    const mesh = new Mesh(new BoxGeometry(w, h, d), material);
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  const lotCentre = (tile: TileId) => {
    const lot = plan?.lots.find((l) => l.tile === tile);
    return { x: (lot?.col ?? 0) - cols / 2 + 0.5, z: (lot?.row ?? 0) - rows / 2 + 0.5 };
  };

  interface Built {
    readonly key: string;
    readonly building: Building;
    readonly group: Group;
    /** Materials that take a new colour in a takeover. */
    readonly recolour: MeshStandardMaterial[];
    readonly height: number;
  }

  function make(building: Building, tile: TileId): Built {
    const group = new Group();
    const { x, z } = lotCentre(tile);
    group.position.set(x, 0, z);
    const recolour: MeshStandardMaterial[] = [];
    let height = 0.3;
    switch (building.type) {
      case 'block': {
        height = building.height;
        const wall = facadeMaterial(building.color, 1, Math.max(1, Math.round(height / STOREY)));
        const roof = plain(building.color);
        group.add(box(0.78, height, 0.78, walls(wall, roof), height / 2));
        recolour.push(wall, roof);
        break;
      }
      case 'tower': {
        height = building.storeys * STOREY;
        group.add(box(0.82, height, 0.82, walls(facadeMaterial(building.color, 2, building.storeys), plain(building.color)), height / 2));
        building.eaten.forEach((colour, i) => group.add(box(0.88, 0.075, 0.88, plain(colour), 0.13 + i * 0.12)));
        group.add(box(0.86, 0.06, 0.86, plain(building.ink === '#FFFFFF' ? '#2a2622' : '#f3ede4'), height + 0.03));
        if (building.safe) {
          const gold = plain('#e2b23a', { emissive: 0xe2a92a, emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.4 });
          group.add(box(0.46, 0.26, 0.46, gold, height + 0.19));
          const antenna = new Mesh(new CylinderGeometry(0.018, 0.028, 0.9, 8), plain('#3a352f'));
          antenna.position.y = height + 0.77;
          antenna.castShadow = true;
          group.add(antenna);
        }
        break;
      }
      case 'pad': {
        group.add(box(0.8, 0.1, 0.8, plain('#b2aba1'), 0.05));
        group.add(box(0.8, 0.2, 0.05, plain('#e2b23a'), 0.2).translateZ(-0.37));
        group.add(box(0.05, 0.2, 0.74, plain('#e2b23a'), 0.2).translateX(-0.37));
        break;
      }
      case 'marker': {
        // Above every rooftop, so a tower in front can never hide where you may play.
        const gold = plain('#e2a92a', { emissive: 0xe2a92a, emissiveIntensity: 0.6 });
        const cone = new Mesh(new ConeGeometry(0.2, 0.46, 20), gold);
        cone.rotation.x = Math.PI;
        cone.position.y = 5.0;
        const stem = new Mesh(
          new CylinderGeometry(0.012, 0.012, 4.7, 6),
          new MeshBasicMaterial({ color: 0xe2a92a, transparent: true, opacity: 0.45 }),
        );
        stem.position.y = 2.4;
        group.add(cone, stem);
        height = 1;
        break;
      }
    }
    scene.add(group);
    return { key: buildingKey(building), building, group, recolour, height };
  }

  function dispose3d(object: Object3D): void {
    scene.remove(object);
    object.traverse((node) => {
      const mesh = node as Mesh;
      mesh.geometry?.dispose();
      for (const material of ([] as Material[]).concat(mesh.material ?? [])) {
        litMaterials.delete(material as MeshStandardMaterial);
        material.dispose();
      }
    });
  }

  // ------------------------------------------------- tweens, drawn on demand
  interface Tween {
    readonly start: number;
    readonly duration: number;
    readonly step: (p: number) => void;
    readonly done?: () => void;
    readonly ease: (p: number) => number;
  }
  const tweens: Tween[] = [];
  let raf = 0;
  let lastFrame = 0;
  const frameTimes: number[] = [];
  const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
  const easeBack = (p: number) => 1 + 2.5 * Math.pow(p - 1, 3) + 1.5 * Math.pow(p - 1, 2);

  function tween(duration: number, delay: number, step: (p: number) => void, done?: () => void, ease = easeOut): void {
    step(0);
    tweens.push({
      start: performance.now() + (reducedMotion ? 0 : delay),
      duration: reducedMotion ? 0 : duration,
      step,
      ...(done ? { done } : {}),
      ease,
    });
    requestRender();
  }

  function requestRender(): void {
    if (!raf && !disposed) raf = requestAnimationFrame(frame);
  }

  let troubled = false;
  function trouble(reason: SkylineTrouble): void {
    if (troubled) return;
    troubled = true;
    onTrouble(reason);
  }

  function frame(now: number): void {
    raf = 0;
    const animating = tweens.length > 0 || dragging;
    // The slow-machine probe only listens while something moves: a still
    // board renders one frame per change, and the gap between those is the
    // table's pace, not the GPU's.
    if (animating && lastFrame && !forced) {
      frameTimes.push(now - lastFrame);
      if (frameTimes.length >= SLOW_SAMPLE) {
        const sorted = [...frameTimes].sort((a, b) => a - b);
        if (sorted[Math.floor(sorted.length / 2)]! > SLOW_FRAME_MS) trouble('slow');
        frameTimes.length = 0;
      }
    }
    lastFrame = animating ? now : 0;
    for (const t of [...tweens]) {
      if (now < t.start) continue;
      const p = t.duration ? Math.min(1, (now - t.start) / t.duration) : 1;
      t.step(t.ease(p));
      if (p >= 1) {
        tweens.splice(tweens.indexOf(t), 1);
        t.done?.();
      }
    }
    render();
    if (tweens.length) requestRender();
  }

  // ------------------------------------------------------------ the camera
  let azimuth = BASE_AZIMUTH;
  let elevation = BASE_ELEVATION;
  let quarter = 0;
  const nearestQuarter = () => Math.round((azimuth - BASE_AZIMUTH) / QUARTER);

  function placeCamera(width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    const half = Math.max(0.58 * rows, (0.6 * cols) / aspect);
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
    const distance = 40;
    camera.position.set(
      Math.sin(azimuth) * Math.cos(elevation) * distance,
      Math.sin(elevation) * distance,
      Math.cos(azimuth) * Math.cos(elevation) * distance,
    );
    camera.lookAt(0, 1.2, 0);
  }

  const scratch = new Vector3();
  function project(x: number, z: number, width: number, height: number) {
    scratch.set(x, 0, z).project(camera);
    return { x: ((scratch.x + 1) / 2) * width, y: ((1 - scratch.y) / 2) * height };
  }

  function render(): void {
    if (disposed || !plan) return;
    // The coordinates are repainted upright whenever the camera crosses into another quarter.
    const q = ((nearestQuarter() % 4) + 4) % 4;
    if (q !== quarter) {
      quarter = q;
      paintGround();
    }
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    placeCamera(width, height);
    renderer.render(scene, camera);
    const p0 = project(-cols / 2, -rows / 2, width, height);
    const p1 = project(cols / 2, -rows / 2, width, height);
    const p2 = project(-cols / 2, rows / 2, width, height);
    const w = cols * cellPx;
    const h = rows * cellPx;
    onFrame(`matrix(${(p1.x - p0.x) / w}, ${(p1.y - p0.y) / w}, ${(p2.x - p0.x) / h}, ${(p2.y - p0.y) / h}, ${p0.x}, ${p0.y})`);
  }

  function swing(toAzimuth: number, toElevation: number): void {
    const fromAzimuth = azimuth;
    const fromElevation = elevation;
    tween(520, 0, (p) => {
      azimuth = fromAzimuth + (toAzimuth - fromAzimuth) * p;
      elevation = fromElevation + (toElevation - fromElevation) * p;
    });
  }

  // -------------------------------------------------------- free rotation
  // Drag sideways to spin, up and down to tilt. A press that moves less than a
  // few pixels is still a click on the cell under it; a real drag swallows the
  // click it would otherwise end in, so spinning the board can never place a tile.
  let drag: { x: number; y: number; azimuth: number; elevation: number; id: number; moved: boolean } | null = null;
  let dragging = false;
  let swallowClick = false;
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('[data-skyline-controls]')) return;
    drag = { x: e.clientX, y: e.clientY, azimuth, elevation, id: e.pointerId, moved: false };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      dragging = true;
      stage.setPointerCapture?.(e.pointerId);
      stage.dataset['dragging'] = 'true';
    }
    azimuth = drag.azimuth - dx * 0.009;
    elevation = Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, drag.elevation + dy * 0.006));
    requestRender();
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    swallowClick = drag.moved;
    drag = null;
    dragging = false;
    delete stage.dataset['dragging'];
  };
  const onClick = (e: MouseEvent) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  };
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  stage.addEventListener('click', onClick, true);

  // ------------------------------------------------------------ the ground
  let hover: TileId | null = null;
  let focus: TileId | null = null;
  const fontFamily = getComputedStyle(stage).fontFamily || 'system-ui, sans-serif';

  function roundRect(x: number, y: number, w: number, h: number, r: number): void {
    gctx.beginPath();
    if (gctx.roundRect) gctx.roundRect(x, y, w, h, r);
    else gctx.rect(x, y, w, h);
  }

  function paintGround(): void {
    if (!plan) return;
    const pal = PALETTE[lighting];
    const P = LOT_PX;
    gctx.fillStyle = pal.ground;
    gctx.fillRect(0, 0, groundCanvas.width, groundCanvas.height);
    gctx.textAlign = 'center';
    gctx.textBaseline = 'middle';
    const lotColour = new Color();
    const lotBase = new Color(pal.lot);
    for (const lot of plan.lots) {
      const x = (MARGIN + lot.col + 0.05) * P;
      const y = (MARGIN + lot.row + 0.05) * P;
      const w = 0.9 * P;
      let fill: string = pal.lot;
      if (lot.kind === 'corp' && lot.color) fill = `#${lotColour.set(lot.color).lerp(lotBase, 1 - pal.corpMix).getHexString()}`;
      else if (lot.kind === 'uninc') fill = pal.uninc;
      else if (lot.kind === 'playable') fill = pal.playable;
      else if (lot.kind === 'dead') fill = pal.dead;
      roundRect(x, y, w, w, 0.12 * P);
      gctx.fillStyle = fill;
      gctx.fill();
      if (lot.kind === 'playable') {
        gctx.lineWidth = 6;
        gctx.strokeStyle = pal.ring;
        gctx.stroke();
      }
      if (lot.tile === hover || lot.tile === focus) {
        const focused = lot.tile === focus;
        gctx.lineWidth = focused ? 8 : 5;
        gctx.setLineDash(focused ? [] : [12, 8]);
        gctx.strokeStyle = pal.highlight;
        roundRect(x - 4, y - 4, w + 8, w + 8, 0.15 * P);
        gctx.stroke();
        gctx.setLineDash([]);
      }
      gctx.save();
      gctx.translate(x + w / 2, y + w / 2);
      gctx.rotate((-quarter * Math.PI) / 2);
      gctx.font = `500 ${Math.round(P * 0.24)}px ${fontFamily}`;
      gctx.fillStyle = lot.kind === 'dead' ? pal.cross : pal.text;
      if (lot.kind === 'empty' || lot.kind === 'playable' || lot.kind === 'dead') gctx.fillText(lot.tile, 0, 0);
      if (lot.kind === 'dead') {
        const r = w * 0.32;
        gctx.strokeStyle = pal.cross;
        gctx.lineWidth = 5;
        gctx.beginPath();
        gctx.moveTo(-r, -r);
        gctx.lineTo(r, r);
        gctx.moveTo(r, -r);
        gctx.lineTo(-r, r);
        gctx.stroke();
      }
      gctx.restore();
    }
    groundTex.needsUpdate = true;
    requestRender();
  }

  function applyLighting(): void {
    const pal = PALETTE[lighting];
    scene.background = new Color(pal.background);
    hemi.color.set(pal.hemi.sky);
    hemi.groundColor.set(pal.hemi.ground);
    hemi.intensity = pal.hemi.intensity;
    sun.color.set(pal.sun.color);
    sun.intensity = pal.sun.intensity;
    plateMat.color.set(pal.plate);
    for (const m of litMaterials) m.emissiveIntensity = pal.windows;
    stage.style.background = pal.background;
    stage.dataset['lighting'] = lighting;
    paintGround();
  }

  // -------------------------------------------------------------- showing
  const built = new Map<TileId, Built>();
  const rise = (b: Built, delay: number) =>
    tween(460, delay, (p) => void (b.group.scale.y = Math.max(0.001, p)), undefined, easeBack);
  const sink = (group: Group, delay: number) =>
    tween(
      380,
      delay,
      (p) => {
        group.scale.y = Math.max(0.001, 1 - p);
        group.position.y = -0.05 * p;
      },
      () => dispose3d(group),
    );
  function recolour(b: Built, colour: string, delay: number): void {
    const target = new Color(colour);
    let from: Color[] | null = null;
    tween(560, delay, (p) => {
      from ??= b.recolour.map((m) => m.color.clone());
      b.recolour.forEach((m, i) => m.color.copy(from![i]!).lerp(target, p));
    });
  }

  function show(next: SkylinePlan, origin: TileId | null, animate: boolean): void {
    sizeBoard(next.cols, next.rows);
    plan = next;
    const delayOf = (tile: TileId) => {
      if (!animate || !origin) return 0;
      const a = next.lots.find((l) => l.tile === tile);
      const b = next.lots.find((l) => l.tile === origin);
      if (!a || !b) return 0;
      return Math.min(Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row)) * 95, 700);
    };
    const tiles = new Set<TileId>([...built.keys(), ...next.buildings.keys()]);
    for (const tile of tiles) {
      const old = built.get(tile);
      const wanted = next.buildings.get(tile);
      const delay = delayOf(tile);
      if (!old && wanted) {
        const b = make(wanted, tile);
        built.set(tile, b);
        if (animate) rise(b, delay);
      } else if (old && !wanted) {
        built.delete(tile);
        if (animate) sink(old.group, delay);
        else dispose3d(old.group);
      } else if (old && wanted && old.key !== buildingKey(wanted)) {
        if (old.building.type === 'block' && wanted.type === 'block') {
          // A takeover: the district repaints in the survivor's colour, in a
          // wave running out from the tile that caused it.
          const b = { ...old, key: buildingKey(wanted), building: wanted };
          built.set(tile, b);
          if (animate) recolour(b, wanted.color, delay);
          else b.recolour.forEach((m) => m.color.set(wanted.color));
        } else if (old.building.type === 'tower' && wanted.type === 'tower' && old.building.color === wanted.color) {
          // The same chain, grown (or crowned, or striped): rebuild it and
          // stretch it up from its old height.
          dispose3d(old.group);
          const b = make(wanted, tile);
          built.set(tile, b);
          const from = old.height / b.height;
          if (animate) tween(650, delay, (p) => void (b.group.scale.y = from + (1 - from) * p));
        } else {
          // Anything else is a demolition and a new building on the same lot.
          const b = make(wanted, tile);
          built.set(tile, b);
          if (animate) {
            sink(old.group, delay);
            rise(b, delay + 300);
          } else dispose3d(old.group);
        }
      }
    }
    paintGround();
  }

  const resizer = new ResizeObserver(() => {
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    requestRender();
  });
  resizer.observe(stage);

  const onLost = (e: Event) => {
    e.preventDefault();
    trouble('lost');
  };
  canvas.addEventListener('webglcontextlost', onLost);

  let disposed = false;
  applyLighting();

  return {
    show,
    setLighting(next) {
      if (next === lighting) return;
      lighting = next;
      applyLighting();
    },
    setHighlight(nextHover, nextFocus) {
      if (nextHover === hover && nextFocus === focus) return;
      hover = nextHover;
      focus = nextFocus;
      paintGround();
    },
    turn(direction) {
      const here = (azimuth - BASE_AZIMUTH) / QUARTER;
      const next = direction > 0 ? Math.floor(here + 1e-6) + 1 : Math.ceil(here - 1e-6) - 1;
      swing(BASE_AZIMUTH + next * QUARTER, elevation);
    },
    resetView() {
      swing(BASE_AZIMUTH + nearestQuarter() * QUARTER, BASE_ELEVATION);
    },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      resizer.disconnect();
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
      stage.removeEventListener('click', onClick, true);
      canvas.removeEventListener('webglcontextlost', onLost);
      for (const b of built.values()) dispose3d(b.group);
      built.clear();
      for (const mesh of [plate, ground]) mesh?.geometry.dispose();
      plateMat.dispose();
      groundMat.dispose();
      groundTex.dispose();
      for (const f of facades.values()) {
        f.map.dispose();
        f.emissiveMap.dispose();
      }
      renderer.dispose();
      // Browsers cap live WebGL contexts; switching back to Board View must hand this one back.
      renderer.forceContextLoss();
      canvas.remove();
      stage.style.background = '';
    },
  };
}
