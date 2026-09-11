export type { Ruleset, RulesetId, Tier, BonusRow, EndVoteConfig } from './types.js';
export { classic } from './classic.js';
export { edition2015 } from './edition2015.js';
export { boomtown } from './boomtown.js';

import { boomtown } from './boomtown.js';
import { classic } from './classic.js';
import { edition2015 } from './edition2015.js';
import type { Ruleset, RulesetId } from './types.js';

/**
 * All shipped presets, keyed by id. Default to `boomtown`.
 *
 * Two are reconstructions of published rulebooks; `boomtown` is the project's
 * own variant and is not claiming to reproduce anything. It is nevertheless
 * the default, because it is the game this project is actually making — the
 * reconstructions are here so a table that wants the published rules can have
 * them, not as the thing on offer.
 */
export const PRESETS: Record<RulesetId, Ruleset> = {
  classic,
  'edition-2015': edition2015,
  boomtown,
};

/**
 * What `createGame` uses when a caller names no ruleset.
 *
 * Note what this drags along: `boomtown` forces closed books, so a game
 * created with no options is now a hidden-information table, and its turn
 * holds at end-check whenever a motion is available. A caller that wants the
 * plain published game must ask for `classic` by name.
 */
export const defaultRuleset: Ruleset = boomtown;
