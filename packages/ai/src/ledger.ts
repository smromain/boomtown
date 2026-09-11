import {
  INDUSTRIES,
  RULES,
  type EngineEvent,
  type Industry,
  type Seat,
} from '@boomtown/engine';

/**
 * What a bot is allowed to know about who owns what.
 *
 * At a closed table holdings are secret, so a bot cannot read them — but it can
 * do what a person at the table does: notice who keeps buying what. The log
 * names the corporation a purchase went into and never the number of shares, so
 * the one honest observable is a **purchase event per seat per corporation**,
 * and this is a tally of those. "Ana's Concordia tally is six, her Enrun tally
 * is two" is the whole model.
 *
 * Deliberately counts events and not shares even where the event still carries
 * a quantity: the quantity is the thing being hidden, and reading it here would
 * put the leak back one layer down.
 */
export interface Ledger {
  /** `tally[seat][industry]` — purchase-like events observed. */
  readonly tally: readonly Readonly<Record<Industry, number>>[];
}

const emptyRow = (): Record<Industry, number> =>
  Object.fromEntries(INDUSTRIES.map((i) => [i, 0])) as Record<Industry, number>;

export function emptyLedger(seatCount: number): Ledger {
  return { tally: Array.from({ length: seatCount }, emptyRow) };
}

/**
 * Fold the public log into tallies. A pure function of the log, rebuilt each
 * turn rather than maintained: the log is small, so the cost is nothing, and it
 * buys a bot with no mutable belief state and a result that is deterministic
 * and therefore replay-safe (KTD13).
 */
export function ledgerFrom(log: readonly EngineEvent[], seatCount: number): Ledger {
  const tally = Array.from({ length: seatCount }, emptyRow);
  const bump = (seat: Seat, industry: Industry) => {
    const row = tally[seat];
    if (row) row[industry] += 1;
  };
  // `shares-disposed` names the defunct corporation, not the survivor the trade
  // goes into, so the survivor has to be carried from the choice that set it.
  let survivor: Industry | null = null;
  // `corporation-founded` names no seat, so the founder is whoever was on the
  // clock — which is what a person at the table goes on too. Unknown before the
  // first `turn-advanced`, and a single free share is not worth guessing over.
  let onClock: Seat | null = null;

  for (const event of log) {
    switch (event.type) {
      case 'shares-bought':
        // The industries, never `picks[industry]`. See the note on `Ledger`.
        for (const industry of INDUSTRIES) {
          if ((event.picks[industry] ?? 0) > 0) bump(event.seat, industry);
        }
        break;
      case 'turn-advanced':
        onClock = event.seat;
        break;
      case 'corporation-founded':
        // The founder's free share is public and exactly known — when the event
        // was actually paid one.
        if (event.founderBonusPaid && onClock !== null) bump(onClock, event.industry);
        break;
      case 'survivor-chosen':
        survivor = event.survivor;
        break;
      case 'shares-disposed':
        // A 2:1 trade moves stock into the survivor — purchase-like on the same
        // terms, and register-relevant because the survivor may be safe.
        if (event.trade > 0 && survivor) bump(event.seat, survivor);
        break;
      default:
        break;
    }
  }
  return { tally };
}

/** Largest-remainder apportionment, so the parts sum to exactly `total`. */
function apportion(weights: readonly number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return weights.map(() => 0);
  if (sum <= 0) {
    // Nothing observed: spread it evenly rather than pretending to know.
    const base = Math.floor(total / weights.length);
    const out = weights.map(() => base);
    for (let i = 0; i < total - base * weights.length; i += 1) out[i] = (out[i] ?? 0) + 1;
    return out;
  }
  const exact = weights.map((w) => (w / sum) * total);
  const out = exact.map((x) => Math.floor(x));
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] = (out[i] ?? 0) + 1;
    left -= 1;
  }
  return out;
}

/**
 * Estimated holdings of `industry` per seat, given what `me` actually holds.
 *
 * `bankShares` is public and ungated, so **issued shares per corporation
 * (25 − bankShares) is known exactly by everyone**. The tallies only split a
 * total that is already certain, and this seat's own holding is subtracted
 * first — so estimation errors are zero-sum. Overrating one opponent
 * necessarily underrates another, rather than drifting one way: an unanchored
 * tally ratio would systematically underrate whoever buys in bulk, and that is
 * usually the leader.
 */
export function estimateHoldings(
  ledger: Ledger,
  industry: Industry,
  me: Seat,
  myShares: number,
  bankShares: number,
): number[] {
  const seatCount = ledger.tally.length;
  const issued = RULES.sharesPerCorporation - bankShares;
  const others = Array.from({ length: seatCount }, (_, s) => s).filter((s) => s !== me);
  const weights = others.map((s) => ledger.tally[s]?.[industry] ?? 0);
  const parts = apportion(weights, Math.max(0, issued - myShares));

  const out = Array.from({ length: seatCount }, () => 0);
  out[me] = myShares;
  others.forEach((s, k) => {
    out[s] = parts[k] ?? 0;
  });
  return out;
}
