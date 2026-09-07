import { describe, expect, it } from 'vitest';
import {
  INDUSTRIES,
  POOL,
  RULES,
  TOTAL_SHARES,
  classic,
  createGame,
  tileCount,
  viewFor,
} from '@boomtown/engine';

const seats = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];

describe('createGame', () => {
  it('is deterministic for a seed', () => {
    const a = createGame({ seats, seed: 555 });
    const b = createGame({ seats, seed: 555 });
    expect(a.hands).toEqual(b.hands);
    expect(a.bag).toEqual(b.bag);
    expect(a.turnOrder).toEqual(b.turnOrder);
    expect(a.companies).toEqual(b.companies);
  });

  it('a different seed changes the deal', () => {
    const a = createGame({ seats, seed: 1 });
    const b = createGame({ seats, seed: 2 });
    expect(a.hands).not.toEqual(b.hands);
  });

  it('deals six tiles per seat and starts everyone at $6,000', () => {
    const game = createGame({ seats, seed: 9 });
    for (const hand of game.hands) expect(hand).toHaveLength(RULES.handSize);
    for (const seat of game.seats) expect(seat.cash).toBe(RULES.startingCash);
  });

  it('conserves tiles: bag + hands = board size', () => {
    const game = createGame({ seats, seed: 9 });
    const dealt = game.hands.flat().length;
    expect(dealt + game.bag.length).toBe(tileCount(classic));
  });

  it('starts the bank with every share', () => {
    const game = createGame({ seats, seed: 9 });
    const total = INDUSTRIES.reduce((sum, i) => sum + game.bankShares[i], 0);
    expect(total).toBe(TOTAL_SHARES);
  });

  it('rejects fewer than 2 and more than 6 seats', () => {
    expect(() => createGame({ seats: [{ name: 'solo' }], seed: 1 })).toThrow();
    expect(() =>
      createGame({ seats: Array.from({ length: 7 }, (_, i) => ({ name: `p${i}` })), seed: 1 }),
    ).toThrow();
  });

  it('honours a forced company line-up', () => {
    const game = createGame({ seats, seed: 1, companyDraw: { video: 3, air: 0 } });
    expect(game.companies.video.baseName).toBe(POOL.video[3].baseName);
    expect(game.companies.air.baseName).toBe(POOL.air[0].baseName);
  });
});

describe('viewFor', () => {
  it('never exposes another seat’s hand or the bag', () => {
    const game = createGame({ seats, seed: 3 });
    const view = viewFor(game, 0);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('"bag"');
    expect(view).not.toHaveProperty('hands');
    // only your own hand is enumerable
    expect(view.yourHand).toEqual(game.hands[0]);
    expect(view.seats[1]?.handCount).toBe(RULES.handSize);
  });

  it('hides opponent cash and holdings when the table is set to hidden', () => {
    const hidden = createGame({ seats, seed: 3, visibility: 'hidden' });
    const view = viewFor(hidden, 0);
    expect(view.seats[0]?.cash).toBe(RULES.startingCash);
    expect(view.seats[1]?.cash).toBeNull();
    expect(view.seats[1]?.holdings).toBeNull();
  });

  it('shows opponent cash and holdings when the table is set to open', () => {
    const open = createGame({ seats, seed: 3, visibility: 'open' });
    const view = viewFor(open, 0);
    expect(view.seats[1]?.cash).toBe(RULES.startingCash);
    expect(view.seats[1]?.holdings).not.toBeNull();
  });
});
