import {
  INDUSTRIES,
  allTiles,
  makeRng,
  shuffle,
  type GameState,
  type Seat,
  type TileId,
} from '@boomtown/engine';
import { estimateHoldings, ledgerFrom, type Ledger } from './ledger.js';

/**
 * The state a bot is allowed to reason on: everything public, its own secrets
 * intact, and every other secret replaced by a plausible belief.
 *
 * A bot has to run `reduce` to look ahead, and `reduce` needs a whole
 * `GameState` — so the honest boundary is not a narrower argument but a
 * *redacted* one. The driver holds the real state and hands over this instead,
 * which means no policy can reach a hidden value even by accident, now or after
 * someone deepens the lookahead later. The rule it implements is the general
 * one: **a bot sees what a player at that table could see.**
 *
 * At an open table (`visibility: 'open'`) cash and holdings are public, so those
 * are passed through untouched — redacting them would make bots *worse* than
 * the humans they play against, which is no fairer than making them better.
 *
 * The result is a consistent, legal `GameState`: hand sizes match, and the
 * unseen tiles are dealt out so the bag and the fake hands together account for
 * exactly the tiles nobody can see. `reduce` accepts it, and a lookahead that
 * draws from it draws from a believable pile rather than the real one.
 */
export function redactFor(state: GameState, seat: Seat, ledger?: Ledger): GameState {
  const beliefs = ledger ?? ledgerFrom([], state.seats.length);
  const open = state.visibility === 'open';

  // Tiles nobody watching the board can place: the whole set, minus what is on
  // it, minus what has been swept out of play, minus this seat's own hand.
  const mine = new Set(state.hands[seat] ?? []);
  const removed = new Set(state.removed);
  const pool: TileId[] = allTiles(state.ruleset).filter(
    (tile) => !(tile in state.cells) && !removed.has(tile) && !mine.has(tile),
  );

  // Deterministic, seeded off the real rng and the seat: redaction stays pure,
  // and replaying the same game redacts identically (KTD13). It must NOT reuse
  // the real rng state directly — that is the sequence the true bag was dealt
  // from, and a bot must not be able to run it forward.
  const { value: unseen } = shuffle(makeRng(state.rng.s ^ ((seat + 1) * 0x9e37)), pool);

  let cursor = 0;
  const hands = state.hands.map((hand, index) => {
    if (index === seat) return [...hand];
    return unseen.slice(cursor, (cursor += hand.length));
  });
  const bag = unseen.slice(cursor);

  const estimates = open
    ? null
    : Object.fromEntries(
        INDUSTRIES.map((industry) => [
          industry,
          estimateHoldings(
            beliefs,
            industry,
            seat,
            state.seats[seat]?.holdings[industry] ?? 0,
            state.bankShares[industry],
          ),
        ]),
      );

  const seats = state.seats.map((s, index) => {
    if (index === seat || open) return { ...s, holdings: { ...s.holdings } };
    return {
      ...s,
      // Nothing reads another seat's cash today; it is replaced rather than
      // carried so that a future reader gets a belief and not the truth.
      cash: 0,
      holdings: Object.fromEntries(
        INDUSTRIES.map((industry) => [industry, estimates![industry]![index] ?? 0]),
      ) as typeof s.holdings,
    };
  });

  return { ...state, seats, hands, bag };
}

/** Convenience for the driver: fold the log, then redact in one step. */
export function beliefState(state: GameState, seat: Seat, log: Parameters<typeof ledgerFrom>[0]): GameState {
  return redactFor(state, seat, ledgerFrom(log, state.seats.length));
}
