// @boomtown/engine — headless, deterministic Boomtown rules engine.
// Public surface grows across Phase A units U2–U8.

export { RULES, TOTAL_SHARES } from './constants.js';
export {
  type Ruleset,
  type RulesetId,
  type Tier,
  type BonusRow,
  classic,
  edition2015,
  PRESETS,
  defaultRuleset,
} from './ruleset/index.js';
export {
  PRICE_ROWS,
  PRIMARY,
  SECONDARY_2015,
  TERTIARY,
  bandIndex,
  rowIndex,
  sharePrice,
  bonusRow,
} from './pricing.js';
