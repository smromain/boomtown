import './troika.js';
import { useMemo, useRef } from 'react';
import { Instance, Instances, Text } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Color, type Mesh, type MeshBasicMaterial } from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import {
  INDUSTRY_INFO,
  type Cell,
  type CorpView,
  type Industry,
  type Ruleset,
  type TileId,
} from '@boomtown/engine';
import fontMedium from '../assets/fonts/DMSans-Medium.ttf';
import fontBold from '../assets/fonts/DMSans-Bold.ttf';
import { boardCells, tileToWorld } from './coords.js';

/** Saxon City board palette — design/build.py, `board()` in the "B" direction. */
const CELL_EMPTY = '#f1eae0';
const CELL_EMPTY_INK = '#8a7c68';
const CELL_UNINC = '#b0a496';
const ACCENT = '#a5361f';
const RING = '#c6b8a6';
const RING_HOT = '#d98a4e';
const HEADER_INK = '#7a6f60';
const HQ_BADGE = '#221e18';

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const cool = new Color(RING);
const hot = new Color(RING_HOT);

export type CellTarget = 'playable' | 'dead';

export interface BoardSceneProps {
  readonly ruleset: Ruleset;
  readonly cells: Readonly<Record<TileId, Cell>>;
  readonly corporations: Record<Industry, CorpView>;
  /** Legal-target cells for the active seat: a ring for `playable` (which blinks), struck red for `dead`. */
  readonly targets: ReadonlyMap<TileId, CellTarget>;
  readonly onPick: (tile: TileId) => void;
}

function cellColor(cell: Cell | undefined): string {
  if (!cell) return CELL_EMPTY;
  return cell.kind === 'corporation' ? INDUSTRY_INFO[cell.industry].color : CELL_UNINC;
}

function labelInk(cell: Cell | undefined): string {
  if (!cell) return CELL_EMPTY_INK;
  return cell.kind === 'corporation' ? INDUSTRY_INFO[cell.industry].ink : '#ffffff';
}

const cellGeo = new RoundedBoxGeometry(0.94, 0.16, 0.94, 3, 0.14);
const ringGeo = new RoundedBoxGeometry(0.98, 0.1, 0.98, 3, 0.14);

