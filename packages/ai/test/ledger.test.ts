import { describe, expect, it } from 'vitest';
import {
  RULES,
  createGame,
  legalMovesForSeat,
  reduce,
  type EngineEvent,
  type GameState,
} from '@boomtown/engine';
import { estimateHoldings, ledgerFrom, redactFor } from '../src/index.js';

const game = (over: Partial<Parameters<typeof createGame>[0]> = {}): GameState =>
  createGame({
    seats: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    seed: 4,
    turnOrder: [0, 1, 2],
    ...over,
  });

describe('ledgerFrom', () => {
  it('counts purchase events, not shares — the quantity is the thing being hidden', () => {
    const log: EngineEvent[] = [
      { type: 'shares-bought', seat: 0, picks: { books: 3 }, cost: 900 },
      { type: 'shares-bought', seat: 1, picks: { books: 1 }, cost: 300 },
      { type: 'shares-bought', seat: 1, picks: { books: 1 }, cost: 300 },
    ];
    const { tally } = ledgerFrom(log, 3);
    // Seat 0 bought three shares in one go; seat 1 bought two across two turns.
    // The model reads seat 1 as the heavier buyer, and that is the intended
    // bias — cadence is a signal a player can bluff with.
    expect(tally[0]!.books).toBe(1);
    expect(tally[1]!.books).toBe(2);
  });

  it('counts one event per corporation in a mixed purchase', () => {
    const log: EngineEvent[] = [
      { type: 'shares-bought', seat: 2, picks: { books: 2, air: 1 }, cost: 900 },
    ];
    const { tally } = ledgerFrom(log, 3);
    expect(tally[2]!.books).toBe(1);
    expect(tally[2]!.air).toBe(1);
    expect(tally[2]!.toys).toBe(0);
  });

  it("attributes the founder's free share to whoever was on the clock", () => {
    const log: EngineEvent[] = [
      { type: 'turn-advanced', seat: 1 },
      {
        type: 'corporation-founded',
        industry: 'video',
        hqTile: '3C',
        tiles: ['3C', '4C'],
        founderBonusPaid: true,
      },
    ];
    expect(ledgerFrom(log, 3).tally[1]!.video).toBe(1);
  });

  it('ignores a founding that paid no bonus, and one before any turn is known', () => {
    const unpaid: EngineEvent[] = [
      { type: 'turn-advanced', seat: 1 },
      { type: 'corporation-founded', industry: 'video', hqTile: '3C', tiles: ['3C'], founderBonusPaid: false },
    ];
    expect(ledgerFrom(unpaid, 3).tally[1]!.video).toBe(0);

    const orphan: EngineEvent[] = [
      { type: 'corporation-founded', industry: 'video', hqTile: '3C', tiles: ['3C'], founderBonusPaid: true },
    ];
    expect(ledgerFrom(orphan, 3).tally.every((row) => row.video === 0)).toBe(true);
  });

  it('counts a 2:1 trade into the survivor, not the corporation that died', () => {
    const log: EngineEvent[] = [
      { type: 'survivor-chosen', survivor: 'air' },
      { type: 'shares-disposed', seat: 2, defunct: 'toys', hold: 0, sell: 0, trade: 4, proceeds: 0 },
    ];
    const { tally } = ledgerFrom(log, 3);
    expect(tally[2]!.air).toBe(1);
    expect(tally[2]!.toys).toBe(0);
  });

  it('is a pure fold — same log, same tallies', () => {
    const log: EngineEvent[] = [{ type: 'shares-bought', seat: 0, picks: { tech: 1 }, cost: 300 }];
    expect(ledgerFrom(log, 3)).toEqual(ledgerFrom(log, 3));
  });
});

describe('estimateHoldings', () => {
  it('splits exactly the issued shares, and never guesses at your own', () => {
    const ledger = ledgerFrom(
      [
        { type: 'shares-bought', seat: 1, picks: { books: 1 }, cost: 300 },
        { type: 'shares-bought', seat: 1, picks: { books: 1 }, cost: 300 },
        { type: 'shares-bought', seat: 1, picks: { books: 1 }, cost: 300 },
        { type: 'shares-bought', seat: 2, picks: { books: 1 }, cost: 300 },
      ],
      3,
    );
    const bank = 15; // 10 issued
    const mine = 4;
    const est = estimateHoldings(ledger, 'books', 0, mine, bank);

    expect(est[0]).toBe(mine); // exact, not estimated
    expect(est.reduce((a, b) => a + b, 0)).toBe(RULES.sharesPerCorporation - bank);
    // 6 left over a 3:1 tally split
    expect(est[1]).toBeGreaterThan(est[2]!);
  });

  it('spreads evenly when nothing has been observed rather than pretending to know', () => {
    const est = estimateHoldings(ledgerFrom([], 3), 'air', 0, 0, 19); // 6 issued
    expect(est[0]).toBe(0);
    expect(est[1]).toBe(3);
    expect(est[2]).toBe(3);
  });

  it('claims nothing when the seat already holds every issued share', () => {
    const est = estimateHoldings(ledgerFrom([], 3), 'air', 1, 6, 19);
    expect(est).toEqual([0, 6, 0]);
  });
});

