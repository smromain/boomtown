import { describe, expect, it } from 'vitest';
import { edition2015, endConditionMet, reduce } from '@boomtown/engine';
import { blankGame, ok, rejects, seedCorp } from './helpers.js';

const rows = 'ABCDEFGHI';
/** `n` real tile ids, filling the board column-major. */
function tiles(n: number): string[] {
  const out: string[] = [];
  for (let col = 1; col <= 12 && out.length < n; col++) {
    for (let r = 0; r < rows.length && out.length < n; r++) out.push(`${col}${rows[r]}`);
  }
  return out;
}

describe('endConditionMet', () => {
  it('is false with no corporations on the board', () => {
    expect(endConditionMet(blankGame())).toBe(false);
  });

  it('is true when a corporation reaches the end size (classic 41)', () => {
    const game = blankGame();
    seedCorp(game, 'video', tiles(41));
    expect(endConditionMet(game)).toBe(true);
  });

  it('uses the edition end size (2015: 38)', () => {
    const smallBooks = ['1I', '2I', '3I']; // size 3, never safe, keeps "all safe" false
    const at37 = blankGame({ ruleset: edition2015 });
    seedCorp(at37, 'video', tiles(37));
    seedCorp(at37, 'books', smallBooks);
    expect(endConditionMet(at37)).toBe(false);
    const at38 = blankGame({ ruleset: edition2015 });
    seedCorp(at38, 'video', tiles(38));
    seedCorp(at38, 'books', smallBooks);
    expect(endConditionMet(at38)).toBe(true);
  });

  it('is true when every corporation on the board is safe', () => {
    const game = blankGame();
    seedCorp(game, 'video', tiles(11));
    seedCorp(game, 'books', tiles(12).slice(0, 11).map((t) => `${t}`));
    // give books distinct tiles
    game.corporations.books.tiles = ['1I', '2I', '3I', '4I', '5I', '6I', '7I', '8I', '9I', '10I', '11I'];
    expect(endConditionMet(game)).toBe(true);
  });

  it('is false when a corporation is neither safe nor at end size', () => {
    const game = blankGame();
    seedCorp(game, 'video', tiles(11)); // safe
    seedCorp(game, 'books', ['1I', '2I', '3I']); // size 3, not safe
    expect(endConditionMet(game)).toBe(false);
  });
});

describe('announcing the end', () => {
  function atEndCheck() {
    const game = blankGame({ seats: 2 });
    seedCorp(game, 'video', tiles(11)); // only corp, safe -> end condition holds
    game.step = 'buy';
    game.hands[0] = [];
    game.seats[0]!.holdings.video = 4;
    game.seats[1]!.holdings.video = 2;
    game.bankShares.video = 19;
    return ok(game, { type: 'buy-shares', seat: 0, picks: {} });
  }

  it('parks at the end-check step instead of advancing', () => {
    const state = atEndCheck();
    expect(state.step).toBe('end-check');
    expect(state.status).toBe('playing');
  });

  it('a seat may decline and the game continues', () => {
    const state = ok(atEndCheck(), { type: 'end-turn', seat: 0 });
    expect(state.status).toBe('playing');
    expect(state.turnPointer).toBe(1);
  });

  it('announcing runs final settlement and ends the game', () => {
    const state = ok(atEndCheck(), { type: 'announce-end', seat: 0 });
    expect(state.status).toBe('over');
    expect(state.result).not.toBeNull();
  });

  it('records which seat announced the end in the final state', () => {
    const before = atEndCheck();
    expect(before.endAnnouncedBy).toBeNull();
    const result = reduce(before, { type: 'announce-end', seat: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.endAnnouncedBy).toBe(0);
    expect(result.events).toContainEqual({ type: 'end-announced', seat: 0 });
  });

  it('rejects an announcement when no end condition holds', () => {
    const game = blankGame({ seats: 2 });
    seedCorp(game, 'video', ['1A', '2A', '3A']);
    game.step = 'end-check';
    rejects(game, { type: 'announce-end', seat: 0 }, 'end-condition-not-met');
  });

  it('rejects any command once the game is over', () => {
    const over = ok(atEndCheck(), { type: 'announce-end', seat: 0 });
    rejects(over, { type: 'buy-shares', seat: 1, picks: {} }, 'game-over');
  });
});

describe('final settlement', () => {
  it('pays bonuses and buys back stock at the current price', () => {
    const game = blankGame({ seats: 2 });
    seedCorp(game, 'video', tiles(11)); // size 11, tier 3 -> $900/share; primary 9000, tertiary 4500
    game.step = 'buy';
    game.hands[0] = [];
    game.seats[0]!.holdings.video = 4;
    game.seats[1]!.holdings.video = 2;
    game.bankShares.video = 19;

    const parked = ok(game, { type: 'buy-shares', seat: 0, picks: {} });
    const done = ok(parked, { type: 'announce-end', seat: 0 });

    const result = done.result!;
    const bySeat = new Map(result.rankings.map((r) => [r.seat, r]));
    // seat 0: primary 9000 + buyback 4*900 = 12600
    expect(bySeat.get(0)!.total).toBe(6000 + 12600);
    // seat 1: tertiary 4500 + buyback 2*900 = 6300
    expect(bySeat.get(1)!.total).toBe(6000 + 6300);
    expect(result.winners).toEqual([0]);
    expect(result.rankings[0]!.seat).toBe(0); // sorted highest-first
  });

  it('stock in an off-board corporation is worth nothing', () => {
    const game = blankGame({ seats: 2 });
    seedCorp(game, 'video', tiles(11));
    game.step = 'buy';
    game.hands[0] = [];
    game.seats[1]!.holdings.books = 10; // books never founded
    game.seats[0]!.holdings.video = 1;

    const done = ok(ok(game, { type: 'buy-shares', seat: 0, picks: {} }), {
      type: 'announce-end',
      seat: 0,
    });
    const seat1 = done.result!.rankings.find((r) => r.seat === 1)!;
    expect(seat1.equity).toBe(0);
    expect(seat1.total).toBe(6000);
  });

  it('reports every seat when totals tie', () => {
    const game = blankGame({ seats: 2 });
    seedCorp(game, 'video', tiles(11));
    game.step = 'buy';
    game.hands[0] = [];
    game.seats[0]!.holdings.video = 3;
    game.seats[1]!.holdings.video = 3;
    game.bankShares.video = 19;
    const done = ok(ok(game, { type: 'buy-shares', seat: 0, picks: {} }), {
      type: 'announce-end',
      seat: 0,
    });
    // both split (primary + tertiary) / 2 and hold the same shares -> equal totals
    expect([...done.result!.winners].sort()).toEqual([0, 1]);
  });
});

describe('skipping a forced placement', () => {
  it('end-turn at the placement step is allowed only when no hand tile is playable', () => {
    const game = blankGame();
    game.hands[0] = ['6E'];
    rejects(game, { type: 'end-turn', seat: 0 }, 'wrong-step');

    const stuck = blankGame();
    seedCorp(stuck, 'video', tiles(11));
    seedCorp(stuck, 'books', ['1I', '2I', '3I', '4I', '5I', '6I', '7I', '8I', '9I', '10I', '11I']);
    // 1H would merge two safe corporations -> dead -> not playable
    stuck.hands[0] = ['1H'];
    stuck.bag = [];
    const skipped = ok(stuck, { type: 'end-turn', seat: 0 });
    expect(skipped.step).toBe('buy');
  });
});
