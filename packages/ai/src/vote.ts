import { finalSettlement, type GameState, type Seat } from '@boomtown/engine';

/**
 * How a bot votes on a motion to liquidate.
 *
 * This cannot go through `evaluate`, and the first tuning run proved it: with
 * the generic scorer every bot voted yes and every motion carried, at every
 * quota. The reason is that `evaluate` measures a seat's own money, and final
 * settlement realises everyone's equity at full value plus bonuses where the
 * running estimate discounts it — so ending the game raises *everybody's*
 * score. The quota was measuring nothing.
 *
 * A player does not vote on their own balance, they vote on their **standing**.
 * Ending freezes variance, and variance is the only route to first for anyone
 * not already there — so the leader votes yes and everyone else votes no,
 * which is the whole game-theoretic spine of the design.
 *
 * The estimate runs on the seat's *belief* state, so a bot that has misjudged
 * the register misjudges its own standing too. That is the intended failure
 * mode: misreading where you stand is where the tension lives.
 */
export function wouldWinBySettlingNow(state: GameState, seat: Seat): boolean {
  const result = finalSettlement(state);
  return result.winners.includes(seat);
}

/**
 * Whether `seat` should back a motion, given how confident it needs to be.
 *
 * `margin` is the cushion a bot wants before committing: backing a motion that
 * fails costs its books for the rest of the game, so a cautious bot wants to be
 * clearly ahead rather than nominally ahead. It scales with difficulty — a weak
 * bot backs anything that looks good and walks into the exposure, a strong one
 * waits. That reads at the table as recklessness against judgement rather than
 * as a difficulty number.
 */
export function backsMotion(state: GameState, seat: Seat, margin: number): boolean {
  const result = finalSettlement(state);
  const mine = result.rankings.find((row) => row.seat === seat)?.total ?? 0;
  const best = Math.max(...result.rankings.filter((row) => row.seat !== seat).map((row) => row.total));
  return mine >= best * (1 + margin);
}
