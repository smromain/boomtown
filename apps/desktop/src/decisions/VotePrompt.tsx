import type { PendingDecision, Seat } from '@boomtown/engine';
import { useGameClient, useAnyView } from '../client/GameClientProvider.js';
import { tallyOf } from '../game/motion.js';
import styles from './decisions.module.css';

type Decision = Extract<PendingDecision, { type: 'cast-vote' }>;

/**
 * The vote on a motion to liquidate (#26). Every seat with a share in a safe
 * corporation is asked in turn, clockwise from the mover.
 *
 * The prompt states the price of a yes before it takes one. Backing a motion
 * that fails opens your books for the rest of the game, and that cost — not the
 * quota — is what makes a speculative or spiteful yes expensive; a player who
 * only discovers it afterwards has been tricked by the interface rather than
 * outplayed at the table.
 *
 * It shows the running tally too, because votes are public and sequential: what
 * the seats before you did is information you are entitled to and would be
 * reading off the table in a physical game.
 */
export function VotePrompt({ decision }: { decision: Decision }) {
  const client = useGameClient();
  const view = useAnyView();
  const tally = view ? tallyOf(view) : null;
  const name = (seat: Seat) => view?.seats[seat]?.name ?? `Player ${seat + 1}`;
  const weight = view?.motion?.weights[decision.seat] ?? 0;

  const cast = (inFavour: boolean) =>
    client.dispatch({ type: 'cast-vote', seat: decision.seat, inFavour });

  return (
    <div>
      <h2>Wind the game up?</h2>
      <p className={styles.seat}>
        {name(decision.motionBy)} moved to liquidate — you vote {weight} {weight === 1 ? 'share' : 'shares'}
      </p>

      {tally && (
        <p className={styles.voteState}>
          <span className="tabnum">{tally.yes}</span> of {tally.total} shares in favour so far;{' '}
          <span className="tabnum">{tally.needed}</span> carries it.
        </p>
      )}

      <div className={styles.options}>
        <button type="button" className={styles.option} onClick={() => cast(true)}>
          <span className={styles.optionName}>Vote to liquidate</span>
          <span className={styles.optionRef}>
            Ends the game now if the motion carries. If it fails, you play the rest of the game with your cash
            and holdings visible to everyone.
          </span>
        </button>
        <button type="button" className={styles.option} onClick={() => cast(false)}>
          <span className={styles.optionName}>Vote against</span>
          <span className={styles.optionRef}>Play on. A vote against costs you nothing either way.</span>
        </button>
      </div>
    </div>
  );
}
