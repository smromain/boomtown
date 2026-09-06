import { describe, expect, it } from 'vitest';
import { edition2015, reduce, replay, type Command } from '@boomtown/engine';
import { blankGame, ok, rejects, seedCorp } from '../helpers.js';

/**
 * Standard merger fixture: two corporations either side of tile `5E`.
 * `video` sits on column 4, `books` on column 6/7. Seat 0 places `5E`.
 */
function twoCorpBoard(videoTiles: string[], booksTiles: string[]) {
  const game = blankGame({ seats: 3 });
  seedCorp(game, 'video', videoTiles);
  seedCorp(game, 'books', booksTiles);
  game.hands[0] = ['5E'];
  return game;
}

describe('survivor selection', () => {
  it('the larger corporation survives; no decision needed', () => {
    const game = twoCorpBoard(['2E', '3E', '4E'], ['6E', '7E']);
    const placed = ok(game, { type: 'place-tile', seat: 0, tile: '5E' });
    expect(placed.merger).toBeNull();
    expect(placed.corporations.video.founded).toBe(true);
    expect(placed.corporations.books.founded).toBe(false);
    // video: 2E,3E,4E + books 6E,7E + placed 5E = 6
    expect(placed.corporations.video.tiles).toHaveLength(6);
    expect(placed.corporations.video.eaten).toEqual(['books']);
    expect(placed.step).toBe('buy');
  });

  it('a size tie pauses for the mergemaker to choose', () => {
    const game = twoCorpBoard(['3E', '4E'], ['6E', '7E']);
    const placed = ok(game, { type: 'place-tile', seat: 0, tile: '5E' });
    expect(placed.merger?.pending).toEqual({
      type: 'choose-survivor',
      seat: 0,
      options: ['books', 'video'],
    });
    const chosen = ok(placed, { type: 'choose-survivor', seat: 0, survivor: 'books' });
    expect(chosen.corporations.books.founded).toBe(true);
    expect(chosen.corporations.video.founded).toBe(false);
  });

  it('rejects a survivor that is not tied for largest', () => {
    const game = twoCorpBoard(['3E', '4E'], ['6E', '7E']);
    const placed = ok(game, { type: 'place-tile', seat: 0, tile: '5E' });
    rejects(placed, { type: 'choose-survivor', seat: 0, survivor: 'air' }, 'invalid-survivor');
  });

  it('only the mergemaker may choose the survivor', () => {
    const game = twoCorpBoard(['3E', '4E'], ['6E', '7E']);
    const placed = ok(game, { type: 'place-tile', seat: 0, tile: '5E' });
    rejects(placed, { type: 'choose-survivor', seat: 1, survivor: 'video' }, 'not-your-turn');
  });
});

