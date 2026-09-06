import type { BonusRow, Ruleset, Tier } from './ruleset/types.js';

/**
 * The price-and-bonus table from `docs/rules.md`, ported verbatim from
 * `design/build.py`. Eleven rows: nine size bands shifted by tier.
 *
 * `PRIMARY` is always `10 x` the share price and `TERTIARY` (classic: minority)
 * is always `5 x`, but `SECONDARY_2015` fits no multiplier — it is a printed
 * lookup and must ship as data.
 */
export const PRICE_ROWS = [200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200] as const;
export const PRIMARY = [2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000] as const;
export const SECONDARY_2015 = [1500, 2200, 3000, 3700, 4200, 5000, 5700, 6200, 7000, 7700, 8200] as const;
export const TERTIARY = [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 6000] as const;

/** Index (0–8) of the price band a corporation of `size` falls in, or null when unincorporated (`size < 2`). */
export function bandIndex(size: number, ruleset: Ruleset): number | null {
  if (size < 2) return null;
  for (let i = 0; i < ruleset.bandCuts.length; i++) {
    if (size <= ruleset.bandCuts[i]!) return i;
  }
  return 8;
}

/** Row (0–10) into the price table for a corporation of `size` in a `tier` industry. */
export function rowIndex(size: number, tier: Tier, ruleset: Ruleset): number | null {
  const band = bandIndex(size, ruleset);
  return band === null ? null : band + (tier - 1);
}

/** Current share price, or null when the corporation is not on the board. */
export function sharePrice(size: number, tier: Tier, ruleset: Ruleset): number | null {
  const row = rowIndex(size, tier, ruleset);
  return row === null ? null : PRICE_ROWS[row]!;
}

/**
 * Bonus payout for a corporation of `size` in a `tier` industry. Priced at the
 * defunct corporation's size *before* the merging tile. Null when off the board.
 */
export function bonusRow(size: number, tier: Tier, ruleset: Ruleset): BonusRow | null {
  const row = rowIndex(size, tier, ruleset);
  if (row === null) return null;
  return {
    primary: PRIMARY[row]!,
    secondary: ruleset.bonusTiers === 3 ? SECONDARY_2015[row]! : null,
    tertiary: TERTIARY[row]!,
  };
}
