import { bonusRow } from '../../pricing.js';
import { tierOf, type Industry } from '../../pool.js';
import type { Ruleset } from '../../ruleset/types.js';
import type { GameState, Seat } from '../../state.js';
import { parseTile } from '../../board.js';

/** A synthetic "seat" for the two-player phantom shareholder. Its payouts go nowhere. */
export const PHANTOM_SEAT: Seat = -1;

/**
 * Provisional phantom-shareholder holding for one merger. `docs/rules.md` says
 * the bank's holding is "drawn from the tile pile each merger" but the 2015
 * rulebook never gives the number — this is an open item in `docs/decisions.md`.
 * The model here: draw one tile, size the holding from its column, discard it.
 */
export function phantomHolding(state: GameState): { shares: number; state: GameState } {
  if (state.bag.length === 0) return { shares: 0, state };
  const [drawn, ...rest] = state.bag;
  const shares = (parseTile(drawn!).col % 6) + 1;
  return { shares, state: { ...state, bag: rest } };
}

export interface Payout {
  readonly seat: Seat;
  readonly tier: 'primary' | 'secondary' | 'tertiary';
  readonly amount: number;
}

interface Holder {
  readonly seat: Seat;
  readonly shares: number;
}

function roundSplit(total: number, n: number, ruleset: Ruleset): number {
  const base = total / n;
  if (base % 1 === 0) return base;
  // 2015 rounds a split up to the nearest 100; classic is silent, so split exactly.
  if (ruleset.splitRounding === 'up100') return Math.ceil(base / 100) * 100;
  return base;
}

/** Group holders by share count, descending. */
function groupsOf(holders: readonly Holder[]): { shares: number; seats: Seat[] }[] {
  const sorted = [...holders].filter((h) => h.shares > 0).sort((a, b) => b.shares - a.shares);
  const groups: { shares: number; seats: Seat[] }[] = [];
  for (const holder of sorted) {
    const last = groups.at(-1);
    if (last && last.shares === holder.shares) last.seats.push(holder.seat);
    else groups.push({ shares: holder.shares, seats: [holder.seat] });
  }
  return groups;
}

/**
 * Distribute the primary / secondary / tertiary bonuses for one defunct
 * corporation, following the edition's tie rules (`docs/rules.md`, "Bonus ties").
 */
export function distributeBonuses(
  holders: readonly Holder[],
  size: number,
  industry: Industry,
  ruleset: Ruleset,
): Payout[] {
  const row = bonusRow(size, tierOf(industry), ruleset);
  if (!row) return [];
  const groups = groupsOf(holders);
  if (groups.length === 0) return [];

  const distinctSeats = new Set(groups.flatMap((g) => g.seats));

  // Sole shareholder: primary + tertiary, both editions (classic "both", 2015 "primary + tertiary").
  if (distinctSeats.size === 1) {
    const seat = groups[0]!.seats[0]!;
    return [
      { seat, tier: 'primary', amount: row.primary },
      { seat, tier: 'tertiary', amount: row.tertiary },
    ];
  }

  const primary = groups[0]!;
  const payouts: Payout[] = [];

  if (primary.seats.length >= 2) {
    if (ruleset.bonusTiers === 3) {
      const per = roundSplit(row.primary + row.secondary!, primary.seats.length, ruleset);
      for (const seat of primary.seats) payouts.push({ seat, tier: 'primary', amount: per });
      const next = groups[1];
      if (next) {
        const perNext = roundSplit(row.tertiary, next.seats.length, ruleset);
        for (const seat of next.seats) payouts.push({ seat, tier: 'tertiary', amount: perNext });
      }
      return payouts;
    }
    const per = roundSplit(row.primary + row.tertiary, primary.seats.length, ruleset);
    for (const seat of primary.seats) payouts.push({ seat, tier: 'primary', amount: per });
    return payouts;
  }

  payouts.push({ seat: primary.seats[0]!, tier: 'primary', amount: row.primary });
  const secondary = groups[1];
  if (!secondary) return payouts;

  if (ruleset.bonusTiers === 2) {
    const per = roundSplit(row.tertiary, secondary.seats.length, ruleset);
    for (const seat of secondary.seats) payouts.push({ seat, tier: 'tertiary', amount: per });
    return payouts;
  }

  if (secondary.seats.length >= 2) {
    const per = roundSplit(row.secondary! + row.tertiary, secondary.seats.length, ruleset);
    for (const seat of secondary.seats) payouts.push({ seat, tier: 'secondary', amount: per });
    return payouts;
  }

  payouts.push({ seat: secondary.seats[0]!, tier: 'secondary', amount: row.secondary! });
  const tertiary = groups[2];
  if (!tertiary) return payouts;
  const per = roundSplit(row.tertiary, tertiary.seats.length, ruleset);
  for (const seat of tertiary.seats) payouts.push({ seat, tier: 'tertiary', amount: per });
  return payouts;
}

/** Collect every holder of `industry`, including the phantom shareholder when the two-player rule is active. */
export function holdersOf(state: GameState, industry: Industry): Holder[] {
  const holders: Holder[] = state.seats.map((seat, index) => ({
    seat: index,
    shares: seat.holdings[industry],
  }));

  if (state.ruleset.phantomShareholderInTwoPlayer && state.seats.length === 2) {
    const draw = phantomHolding(state);
    state.bag = draw.state.bag;
    if (draw.shares > 0) holders.push({ seat: PHANTOM_SEAT, shares: draw.shares });
  }

  return holders;
}
