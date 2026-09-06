import { describe, expect, it } from 'vitest';
import { checkDisposal, maxTrade } from './disposal.js';

describe('checkDisposal', () => {
  it('accepts a split that accounts for every share', () => {
    expect(checkDisposal(5, 10, { hold: 2, sell: 1, trade: 2 })).toEqual({ valid: true, received: 1 });
  });

  it('rejects a split that does not sum to the holding', () => {
    const check = checkDisposal(5, 10, { hold: 1, sell: 1, trade: 2 });
    expect(check.valid).toBe(false);
    expect(check.reason).toMatch(/all 5 shares/);
  });

  it('rejects an odd trade', () => {
    expect(checkDisposal(5, 10, { hold: 2, sell: 0, trade: 3 }).valid).toBe(false);
  });

  it('rejects a trade beyond twice the survivor bank', () => {
    expect(checkDisposal(6, 1, { hold: 0, sell: 2, trade: 4 }).reason).toMatch(/survivor shares left/);
    expect(checkDisposal(6, 2, { hold: 0, sell: 2, trade: 4 }).valid).toBe(true);
  });
});

describe('maxTrade', () => {
  it('is the smaller of the even remainder and twice the bank', () => {
    expect(maxTrade(5, 10)).toBe(4);
    expect(maxTrade(10, 3)).toBe(6);
    expect(maxTrade(0, 5)).toBe(0);
  });
});