/** The 3D contents only — no `<Canvas>`, so `@react-three/test-renderer` can mount it. */
export function BoardScene({ ruleset, cells, corporations, targets, onPick }: BoardSceneProps) {
  const tiles = useMemo(() => boardCells(ruleset), [ruleset]);
  const { cols, rows } = ruleset.board;
  const halfW = (cols - 1) / 2;
  const halfH = (rows - 1) / 2;

  const plainTiles = tiles.filter((tile) => !targets.has(tile));
  const targeted = tiles.filter((tile) => targets.has(tile));

  const headquarters = useMemo(
    () =>
      (Object.entries(corporations) as [Industry, CorpView][])
        .filter(([, corp]) => corp.founded && corp.hqTile)
        .map(([industry, corp]) => ({ industry, tile: corp.hqTile! })),
    [corporations],
  );

  return (
    <group position={[0, 0, 0.9]}>
      <ambientLight intensity={1.5} />

      {/* every non-targeted cell, one InstancedMesh (KTD8) */}
      <Instances range={plainTiles.length} limit={tiles.length}>
        <primitive object={cellGeo} attach="geometry" />
        <meshBasicMaterial />
        {plainTiles.map((tile) => {
          const [x, , z] = tileToWorld(tile, ruleset);
          return (
            <Instance
              key={tile}
              name={`cell:${tile}`}
              position={[x, 0, z]}
              color={cellColor(cells[tile])}
              onClick={(event: ThreeEvent<MouseEvent>) => {
                event.stopPropagation();
                onPick(tile);
              }}
            />
          );
        })}
      </Instances>

      <TargetCells
        tiles={targeted}
        targets={targets}
        cells={cells}
        ruleset={ruleset}
        onPick={onPick}
      />

      {/* every cell's coordinate */}
      {tiles.map((tile) => {
        const [x, , z] = tileToWorld(tile, ruleset);
        const target = targets.get(tile);
        return (
          <Text
            key={tile}
            name={`label:${tile}`}
            font={fontMedium}
            position={[x, 0.2, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.3}
            color={target ? ACCENT : labelInk(cells[tile])}
            anchorX="center"
            anchorY="middle"
          >
            {tile}
          </Text>
        );
      })}

      {/* perimeter headers: 1..cols across the top, A.. down the left */}
      {Array.from({ length: cols }, (_, i) => i + 1).map((col) => (
        <Text
          key={`col-${col}`}
          name={`header-col:${col}`}
          font={fontBold}
          position={[col - 1 - halfW, 0.2, -halfH - 1]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.4}
          color={HEADER_INK}
          anchorX="center"
          anchorY="middle"
        >
          {String(col)}
        </Text>
      ))}
      {Array.from({ length: rows }, (_, i) => ROW_LETTERS[i]!).map((letter, index) => (
        <Text
          key={`row-${letter}`}
          name={`header-row:${letter}`}
          font={fontBold}
          position={[-halfW - 1, 0.2, index - halfH]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.4}
          color={HEADER_INK}
          anchorX="center"
          anchorY="middle"
        >
          {letter}
        </Text>
      ))}

      {/* headquarters: a dark circle badge with the corporation's initial */}
      {headquarters.map(({ industry, tile }) => {
        const [x, , z] = tileToWorld(tile, ruleset);
        return (
          <group key={industry} name={`hq:${industry}`} position={[x, 0.14, z]}>
            <mesh position={[0, 0.02, -0.05]}>
              <cylinderGeometry args={[0.3, 0.3, 0.14, 32]} />
              <meshBasicMaterial color={HQ_BADGE} />
            </mesh>
            <Text
              font={fontBold}
              position={[0, 0.16, -0.05]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.3}
              color="#ffffff"
              anchorX="center"
              anchorY="middle"
            >
              {industry[0]!.toUpperCase()}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

/** Legal targets: a rounded ring around the cell. `playable` rings blink cool↔warm; `dead` are red with a strike bar. */
function TargetCells({
  tiles,
  targets,
  cells,
  ruleset,
  onPick,
}: {
  tiles: readonly TileId[];
  targets: ReadonlyMap<TileId, CellTarget>;
  cells: Readonly<Record<TileId, Cell>>;
  ruleset: Ruleset;
  onPick: (tile: TileId) => void;
}) {
  const rings = useRef<(Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4.5);
    tiles.forEach((tile, index) => {
      const mesh = rings.current[index];
      if (!mesh) return;
      const material = mesh.material as MeshBasicMaterial;
      if (targets.get(tile) === 'dead') material.color.set(ACCENT);
      else material.color.copy(cool).lerp(hot, t);
    });
  });

  return (
    <>
      {tiles.map((tile, index) => {
        const [x, , z] = tileToWorld(tile, ruleset);
        const dead = targets.get(tile) === 'dead';
        return (
          <group key={tile} position={[x, 0, z]}>
            <mesh
              ref={(mesh) => {
                rings.current[index] = mesh;
              }}
            >
              <primitive object={ringGeo} attach="geometry" />
              <meshBasicMaterial color={RING} />
            </mesh>
            <mesh
              name={`cell:${tile}`}
              position={[0, 0.03, 0]}
              onClick={(event: ThreeEvent<MouseEvent>) => {
                event.stopPropagation();
                onPick(tile);
              }}
            >
              <primitive object={cellGeo} attach="geometry" />
              <meshBasicMaterial color={cellColor(cells[tile])} />
            </mesh>
            {dead && (
              <mesh position={[0, 0.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[0.7, 0.06]} />
                <meshBasicMaterial color={ACCENT} />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}