describe('redactFor — the boundary a bot cannot reach past', () => {
  const withSecrets = (): GameState => {
    const state = game({ visibility: 'hidden' });
    state.seats[1]!.holdings.books = 7;
    state.seats[2]!.holdings.air = 5;
    state.seats[1]!.cash = 12345;
    return state;
  };

  it('keeps your own hand and holdings exact', () => {
    const real = withSecrets();
    const belief = redactFor(real, 0);
    expect(belief.hands[0]).toEqual(real.hands[0]);
    expect(belief.seats[0]!.holdings).toEqual(real.seats[0]!.holdings);
    expect(belief.seats[0]!.cash).toBe(real.seats[0]!.cash);
  });

  it('replaces every other hand, the bag, and the holdings behind them', () => {
    const real = withSecrets();
    const belief = redactFor(real, 0);

    expect(belief.hands[1]).not.toEqual(real.hands[1]);
    expect(belief.bag).not.toEqual(real.bag);
    // The estimate is not the truth, and the truth is not reachable.
    expect(belief.seats[1]!.holdings.books).not.toBe(7);
    expect(belief.seats[1]!.cash).not.toBe(12345);
  });

  it('never shows a tile that is already on the board or out of play', () => {
    const real = withSecrets();
    const belief = redactFor(real, 0);
    const invented = [...belief.hands.flat(), ...belief.bag];
    for (const tile of invented) {
      expect({ tile, onBoard: tile in real.cells }).toEqual({ tile, onBoard: false });
      expect({ tile, removed: real.removed.includes(tile) }).toEqual({ tile, removed: false });
    }
    // and every unseen tile is accounted for exactly once
    expect(new Set(invented).size).toBe(invented.length);
  });

  it('keeps hand sizes, so the belief is a legal state the reducer accepts', () => {
    const real = withSecrets();
    const belief = redactFor(real, 0);
    expect(belief.hands.map((h) => h.length)).toEqual(real.hands.map((h) => h.length));

    // The point of redacting rather than narrowing the argument: a policy still
    // has a whole GameState to look ahead with.
    const move = legalMovesForSeat(belief, 0)[0]!;
    expect(reduce(belief, move).ok).toBe(true);
  });

  it('passes cash and holdings through at an open table', () => {
    // "A bot sees what a player at that table could see" — at an open table
    // that is everything, and blinding it would make bots worse than the humans
    // they play, which is no fairer than making them better.
    const real: GameState = { ...withSecrets(), visibility: 'open' };
    const belief = redactFor(real, 0);
    expect(belief.seats[1]!.holdings.books).toBe(7);
    expect(belief.seats[1]!.cash).toBe(12345);
    // hands and the bag stay secret even then — they are secret to everyone
    expect(belief.hands[1]).not.toEqual(real.hands[1]);
  });

  it('is deterministic, so a replay redacts identically', () => {
    const real = withSecrets();
    expect(redactFor(real, 0)).toEqual(redactFor(real, 0));
  });

  it('gives different seats different beliefs', () => {
    const real = withSecrets();
    expect(redactFor(real, 0).bag).not.toEqual(redactFor(real, 1).bag);
  });

  it('leaves the real state untouched', () => {
    const real = withSecrets();
    const before = structuredClone(real);
    redactFor(real, 0);
    expect(real).toEqual(before);
  });

  it('estimates rather than reveals on a closed table, whatever the ruleset', () => {
    const real = withSecrets();
    const belief = redactFor(real, 0);
    // Every seat's books holding is a split of what the bank has issued, so the
    // parts add up even though no single one is the truth.
    const issued = RULES.sharesPerCorporation - real.bankShares.books;
    const total = belief.seats.reduce((sum, s) => sum + s.holdings.books, 0);
    expect(total).toBe(issued);
  });
});
