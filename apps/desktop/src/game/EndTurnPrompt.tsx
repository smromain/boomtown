import { useGameClient, useGameState, useLocalActiveView } from '../client/GameClientProvider.js';
import styles from '../decisions/decisions.module.css';
import { copy } from '../copy/copy.js';

const e = copy.game.endTurn;

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
      <h2>{canAnnounce ? e.titleCanEnd : canMove ? e.titleBeforeFinish : e.titleOver}</h2>
      <p className={styles.seat}>
        {canAnnounce ? e.noteCanEnd : canMove ? e.noteCanMove : e.noteOver}
      </p>

      <div className={styles.options}>
        {canAnnounce && (
          <button type="button" className={styles.option} disabled={busy} onClick={() => client.dispatch({ type: 'announce-end', seat: view.you })}>
            <span className={styles.optionName}>{e.endGame}</span>
            <span className={styles.optionRef}>{e.endGameNote}</span>
          </button>
        )}

        <button type="button" className={styles.option} disabled={busy} onClick={endTurn}>
          <span className={styles.optionName}>{canAnnounce ? e.keepPlaying : e.endTurn}</span>
          <span className={styles.optionRef}>
            {canAnnounce ? e.keepPlayingNote : e.endTurnNote}
          </span>
        </button>

        {canMove && (
          <button type="button" className={styles.option} disabled={busy} onClick={() => client.dispatch({ type: 'move-to-liquidate', seat: view.you })}>
            <span className={styles.optionName}>{e.moveToLiquidate}</span>
            <span className={styles.optionRef}>{e.moveToLiquidateNote}</span>
          </button>
        )}
      </div>
    </div>
  );
}
