/**
 * The art kit: the drawings under `drawings/` sent out for touch-up and taken
 * back. The files are written with `var(--gn-*)` tokens, which no drawing
 * program understands, so `exportDrawing` swaps each token for one plain colour
 * (the day palette, nudged so no two tokens share a colour) and `importDrawing`
 * swaps them back. Whatever the editor did to the file on the way (Illustrator's
 * `.st0` classes, Inkscape's metadata, a moved or rescaled canvas) is undone on
 * import, so what lands back in `drawings/` is written like the rest.
 *
 * Pure string-to-string; the caller supplies the DOM (the renderer's under
 * test, jsdom's in `scripts/art-kit.ts`).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Each token's colour in an exported file. A token with alpha is its colour
 * plus an opacity. `lite` and `star` are both white in the app, so `star` is a
 * shade off; the company colours are placeholders, since a drawing takes the
 * colour of whichever company it is on.
 */
export const EXPORT_PALETTE: Record<string, { hex: string; opacity?: number; note: string }> = {
  c: { hex: '#2a9d8f', note: 'the company this drawing belongs to (any company colour)' },
  t: { hex: '#e76f51', note: 'the company being taken over in a merger (any company colour)' },
  ci: { hex: '#fdf6e3', note: 'ink on the company colour' },
  line: { hex: '#1c2a47', note: 'outlines' },
  sky: { hex: '#bfe2ea', note: 'sky' },
  sun: { hex: '#ffd166', note: 'sun, moon at night' },
  hill: { hex: '#a9d19a', note: 'hills' },
  hill2: { hex: '#8fbf85', note: 'nearer hills, grass' },
  wall: { hex: '#f6e7cf', note: 'building walls' },
  glass: { hex: '#274062', note: 'windows, lit at night' },
  lite: { hex: '#ffffff', note: 'white' },
  star: { hex: '#fefefe', note: 'stars and sparkles' },
  rock: { hex: '#b7a58f', note: 'rock, earth' },
  seal: { hex: '#6f7f8f', note: 'steel, grey metal' },
  win: { hex: '#ffe7a3', note: 'warm window light' },
  road: { hex: '#d9d4c7', note: 'road' },
  crane: { hex: '#f3b93a', note: 'the crane' },
  trail: { hex: '#1c2a48', opacity: 0.2, note: 'faint trails (20% opacity)' },
  skin1: { hex: '#f2c9a1', note: 'skin, light' },
  skin2: { hex: '#c68b5e', note: 'skin, medium' },
  skin3: { hex: '#8d5a3b', note: 'skin, dark' },
};

const TOKEN_OF_HEX = new Map(Object.entries(EXPORT_PALETTE).map(([token, { hex }]) => [hex, token]));

/** The properties that carry a colour, and the opacity that goes with each. */
const PAINT: Record<string, string | undefined> = {
  fill: 'fill-opacity',
  stroke: 'stroke-opacity',
  'stop-color': 'stop-opacity',
  'flood-color': 'flood-opacity',
  'lighting-color': undefined,
  color: undefined,
};

/** Elements an editor adds that mean nothing here. */
const DROP = new Set(['title', 'desc', 'metadata', 'script']);
/** Elements that cannot come back: they would not draw the same in the app. */
const REFUSE: Record<string, string> = {
  image: 'embedded pictures cannot be used; redraw them as shapes',
  text: 'convert text to outlines (paths) first',
  foreignObject: 'foreign content cannot be used',
};

export interface Dom {
  DOMParser: typeof DOMParser;
  XMLSerializer: typeof XMLSerializer;
}

export interface ImportResult {
  /** The file as it belongs in `drawings/`. */
  svg: string;
  /** Colours that match no token and were not in the drawing before: new, or a token slightly off. */
  newColours: string[];
  warnings: string[];
}

type Style = [string, string][];

const parseStyle = (text: string | null): Style =>
  (text ?? '')
    .split(';')
    .map((decl) => {
      const colon = decl.indexOf(':');
      return [decl.slice(0, colon).trim(), decl.slice(colon + 1).trim()] as [string, string];
    })
    .filter(([key]) => key.length > 0);

const writeStyle = (element: Element, style: Style) => {
  if (style.length === 0) element.removeAttribute('style');
  else element.setAttribute('style', style.map(([key, value]) => `${key}:${value}`).join(';'));
};

function parse(dom: Dom, file: string): SVGSVGElement {
  const doc = new dom.DOMParser().parseFromString(file, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.getElementsByTagName('parsererror').length > 0 || root.localName !== 'svg') {
    throw new Error('not a readable SVG file');
  }
  return root as unknown as SVGSVGElement;
}

