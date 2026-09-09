import type { TileId } from '@boomtown/engine';
import { activeView } from '@boomtown/client-core';
import { useGameState } from '../client/GameClientProvider.js';
import styles from './game.module.css';

/**
 * A single stable empty array. `useGameState` runs on `useSyncExternalStore`,
 * which compares snapshots with `Object.is` (zustand v5 dropped v4's implicit
 * shallow check) — so a selector that builds `?? []` inline returns a fresh
 * reference every render and spins into an infinite loop. Online this fires the
 * moment the clock moves to a bot or a remote player: the client holds no view
 * for that seat, so `activeView` is null and the fallback runs every render.
 */
const NO_TILES: readonly TileId[] = Object.freeze([]);

/**
 * The dead-tile pile: tiles revealed face-up and taken out of play because they
 * would illegally merge two safe corporations. It sits below the board, mirroring
 * the physical "side of the board". Nothing renders until the first tile is
 * removed.
 */
export function OutOfPlay() {
  const removed = useGameState((state) => activeView(state)?.removedTiles ?? NO_TILES);
  if (removed.length === 0) return null;

  return (
    <section className={styles.outOfPlay} aria-label="Out of play">
      <span className={styles.outOfPlayLabel}>Out of play</span>
      <div className={styles.outOfPlayTiles}>
        {removed.map((tile) => (
          <span key={tile} className={`tabnum ${styles.deadTile}`}>
            {tile}
          </span>
        ))}
      </div>
    </section>
  );
}
