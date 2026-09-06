import { describe, expect, it } from 'vitest';
import { classic, distributeBonuses, edition2015 } from '@boomtown/engine';

// `books` is a tier-1 industry. A size-5 tier-1 corporation prices at $500/share:
// classic  -> primary 5000, tertiary 2500
// 2015     -> primary 5000, secondary 3700, tertiary 2500
const SIZE = 5;
const IND = 'books' as const;

describe('classic bonus ties (majority / minority)', () => {
  it('sole shareholder takes both bonuses', () => {
    expect(distributeBonuses([{ seat: 0, shares: 4 }], SIZE, IND, classic)).toEqual([
      { seat: 0, tier: 'primary', amount: 5000 },
      { seat: 0, tier: 'tertiary', amount: 2500 },
    ]);
  });

  it('clear majority and minority', () => {
    expect(
      distributeBonuses([{ seat: 0, shares: 5 }, { seat: 1, shares: 3 }], SIZE, IND, classic),
    ).toEqual([
      { seat: 0, tier: 'primary', amount: 5000 },
      { seat: 1, tier: 'tertiary', amount: 2500 },
    ]);
  });

  it('majority tie combines primary + minority, halves, and snaps to $100', () => {
    expect(
      distributeBonuses([{ seat: 0, shares: 4 }, { seat: 1, shares: 4 }], SIZE, IND, classic),
    ).toEqual([
      // (5000 + 2500) / 2 = 3750 -> nearest $100 = 3800 (classic never pays a fraction)
      { seat: 0, tier: 'primary', amount: 3800 },
      { seat: 1, tier: 'primary', amount: 3800 },
    ]);
  });

  it('minority tie splits the minority bonus, snapped to $100', () => {
    expect(
      distributeBonuses(
        [{ seat: 0, shares: 6 }, { seat: 1, shares: 2 }, { seat: 2, shares: 2 }],
        SIZE,
        IND,
        classic,
      ),
    ).toEqual([
      { seat: 0, tier: 'primary', amount: 5000 },
      // 2500 / 2 = 1250 -> nearest $100 = 1300
      { seat: 1, tier: 'tertiary', amount: 1300 },
      { seat: 2, tier: 'tertiary', amount: 1300 },
    ]);
  });

  it('an odd three-way minority split never pays a fraction of a dollar', () => {
    const payouts = distributeBonuses(
      [{ seat: 0, shares: 6 }, { seat: 1, shares: 2 }, { seat: 2, shares: 2 }, { seat: 3, shares: 2 }],
      SIZE,
      IND,
      classic,
    );
    // 2500 / 3 = 833.33... -> nearest $100 = 800
    for (const payout of payouts.filter((p) => p.tier === 'tertiary')) {
      expect(payout.amount % 100).toBe(0);
      expect(payout.amount).toBe(800);
    }
  });
});

describe('2015 bonus ties (primary / secondary / tertiary)', () => {
  it('sole shareholder takes primary and tertiary, not secondary', () => {
    expect(distributeBonuses([{ seat: 0, shares: 4 }], SIZE, IND, edition2015)).toEqual([
      { seat: 0, tier: 'primary', amount: 5000 },
      { seat: 0, tier: 'tertiary', amount: 2500 },
    ]);
  });

  it('clear 1 / 2 / 3', () => {
    expect(
      distributeBonuses(
        [{ seat: 0, shares: 5 }, { seat: 1, shares: 3 }, { seat: 2, shares: 1 }],
        SIZE,
        IND,
        edition2015,
      ),
    ).toEqual([
      { seat: 0, tier: 'primary', amount: 5000 },
      { seat: 1, tier: 'secondary', amount: 3700 },
      { seat: 2, tier: 'tertiary', amount: 2500 },
    ]);
  });

  it('primary tie: combine primary + secondary, halve, round up; next group takes tertiary', () => {
    expect(
      distributeBonuses(
        [{ seat: 0, shares: 4 }, { seat: 1, shares: 4 }, { seat: 2, shares: 2 }],
        SIZE,
        IND,
        edition2015,
      ),
    ).toEqual([
      { seat: 0, tier: 'primary', amount: 4400 }, // ceil((5000 + 3700) / 2 / 100) * 100
      { seat: 1, tier: 'primary', amount: 4400 },
      { seat: 2, tier: 'tertiary', amount: 2500 },
    ]);
  });

  it('secondary tie: combine secondary + tertiary, halve, round up; third holder gets nothing', () => {
    expect(
      distributeBonuses(
        [{ seat: 0, shares: 6 }, { seat: 1, shares: 3 }, { seat: 2, shares: 3 }, { seat: 3, shares: 1 }],
        SIZE,
        IND,
        edition2015,
      ),
    ).toEqual([
      { seat: 0, tier: 'primary', amount: 5000 },
      { seat: 1, tier: 'secondary', amount: 3100 }, // ceil((3700 + 2500) / 2 / 100) * 100
      { seat: 2, tier: 'secondary', amount: 3100 },
    ]);
  });

  it('tertiary tie: split the tertiary bonus, round up', () => {
    expect(
      distributeBonuses(
        [{ seat: 0, shares: 6 }, { seat: 1, shares: 4 }, { seat: 2, shares: 1 }, { seat: 3, shares: 1 }],
        SIZE,
        IND,
        edition2015,
      ),
    ).toEqual([
      { seat: 0, tier: 'primary', amount: 5000 },
      { seat: 1, tier: 'secondary', amount: 3700 },
      { seat: 2, tier: 'tertiary', amount: 1300 }, // ceil(2500 / 2 / 100) * 100
      { seat: 3, tier: 'tertiary', amount: 1300 },
    ]);
  });
});
