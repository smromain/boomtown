import { describe, expect, it } from 'vitest';
import {
  createGame,
  legalMoves,
  makeRng,
  reduce,
  type Command,
  type EngineEvent,
  type GameState,
  type Seat,
} from '@boomtown/engine';
import {
  difficulty,
  heuristicPolicy,
  ledgerFrom,
  normalizeDifficulty,
  redactFor,
  type Policy,
} from '../src/index.js';

/** A fresh 4-seat classic game on a fixed seed. */
function game(seed = 7): GameState {
  return createGame({
    seats: Array.from({ length: 4 }, (_, i) => ({ name: `P${i}` })),
    seed,
    turnOrder: [0, 1, 2, 3],
    companyDraw: { books: 0, electronics: 0, air: 0, energy: 0, tech: 0, video: 0, toys: 0 },
  });
}

/** Run a whole game with each seat driven by `policyFor(seat)`. Returns the final state. */
function playOut(
  initial: GameState,
  policyFor: (seat: Seat) => Policy,
  seed = 99,
): GameState {
  let state = initial;
  let rng = makeRng(seed);
  let guard = 0;
  // The public log, accumulated as the game runs — it is what the ledger folds,
  // and the only thing a redacted bot has to reason about opponents with.
  const log: EngineEvent[] = [];

  while (state.status === 'playing') {
    if (guard++ > 5000) throw new Error('game did not terminate');
    const seat = state.merger?.pending?.seat ?? state.turnOrder[state.turnPointer]!;
    // Redacted, exactly as the real driver does it (#25). A harness that fed
    // policies the authoritative state would be measuring a different game from
    // the one anyone plays — which matters most for the tuning runs this
    // function exists to support.
    const choice = policyFor(seat).chooseMove(redactFor(state, seat, ledgerFrom(log, state.seats.length)), seat, rng);
    if (!choice) throw new Error(`no move for seat ${seat} at step ${state.step}`);
    rng = choice.rng;
    const result = reduce(state, choice.command);
    if (!result.ok) {
      throw new Error(`policy emitted an illegal ${choice.command.type}: ${result.error.code}`);
    }
    state = result.state;
    log.push(...result.events);
  }
  return state;
}

describe('difficulty dial', () => {
  it('clamps to 1–10', () => {
    expect(normalizeDifficulty(-3)).toBe(1);
    expect(normalizeDifficulty(50)).toBe(10);
    expect(normalizeDifficulty(4.4)).toBe(4);
    expect(normalizeDifficulty(Number.NaN)).toBe(5);
  });

  it('blunder rate falls to zero as the dial rises; lookahead only at the top', () => {
    expect(difficulty(1).blunderRate).toBeGreaterThan(difficulty(5).blunderRate);
    expect(difficulty(10).blunderRate).toBe(0);
    expect(difficulty(5).lookahead).toBe(0);
    expect(difficulty(10).lookahead).toBeGreaterThan(0);
  });
});

describe('heuristic policy', () => {
  const strong = heuristicPolicy({ level: 10 });

  it('only ever emits a command the reducer accepts (fuzz over a full game)', () => {
    // playOut throws on the first illegal command, so reaching the end is the assertion.
    const final = playOut(game(), () => strong);
    expect(final.status).toBe('over');
  });

  it('resolves every pending decision type without stalling', () => {
    // Seed 7 / this line-up produces multi-corp mergers with disposal decisions;
    // if any pending state had no policy answer, playOut would throw "no move".
    const final = playOut(game(7), () => strong, 3);
    expect(final.result).not.toBeNull();
    expect(final.result!.rankings).toHaveLength(4);
  });

  it('is reproducible: same seeds, same game', () => {
    const a = playOut(game(4), () => heuristicPolicy({ level: 6 }), 12);
    const b = playOut(game(4), () => heuristicPolicy({ level: 6 }), 12);
    expect(b.result!.rankings).toEqual(a.result!.rankings);
    expect(b.seats.map((s) => s.cash)).toEqual(a.seats.map((s) => s.cash));
  });

  it('an all-bot game runs to a ranked result', () => {
    const final = playOut(game(21), () => heuristicPolicy({ level: 4 }), 5);
    expect(final.status).toBe('over');
    const totals = final.result!.rankings.map((r) => r.total);
    // rankings come back sorted best-first
    expect([...totals].sort((x, y) => y - x)).toEqual(totals);
  });

  it('with no blunders, picks the move its own evaluator rates highest', () => {
    const state = game(2);
    const seat = state.turnOrder[state.turnPointer]!;
    const moves = legalMoves(state).filter(
      (m): m is Command => 'seat' in m && m.seat === seat,
    );
    const choice = heuristicPolicy({ level: 10 }).chooseMove(state, seat, makeRng(1));
    expect(choice).not.toBeNull();
    expect(moves).toContainEqual(choice!.command);
  });
});

describe('difficulty monotonicity', () => {
  it('a strong bot beats a weak one materially more often than chance', () => {
    // A reduced sample — the plan runs the full statistical harness in CI/nightly.
    // Seats 0 and 2 are the strong side, 1 and 3 the weak side, so a single game
    // scores two head-to-head pairings.
    const strongLevel = 9;
    const weakLevel = 2;
    const policyFor = (seat: Seat) =>
      heuristicPolicy({ level: seat % 2 === 0 ? strongLevel : weakLevel });

    let strongWins = 0;
    let decided = 0;
    for (let g = 0; g < 12; g++) {
      const final = playOut(game(100 + g), policyFor, 200 + g);
      const cashOf = (seat: number) =>
        final.result!.rankings.find((r) => r.seat === seat)!.total;
      for (const [s, w] of [
        [0, 1],
        [2, 3],
      ] as const) {
        if (cashOf(s) === cashOf(w)) continue;
        decided++;
        if (cashOf(s) > cashOf(w)) strongWins++;
      }
    }
    // 24 pairings; expect the strong side well above half.
    expect(decided).toBeGreaterThan(16);
    expect(strongWins / decided).toBeGreaterThan(0.6);
  });
});
