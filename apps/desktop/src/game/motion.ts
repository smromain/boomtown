import { quotaFor, type PlayerView, type Seat } from '@boomtown/engine';

export interface Tally {
  /** Who raised the motion. */
  readonly by: Seat;
  /** Total register weight — the denominator the quota is taken of. */
  readonly total: number;
  /** Weight cast in favour so far. */
  readonly yes: number;
  /** Weight cast against so far. */
  readonly no: number;
  /** Weight still to vote. */
  readonly undecided: number;
  /** Weight needed to carry, i.e. `ceil(quota x total)`. */
  readonly needed: number;
  /** The quota itself, for display as a percentage. */
  readonly quota: number;
  /** Seats that have backed it so far, and how many are required. */
  readonly backers: readonly Seat[];
  readonly minBackers: number;
  /** The seat whose vote is awaited, or null once the motion is decided. */
  readonly waitingOn: Seat | null;
}

/**
 * The running vote, derived rather than stored.
 *
 * The engine settles the motion itself and never publishes a partial tally —
 * so this recomputes it from `view.motion`, which carries the frozen weights
 * and the votes cast so far. Deriving it keeps the display honest by
 * construction: it can only ever show votes the engine has actually recorded,
 * and the quota it draws is read from the same `endVote` config the reducer
 * settles against.
 */
export function tallyOf(view: PlayerView): Tally | null {
  const motion = view.motion;
  const config = view.ruleset.endVote;
  if (!motion || !config) return null;

  const weightOf = (seat: Seat) => motion.weights[seat] ?? 0;
  const seats = Object.keys(motion.weights).map(Number);
  const voted = seats.filter((seat) => motion.votes[seat] !== undefined);
  const sum = (list: readonly Seat[]) => list.reduce((acc, seat) => acc + weightOf(seat), 0);

  const backers = voted.filter((seat) => motion.votes[seat]);
  const total = sum(seats);
  const quota = quotaFor(config, view.seats.length);

  return {
    by: motion.by,
    total,
    yes: sum(backers),
    no: sum(voted.filter((seat) => !motion.votes[seat])),
    undecided: sum(seats.filter((seat) => motion.votes[seat] === undefined)),
    needed: Math.ceil(quota * total),
    quota,
    backers,
    minBackers: config.minBackers,
    waitingOn: motion.waitingOn,
  };
}
