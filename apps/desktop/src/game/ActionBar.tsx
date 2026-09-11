import { useGameClient, useGameState, useLocalActiveView } from '../client/GameClientProvider.js';
import { Button } from '../ui/Button.js';
import styles from './game.module.css';

/**
 * The contextual action beside the tile rack. Only one case is left: a turn
 * that cannot start because nothing in hand is playable.
 *
 * The end-of-turn choice used to live here too and now sits in `TurnModal`,
 * because a card at the foot of the right rail is below the fold and was
 * routinely missed — the buy modal would close and the game looked stuck. This
 * case keeps its card: the rack directly above it is the explanation (every
 * tile greyed out), so the card confirms what the rack already shows rather
 * than being the only sign the turn is waiting.
 */
export function ActionBar() {
  const view = useLocalActiveView();
  const busy = useGameState((state) => state.inFlight != null);
  const client = useGameClient();
  if (!view) return null;

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
