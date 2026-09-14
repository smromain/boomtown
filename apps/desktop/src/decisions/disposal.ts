import { copy, fill } from '../copy/copy.js';

export interface DisposalSplit {
  readonly hold: number;
  readonly sell: number;
  readonly trade: number;
}

export interface DisposalCheck {
  readonly valid: boolean;
  readonly reason?: string;
  /** Survivor shares gained (trade / 2). */
  readonly received: number;
}

/**
 * Client-side mirror of the engine's disposal rules (`docs/rules.md` step 5):
 * the split must account for every share, trades are even, and a trade cannot
 * exceed twice the survivor's remaining bank stock.
 */
export function checkDisposal(shares: number, survivorBank: number, split: DisposalSplit): DisposalCheck {
  const { hold, sell, trade } = split;
  if (hold < 0 || sell < 0 || trade < 0) return { valid: false, reason: copy.disposalErrors.negative, received: 0 };
  if (hold + sell + trade !== shares) {
    return { valid: false, reason: fill(copy.disposalErrors.accountForAll, { n: shares }), received: 0 };
  }
  if (trade % 2 !== 0) return { valid: false, reason: copy.disposalErrors.twoForOne, received: 0 };
  if (trade / 2 > survivorBank) {
    return { valid: false, reason: fill(copy.disposalErrors.bankShort, { n: survivorBank }), received: 0 };
  }
  return { valid: true, received: trade / 2 };
}

/** The largest even trade the survivor's bank can absorb, given how many shares are left to place. */
export function maxTrade(remaining: number, survivorBank: number): number {
  return Math.min(remaining - (remaining % 2), survivorBank * 2);
}
