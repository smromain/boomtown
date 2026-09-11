import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  createGame,
  legalMovesForSeat,
  quotaFor,
  reduce,
  replay,
  viewFor,
  type Command,
  type GameState,
  type Industry,
  type Seat,
} from '../src/index.js';

/**
 * A table parked at the end-check step with two safe corporations and a
 * register worth voting on. Crafted rather than played out: the motion is what
 * is under test, not the twenty turns it would take to reach one legitimately.
 */
function table(over: { seats?: number; ruleset?: GameState['ruleset'] } = {}): GameState {
  const count = over.seats ?? 3;
  const state = createGame({
    seats: Array.from({ length: count }, (_, i) => ({ name: `P${i}` })),
    seed: 7,
    turnOrder: Array.from({ length: count }, (_, i) => i),
    ruleset: over.ruleset ?? PRESETS.boomtown,
  });

  const grow = (industry: Industry, tiles: readonly string[]) => {
    const corp = state.corporations[industry];
    corp.founded = true;
    corp.tiles = [...tiles];
    corp.hqTile = tiles[0] ?? null;
    for (const tile of tiles) state.cells[tile] = { kind: 'corporation', industry };
  };
  // 11 tiles each: safe under classic, which is what the register counts.
  grow('books', ['1A', '2A', '3A', '4A', '5A', '6A', '7A', '8A', '9A', '10A', '11A']);
  grow('air', ['1C', '2C', '3C', '4C', '5C', '6C', '7C', '8C', '9C', '10C', '11C']);
  // A third chain that is NOT safe, so the normal ending is not already
  // available: "every corporation on the board is safe" is itself an end
  // condition, and a motion is illegal whenever the game can simply be ended.
  grow('video', ['1E', '2E', '3E']);

  state.step = 'end-check';
  return state;
}

const holdings = (state: GameState, seat: Seat, industry: Industry, shares: number) => {
  state.seats[seat]!.holdings[industry] = shares;
  state.bankShares[industry] -= shares;
};

const motionMoves = (state: GameState, seat: Seat) =>
  legalMovesForSeat(state, seat).filter((m) => m.type === 'move-to-liquidate');

const run = (state: GameState, commands: readonly Command[]): GameState => {
  let current = state;
  for (const command of commands) {
    const result = reduce(current, command);
    if (!result.ok) throw new Error(`${command.type} rejected: ${result.error.code}`);
    current = result.state;
  }
  return current;
};

describe('when a motion is legal', () => {
  it('is offered at the end-check step once two corporations are safe', () => {
    const state = table();
    holdings(state, 0, 'books', 5);
    expect(motionMoves(state, 0)).toHaveLength(1);
  });

  it('is not offered under a ruleset without the vote', () => {
    for (const id of ['classic', 'edition-2015'] as const) {
      const state = table({ ruleset: PRESETS[id] });
      holdings(state, 0, 'books', 5);
      expect({ id, moves: motionMoves(state, 0).length }).toEqual({ id, moves: 0 });
    }
  });

  it('is not offered once the game can simply be ended', () => {
    // A motion is strictly worse than announcing, so the two endings never
    // overlap — by construction, not convention.
    const state = table();
    holdings(state, 0, 'books', 5);
    state.corporations.books.tiles = Array.from({ length: 41 }, (_, i) => `${(i % 12) + 1}${'ABCDEFGHI'[i % 9]}`);
    expect(motionMoves(state, 0)).toHaveLength(0);
  });

  it('is not offered before the quorum of safe corporations', () => {
    const state = table();
    holdings(state, 0, 'books', 5);
    state.corporations.air.tiles = ['1C', '2C']; // no longer safe
    expect(motionMoves(state, 0)).toHaveLength(0);
  });

  it('is not offered to a seat that has spent its motion', () => {
    const state = table();
    holdings(state, 0, 'books', 5);
    state.motionsRaised[0] = 1;
    expect(motionMoves(state, 0)).toHaveLength(0);
  });

  it('is not offered below the minimum seat count — a coalition needs three', () => {
    const state = table({ seats: 2 });
    holdings(state, 0, 'books', 5);
    expect(motionMoves(state, 0)).toHaveLength(0);
  });

  it('is not offered when nobody holds a safe share', () => {
    expect(motionMoves(table(), 0)).toHaveLength(0);
  });
});

