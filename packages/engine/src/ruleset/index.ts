export type { Ruleset, RulesetId, Tier, BonusRow } from './types.js';
export { classic } from './classic.js';
export { edition2015 } from './edition2015.js';
export { boomtown } from './boomtown.js';

import { boomtown } from './boomtown.js';
import { classic } from './classic.js';
import { edition2015 } from './edition2015.js';
import type { Ruleset, RulesetId } from './types.js';

/**
 * All shipped presets, keyed by id. Default to `classic`.
 *
 * Two are reconstructions of published rulebooks; `boomtown` is the project's
 * own variant and is not claiming to reproduce anything.
 */
export const PRESETS: Record<RulesetId, Ruleset> = {
  classic,
  'edition-2015': edition2015,
  boomtown,
};

export const defaultRuleset: Ruleset = classic;