describe('the placed tile never counts', () => {
  it('bonuses are priced at the defunct corporation’s pre-merger size', () => {
    const game = twoCorpBoard(['2E', '3E', '4E'], ['6E', '7E']); // video 3, books 2
    game.seats[0]!.holdings.books = 3; // sole holder
    const result = reduce(game, { type: 'place-tile', seat: 0, tile: '5E' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bonus = result.events.find((e) => e.type === 'bonus-paid');
    // books is tier 1; size 2 -> $200/share -> primary 2000, tertiary 1000 (NOT the size-3 row: primary 3000)
    expect(bonus).toEqual({
      type: 'bonus-paid',
      defunct: 'books',
      payouts: [
        { seat: 0, tier: 'primary', amount: 2000 },
        { seat: 0, tier: 'tertiary', amount: 1000 },
      ],
    });
    expect(result.state.seats[0]!.cash).toBe(6000 + 3000);
  });
});

describe('multi-corporation mergers', () => {
  function threeCorpBoard(video: string[], books: string[], air: string[]) {
    const game = blankGame({ seats: 3 });
    seedCorp(game, 'video', video); // column 4
    seedCorp(game, 'books', books); // column 6/7/8
    seedCorp(game, 'air', air); // 5D / 5C
    game.hands[0] = ['5E'];
    return game;
  }

  it('resolves defunct chains largest-first when sizes differ', () => {
    const game = threeCorpBoard(['1E', '2E', '3E', '4E'], ['6E', '7E', '8E'], ['5D', '5C']);
    const result = reduce(game, { type: 'place-tile', seat: 0, tile: '5E' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const defunctEvents = result.events
      .filter((e) => e.type === 'corporation-defunct')
      .map((e) => (e.type === 'corporation-defunct' ? e.industry : ''));
    expect(defunctEvents).toEqual(['books', 'air']); // 3 before 2
    expect(result.state.corporations.video.eaten).toEqual(['books', 'air']);
  });

  it('pauses for the mergemaker to order two equally sized defunct chains', () => {
    const game = threeCorpBoard(['1E', '2E', '3E', '4E'], ['6E', '7E'], ['5D', '5C']);
    const placed = ok(game, { type: 'place-tile', seat: 0, tile: '5E' });
    expect(placed.merger?.pending).toEqual({
      type: 'choose-defunct-order',
      seat: 0,
      options: ['books', 'air'],
    });
    const ordered = ok(placed, { type: 'choose-defunct-order', seat: 0, next: 'air' });
    // air resolved first, then books
    const done = ordered.merger === null ? ordered : ordered;
    expect(done.corporations.video.eaten).toEqual(['air', 'books']);
  });

  it('fully resolves one defunct chain before starting the next', () => {
    const game = threeCorpBoard(['1E', '2E', '3E', '4E'], ['6E', '7E', '8E'], ['5D', '5C']);
    const result = reduce(game, { type: 'place-tile', seat: 0, tile: '5E' });
    if (!result.ok) throw new Error('merge failed');
    const types = result.events.map((e) => e.type);
    const firstBonus = types.indexOf('bonus-paid');
    const firstDefunct = types.indexOf('corporation-defunct');
    const lastBonus = types.lastIndexOf('bonus-paid');
    expect(firstBonus).toBeLessThan(firstDefunct);
    expect(firstDefunct).toBeLessThan(lastBonus); // books resolved before air's bonus
  });
});

describe('share disposal', () => {
  function atDisposal() {
    const game = twoCorpBoard(['2E', '3E', '4E'], ['6E', '7E']); // video survives, books defunct
    game.turnPointer = 1; // mergemaker is seat 1
    game.hands[0] = [];
    game.hands[1] = ['5E'];
    game.seats[0]!.holdings.books = 2;
    game.seats[1]!.holdings.books = 4;
    game.seats[2]!.holdings.books = 1;
    const placed = ok(game, { type: 'place-tile', seat: 1, tile: '5E' });
    return placed;
  }

  it('offers disposal mergemaker-first, then clockwise', () => {
    const s1 = atDisposal();
    expect(s1.merger?.pending?.seat).toBe(1);
    const s2 = ok(s1, { type: 'dispose-shares', seat: 1, hold: 4, sell: 0, trade: 0 });
    expect(s2.merger?.pending?.seat).toBe(2);
    const s3 = ok(s2, { type: 'dispose-shares', seat: 2, hold: 1, sell: 0, trade: 0 });
    expect(s3.merger?.pending?.seat).toBe(0);
  });

  it('requires the split to account for every share', () => {
    const s1 = atDisposal();
    rejects(s1, { type: 'dispose-shares', seat: 1, hold: 1, sell: 0, trade: 0 }, 'disposal-mismatch');
  });

  it('rejects an odd trade', () => {
    const s1 = atDisposal();
    rejects(s1, { type: 'dispose-shares', seat: 1, hold: 1, sell: 0, trade: 3 }, 'trade-not-even');
  });

  it('caps trades at the survivor’s remaining bank stock', () => {
    const s1 = atDisposal();
    s1.bankShares.video = 1; // room for one traded share only
    rejects(s1, { type: 'dispose-shares', seat: 1, hold: 0, sell: 0, trade: 4 }, 'trade-exceeds-bank');
    const okTrade = ok(s1, { type: 'dispose-shares', seat: 1, hold: 2, sell: 0, trade: 2 });
    expect(okTrade.seats[1]!.holdings.video).toBe(1);
    expect(okTrade.bankShares.video).toBe(0);
  });

  it('selling pays the defunct price and returns shares to the bank', () => {
    const s1 = atDisposal();
    const before = s1.seats[1]!.cash;
    const after = ok(s1, { type: 'dispose-shares', seat: 1, hold: 0, sell: 4, trade: 0 });
    // books size 2, tier 1 -> $200/share
    expect(after.seats[1]!.cash).toBe(before + 800);
    expect(after.seats[1]!.holdings.books).toBe(0);
  });

  it('held defunct shares persist and go live again when the corporation refounds', () => {
    const s1 = atDisposal();
    let state = ok(s1, { type: 'dispose-shares', seat: 1, hold: 4, sell: 0, trade: 0 });
    state = ok(state, { type: 'dispose-shares', seat: 2, hold: 1, sell: 0, trade: 0 });
    state = ok(state, { type: 'dispose-shares', seat: 0, hold: 2, sell: 0, trade: 0 });
    expect(state.merger).toBeNull();
    expect(state.corporations.books.founded).toBe(false);
    expect(state.seats[1]!.holdings.books).toBe(4);

    // seat 1 buys nothing, ends turn; later a seat refounds books
    state = ok(state, { type: 'buy-shares', seat: 1, picks: {} });
    // fast-forward: manually set up a founding for seat 2 (turnPointer now 2)
    state.hands[state.turnOrder[state.turnPointer]!] = ['1I'];
    state.cells['2I'] = { kind: 'unincorporated' };
    const placed = ok(state, { type: 'place-tile', seat: state.turnOrder[state.turnPointer]!, tile: '1I' });
    const refounded = ok(placed, {
      type: 'found-corporation',
      seat: state.turnOrder[state.turnPointer]!,
      industry: 'books',
      hqTile: '1I',
    });
    expect(refounded.corporations.books.founded).toBe(true);
    expect(refounded.corporations.books.eaten).toEqual([]);
    expect(refounded.seats[1]!.holdings.books).toBe(4); // still there
  });
});

describe('determinism', () => {
  it('a merger replays from its command log to the same state', () => {
    const build = () => {
      const game = blankGame({ seats: 3 });
      seedCorp(game, 'video', ['3E', '4E']);
      seedCorp(game, 'books', ['6E', '7E']);
      game.hands[0] = ['5E'];
      game.seats[0]!.holdings.books = 2;
      game.seats[1]!.holdings.books = 3;
      return game;
    };
    const commands: Command[] = [
      { type: 'place-tile', seat: 0, tile: '5E' },
      { type: 'choose-survivor', seat: 0, survivor: 'video' },
      { type: 'dispose-shares', seat: 0, hold: 0, sell: 2, trade: 0 },
      { type: 'dispose-shares', seat: 1, hold: 1, sell: 0, trade: 2 },
      { type: 'buy-shares', seat: 0, picks: {} },
    ];

    let stepwise = build();
    for (const command of commands) stepwise = ok(stepwise, command);

    const replayed = replay(build(), commands);
    expect('state' in replayed).toBe(true);
    if ('state' in replayed) expect(replayed.state).toEqual(stepwise);
  });
});

describe('2015 edition disposal', () => {
  it('resolves a full merger under the 2015 ruleset', () => {
    const game = blankGame({ ruleset: edition2015, seats: 2 });
    seedCorp(game, 'video', ['2E', '3E', '4E']);
    seedCorp(game, 'books', ['6E', '7E']);
    game.hands[0] = ['5E'];
    game.seats[0]!.holdings.books = 2;
    game.seats[1]!.holdings.books = 2;
    let state = ok(game, { type: 'place-tile', seat: 0, tile: '5E' });
    state = ok(state, { type: 'dispose-shares', seat: 0, hold: 2, sell: 0, trade: 0 });
    state = ok(state, { type: 'dispose-shares', seat: 1, hold: 2, sell: 0, trade: 0 });
    expect(state.merger).toBeNull();
    expect(state.step).toBe('buy');
  });
});
