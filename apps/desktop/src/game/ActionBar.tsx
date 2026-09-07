import { activeView } from '@boomtown/client-core';
import { useGameClient, useGameState } from '../client/GameClientProvider.js';
import { BuyControls } from '../panels/BuyControls.js';
import styles from './game.module.css';

/**
 * The contextual action beside the tile rack: buy stock during the buy step, the
 * end‑of‑game choice at the end‑check step, or a skip when nothing is playable.
 * Kept next to the rack so it does not fight the story card for space.
 */
export function ActionBar() {
  const view = useGameState(activeView);
  const busy = useGameState((state) => state.inFlight != null);
  const client = useGameClient();
  if (!view) return null;

  if (view.step === 'buy') {
    return <BuyControls />;
  }

  if (view.step === 'end-check') {
    return (
      <div className={styles.actionCard} aria-label="End of game">
        <p className={styles.actionPrompt}>A corporation is safe or at the end size.</p>
        <div className={styles.actionButtons}>
          <button
            type="button"
            className={styles.primaryAction}
            disabled={busy}
            onClick={() => client.dispatch({ type: 'announce-end', seat: view.you })}
          >
            End the game
          </button>
          <button
            type="button"
            className={styles.secondaryAction}
            disabled={busy}
            onClick={() => client.dispatch({ type: 'end-turn', seat: view.you })}
          >
            Keep playing
          </button>
        </div>
      </div>
    );
  }

  if (view.step === 'place' && !view.handTiles.some((tile) => tile.playable)) {
    return (
      <div className={styles.actionCard} aria-label="No playable tile">
        <p className={styles.actionPrompt}>No tile in hand can be placed this turn.</p>
        <button
          type="button"
          className={styles.primaryAction}
          disabled={busy}
          onClick={() => client.dispatch({ type: 'end-turn', seat: view.you })}
        >
          Skip placement
        </button>
      </div>
    );
  }

  return null;
}