describe('raising a motion', () => {
  it('publishes the register and puts the next seat on the clock', () => {
    const state = table();
    holdings(state, 0, 'books', 6);
    holdings(state, 1, 'books', 4);
    const after = run(state, [{ type: 'move-to-liquidate', seat: 0 }]);

    expect(after.registerPublic).toBe(true);
    expect(after.step).toBe('vote');
    expect(after.motion!.pending!.seat).toBe(1);
    // Raising is voting for it: the mover cannot move and then vote no.
    expect(after.motion!.votes[0]).toBe(true);
  });

  it('publishes the register to every seat, but not their cash', () => {
    const state = table();
    holdings(state, 0, 'books', 6);
    holdings(state, 1, 'books', 4);
    const after = run(state, [{ type: 'move-to-liquidate', seat: 0 }]);

    const view = viewFor(after, 2);
    expect(view.register).toEqual({ 0: 6, 1: 4, 2: 0 });
    expect(view.seats[0]!.cash).toBeNull(); // still a closed table
  });

  it('spends the motion whether it carries or not', () => {
    const state = table();
    holdings(state, 0, 'books', 6);
    const after = run(state, [{ type: 'move-to-liquidate', seat: 0 }]);
    expect(after.motionsRaised[0]).toBe(1);
  });
});

describe('resolving a motion', () => {
  it('carries on two-thirds with two backers, and ends the game', () => {
    const state = table();
    holdings(state, 0, 'books', 6);
    holdings(state, 1, 'books', 4);
    holdings(state, 2, 'books', 2); // register 12, two-thirds = 8
    const after = run(state, [
      { type: 'move-to-liquidate', seat: 0 },
      { type: 'cast-vote', seat: 1, inFavour: true }, // 10 of 12, two backers
    ]);

    expect(after.status).toBe('over');
    expect(after.result).not.toBeNull();
    // Seat 2 never had to vote — the count short-circuits once it is settled.
    expect(after.motion).toBeNull();
  });

  it('refuses a lone leader with two-thirds — the reason minBackers exists', () => {
    // The window opens early and a small register can be two-thirds held by one
    // player. Without the two-backer rule this carries at the first legal moment.
    const state = table();
    holdings(state, 0, 'books', 9);
    holdings(state, 1, 'books', 2);
    holdings(state, 2, 'books', 1); // mover alone has 9 of 12 — past the quota
    const after = run(state, [
      { type: 'move-to-liquidate', seat: 0 },
      { type: 'cast-vote', seat: 1, inFavour: false },
      { type: 'cast-vote', seat: 2, inFavour: false },
    ]);

    expect(after.status).toBe('playing');
    expect(after.openBooks).toEqual([0]);
  });

  it('fails as soon as the quota is out of reach, without asking the rest', () => {
    const state = table({ seats: 4 });
    holdings(state, 0, 'books', 2);
    holdings(state, 1, 'books', 9);
    holdings(state, 2, 'books', 1);
    holdings(state, 3, 'books', 1); // register 13, two-thirds = 9
    const after = run(state, [
      { type: 'move-to-liquidate', seat: 0 },
      { type: 'cast-vote', seat: 1, inFavour: false }, // 9 gone: 2+1+1 cannot reach 9
    ]);

    expect(after.status).toBe('playing');
    expect(after.step).toBe('end-check'); // the mover still owes an end-turn
    expect(after.motion).toBeNull();
  });

  it('opens the books of everyone who backed it, and only them', () => {
    const state = table({ seats: 4 });
    holdings(state, 0, 'books', 3);
    holdings(state, 1, 'books', 3);
    holdings(state, 2, 'books', 7);
    holdings(state, 3, 'books', 1); // register 14, two-thirds = 10
    const after = run(state, [
      { type: 'move-to-liquidate', seat: 0 },
      { type: 'cast-vote', seat: 1, inFavour: true },
      // Seat 2's no puts it out of reach (6 for, 1 left), so seat 3 is never
      // asked — the count stops the moment the outcome is settled.
      { type: 'cast-vote', seat: 2, inFavour: false },
    ]);

    expect(after.status).toBe('playing');
    expect(after.openBooks.sort()).toEqual([0, 1]);
    // ...and open really is open, permanently.
    const seen = viewFor(after, 2);
    expect(seen.seats[0]!.cash).not.toBeNull();
    expect(seen.seats[1]!.holdings).not.toBeNull();
    expect(seen.seats[3]!.cash).toBeNull(); // a no vote costs nothing
  });

  it('leaves the register public after a failure — the bell does not un-ring', () => {
    const state = table();
    holdings(state, 0, 'books', 1);
    holdings(state, 1, 'books', 6);
    holdings(state, 2, 'books', 5);
    const after = run(state, [
      { type: 'move-to-liquidate', seat: 0 },
      // 1 for, 11 against between them: settled on the first no.
      { type: 'cast-vote', seat: 1, inFavour: false },
    ]);
    expect(after.registerPublic).toBe(true);
    expect(viewFor(after, 1).register).not.toBeNull();
  });

  it('votes clockwise from the mover', () => {
    const state = table({ seats: 4 });
    holdings(state, 1, 'books', 4);
    holdings(state, 2, 'books', 4);
    holdings(state, 3, 'books', 4);
    state.turnPointer = 1; // only the seat on the clock may raise
    let current = run(state, [{ type: 'move-to-liquidate', seat: 1 }]);
    expect(current.motion!.order).toEqual([1, 2, 3, 0]);
    expect(current.motion!.pending!.seat).toBe(2);
    current = run(current, [{ type: 'cast-vote', seat: 2, inFavour: false }]);
    expect(current.motion!.pending!.seat).toBe(3);
  });

  it('refuses a vote from a seat that is not on the clock', () => {
    const state = table();
    holdings(state, 0, 'books', 4);
    holdings(state, 1, 'books', 4);
    holdings(state, 2, 'books', 4);
    const raised = run(state, [{ type: 'move-to-liquidate', seat: 0 }]);
    const result = reduce(raised, { type: 'cast-vote', seat: 2, inFavour: true });
    expect(result.ok).toBe(false);
  });
});

