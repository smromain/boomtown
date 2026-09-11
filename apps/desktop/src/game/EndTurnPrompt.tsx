import { useGameClient, useGameState, useLocalActiveView } from '../client/GameClientProvider.js';
import styles from '../decisions/decisions.module.css';

/**
 * The end-of-turn choice: announce the end, move to liquidate, or play on.
 *
 * It reads its options off `view.legalMoves` rather than assuming any of them.
 * The end-check step is not synonymous with "the game can end" — under Boomtown
 * the turn also holds here when a motion is available (which requires that no
 * end condition is met), and a third time after a motion has failed, when
 * ending the turn is the only move left. The engine is the authority on what
 * may be done; this only has to say it in words (KTD3).
 *
 * Continuing is always the last option and always available, so the shape of
 * the prompt changes but the way out of it never does.
 */
export function EndTurnPrompt() {
  const view = useLocalActiveView();
  const busy = useGameState((state) => state.inFlight != null);
  const client = useGameClient();
  if (!view) return null;

  const can = (type: string) => view.legalMoves.some((move) => move.type === type);
  const canAnnounce = can('announce-end');
  const canMove = can('move-to-liquidate');

  const endTurn = () => client.dispatch({ type: 'end-turn', seat: view.you });

  return (
    <div>
      <h2>{canAnnounce ? 'The game can end here' : canMove ? 'Before you finish' : 'Your turn is over'}</h2>
      <p className={styles.seat}>
        {canAnnounce
          ? 'A corporation is safe or at the end size. Ending is a choice — nobody is forced.'
          : canMove
            ? 'No corporation has reached the end size, but you may ask the table to wind the game up.'
            : 'Nothing left to do this turn.'}
      </p>

      <div className={styles.options}>
        {canAnnounce && (
          <button type="button" className={styles.option} disabled={busy} onClick={() => client.dispatch({ type: 'announce-end', seat: view.you })}>
            <span className={styles.optionName}>End the game</span>
            <span className={styles.optionRef}>
              You finish this turn and nobody gets another. Final scoring follows.
            </span>
          </button>
        )}

        <button type="button" className={styles.option} disabled={busy} onClick={endTurn}>
          <span className={styles.optionName}>{canAnnounce ? 'Keep playing' : 'End turn'}</span>
          <span className={styles.optionRef}>
            {canAnnounce ? 'Pass to the next player and leave the ending for later.' : 'Pass to the next player.'}
          </span>
        </button>

        {canMove && (
          <button type="button" className={styles.option} disabled={busy} onClick={() => client.dispatch({ type: 'move-to-liquidate', seat: view.you })}>
            <span className={styles.optionName}>Move to liquidate</span>
            <span className={styles.optionRef}>
              Everyone votes their shares in safe corporations. If it fails, every backer plays the
              rest of the game with open books — including you.
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
