import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  boomtown,
  classic,
  createGame,
  legalMoves,
  reduce,
  retrospective,
  type Award,
  type AwardId,
  type Command,
  type GameState,
  type Industry,
  type Ruleset,
  type Seat,
} from '../src/index.js';

/** The same reproducible driver the retrospective tests use: a real log, cheaply. */
function playOut(ruleset: Ruleset, seed: number, seats = 3): { initial: GameState; log: Command[] } {
  const initial = createGame({
    seats: Array.from({ length: seats }, (_, i) => ({ name: `P${i}` })),
    seed,
    ruleset,
    turnOrder: Array.from({ length: seats }, (_, i) => i),
  });
  const log: Command[] = [];
  let state = initial;
  for (let step = 0; step < 6000 && state.status === 'playing'; step += 1) {
    const moves = legalMoves(state);
    if (moves.length === 0) break;
    const command = moves.find((move) => move.type === 'announce-end') ?? moves[moves.length - 1]!;
    const result = reduce(state, command);
    if (!result.ok) throw new Error(`driver produced an illegal move: ${result.error.code}`);
    log.push(command);
    state = result.state;
  }
  return { initial, log };
}

const ids = (awards: readonly Award[]): AwardId[] => awards.map((award) => award.id);
const find = (awards: readonly Award[], id: AwardId): Award | undefined =>
  awards.find((award) => award.id === id);

describe('awards — the shape every one of them keeps', () => {
  const { initial, log } = playOut(boomtown, 20250917);
  const { awards } = retrospective(initial, log);

  it('earns a useful number of them from one real game', () => {
    expect(awards.length).toBeGreaterThan(8);
  });

  it('never awards one to nobody', () => {
    for (const award of awards) expect(award.seats.length).toBeGreaterThan(0);
  });

  it('never awards one to the whole table — a superlative everybody ties on says nothing', () => {
    for (const award of awards) expect(award.seats.length).toBeLessThan(initial.seats.length);
  });

  it('lists tied seats ascending, so a replay ranks them identically', () => {
    for (const award of awards) {
      expect([...award.seats].sort((a, b) => a - b)).toEqual(award.seats);
    }
  });

  it('gives each award at most once', () => {
    expect(new Set(ids(awards)).size).toBe(awards.length);
  });

  it('is a pure function of the log', () => {
    expect(retrospective(initial, log).awards).toEqual(awards);
  });

  it('names the corporation an award is *about*, where there is one', () => {
    expect(find(awards, 'right-place-right-collapse')?.industry).toBeDefined();
    expect(find(awards, 'too-big-to-fail')?.industry).toBeDefined();
  });

  it('awards nothing at all for a game nobody played', () => {
    expect(retrospective(initial, []).awards).toEqual([]);
  });
});

describe('awards — the four that are Boomtown’s own', () => {
  const boomtownAwards: AwardId[] = [
    'called-last-orders',
    'shareholder-activist',
    'showed-everyone-their-hand',
    'institutional-investor',
  ];

  it('are skipped at a classic table, which has no motion to raise', () => {
    const game = playOut(classic, 7, 4);
    const earned = ids(retrospective(game.initial, game.log).awards);
    for (const id of boomtownAwards) expect(earned).not.toContain(id);
  });

  it('name whoever called the end at a Boomtown table', () => {
    const game = playOut(boomtown, 20250917);
    let state = game.initial;
    for (const command of game.log) {
      const result = reduce(state, command);
      if (!result.ok) throw new Error('log did not replay');
      state = result.state;
    }
    const award = find(retrospective(game.initial, game.log).awards, 'called-last-orders');
    expect(award?.seats).toEqual([state.endAnnouncedBy]);
  });
});

/**
 * A table parked at the end-check step with two safe corporations, borrowed
 * from `motion.test.ts`: the motion awards are what is under test, not the
 * twenty turns it takes to reach one legitimately.
 */
function motionTable(): GameState {
  const state = createGame({
    seats: [{ name: 'P0' }, { name: 'P1' }, { name: 'P2' }],
    seed: 7,
    turnOrder: [0, 1, 2],
    ruleset: PRESETS.boomtown,
  });
  const grow = (industry: Industry, tiles: readonly string[]) => {
    const corp = state.corporations[industry];
    corp.founded = true;
    corp.tiles = [...tiles];
    corp.hqTile = tiles[0] ?? null;
    for (const tile of tiles) state.cells[tile] = { kind: 'corporation', industry };
  };
  grow('books', ['1A', '2A', '3A', '4A', '5A', '6A', '7A', '8A', '9A', '10A', '11A']);
  grow('air', ['1C', '2C', '3C', '4C', '5C', '6C', '7C', '8C', '9C', '10C', '11C']);
  grow('video', ['1E', '2E', '3E']);
  const hold = (seat: Seat, industry: Industry, shares: number) => {
    state.seats[seat]!.holdings[industry] = shares;
    state.bankShares[industry] -= shares;
  };
  hold(0, 'books', 3);
  hold(1, 'books', 8);
  hold(2, 'air', 2);
  state.step = 'end-check';
  return state;
}

