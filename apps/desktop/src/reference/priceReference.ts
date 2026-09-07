import {
  INDUSTRIES,
  INDUSTRY_INFO,
  bonusRow,
  nextPriceStep,
  priceLadder,
  rowIndex,
  tierOf,
  type Industry,
  type LadderRung,
} from '@boomtown/engine';
import type { ClientView } from '@boomtown/client-core';

/** A founded corporation sitting on a given row of the reference chart. */
export interface ChartMarker {
  readonly industry: Industry;
  readonly name: string;
  readonly color: string;
  readonly size: number;
}

/** One row of the full stock-reference matrix (one price band). */
export interface ChartRow {
  readonly row: number; // 0..10 in the underlying price table
  /** Per-tier: the band label for this row (or '—' when this tier has no band
   *  here), and any founded corporations currently in that band. */
  readonly tiers: readonly {
    readonly tier: 1 | 2 | 3;
    readonly label: string;
    readonly here: readonly ChartMarker[];
  }[];
  readonly price: number;
  readonly primary: number;
  readonly secondary: number | null;
  readonly tertiary: number;
}

const TIERS = [1, 2, 3] as const;

/** The corporations of a given tier, founded ones first with their live data. */
export function corpsByTier(view: ClientView): Record<1 | 2 | 3, ChartMarker[]> {
  const out: Record<1 | 2 | 3, ChartMarker[]> = { 1: [], 2: [], 3: [] };
  for (const industry of INDUSTRIES) {
    const corp = view.corporations[industry];
    out[tierOf(industry)].push({
      industry,
      name: corp.founded ? corp.displayName : corp.baseName,
      color: INDUSTRY_INFO[industry].color,
      size: corp.size,
    });
  }
  return out;
}

/** One unfounded corporation as a founding candidate, with what founding it is worth. */
export interface FoundingOption {
  readonly industry: Industry;
  readonly name: string;
  readonly color: string;
  readonly tier: 1 | 2 | 3;
  /** Share price at the opening size of 2 — the value of the founder's free share. */
  readonly openingPrice: number;
  /** Primary bonus if it went defunct at size 2 — the low end of its bonus ladder. */
  readonly openingPrimary: number;
}

/**
 * The unfounded corporations, richest tier first, with the opening share price
 * and bonus each would carry — the "which is best to found" reference.
 */
export function foundingOptions(view: ClientView): FoundingOption[] {
  return INDUSTRIES.filter((industry) => !view.corporations[industry].founded)
    .map((industry) => {
      const tier = tierOf(industry);
      const opening = priceLadder(tier, view.ruleset)[0]!; // size-2 rung
      return {
        industry,
        name: view.corporations[industry].baseName,
        color: INDUSTRY_INFO[industry].color,
        tier,
        openingPrice: opening.price,
        openingPrimary: opening.bonus.primary,
      };
    })
    .sort((a, b) => b.tier - a.tier || b.openingPrice - a.openingPrice);
}

/**
 * The full reference matrix for the current ruleset — 11 price rows, each with
 * the band label per tier and any founded corporation sitting there.
 */
export function fullChart(view: ClientView): ChartRow[] {
  const ladders = {
    1: priceLadder(1, view.ruleset),
    2: priceLadder(2, view.ruleset),
    3: priceLadder(3, view.ruleset),
  } as const;

  const founded = INDUSTRIES.map((industry) => view.corporations[industry])
    .map((corp, i) => ({ corp, industry: INDUSTRIES[i]! }))
    .filter(({ corp }) => corp.founded && corp.size >= 2);

  const rows: ChartRow[] = [];
  for (let row = 0; row < 11; row++) {
    const tiers = TIERS.map((tier) => {
      const rung = ladders[tier].find((r) => r.row === row);
      const here: ChartMarker[] = founded
        .filter(({ industry }) => tierOf(industry) === tier)
        .filter(({ corp }) => rowIndex(corp.size, tier, view.ruleset) === row)
        .map(({ industry, corp }) => ({
          industry,
          name: corp.displayName,
          color: INDUSTRY_INFO[industry].color,
          size: corp.size,
        }));
      return { tier, label: rung?.label ?? '—', here };
    });

    // every row exists in at least one tier's ladder
    const anyRung = ladders[1][row] ?? ladders[2].find((r) => r.row === row) ?? ladders[3].find((r) => r.row === row)!;
    rows.push({
      row,
      tiers,
      price: anyRung.price,
      primary: anyRung.bonus.primary,
      secondary: anyRung.bonus.secondary,
      tertiary: anyRung.bonus.tertiary,
    });
  }
  return rows;
}

export interface CorpReferenceData {
  readonly industry: Industry;
  readonly name: string;
  readonly flavour: string;
  readonly color: string;
  readonly ink: string;
  readonly tier: 1 | 2 | 3;
  readonly founded: boolean;
  readonly safe: boolean;
  readonly size: number;
  readonly sharePrice: number | null;
  /** Your holding and its cash value at the current price. */
  readonly you: { readonly shares: number; readonly value: number };
  readonly ladder: readonly (LadderRung & { readonly current: boolean })[];
  /** The next size band and its price, or null in the top band / unfounded. */
  readonly nextStep: { readonly atSize: number; readonly price: number } | null;
  /** What each shareholder would collect if the corporation went defunct now. */
  readonly payouts: readonly {
    readonly seat: number;
    readonly name: string;
    readonly shares: number;
    readonly tier: 'primary' | 'secondary' | 'tertiary' | null;
    readonly amount: number;
  }[];
}

/** Everything the single-corporation reference modal shows for one industry. */
export function corpReference(view: ClientView, industry: Industry): CorpReferenceData {
  const corp = view.corporations[industry];
  const tier = tierOf(industry);
  const info = INDUSTRY_INFO[industry];
  const currentRow = corp.founded ? rowIndex(corp.size, tier, view.ruleset) : null;
  const bonus = corp.founded ? bonusRow(corp.size, tier, view.ruleset) : null;
  const yourShares = view.yourHoldings[industry] ?? 0;

  // rank holders by shares to decide primary / secondary
  const holders = view.seats
    .map((seat, index) => ({
      seat: index,
      name: seat.name,
      shares: seat.holdings?.[industry] ?? (index === view.you ? yourShares : 0),
    }))
    .filter((h) => h.shares > 0)
    .sort((a, b) => b.shares - a.shares);

  const payouts = holders.map((h, rank) => {
    if (!bonus) return { ...h, tier: null, amount: 0 } as const;
    if (rank === 0) return { ...h, tier: 'primary' as const, amount: bonus.primary };
    if (rank === 1) {
      return bonus.secondary != null
        ? ({ ...h, tier: 'secondary' as const, amount: bonus.secondary } as const)
        : ({ ...h, tier: 'tertiary' as const, amount: bonus.tertiary } as const);
    }
    return { ...h, tier: 'tertiary' as const, amount: bonus.tertiary } as const;
  });

  return {
    industry,
    name: corp.founded ? corp.displayName : corp.baseName,
    flavour: corp.flavour,
    color: info.color,
    ink: info.ink,
    tier,
    founded: corp.founded,
    safe: corp.safe,
    size: corp.size,
    sharePrice: corp.sharePrice,
    you: { shares: yourShares, value: yourShares * (corp.sharePrice ?? 0) },
    ladder: priceLadder(tier, view.ruleset).map((rung) => ({
      ...rung,
      current: rung.row === currentRow,
    })),
    nextStep: corp.founded ? nextPriceStep(corp.size, tier, view.ruleset) : null,
    payouts,
  };
}
