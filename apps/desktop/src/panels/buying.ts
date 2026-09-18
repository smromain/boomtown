import type { ClientView } from '@boomtown/client-core';
import { INDUSTRIES, RULES, type Industry } from '@boomtown/engine';

export type BuyPicks = Partial<Record<Industry, number>>;

/** Corporations a seat can buy into: founded and priced. */
export function buyableCorporations(view: ClientView): Industry[] {
  return INDUSTRIES.filter(
    (industry) => view.corporations[industry].founded && view.corporations[industry].sharePrice != null,
  );
}

export function buyTotal(picks: BuyPicks): number {
  return Object.values(picks).reduce((sum, qty) => sum + (qty ?? 0), 0);
}

export function buyCost(view: ClientView, picks: BuyPicks): number {
  return buyableCorporations(view).reduce(
    (sum, industry) => sum + (picks[industry] ?? 0) * (view.corporations[industry].sharePrice ?? 0),
    0,
  );
}

/**
 * Why a row cannot be bought into at all, independent of what is already
 * picked. `canIncrement` answers the button's question — "one more, right now?"
 * — and goes false as soon as three are picked, which is not a fact about the
 * corporation. This answers the row's question, so it is stable while a player
 * picks and can be shown as a standing note rather than inferred from a
 * greyed-out `+` (#58).
 */
export function rowStanding(view: ClientView, industry: Industry): 'available' | 'sold-out' | 'unaffordable' {
  if (view.corporations[industry].bankShares === 0) return 'sold-out';
  if ((view.corporations[industry].sharePrice ?? 0) > view.yourCash) return 'unaffordable';
  return 'available';
}

/** Whether one more share of `industry` is affordable and within the caps (mirrors the engine's buy rules). */
export function canIncrement(view: ClientView, picks: BuyPicks, industry: Industry): boolean {
  if (buyTotal(picks) >= RULES.maxStockPurchasesPerTurn) return false;
  const next = (picks[industry] ?? 0) + 1;
  if (next > view.corporations[industry].bankShares) return false;
  return buyCost(view, { ...picks, [industry]: next }) <= view.yourCash;
}
