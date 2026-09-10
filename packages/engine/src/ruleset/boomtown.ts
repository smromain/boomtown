import { DEFAULT_MERGE_NAMING } from '../naming/index.js';
import { classic } from './classic.js';
import type { Ruleset } from './types.js';

/**
 * **Boomtown** — the project's own variant, and the only preset here that is not
 * a reconstruction of a published rulebook. Classic's rules, played with the
 * books closed.
 *
 * It exists to carry the *Going Public* ending (a vote to liquidate early,
 * where backing a failed motion opens your books), which is why closed books
 * are a rule here rather than a table setting: at an open table the register a
 * motion publishes is already visible, so the disclosure that pays for calling
 * one costs nothing and the mechanic evaporates. See
 * https://github.com/smromain/boomtown/issues/23.
 *
 * The vote itself is not built yet. Until it is, this plays exactly as classic
 * with `visibility: 'hidden'` forced — which is a coherent ruleset on its own,
 * and deliberately shippable before the mechanic lands.
 */
export const boomtown: Ruleset = {
  ...classic,
  id: 'boomtown',
  forcedVisibility: 'hidden',
  mergeNaming: DEFAULT_MERGE_NAMING,
};
