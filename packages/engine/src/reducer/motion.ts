import type { CastVote, MoveToLiquidate } from '../commands.js';
import type { EndVoteConfig } from '../ruleset/types.js';
import { err } from '../errors.js';
import type { EngineEvent } from '../events.js';
import {
  activeCorporations,
  activeSeat,
  isSafe,
  type GameState,
  type Seat,
} from '../state.js';
import { endConditionMet } from './endgame.js';
import { endGame } from './lifecycle.js';
import type { ReduceResult } from './result.js';

/**
 * The register: one vote per share held in a *safe* corporation.
 *
 * Safe corporations only, because those are the ones certain to still exist at
 * settlement — a corporation that can still be eaten is not a company anyone is
 * voting the future of. Unissued bank stock has no owner and is not counted, so
 * the denominator is what players actually hold.
 *
 * It only ever grows: safe is permanent, two safe corporations can never merge,
 * and safe-corp holdings only increase (bought from the bank, or traded into on
 * a merger, since only defunct stock sells). Nobody is disenfranchised after
 * being enfranchised, and the electorate cannot be attacked.
 */
export function registerWeights(state: GameState): Record<number, number> {
  const safe = activeCorporations(state).filter((industry) => isSafe(state, industry));
  const weights: Record<number, number> = {};
  state.seats.forEach((seat, index) => {
    weights[index] = safe.reduce((sum, industry) => sum + seat.holdings[industry], 0);
  });
  return weights;
}

/**
 * The quota this table plays to. Bigger tables need a lower one: coordinating a
 * supermajority gets harder with every seat, and diffusion of responsibility
 * sets in — everyone waits for someone else to move against the leader.
 */
export function quotaFor(config: EndVoteConfig, seatCount: number): number {
  return config.quotaBySeats?.[seatCount] ?? config.quota;
}

/** Seats that count as safe corporations for the motion window. */
function safeCount(state: GameState): number {
  return activeCorporations(state).filter((industry) => isSafe(state, industry)).length;
}

/**
 * Why `seat` may not move to liquidate right now, or null when they may.
 *
 * Note the end-condition gate: a motion is only legal *while the normal ending
 * is not available*. Once a chain reaches the end size (or every corporation is
 * safe) anyone may simply announce, which is strictly better than asking, so
 * the two endings are mutually exclusive by construction rather than by
 * convention.
 */
export function motionBlockedBecause(state: GameState, seat: Seat): string | null {
  if (state.step !== 'end-check') return 'a motion is raised at the end-check step';
  return motionWindowShut(state, seat);
}

/**
 * The same test minus the step, so `finishTurn` can ask whether a motion is
 * available *before* deciding to stop at `end-check` at all.
 *
 * That split is not cosmetic. `finishTurn` only held at `end-check` when an end
 * condition was met, and a motion is legal only while one is *not* — so gating
 * the motion on the step made it unreachable by construction. Engine tests that
 * set `step` by hand never saw it; playing whole games did (#27).
 */
export function motionWindowShut(state: GameState, seat: Seat): string | null {
  const config = state.ruleset.endVote;
  if (!config) return 'this ruleset has no vote to end';
  if (state.seats.length < config.minPlayers) return 'too few players for a vote';
  if (seat !== activeSeat(state)) return 'only the active seat may raise a motion';
  if (endConditionMet(state)) return 'the game can simply be ended, so a motion is moot';
  if (safeCount(state) < config.quorumSafeCorps) return 'not enough safe corporations yet';
  if ((state.motionsRaised[seat] ?? 0) >= config.motionsPerPlayer) {
    return 'this seat has already raised its motion';
  }
  const weights = registerWeights(state);
  if (Object.values(weights).reduce((a, b) => a + b, 0) <= 0) return 'the register is empty';
  return null;
}

export function canMoveToLiquidate(state: GameState, seat: Seat): boolean {
  return motionBlockedBecause(state, seat) === null;
}

/** Whether the active seat could raise a motion if the turn paused for it. */
export function motionAvailable(state: GameState): boolean {
  return motionWindowShut(state, activeSeat(state)) === null;
}

/** Voting order: the mover, then clockwise around the table. */
function votingOrder(state: GameState, mover: Seat): Seat[] {
  const at = state.turnOrder.indexOf(mover);
  return state.turnOrder.map((_, i) => state.turnOrder[(at + i) % state.turnOrder.length]!);
}

