import { sharePrice } from './pricing.js';
import { INDUSTRIES, tierOf } from './pool.js';
import { distributeBonuses, PHANTOM_SEAT } from './reducer/merge/bonuses.js';
import { activeCorporations, corpSize, type CorpSettlement, type GameResult, type GameState, type RankingRow } from './state.js';

/**
 * Final settlement (`docs/rules.md`, "Invariants"): pay bonuses for every active
 * corporation as if it were merging, then the bank buys back all stock at the
 * current price. Stock in a corporation not on the board is worth nothing.
 * Mutates seat cash and zeroes holdings; returns the ranking, each with a
 * per-corporation breakdown (shares, price, bonus) for the victory beat's
 * "show the work" cascade.
 */
export function finalSettlement(state: GameState): GameResult {
  const cashBefore = state.seats.map((seat) => seat.cash);
  const gained = state.seats.map(() => 0);
  const holdings: CorpSettlement[][] = state.seats.map(() => []);

  for (const industry of activeCorporations(state)) {
    const size = corpSize(state, industry);
    const tier = tierOf(industry);
    const price = sharePrice(size, tier, state.ruleset) ?? 0;

    const holders = state.seats.map((seat, index) => ({ seat: index, shares: seat.holdings[industry] }));
    const bonusBySeat = new Map<number, number>();
    for (const payout of distributeBonuses(holders, size, industry, state.ruleset)) {
      if (payout.seat === PHANTOM_SEAT) continue;
      gained[payout.seat]! += payout.amount;
      bonusBySeat.set(payout.seat, (bonusBySeat.get(payout.seat) ?? 0) + payout.amount);
    }

    state.seats.forEach((seat, index) => {
      const shares = seat.holdings[industry];
      const bonus = bonusBySeat.get(index) ?? 0;
      const saleValue = shares * price;
      gained[index]! += saleValue;
      if (shares > 0 || bonus > 0) {
        holdings[index]!.push({ industry, shares, price, saleValue, bonus });
      }
    });
  }

  state.seats.forEach((seat, index) => {
    seat.cash += gained[index]!;
    for (const industry of INDUSTRIES) seat.holdings[industry] = 0;
  });

  const rankings: RankingRow[] = state.seats
    .map((seat, index) => ({
      seat: index,
      cash: cashBefore[index]!,
      equity: gained[index]!,
      total: seat.cash,
      holdings: holdings[index]!,
    }))
    .sort((a, b) => b.total - a.total);

  const top = rankings[0]?.total ?? 0;
  return {
    rankings,
    winners: rankings.filter((row) => row.total === top).map((row) => row.seat),
  };
}