/** The markup between the root's tags, one element per line, as the files are written. */
function body(dom: Dom, root: Element): string {
  const text = new dom.XMLSerializer().serializeToString(root);
  return text
    .slice(text.indexOf('>') + 1, text.lastIndexOf('</'))
    .replace(/>\s+</g, '>\n<')
    .trim();
}

const viewBoxOf = (root: Element): number[] | undefined => {
  const box = root.getAttribute('viewBox');
  if (box != null) return box.trim().split(/[\s,]+/).map(Number);
  const width = parseFloat(root.getAttribute('width') ?? '');
  const height = parseFloat(root.getAttribute('height') ?? '');
  return Number.isFinite(width) && Number.isFinite(height) ? [0, 0, width, height] : undefined;
};

/** Every element under the root, depth first. */
const elementsIn = (root: Element): Element[] => [...root.getElementsByTagName('*')];

function eachPaint(root: Element, visit: (element: Element, where: 'attr' | Style, property: string, value: string) => string | undefined) {
  for (const element of elementsIn(root)) {
    for (const property of Object.keys(PAINT)) {
      const value = element.getAttribute(property);
      if (value == null) continue;
      const next = visit(element, 'attr', property, value);
      if (next != null) element.setAttribute(property, next);
    }
    if (!element.hasAttribute('style')) continue;
    const style = parseStyle(element.getAttribute('style'));
    for (const decl of style) {
      if (!(decl[0] in PAINT)) continue;
      const next = visit(element, style, decl[0], decl[1]);
      if (next != null) decl[1] = next;
    }
    writeStyle(element, style);
  }
}

/** A drawing from `drawings/`, with plain colours, for a drawing program. */
export function exportDrawing(dom: Dom, file: string): string {
  const root = parse(dom, file);
  eachPaint(root, (element, where, property, value) => {
    const token = /^var\(--gn-([a-z0-9]+)\)$/.exec(value)?.[1];
    if (token == null) return undefined;
    const colour = EXPORT_PALETTE[token];
    if (colour == null) throw new Error(`no export colour for --gn-${token}`);
    const opacity = PAINT[property];
    if (colour.opacity != null && opacity != null) {
      if (where === 'attr') element.setAttribute(opacity, String(colour.opacity));
      else where.push([opacity, String(colour.opacity)]);
    }
    return colour.hex;
  });
  const [x, y, width, height] = viewBoxOf(root)!;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="${SVG_NS}" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}">\n` +
    `${body(dom, root)}\n</svg>\n`
  );
}

/** `#ABC`, `#aabbcc` or `rgb(…)` as `#aabbcc`; anything else as it came. */
export function normaliseColour(value: string): string {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(v);
  if (rgb != null) return `#${rgb.slice(1).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')}`;
  if (v === 'white') return '#ffffff';
  if (v === 'black') return '#000000';
  return value.trim();
}

/** Class rules from an editor's `<style>` block: `.st0{fill:#fff}` and `.a,.b{…}`. */
function classRules(css: string, warnings: string[]): Map<string, Style> {
  const rules = new Map<string, Style>();
  for (const [, selectors, decls] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    for (const selector of selectors!.split(',').map((s) => s.trim())) {
      if (!/^\.[\w-]+$/.test(selector)) {
        warnings.push(`ignored a style rule for "${selector}"`);
        continue;
      }
      rules.set(selector.slice(1), [...(rules.get(selector.slice(1)) ?? []), ...parseStyle(decls!)]);
    }
  }
  return rules;
}

/**
 * A drawing back from a drawing program, as it belongs in `drawings/`. `was`
 * is the file it replaces (for its canvas, and to tell new colours from old);
 * `name` its path under `drawings/`, which prefixes any ids it needs.
 */
