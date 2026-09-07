import './troika.js';
import { useMemo, useRef } from 'react';
import { Instance, Instances, Text } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Color, type Mesh, type MeshBasicMaterial } from 'three';
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

/** Saxon City board palette — see design/build.py, the "B" direction (contrast nudged for a live UI). */
const CELL_EMPTY = '#f1eae0';
const CELL_EMPTY_INK = '#8a7c68';
const CELL_UNINC = '#b0a496';
const ACCENT = '#a5361f';
const HEADER_INK = '#7a6f60';
const BASE = '#e3d8c9';
const HIGHLIGHT_HOT = '#e0a066';

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const emptyColor = new Color(CELL_EMPTY);
const hotColor = new Color(HIGHLIGHT_HOT);

export interface BoardSceneProps {
  readonly ruleset: Ruleset;
  readonly cells: Readonly<Record<TileId, Cell>>;
  readonly corporations: Record<Industry, CorpView>;
  /** Tiles the active seat can legally place this turn — pulsed and clickable. */
  readonly playable: ReadonlySet<TileId>;
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

/** The 3D contents only — no `<Canvas>`, so `@react-three/test-renderer` can mount it. */
export function BoardScene({ ruleset, cells, corporations, playable, onPick }: BoardSceneProps) {
  const tiles = useMemo(() => boardCells(ruleset), [ruleset]);
  const { cols, rows } = ruleset.board;
  const halfW = (cols - 1) / 2;
  const halfH = (rows - 1) / 2;

  const staticTiles = tiles.filter((tile) => !playable.has(tile));
  const playableTiles = tiles.filter((tile) => playable.has(tile));

  const headquarters = useMemo(
    () =>
      (Object.entries(corporations) as [Industry, CorpView][])
        .filter(([, corp]) => corp.founded && corp.hqTile)
        .map(([industry, corp]) => ({ industry, tile: corp.hqTile! })),
    [corporations],
  );

  return (
    <group>
      <ambientLight intensity={1.4} />

      {/* base plate, a thin frame visible through the cell gaps */}
      <mesh name="board-base" position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[cols + 0.16, rows + 0.16]} />
        <meshBasicMaterial color={BASE} />
      </mesh>

      {/* one InstancedMesh for every non-highlighted cell (KTD8) */}
      <Instances limit={tiles.length} range={staticTiles.length}>
        <boxGeometry args={[0.94, 0.1, 0.94]} />
        <meshBasicMaterial />
        {staticTiles.map((tile) => {
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

      <PulsingCells tiles={playableTiles} ruleset={ruleset} onPick={onPick} />

      {/* every cell's coordinate */}
      {tiles.map((tile) => {
        const [x, , z] = tileToWorld(tile, ruleset);
        const highlighted = playable.has(tile);
        return (
          <Text
            key={tile}
            name={`label:${tile}`}
            font={fontMedium}
            position={[x, 0.09, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.32}
            color={highlighted ? ACCENT : labelInk(cells[tile])}
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
          position={[col - 1 - halfW, 0.09, -halfH - 1]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.42}
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
          position={[-halfW - 1, 0.09, index - halfH]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.42}
          color={HEADER_INK}
          anchorX="center"
          anchorY="middle"
        >
          {letter}
        </Text>
      ))}

      {/* headquarters coins */}
      {headquarters.map(({ industry, tile }) => {
        const [x, , z] = tileToWorld(tile, ruleset);
        return (
          <group key={industry} name={`hq:${industry}`} position={[x, 0.14, z]}>
            <mesh>
              <cylinderGeometry args={[0.28, 0.28, 0.12, 28]} />
              <meshStandardMaterial color={INDUSTRY_INFO[industry].color} metalness={0.1} roughness={0.6} />
            </mesh>
            <Text
              font={fontBold}
              position={[0, 0.07, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.28}
              color={INDUSTRY_INFO[industry].ink}
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

/** Playable cells rendered as individual meshes so their colour can pulse (the "blink"). */
function PulsingCells({
  tiles,
  ruleset,
  onPick,
}: {
  tiles: readonly TileId[];
  ruleset: Ruleset;
  onPick: (tile: TileId) => void;
}) {
  const meshes = useRef<(Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4.5);
    for (const mesh of meshes.current) {
      if (mesh) (mesh.material as MeshBasicMaterial).color.copy(emptyColor).lerp(hotColor, t);
    }
  });

  return (
    <>
      {tiles.map((tile, index) => {
        const [x, , z] = tileToWorld(tile, ruleset);
        return (
          <mesh
            key={tile}
            name={`cell:${tile}`}
            position={[x, 0.01, z]}
            ref={(mesh) => {
              meshes.current[index] = mesh;
            }}
            onClick={(event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation();
              onPick(tile);
            }}
          >
            <boxGeometry args={[0.94, 0.12, 0.94]} />
            <meshBasicMaterial color={CELL_EMPTY} />
          </mesh>
        );
      })}
    </>
  );
}
