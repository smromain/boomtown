import { useGameClient, useGameState, useLocalActiveView } from '../client/GameClientProvider.js';
import { Button } from '../ui/Button.js';
import styles from './game.module.css';

/**
 * The contextual action beside the tile rack: the end‑of‑game choice at the
 * end‑check step, or a skip when nothing is playable. The buy step has its own
 * modal (`BuyModal`), so it is not handled here.
 */
export function ActionBar() {
  const view = useLocalActiveView();
  const busy = useGameState((state) => state.inFlight != null);
  const client = useGameClient();
  if (!view) return null;

  if (view.step === 'end-check') {
    return (
      <div className={styles.actionCard} aria-label="End of game">
        <p className={styles.actionPrompt}>A corporation is safe or at the end size.</p>
        <div className={styles.actionButtons}>
          <Button variant="primary" disabled={busy} onClick={() => client.dispatch({ type: 'announce-end', seat: view.you })}>
            End the game
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => client.dispatch({ type: 'end-turn', seat: view.you })}>
            Keep playing
          </Button>
        </div>
      </div>
    );
  }

  if (view.step === 'place' && !view.handTiles.some((tile) => tile.playable)) {
    return (
      <div className={styles.actionCard} aria-label="No playable tile">
        <p className={styles.actionPrompt}>No tile in hand can be placed this turn.</p>
        <Button variant="primary" disabled={busy} onClick={() => client.dispatch({ type: 'end-turn', seat: view.you })}>
          Skip placement
        </Button>
      </div>
    );
  }

  return null;
}
