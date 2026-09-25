import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  createGame,
  legalMoves,
  reduce,
  tableView,
  viewFor,
  type GameState,
  type PendingDecision,
} from '@boomtown/engine';

/**
 * The couch table's view (#62). The table is a screen everyone can see, so it
 * is owed what is public and nothing else — checked here at every step of whole
 * games rather than at a few hand-built positions, because a leak that only
 * appears mid-merger or mid-vote is exactly the one a spot check misses.
 */

const SEATS = [{ name: 'Ana' }, { name: 'Bo' }, { name: 'Cy' }, { name: 'Dee' }];

/** A small seeded chooser, so each game takes varied but reproducible paths. */
function chooser(seed: number): (n: number) => number {
  let s = seed >>> 0;
  return (n) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s % n;
  };
}

/** Every state a game passes through, driven by legal moves to the end. */
function playThrough(initial: GameState, seed: number): GameState[] {
  const pick = chooser(seed);
  const states = [initial];
  let state = initial;
  for (let step = 0; step < 6000 && state.status === 'playing'; step += 1) {
    const moves = legalMoves(state);
    if (moves.length === 0) break;
    const result = reduce(state, moves[pick(moves.length)]!);
    if (!result.ok) throw new Error(`driver produced an illegal move: ${result.error.code}`);
    state = result.state;
    states.push(state);
  }
  return states;
}

function openDecision(state: GameState): PendingDecision | null {
  return state.merger?.pending ?? state.motion?.pending ?? null;
}

const SEEDS = [3, 11, 29, 41];

describe('tableView', () => {
  const games = SEEDS.map((seed) =>
    playThrough(createGame({ seats: SEATS, seed, ruleset: PRESETS.boomtown, visibility: 'hidden' }), seed),
  );
  const states = games.flat();

  it('plays games that reach the decisions worth checking', () => {
    // Guard the guard: if the driver stopped reaching these, every test below
    // would pass without looking at the cases it exists for.
    const kinds = new Set(states.map((s) => openDecision(s)?.type).filter(Boolean));
    expect(kinds).toContain('dispose-shares');
    expect(kinds).toContain('cast-vote');
    expect(games.every((g) => g[g.length - 1]!.status === 'over')).toBe(true);
  });

  it('never carries a hand, a seat of its own, or a decision payload', () => {
    for (const state of states) {
      const view = tableView(state) as unknown as Record<string, unknown>;
      for (const key of ['you', 'yourHand', 'yourCash', 'yourHoldings', 'pendingDecision']) {
        expect(view).not.toHaveProperty(key);
      }
      const serialised = JSON.stringify(view);
      for (const hand of state.hands) {
        for (const tile of hand) {
          // A tile in a hand is never on the board, so its id appearing
          // anywhere in the table's view can only be a leak.
          expect(serialised).not.toContain(`"${tile}"`);
        }
      }
    }
  });

  it('shows cash and holdings only where the table is open or the books are', () => {
    for (const state of states) {
      tableView(state).seats.forEach((seat, index) => {
        const bare = state.visibility === 'open' || state.openBooks.includes(index);
        expect(seat.cash).toBe(bare ? state.seats[index]!.cash : null);
        expect(seat.holdings).toEqual(bare ? state.seats[index]!.holdings : null);
      });
    }
  });

  it('names who owes the open decision and what kind, and nothing else', () => {
    for (const state of states) {
      const pending = openDecision(state);
      expect(tableView(state).decision).toEqual(pending ? { seat: pending.seat, kind: pending.type } : null);
    }
  });

  it('agrees with every seat about everything public', () => {
    for (const state of states) {
      const { decision: _decision, seats: tableSeats, ...table } = tableView(state);
      state.seats.forEach((_, index) => {
        const {
          you: _you,
          yourHand: _hand,
          yourCash: _cash,
          yourHoldings: _holdings,
          pendingDecision: _pending,
          seats,
          ...own
        } = viewFor(state, index);
        expect(own).toEqual(table);
        // Seats differ only in whose cash and holdings are bare.
        expect(seats.map((s) => [s.name, s.handCount])).toEqual(tableSeats.map((s) => [s.name, s.handCount]));
      });
    }
  });

  it('shows an open table everything a seat would see of the others', () => {
    const state = createGame({ seats: SEATS, seed: 5, ruleset: PRESETS.classic, visibility: 'open' });
    for (const seat of tableView(state).seats) {
      expect(seat.cash).not.toBeNull();
      expect(seat.holdings).not.toBeNull();
    }
  });
});
