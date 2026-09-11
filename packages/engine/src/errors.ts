/** A typed reducer rejection. The reducer never throws for a rule violation — it returns one of these. */
export interface EngineError {
  readonly code: EngineErrorCode;
  readonly message: string;
}

export type EngineErrorCode =
  | 'not-your-turn'
  | 'wrong-step'
  | 'tile-not-in-hand'
  | 'cell-occupied'
  | 'tile-permanently-dead'
  | 'founding-blocked-all-corporations-active'
  | 'unknown-industry'
  | 'industry-already-founded'
  | 'hq-tile-not-in-group'
  | 'too-many-shares'
  | 'corporation-not-active'
  | 'not-enough-cash'
  | 'not-enough-bank-stock'
  | 'negative-quantity'
  | 'invalid-survivor'
  | 'invalid-defunct-choice'
  | 'disposal-mismatch'
  | 'trade-not-even'
  | 'trade-exceeds-bank'
  | 'end-condition-not-met'
  | 'illegal-motion'
  | 'game-over';

export function err(code: EngineErrorCode, message: string): { ok: false; error: EngineError } {
  return { ok: false, error: { code, message } };
}