describe('the motion and the rest of the engine', () => {
  it('replays exactly — a game with a motion in it is reproducible (KTD13)', () => {
    const state = table({ seats: 4 });
    holdings(state, 0, 'books', 3);
    holdings(state, 1, 'books', 3);
    holdings(state, 2, 'books', 7);
    holdings(state, 3, 'books', 1);
    const commands: Command[] = [
      { type: 'move-to-liquidate', seat: 0 },
      { type: 'cast-vote', seat: 1, inFavour: true },
      { type: 'cast-vote', seat: 2, inFavour: false },
    ];
    const direct = run(state, commands);
    const replayed = replay(state, commands);
    expect('state' in replayed).toBe(true);
    expect((replayed as { state: GameState }).state).toEqual(direct);
  });

  it('offers exactly the two votes as legal moves while one is open', () => {
    const state = table();
    holdings(state, 0, 'books', 4);
    holdings(state, 1, 'books', 4);
    holdings(state, 2, 'books', 4);
    const raised = run(state, [{ type: 'move-to-liquidate', seat: 0 }]);
    const moves = legalMovesForSeat(raised, 1);
    expect(moves.map((m) => m.type)).toEqual(['cast-vote', 'cast-vote']);
    // and every one of them is actually accepted
    for (const move of moves) expect(reduce(raised, move).ok).toBe(true);
  });

  it('addresses the vote through the same pendingDecision channel as a merger', () => {
    const state = table();
    holdings(state, 0, 'books', 4);
    holdings(state, 1, 'books', 4);
    holdings(state, 2, 'books', 4);
    const raised = run(state, [{ type: 'move-to-liquidate', seat: 0 }]);
    expect(viewFor(raised, 1).pendingDecision).toEqual({
      type: 'cast-vote',
      seat: 1,
      motionBy: 0,
    });
    expect(viewFor(raised, 2).pendingDecision).toBeNull();
  });
});

describe('the quota scales with the table', () => {
  it('is two-thirds at three and four seats, and half at five and six', () => {
    // Measured, not chosen (#27): a fixed two-thirds carried 63% of motions at
    // three seats and 6% at six.
    const config = PRESETS.boomtown.endVote!;
    expect(quotaFor(config, 3)).toBeCloseTo(2 / 3);
    expect(quotaFor(config, 4)).toBeCloseTo(2 / 3);
    expect(quotaFor(config, 5)).toBe(0.5);
    expect(quotaFor(config, 6)).toBe(0.5);
  });

  it('carries at five seats on a half the same register would not carry at four', () => {
    const state = table({ seats: 5 });
    holdings(state, 0, 'books', 3);
    holdings(state, 1, 'books', 3);
    holdings(state, 2, 'books', 2);
    holdings(state, 3, 'books', 2);
    holdings(state, 4, 'books', 2); // register 12: half is 6, two-thirds is 8
    const after = run(state, [
      { type: 'move-to-liquidate', seat: 0 },
      { type: 'cast-vote', seat: 1, inFavour: true }, // 6 of 12, two backers
    ]);
    expect(after.status).toBe('over');
  });
});
