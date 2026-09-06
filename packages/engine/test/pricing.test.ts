import { describe, expect, it } from 'vitest';
import {
  PRICE_ROWS,
  PRIMARY,
  SECONDARY_2015,
  TERTIARY,
  bandIndex,
  bonusRow,
  classic,
  edition2015,
  rowIndex,
  sharePrice,
} from '@boomtown/engine';
import type { Tier } from '@boomtown/engine';

describe('band boundaries', () => {
  it('classic: size 10 and 11 fall in different bands', () => {
    expect(bandIndex(10, classic)).toBe(4);
    expect(bandIndex(11, classic)).toBe(5);
  });

  it('classic: size 41+ is the top band', () => {
    expect(bandIndex(41, classic)).toBe(8);
    expect(bandIndex(108, classic)).toBe(8);
  });

  it('2015: size 7 and 8 fall in different bands', () => {
    expect(bandIndex(7, edition2015)).toBe(4);
    expect(bandIndex(8, edition2015)).toBe(5);
  });

  it('2015: size 38+ is the top band', () => {
    expect(bandIndex(38, edition2015)).toBe(8);
  });

  it('a corporation smaller than 2 has no price or bonus', () => {
    expect(bandIndex(1, classic)).toBeNull();
    expect(rowIndex(0, 1, classic)).toBeNull();
    expect(sharePrice(1, 2, classic)).toBeNull();
    expect(bonusRow(1, 3, edition2015)).toBeNull();
  });
});

describe('docs/rules.md worked example', () => {
  it('a five-tile tier-3 corporation pays 7,000 / 5,000 / 3,500 under 2015', () => {
    expect(sharePrice(5, 3, edition2015)).toBe(700);
    expect(bonusRow(5, 3, edition2015)).toEqual({ primary: 7000, secondary: 5000, tertiary: 3500 });
  });
});

describe('table invariants', () => {
  it('primary is 10x and tertiary is 5x the share price on every row', () => {
    for (let r = 0; r < PRICE_ROWS.length; r++) {
      expect(PRIMARY[r]).toBe(PRICE_ROWS[r]! * 10);
      expect(TERTIARY[r]).toBe(PRICE_ROWS[r]! * 5);
    }
  });

  it('classic reports no secondary bonus; 2015 reports the printed lookup', () => {
    expect(bonusRow(4, 1, classic)?.secondary).toBeNull();
    expect(bonusRow(4, 1, edition2015)?.secondary).toBe(SECONDARY_2015[2]);
  });
});

// Representative size for each (tier, price-row) cell of the docs/rules.md table.
// A cell value is the row that (tier, size) must resolve to.
type Cell = { size: number; tier: Tier; row: number };

const classicCells: Cell[] = [
  { size: 2, tier: 1, row: 0 },
  { size: 3, tier: 1, row: 1 }, { size: 2, tier: 2, row: 1 },
  { size: 4, tier: 1, row: 2 }, { size: 3, tier: 2, row: 2 }, { size: 2, tier: 3, row: 2 },
  { size: 5, tier: 1, row: 3 }, { size: 4, tier: 2, row: 3 }, { size: 3, tier: 3, row: 3 },
  { size: 8, tier: 1, row: 4 }, { size: 5, tier: 2, row: 4 }, { size: 4, tier: 3, row: 4 },
  { size: 15, tier: 1, row: 5 }, { size: 9, tier: 2, row: 5 }, { size: 5, tier: 3, row: 5 },
  { size: 25, tier: 1, row: 6 }, { size: 14, tier: 2, row: 6 }, { size: 9, tier: 3, row: 6 },
  { size: 35, tier: 1, row: 7 }, { size: 25, tier: 2, row: 7 }, { size: 15, tier: 3, row: 7 },
  { size: 41, tier: 1, row: 8 }, { size: 35, tier: 2, row: 8 }, { size: 25, tier: 3, row: 8 },
  { size: 41, tier: 2, row: 9 }, { size: 35, tier: 3, row: 9 },
  { size: 41, tier: 3, row: 10 },
];

const cells2015: Cell[] = [
  { size: 2, tier: 1, row: 0 },
  { size: 3, tier: 1, row: 1 }, { size: 2, tier: 2, row: 1 },
  { size: 4, tier: 1, row: 2 }, { size: 3, tier: 2, row: 2 }, { size: 2, tier: 3, row: 2 },
  { size: 5, tier: 1, row: 3 }, { size: 4, tier: 2, row: 3 }, { size: 3, tier: 3, row: 3 },
  { size: 7, tier: 1, row: 4 }, { size: 5, tier: 2, row: 4 }, { size: 4, tier: 3, row: 4 },
  { size: 12, tier: 1, row: 5 }, { size: 7, tier: 2, row: 5 }, { size: 5, tier: 3, row: 5 },
  { size: 22, tier: 1, row: 6 }, { size: 12, tier: 2, row: 6 }, { size: 7, tier: 3, row: 6 },
  { size: 32, tier: 1, row: 7 }, { size: 22, tier: 2, row: 7 }, { size: 12, tier: 3, row: 7 },
  { size: 38, tier: 1, row: 8 }, { size: 32, tier: 2, row: 8 }, { size: 22, tier: 3, row: 8 },
  { size: 38, tier: 2, row: 9 }, { size: 32, tier: 3, row: 9 },
  { size: 38, tier: 3, row: 10 },
];

describe.each([
  ['classic', classic, classicCells],
  ['edition-2015', edition2015, cells2015],
] as const)('%s price/bonus table', (_label, ruleset, cells) => {
  it.each(cells)('size $size tier $tier -> row $row', ({ size, tier, row }) => {
    expect(rowIndex(size, tier, ruleset)).toBe(row);
    expect(sharePrice(size, tier, ruleset)).toBe(PRICE_ROWS[row]);
    expect(bonusRow(size, tier, ruleset)).toEqual({
      primary: PRIMARY[row],
      secondary: ruleset.bonusTiers === 3 ? SECONDARY_2015[row] : null,
      tertiary: TERTIARY[row],
    });
  });
});
