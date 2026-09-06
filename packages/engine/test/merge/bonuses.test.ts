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

  it('majority tie combines primary + minority and halves', () => {
    expect(
      distributeBonuses([{ seat: 0, shares: 4 }, { seat: 1, shares: 4 }], SIZE, IND, classic),
    ).toEqual([
      { seat: 0, tier: 'primary', amount: 3750 },
      { seat: 1, tier: 'primary', amount: 3750 },
    ]);
  });

  it('minority tie splits the minority bonus', () => {
    expect(
      distributeBonuses(
        [{ seat: 0, shares: 6 }, { seat: 1, shares: 2 }, { seat: 2, shares: 2 }],
        SIZE,
        IND,
        classic,
      ),
    ).toEqual([
      { seat: 0, tier: 'primary', amount: 5000 },
      { seat: 1, tier: 'tertiary', amount: 1250 },
      { seat: 2, tier: 'tertiary', amount: 1250 },
    ]);
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
      { seat: 0, tier: 'primary', amount: 4350 }, // (5000 + 3700) / 2
      { seat: 1, tier: 'primary', amount: 4350 },
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
      { seat: 2, tier: 'tertiary', amount: 1250 }, // 2500 / 2, already a multiple of 100
      { seat: 3, tier: 'tertiary', amount: 1250 },
    ]);
  });
});