export function applyMoveToLiquidate(state: GameState, command: MoveToLiquidate): ReduceResult {
  const why = motionBlockedBecause(state, command.seat);
  if (why) return err('illegal-motion', why);

  const weights = registerWeights(state);
  const order = votingOrder(state, command.seat);

  state.motionsRaised[command.seat] = (state.motionsRaised[command.seat] ?? 0) + 1;
  state.motion = {
    by: command.seat,
    order,
    weights,
    // Raising a motion *is* voting for it; the mover cannot move and then vote no.
    cursor: 1,
    votes: { [command.seat]: true },
    pending: order[1] === undefined ? null : { type: 'cast-vote', seat: order[1], motionBy: command.seat },
  };
  state.step = 'vote';

  const events: EngineEvent[] = [{ type: 'motion-raised', seat: command.seat }];
  if (!state.registerPublic) {
    state.registerPublic = true;
    events.push({ type: 'register-published' });
  }
  events.push({ type: 'vote-cast', seat: command.seat, inFavour: true, weight: weights[command.seat] ?? 0 });

  return settle(state, events);
}

export function applyCastVote(state: GameState, command: CastVote): ReduceResult {
  const motion = state.motion;
  if (!motion) return err('wrong-step', 'no motion is open');
  if (motion.pending?.seat !== command.seat) return err('not-your-turn', 'not your vote to cast');

  motion.votes[command.seat] = command.inFavour;
  motion.cursor += 1;
  const events: EngineEvent[] = [
    {
      type: 'vote-cast',
      seat: command.seat,
      inFavour: command.inFavour,
      weight: motion.weights[command.seat] ?? 0,
    },
  ];
  return settle(state, events);
}

/** The vote so far, and whether it is already decided either way. */
function settle(state: GameState, events: EngineEvent[]): ReduceResult {
  const motion = state.motion!;
  const config = state.ruleset.endVote!;
  const cast = Object.keys(motion.votes).map(Number);
  const remaining = motion.order.slice(motion.cursor);

  const weightOf = (seat: Seat) => motion.weights[seat] ?? 0;
  const yes = cast.filter((s) => motion.votes[s]).reduce((sum, s) => sum + weightOf(s), 0);
  const backers = cast.filter((s) => motion.votes[s]);

  // With `quotaBase: 'cast'` the denominator grows as votes arrive, so an early
  // "carried" could be undone by a later no. Only the register base can settle
  // before everyone has spoken. (Abstention, which is what makes the two bases
  // genuinely differ, is not implemented yet.)
  const registerTotal = Object.values(motion.weights).reduce((a, b) => a + b, 0);
  const castTotal = cast.reduce((sum, s) => sum + weightOf(s), 0);
  const quota = quotaFor(config, state.seats.length);
  const total = config.quotaBase === 'cast' ? castTotal : registerTotal;
  const needed = Math.ceil(quota * total);

  const decidedEarly = config.quotaBase === 'register';
  const carried = yes >= needed && backers.length >= config.minBackers;
  const maxYes = yes + remaining.reduce((sum, s) => sum + weightOf(s), 0);
  const maxBackers = backers.length + remaining.length;
  const doomed = maxYes < Math.ceil(quota * registerTotal) || maxBackers < config.minBackers;

  if (carried && (decidedEarly || remaining.length === 0)) {
    events.push({ type: 'motion-carried', backers, yes, total });
    state.motion = null;
    endGame(state, events);
    return { ok: true, state, events };
  }

  if (remaining.length === 0 || doomed) {
    return fail(state, events, backers, yes, total);
  }

  const next = remaining[0]!;
  motion.pending = { type: 'cast-vote', seat: next, motionBy: motion.by };
  return { ok: true, state, events };
}

/**
 * A failed motion is where every price in this design is actually paid: the
 * register stays published, and everyone who backed it opens their books for
 * the rest of the game. A carried motion ends the game, so none of it matters
 * there — the cost of a yes vote is `P(fail) x your privacy`, which taxes
 * speculative and spiteful votes precisely and leaves sincere ones nearly free.
 */
function fail(
  state: GameState,
  events: EngineEvent[],
  backers: readonly Seat[],
  yes: number,
  total: number,
): ReduceResult {
  const opened = backers.filter((seat) => !state.openBooks.includes(seat));
  state.openBooks.push(...opened);
  state.motion = null;
  // The mover's turn continues: they still owe an end-turn.
  state.step = 'end-check';

  events.push({ type: 'motion-failed', backers: [...backers], yes, total });
  if (opened.length > 0) events.push({ type: 'books-opened', seats: opened });
  return { ok: true, state, events };
}
