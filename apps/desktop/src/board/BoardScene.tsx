import { useMemo } from 'react';
import { Instance, Instances } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { INDUSTRY_INFO, type Cell, type CorpView, type Industry, type Ruleset, type TileId } from '@boomtown/engine';
import { boardCells, tileToWorld } from './coords.js';

const EMPTY_CELL = '#2b2620';
const PLAYABLE_CELL = '#3f7d4f';
const UNINCORPORATED = '#8c8578';

export interface BoardSceneProps {
  readonly ruleset: Ruleset;
  readonly cells: Readonly<Record<TileId, Cell>>;
  readonly corporations: Record<Industry, CorpView>;
  /** Tiles the active seat can legally place this turn — highlighted and clickable. */
  readonly playable: ReadonlySet<TileId>;
  readonly onPick: (tile: TileId) => void;
}

/** The 3D contents only — no `<Canvas>`, so `@react-three/test-renderer` can mount it. */
export function BoardScene({ ruleset, cells, corporations, playable, onPick }: BoardSceneProps) {
  const tiles = useMemo(() => boardCells(ruleset), [ruleset]);

  const occupied = useMemo(
    () =>
      Object.entries(cells).map(([tile, cell]) => ({
        tile,
        color: cell.kind === 'corporation' ? INDUSTRY_INFO[cell.industry].color : UNINCORPORATED,
      })),
    [cells],
  );

  const headquarters = useMemo(
    () =>
      (Object.entries(corporations) as [Industry, CorpView][])
        .filter(([, corp]) => corp.founded && corp.hqTile)
        .map(([industry, corp]) => ({ industry, tile: corp.hqTile! })),
    [corporations],
  );

  return (
    <group>
      <ambientLight intensity={0.85} />
      <directionalLight position={[8, 14, 6]} intensity={0.5} />

      {/* one InstancedMesh for the whole grid floor (KTD8) */}
      <Instances limit={tiles.length} range={tiles.length}>
        <boxGeometry args={[0.94 * 1, 0.12, 0.94]} />
        <meshStandardMaterial />
        {tiles.map((tile) => {
          const [x, , z] = tileToWorld(tile, ruleset);
          const isPlayable = playable.has(tile);
          return (
            <Instance
              key={tile}
              name={`cell:${tile}`}
              position={[x, -0.06, z]}
              color={isPlayable ? PLAYABLE_CELL : EMPTY_CELL}
              onClick={(event: ThreeEvent<MouseEvent>) => {
                event.stopPropagation();
                onPick(tile);
              }}
            />
          );
        })}
      </Instances>

      {occupied.map(({ tile, color }) => {
        const [x, , z] = tileToWorld(tile, ruleset);
        return (
          <mesh key={tile} name={`tile:${tile}`} position={[x, 0.12, z]}>
            <boxGeometry args={[0.86, 0.24, 0.86]} />
            <meshStandardMaterial color={color} />
          </mesh>
        );
      })}

      {headquarters.map(({ industry, tile }) => {
        const [x, , z] = tileToWorld(tile, ruleset);
        return (
          <mesh key={industry} name={`hq:${industry}`} position={[x, 0.42, z]}>
            <cylinderGeometry args={[0.16, 0.22, 0.6, 6]} />
            <meshStandardMaterial color={INDUSTRY_INFO[industry].color} />
          </mesh>
        );
      })}
    </group>
  );
}
