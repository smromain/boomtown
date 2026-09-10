import {
  evaluate,
  legalMoves,
  reduce,
  type Command,
  type GameState,
  type Seat,
} from '@boomtown/engine';

/**
 * Score a candidate command for `seat`: apply it, then read the engine's
 * position evaluator (U8) from `seat`'s perspective on the resulting state. A
 * rejected command scores `-Infinity` so it can never win — `legalMoves` should
 * never hand us one, but the guard keeps a drift bug from making the bot cheat.
 *
 * With `lookahead > 0` and the decision still ours after the move (the buy step,
 * or a merger disposal this seat owns), the bot plays its own best follow-up
 * before scoring. It does not model an opponent reply yet — that is enough to
 * prefer a placement that sets up a cheap founding or a favourable merger next.
 */
export function scoreMove(
  state: GameState,
  seat: Seat,
  command: Command,
  lookahead: number,
): number {
  const result = reduce(state, command);
  if (!result.ok) return Number.NEGATIVE_INFINITY;

  const next = result.state;
  if (lookahead <= 0 || next.status === 'over') return evaluate(next, seat);

  const decider = next.merger?.pending?.seat ?? next.motion?.pending?.seat ?? activeOf(next);
  if (decider !== seat) return evaluate(next, seat);

  return bestScore(next, seat, lookahead - 1);
}

/** The best score `seat` can reach from `state` within `lookahead` plies. */
export function bestScore(state: GameState, seat: Seat, lookahead: number): number {
  const moves = ownMoves(state, seat);
  if (moves.length === 0) return evaluate(state, seat);

  let best = Number.NEGATIVE_INFINITY;
  for (const move of moves) {
    const score = scoreMove(state, seat, move, lookahead);
    if (score > best) best = score;
  }
  return best;
}

export function ownMoves(state: GameState, seat: Seat): Command[] {
  return legalMoves(state).filter(
    (move): move is Command => 'seat' in move && move.seat === seat,
  );
}

function activeOf(state: GameState): Seat {
  return state.turnOrder[state.turnPointer]!;
}
