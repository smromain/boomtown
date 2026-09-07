import { activeView } from '@boomtown/client-core';
import { useGameState } from '../client/GameClientProvider.js';
import styles from './game.module.css';

/**
 * The dead-tile pile: tiles revealed face-up and taken out of play because they
 * would illegally merge two safe corporations. It sits below the board, mirroring
 * the physical "side of the board". Nothing renders until the first tile is
 * removed.
 */
export function OutOfPlay() {
  const removed = useGameState((state) => activeView(state)?.removedTiles ?? []);
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
