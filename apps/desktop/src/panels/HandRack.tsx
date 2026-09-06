import { activeView } from '@boomtown/client-core';
import { useGameClient, useGameState } from '../client/GameClientProvider.js';
import styles from './panels.module.css';

/** The active seat's six tiles, each labelled with its effect. Dead and blocked tiles read differently and cannot be placed. */
export function HandRack() {
  const view = useGameState(activeView);
  const busy = useGameState((state) => state.inFlight != null);
  const client = useGameClient();
  if (!view) return null;

  return (
    <section className={styles.panel} aria-label="Your tiles">
      <h2>Hand — seat {view.you}</h2>
      <div className={styles.rack}>
        {view.handTiles.map(({ tile, effect, playable }) => (
          <button
            key={tile}
            type="button"
            className={styles.tile}
            data-effect={effect}
            disabled={busy || !playable || view.step !== 'place'}
            onClick={() => client.dispatch({ type: 'place-tile', seat: view.you, tile })}
          >
            <span>{tile}</span>
            <span className={styles.effect}>{effect}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
