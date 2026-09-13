import type { PendingDecision, Seat } from '@boomtown/engine';
import { useGameClient, useAnyView } from '../client/GameClientProvider.js';
import { tallyOf } from '../game/motion.js';
import styles from './decisions.module.css';
import { copy, fill } from '../copy/copy.js';

const v = copy.decisions.vote;

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
  const name = (seat: Seat) =>
    view?.seats[seat]?.name ?? fill(copy.common.playerFallback, { n: seat + 1 });
  const weight = view?.motion?.weights[decision.seat] ?? 0;

  const cast = (inFavour: boolean) =>
    client.dispatch({ type: 'cast-vote', seat: decision.seat, inFavour });

  return (
    <div>
      <h2>{v.title}</h2>
      <p className={styles.seat}>
        {fill(weight === 1 ? v.seatOne : v.seatMany, { name: name(decision.motionBy), n: weight })}
      </p>

      {tally && (
        <p className={styles.voteState}>
          <span className="tabnum">{tally.yes}</span> {fill(v.tallyLead, { total: tally.total })}{' '}
          <span className="tabnum">{tally.needed}</span> {v.tallyTail}
        </p>
      )}

      <div className={styles.options}>
        <button type="button" className={styles.option} onClick={() => cast(true)}>
          <span className={styles.optionName}>{v.for}</span>
          <span className={styles.optionRef}>{v.forNote}</span>
        </button>
        <button type="button" className={styles.option} onClick={() => cast(false)}>
          <span className={styles.optionName}>{v.against}</span>
          <span className={styles.optionRef}>{v.againstNote}</span>
        </button>
      </div>
    </div>
  );
}
