import { bonusRow } from '../pricing.js';
import { tierOf, type Industry } from '../pool.js';
import { activeCorporations, corpSize, sharePriceOf, type GameState, type Seat } from '../state.js';

/**
 * A per-seat position value (R8): net worth now, plus a weighted estimate of
 * unrealized position — merger-bonus exposure and growth headroom in the
 * corporations the seat is invested in. Pure and deterministic. U14 layers the
 * real bot heuristic on top of this.
 *
 * It reads **every** seat's holdings, via `bonusExposure` — it has to, since
 * bonus rank depends on how a holding compares with the rest of the table. This
 * docstring used to claim it read only public state and `seat`'s own holdings,
 * which was never true and mattered once holdings became secret (#25). The
 * boundary is the caller's: a bot is handed a redacted state whose other
 * holdings are ledger estimates rather than the truth (`@boomtown/ai`'s
 * `redactFor`), so what this function ranks is a belief. Given the real state
 * it ranks the real thing, which is what the engine's own callers want.
 */
export function evaluate(state: GameState, seat: Seat): number {
  let value = state.seats[seat]!.cash;

  if (state.result) {
    return state.result.rankings.find((row) => row.seat === seat)?.total ?? value;
  }

  for (const industry of activeCorporations(state)) {
    const price = sharePriceOf(state, industry) ?? 0;
    const shares = state.seats[seat]!.holdings[industry];
    if (shares === 0) continue;

    value += shares * price;
    value += bonusExposure(state, industry, seat);

    const size = corpSize(state, industry);
    const headroom = size / state.ruleset.endChainSize;
    value += shares * price * headroom * 0.1;
  }

  return value;
}

/** A fraction of the bonus the seat would collect if this corporation went defunct now. */
function bonusExposure(state: GameState, industry: Industry, seat: Seat): number {
  const row = bonusRow(corpSize(state, industry), tierOf(industry), state.ruleset);
  if (!row) return 0;

  const holdings = state.seats.map((s, index) => ({ seat: index, shares: s.holdings[industry] }));
  const mine = holdings.find((h) => h.seat === seat)!.shares;
  if (mine === 0) return 0;

  const ranked = [...holdings].filter((h) => h.shares > 0).sort((a, b) => b.shares - a.shares);
  const soleHolder = ranked.length === 1;
  const rank = ranked.findIndex((h) => h.seat === seat);

  const weight = 0.3;
  if (soleHolder) return (row.primary + row.tertiary) * weight;
  if (rank === 0) return row.primary * weight;
  if (rank === 1) return (row.secondary ?? row.tertiary) * weight;
  return 0;
}
