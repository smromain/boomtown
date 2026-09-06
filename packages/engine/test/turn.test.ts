import { describe, expect, it } from 'vitest';
import { INDUSTRIES, classifyPlacement, edition2015, isPlayable, reduce } from '@boomtown/engine';
import { blankGame, ok, rejects, seedCorp, seedUnincorporated } from './helpers.js';

describe('placement outcomes', () => {
  it('an isolated tile does nothing and moves to the buy step', () => {
    const game = blankGame();
    game.hands[0] = ['6E'];
    const next = ok(game, { type: 'place-tile', seat: 0, tile: '6E' });
    expect(next.cells['6E']).toEqual({ kind: 'unincorporated' });
    expect(next.step).toBe('buy');
    expect(next.hands[0]).toEqual([]);
  });

  it('placing next to an unincorporated tile founds a corporation', () => {
    const game = blankGame();
    seedUnincorporated(game, '6F');
    game.hands[0] = ['6E'];
    const placed = ok(game, { type: 'place-tile', seat: 0, tile: '6E' });
    expect(placed.step).toBe('found');
    expect([...placed.pendingFound!.group].sort()).toEqual(['6E', '6F']);

    const founded = ok(placed, {
      type: 'found-corporation',
      seat: 0,
      industry: 'video',
      hqTile: '6E',
    });
    expect(founded.corporations.video.founded).toBe(true);
    expect(founded.corporations.video.tiles.sort()).toEqual(['6E', '6F']);
    expect(founded.corporations.video.hqTile).toBe('6E');
    expect(founded.step).toBe('buy');
  });

  it('founding pays one free share when the bank has it', () => {
    const game = blankGame();
    seedUnincorporated(game, '6F');
    game.hands[0] = ['6E'];
    const placed = ok(game, { type: 'place-tile', seat: 0, tile: '6E' });
    const founded = ok(placed, { type: 'found-corporation', seat: 0, industry: 'video', hqTile: '6E' });
    expect(founded.seats[0]!.holdings.video).toBe(1);
    expect(founded.bankShares.video).toBe(24);
  });

  it('founding pays nothing when that bank is empty (R5)', () => {
    const game = blankGame();
    seedUnincorporated(game, '6F');
    game.hands[0] = ['6E'];
    game.bankShares.video = 0;
    const placed = ok(game, { type: 'place-tile', seat: 0, tile: '6E' });
    const founded = ok(placed, { type: 'found-corporation', seat: 0, industry: 'video', hqTile: '6E' });
    expect(founded.seats[0]!.holdings.video).toBe(0);
    expect(founded.bankShares.video).toBe(0);
  });

  it('founding is blocked with all seven corporations on the board; the tile stays in hand and is not dead', () => {
    const game = blankGame();
    for (const industry of INDUSTRIES) game.corporations[industry].founded = true;
    seedUnincorporated(game, '6F');
    game.hands[0] = ['6E'];
    expect(classifyPlacement(game, '6E').kind).toBe('found-blocked');
    expect(isPlayable(game, '6E')).toBe(false);
    rejects(game, { type: 'place-tile', seat: 0, tile: '6E' }, 'founding-blocked-all-corporations-active');
    const after = reduce(game, { type: 'place-tile', seat: 0, tile: '6E' });
    expect(after.ok).toBe(false);
    expect(game.hands[0]).toContain('6E');
  });

  it('growing absorbs a connected run of unincorporated tiles', () => {
    const game = blankGame();
    seedCorp(game, 'video', ['5H', '5I']);
    seedUnincorporated(game, '4H');
    game.hands[0] = ['4I'];
    const next = ok(game, { type: 'place-tile', seat: 0, tile: '4I' });
    expect(next.corporations.video.tiles.sort()).toEqual(['4H', '4I', '5H', '5I']);
    expect(next.cells['4H']).toEqual({ kind: 'corporation', industry: 'video' });
    expect(next.step).toBe('buy');
  });

  it('placing between two corporations starts a merger', () => {
    const game = blankGame();
    seedCorp(game, 'video', ['5H', '5I']);
    seedCorp(game, 'books', ['7H', '7I']);
    game.hands[0] = ['6H'];
    const result = reduce(game, { type: 'place-tile', seat: 0, tile: '6H' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.step).toBe('merge');
    expect([...result.state.merger!.merging].sort()).toEqual(['books', 'video']);
    expect(result.events).toContainEqual({
      type: 'merger-started',
      placedTile: '6H',
      corporations: expect.arrayContaining(['books', 'video']),
    });
  });
});

describe('buying shares', () => {
  function atBuyStep() {
    const game = blankGame();
    seedCorp(game, 'video', ['5H', '5I', '4I']); // size 3, tier 3 -> $500/share
    game.hands[0] = ['6E'];
    return ok(game, { type: 'place-tile', seat: 0, tile: '6E' });
  }

  it('rejects a fourth share', () => {
    rejects(atBuyStep(), { type: 'buy-shares', seat: 0, picks: { video: 4 } }, 'too-many-shares');
  });

  it('rejects a purchase the seat cannot afford', () => {
    const game = atBuyStep();
    game.seats[0]!.cash = 100;
    rejects(game, { type: 'buy-shares', seat: 0, picks: { video: 1 } }, 'not-enough-cash');
  });

  it('rejects buying from an empty bank', () => {
    const game = atBuyStep();
    game.bankShares.video = 0;
    rejects(game, { type: 'buy-shares', seat: 0, picks: { video: 1 } }, 'not-enough-bank-stock');
  });

  it('rejects buying a corporation that is not on the board', () => {
    rejects(atBuyStep(), { type: 'buy-shares', seat: 0, picks: { books: 1 } }, 'corporation-not-active');
  });

  it('applies a legal purchase and deducts cash and bank stock', () => {
    const game = atBuyStep();
    const cash = game.seats[0]!.cash;
    const next = ok(game, { type: 'buy-shares', seat: 0, picks: { video: 2 } });
    expect(next.seats[0]!.holdings.video).toBe(2);
    expect(next.bankShares.video).toBe(23);
    expect(next.seats[0]!.cash).toBe(cash - 1000); // 2 x $500
  });
});

describe('draw and turn advance', () => {
  it('refills the hand to six after the buy step, and to fewer when the bag runs out', () => {
    const game = blankGame();
    game.hands[0] = ['6E', '1A', '12I'];
    const placed = ok(game, { type: 'place-tile', seat: 0, tile: '6E' });
    const bagBefore = placed.bag.length;
    const next = ok(placed, { type: 'buy-shares', seat: 0, picks: {} });
    expect(next.hands[0]).toHaveLength(6);
    expect(next.bag.length).toBe(bagBefore - 4);
    expect(next.turnPointer).toBe(1);
    expect(next.step).toBe('place');
  });

  it('does not draw when the bag is empty', () => {
    const game = blankGame();
    game.hands[0] = ['6E', '1A'];
    game.bag = [];
    const placed = ok(game, { type: 'place-tile', seat: 0, tile: '6E' });
    const next = ok(placed, { type: 'buy-shares', seat: 0, picks: {} });
    expect(next.hands[0]).toEqual(['1A']);
  });

  it('a broke seat still places and draws', () => {
    const game = blankGame();
    game.seats[0]!.cash = 0;
    game.hands[0] = ['6E'];
    const placed = ok(game, { type: 'place-tile', seat: 0, tile: '6E' });
    const next = ok(placed, { type: 'buy-shares', seat: 0, picks: {} });
    expect(next.turnPointer).toBe(1);
  });
});

describe('dead-tile sweep (2015)', () => {
  function twoSafeCorpsWithDeadTile() {
    const game = blankGame({ ruleset: edition2015 });
    seedCorp(game, 'video', Array.from({ length: 10 }, (_, i) => `${i + 1}A`));
    seedCorp(game, 'books', Array.from({ length: 10 }, (_, i) => `${i + 1}C`));
    game.hands[0] = ['1B', '6E'];
    return game;
  }

  it('classifies a tile that would merge two safe corporations as dead', () => {
    const game = twoSafeCorpsWithDeadTile();
    expect(classifyPlacement(game, '1B').kind).toBe('dead');
  });

  it('sweeps the dead tile and draws a replacement after the buy step', () => {
    const game = twoSafeCorpsWithDeadTile();
    const placed = ok(game, { type: 'place-tile', seat: 0, tile: '6E' });
    const next = ok(placed, { type: 'buy-shares', seat: 0, picks: {} });
    expect(next.hands[0]).not.toContain('1B');
    expect(next.hands[0]).toHaveLength(6);
  });

  it('classic never sweeps: the dead tile stays in hand', () => {
    const game = blankGame();
    seedCorp(game, 'video', Array.from({ length: 11 }, (_, i) => `${i + 1}A`));
    seedCorp(game, 'books', Array.from({ length: 11 }, (_, i) => `${i + 1}C`));
    game.hands[0] = ['1B', '6E'];
    const placed = ok(game, { type: 'place-tile', seat: 0, tile: '6E' });
    const next = ok(placed, { type: 'buy-shares', seat: 0, picks: {} });
    expect(next.hands[0]).toContain('1B');
  });
});

describe('turn gating', () => {
  it('rejects an out-of-turn placement', () => {
    const game = blankGame();
    game.hands[1] = ['6E'];
    rejects(game, { type: 'place-tile', seat: 1, tile: '6E' }, 'not-your-turn');
  });

  it('rejects buying before placing', () => {
    const game = blankGame();
    rejects(game, { type: 'buy-shares', seat: 0, picks: {} }, 'wrong-step');
  });
});
