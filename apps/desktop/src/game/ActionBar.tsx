import { useGameClient, useGameState, useLocalActiveView } from '../client/GameClientProvider.js';
import { Button } from '../ui/Button.js';
import styles from './game.module.css';

/**
 * The contextual action beside the tile rack: the end‑of‑game choice at the
 * end‑check step, or a skip when nothing is playable. The buy step has its own
 * modal (`BuyModal`), so it is not handled here.
 *
 * The end‑check step is **not** synonymous with "the game can end" any more.
 * Under Boomtown rules the turn also holds here when a motion to liquidate is
 * available (#26), and holds a third time after a motion has failed — when
 * neither ending is on offer and the only move left is to end the turn. So the
 * card reads its options off `view.legalMoves` rather than assuming them: the
 * engine is the authority on what may be done, and this only has to say it in
 * words (KTD3).
 *
 * Ending the turn is the quiet default in every shape, because under Boomtown
 * this card now appears on most turns once the window opens — measured at
 * 53–72% of games raising a motion at all (#27). An end‑of‑game control that
 * shouts on every turn stops being read.
 */
export function ActionBar() {
  const view = useLocalActiveView();
  const busy = useGameState((state) => state.inFlight != null);
  const client = useGameClient();
  if (!view) return null;

  if (view.step === 'end-check') {
    const can = (type: string) => view.legalMoves.some((move) => move.type === type);
    const canAnnounce = can('announce-end');
    const canMove = can('move-to-liquidate');

    return (
      <div className={styles.actionCard} aria-label="End of game">
        <p className={styles.actionPrompt}>
          {canAnnounce
            ? 'A corporation is safe or at the end size.'
            : canMove
              ? 'You may ask the table to wind the game up.'
              : 'Nothing left to do this turn.'}
        </p>
        {canMove && (
          <p className={styles.quiet}>
            Everyone votes their shares in safe corporations. If it fails, every backer plays with open books
            for the rest of the game.
          </p>
        )}
        <div className={styles.actionButtons}>
          {canAnnounce && (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => client.dispatch({ type: 'announce-end', seat: view.you })}
            >
              End the game
            </Button>
          )}
          <Button
            variant={canAnnounce ? 'secondary' : 'primary'}
            disabled={busy}
            onClick={() => client.dispatch({ type: 'end-turn', seat: view.you })}
          >
            {canAnnounce ? 'Keep playing' : 'End turn'}
          </Button>
          {canMove && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => client.dispatch({ type: 'move-to-liquidate', seat: view.you })}
            >
              Move to liquidate
            </Button>
          )}
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
