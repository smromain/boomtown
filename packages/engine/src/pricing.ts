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

/**
 * The nine size-band labels for a ruleset, derived from `bandCuts` — `"2"`,
 * `"3"`, …, `"6–10"`, …, `"41+"`. Band `i` covers `bandCuts[i-1]+1 … bandCuts[i]`
 * (band 0 is just `bandCuts[0]`, the last band is open-ended).
 */
export function bandLabels(ruleset: Ruleset): string[] {
  const cuts = ruleset.bandCuts;
  return Array.from({ length: cuts.length + 1 }, (_, band) => {
    if (band === 0) return String(cuts[0]);
    if (band === cuts.length) return `${cuts[cuts.length - 1]! + 1}+`;
    const lo = cuts[band - 1]! + 1;
    const hi = cuts[band]!;
    return lo === hi ? String(lo) : `${lo}–${hi}`;
  });
}

/** One rung of the price ladder: a size band and everything it pays. */
export interface LadderRung {
  /** 0–8, the band; 0–10 shifted by tier for the price/bonus lookup. */
  readonly band: number;
  readonly row: number;
  readonly label: string;
  readonly price: number;
  readonly bonus: BonusRow;
}

/**
 * The full price ladder for a `tier` under a ruleset — every band a corporation
 * of that tier can occupy, cheapest first. This is the "stock reference" chart,
 * generated from the ruleset rather than a printed card.
 */
export function priceLadder(tier: Tier, ruleset: Ruleset): LadderRung[] {
  const labels = bandLabels(ruleset);
  return labels.map((label, band) => {
    const row = band + (tier - 1);
    return {
      band,
      row,
      label,
      price: PRICE_ROWS[row]!,
      bonus: {
        primary: PRIMARY[row]!,
        secondary: ruleset.bonusTiers === 3 ? SECONDARY_2015[row]! : null,
        tertiary: TERTIARY[row]!,
      },
    };
  });
}

/**
 * The next band up for a corporation of `size` in a `tier` — the size that
 * reaches it and the share price there. Null when already in the top band or
 * not on the board.
 */
export function nextPriceStep(
  size: number,
  tier: Tier,
  ruleset: Ruleset,
): { readonly atSize: number; readonly price: number } | null {
  const band = bandIndex(size, ruleset);
  if (band === null || band >= ruleset.bandCuts.length) return null;
  const atSize = ruleset.bandCuts[band]! + 1;
  return { atSize, price: PRICE_ROWS[band + 1 + (tier - 1)]! };
}