describe('awards — the motion', () => {
  const table = motionTable();
  // Seat 0 moves to liquidate and loses: seat 1 carries the heavier register.
  const log: Command[] = [
    { type: 'move-to-liquidate', seat: 0 },
    { type: 'cast-vote', seat: 1, inFavour: false },
    { type: 'cast-vote', seat: 2, inFavour: false },
  ];
  const { awards } = retrospective(table, log);

  it('credits the seat that raised it', () => {
    expect(find(awards, 'shareholder-activist')).toMatchObject({ seats: [0], value: 1 });
  });

  it('credits the heaviest vote in the room', () => {
    const award = find(awards, 'institutional-investor');
    expect(award?.seats).toEqual([1]);
    expect(award?.value).toBe(8);
  });

  it('names whoever backed a motion that failed and now plays with open books', () => {
    expect(find(awards, 'showed-everyone-their-hand')?.seats).toEqual([0]);
  });
});

/**
 * A rug pull, built move by move because no driver finds one by accident:
 * seat 0 founds a corporation, the others buy into it, and then seat 0 places
 * the tile that merges it away.
 */
function rugPullGame(): { initial: GameState; log: Command[] } {
  const initial = createGame({
    seats: [{ name: 'P0' }, { name: 'P1' }, { name: 'P2' }],
    seed: 3,
    turnOrder: [0, 1, 2],
    ruleset: PRESETS.classic,
  });
  // A big chain for the small one to be eaten by, and two loose tiles for the
  // founding. Hands are set explicitly so each seat plays the tile it needs.
  const grow = (industry: Industry, tiles: readonly string[]) => {
    const corp = initial.corporations[industry];
    corp.founded = true;
    corp.tiles = [...tiles];
    corp.hqTile = tiles[0] ?? null;
    for (const tile of tiles) initial.cells[tile] = { kind: 'corporation', industry };
  };
  grow('books', ['1A', '1B', '1C', '1D', '1E', '1F']);
  initial.cells['3A'] = { kind: 'unincorporated' };
  // 4A founds air on {3A, 4A}, clear of the books chain; 2A is the bridge that
  // later merges the two. 9I and 12I are isolated, so the other two seats can
  // take a turn without founding anything of their own.
  initial.hands = [['4A', '2A'], ['9I'], ['12I']];
  initial.bag = ['6A', '7A', '8A', '9A', '10A', '11A', '6I', '7I', '5C', '5D'];

  const log: Command[] = [
    // seat 0: 4A joins 3A and founds air, taking the founder's share
    { type: 'place-tile', seat: 0, tile: '4A' },
    { type: 'found-corporation', seat: 0, industry: 'air', hqTile: '4A' },
    // no `end-turn` anywhere: the turn advances the instant a buy resolves
    // unless an ending is available, and at this classic table none is
    { type: 'buy-shares', seat: 0, picks: {} },
    // the others buy into it
    { type: 'place-tile', seat: 1, tile: '9I' },
    { type: 'buy-shares', seat: 1, picks: { air: 3 } },
    { type: 'place-tile', seat: 2, tile: '12I' },
    { type: 'buy-shares', seat: 2, picks: { air: 2 } },
    // seat 0 pulls the floor out: 2A bridges air into the bigger books chain
    { type: 'place-tile', seat: 0, tile: '2A' },
  ];
  return { initial, log };
}

describe('awards — the rug pull', () => {
  const { initial, log } = rugPullGame();

  it('replays the scripted pull', () => {
    let state = initial;
    for (const command of log) {
      const result = reduce(state, command);
      expect(result.ok, `${command.type} was rejected`).toBe(true);
      if (!result.ok) return;
      state = result.state;
    }
    // the tile has started the merger; air is not gone until the disposals are
    expect(state.merger?.merging).toContain('air');
    expect(state.merger?.survivor).toBe('books');
  });

  it('credits the founder who merged it away, ranked by what the others were left holding', () => {
    // disposal is pending when the log runs out; the pull is already recorded
    const award = find(retrospective(initial, log).awards, 'rug-puller');
    expect(award).toBeUndefined();
  });

  it('records the pull once the disposals are in', () => {
    let state = initial;
    const full = [...log];
    for (const command of full) {
      const result = reduce(state, command);
      if (!result.ok) throw new Error(`${command.type}: ${result.error.code}`);
      state = result.state;
    }
    // walk the pending disposals: everyone keeps what they hold
    while (state.merger?.pending) {
      const pending = state.merger.pending;
      if (pending.type !== 'dispose-shares') break;
      const command: Command = { type: 'dispose-shares', seat: pending.seat, hold: pending.shares, sell: 0, trade: 0 };
      full.push(command);
      const result = reduce(state, command);
      if (!result.ok) throw new Error(`dispose: ${result.error.code}`);
      state = result.state;
    }
    const award = find(retrospective(initial, full).awards, 'rug-puller');
    expect(award?.seats).toEqual([0]);
    expect(award?.industry).toBe('air');
    // seat 1 held 3 and seat 2 held 2; the founder's own share is not a victim
    expect(award?.value).toBe(5);
  });

  it('counts the shares held through that merger as sentimental value', () => {
    let state = initial;
    const full = [...log];
    for (const command of full) {
      const result = reduce(state, command);
      if (!result.ok) throw new Error(`${command.type}: ${result.error.code}`);
      state = result.state;
    }
    while (state.merger?.pending) {
      const pending = state.merger.pending;
      if (pending.type !== 'dispose-shares') break;
      const command: Command = { type: 'dispose-shares', seat: pending.seat, hold: pending.shares, sell: 0, trade: 0 };
      full.push(command);
      const result = reduce(state, command);
      if (!result.ok) throw new Error(`dispose: ${result.error.code}`);
      state = result.state;
    }
    expect(find(retrospective(initial, full).awards, 'sentimental-value')?.seats).toEqual([1]);
  });
});