export function importDrawing(dom: Dom, file: string, was: string, name: string): ImportResult {
  const warnings: string[] = [];
  const root = parse(dom, file);
  const canvas = viewBoxOf(parse(dom, was))!;
  const before = new Set(
    (was.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? []).map(normaliseColour),
  );

  // Editor furniture: comments, metadata, other programs' namespaces.
  const walker = root.ownerDocument.createTreeWalker(root, 128 /* NodeFilter.SHOW_COMMENT */);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  for (const comment of comments) comment.parentNode?.removeChild(comment);

  const rules = new Map<string, Style>();
  for (const element of elementsIn(root)) {
    if (element.namespaceURI !== SVG_NS) {
      element.remove();
      continue;
    }
    if (element.localName in REFUSE) throw new Error(`<${element.localName}>: ${REFUSE[element.localName]}`);
    if (element.localName === 'style') {
      for (const [cls, style] of classRules(element.textContent ?? '', warnings)) rules.set(cls, style);
      element.remove();
    } else if (DROP.has(element.localName)) element.remove();
  }

  const ids = new Map<string, string>();
  const prefix = name.replace(/[^a-z0-9]+/gi, '-');
  for (const element of elementsIn(root)) {
    for (const attr of [...element.attributes]) {
      if (attr.prefix != null && attr.prefix !== 'xlink') element.removeAttributeNode(attr);
      else if (attr.name.startsWith('data-') || attr.name === 'enable-background') element.removeAttribute(attr.name);
    }
    // A class rule outranks an attribute and loses to the element's own style.
    const classes = (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
    element.removeAttribute('class');
    const own = new Set(parseStyle(element.getAttribute('style')).map(([key]) => key));
    for (const cls of classes) {
      const style = rules.get(cls);
      if (style == null) warnings.push(`dropped class "${cls}", which has no rule`);
      for (const [key, value] of style ?? []) if (!own.has(key)) element.setAttribute(key, value);
    }
    const id = element.getAttribute('id');
    if (id != null) ids.set(id, `${prefix}-${id}`);
  }

  // Ids survive only where something refers to them, and then under the drawing's name,
  // since every drawing is set into the same page.
  const text = new dom.XMLSerializer().serializeToString(root);
  for (const element of elementsIn(root)) {
    const id = element.getAttribute('id');
    if (id == null) continue;
    const used = text.includes(`url(#${id})`) || text.includes(`href="#${id}"`);
    if (used) element.setAttribute('id', ids.get(id)!);
    else element.removeAttribute('id');
  }
  const renamed = (value: string) =>
    value.replace(/url\(#([^)]+)\)/g, (whole, id: string) => (ids.has(id) ? `url(#${ids.get(id)})` : whole));
  for (const element of elementsIn(root)) {
    for (const attr of [...element.attributes]) {
      if (attr.value.includes('url(#')) attr.value = renamed(attr.value);
      if ((attr.localName === 'href') && attr.value.startsWith('#') && ids.has(attr.value.slice(1))) {
        attr.value = `#${ids.get(attr.value.slice(1))}`;
      }
    }
  }

  // Plain colours back to tokens.
  const newColours = new Set<string>();
  eachPaint(root, (element, where, property, value) => {
    const colour = normaliseColour(value);
    const token = TOKEN_OF_HEX.get(colour);
    if (token == null) {
      if (colour.startsWith('#') && !before.has(colour)) newColours.add(colour);
      return colour === value ? undefined : colour;
    }
    const opacity = PAINT[property];
    if (EXPORT_PALETTE[token]!.opacity != null && opacity != null) {
      if (where === 'attr') element.removeAttribute(opacity);
      else where.splice(0, where.length, ...where.filter(([key]) => key !== opacity));
    }
    return `var(--gn-${token})`;
  });

  // Groups that do nothing (an editor's layers), and empty defs.
  for (const element of elementsIn(root).reverse()) {
    if (element.localName === 'defs' && element.children.length === 0) element.remove();
    else if (element.localName === 'g' && element.attributes.length === 0) {
      while (element.firstChild) element.parentNode!.insertBefore(element.firstChild, element);
      element.remove();
    }
  }

  // A canvas the editor moved or rescaled is put back where the app expects it.
  const box = viewBoxOf(root);
  if (box == null) throw new Error('the file has no canvas size (viewBox)');
  const [cx, cy, cw, ch] = canvas as [number, number, number, number];
  const [x, y, w, h] = box as [number, number, number, number];
  const scale = cw / w;
  if (Math.abs(ch / h - scale) > 1e-3 * scale) {
    throw new Error(`the canvas changed shape: it was ${cw}×${ch} and is now ${w}×${h}`);
  }
  const unscaled = Math.abs(scale - 1) <= 1e-6;
  if (!(unscaled && x === cx && y === cy)) {
    const round = (n: number) => String(Math.round(n * 1e4) / 1e4);
    const moves = unscaled
      ? [`translate(${round(cx - x)} ${round(cy - y)})`]
      : [
          cx !== 0 || cy !== 0 ? `translate(${round(cx)} ${round(cy)})` : '',
          `scale(${round(scale)})`,
          x !== 0 || y !== 0 ? `translate(${round(-x)} ${round(-y)})` : '',
        ].filter(Boolean);
    const group = root.ownerDocument.createElementNS(SVG_NS, 'g');
    group.setAttribute('transform', moves.join(' '));
    while (root.firstChild) group.appendChild(root.firstChild);
    root.appendChild(group);
  }

  const svg = `<svg xmlns="${SVG_NS}" viewBox="${canvas.join(' ')}">\n${body(dom, root)}\n</svg>\n`;
  return { svg, newColours: [...newColours].sort(), warnings };
}
