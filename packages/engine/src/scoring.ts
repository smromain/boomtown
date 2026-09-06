import { sharePrice } from './pricing.js';
import { INDUSTRIES, tierOf } from './pool.js';
import { distributeBonuses, PHANTOM_SEAT } from './reducer/merge/bonuses.js';
import { activeCorporations, corpSize, type GameResult, type GameState, type RankingRow } from './state.js';

/**
 * Final settlement (`docs/rules.md`, "Invariants"): pay bonuses for every active
 * corporation as if it were merging, then the bank buys back all stock at the
 * current price. Stock in a corporation not on the board is worth nothing.
 * Mutates seat cash and zeroes holdings; returns the ranking.
 */
export function finalSettlement(state: GameState): GameResult {
  const cashBefore = state.seats.map((seat) => seat.cash);
  const gained = state.seats.map(() => 0);

  for (const industry of activeCorporations(state)) {
    const size = corpSize(state, industry);
    const tier = tierOf(industry);
    const price = sharePrice(size, tier, state.ruleset) ?? 0;

    const holders = state.seats.map((seat, index) => ({ seat: index, shares: seat.holdings[industry] }));
    for (const payout of distributeBonuses(holders, size, industry, state.ruleset)) {
      if (payout.seat !== PHANTOM_SEAT) gained[payout.seat]! += payout.amount;
    }

    state.seats.forEach((seat, index) => {
      gained[index]! += seat.holdings[industry] * price;
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
    }))
    .sort((a, b) => b.total - a.total);

  const top = rankings[0]?.total ?? 0;
  return {
    rankings,
    winners: rankings.filter((row) => row.total === top).map((row) => row.seat),
  };
}
