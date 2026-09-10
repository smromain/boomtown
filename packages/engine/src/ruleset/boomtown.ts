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
 * The dials below are the design note's starting guesses. They are config
 * rather than constants precisely because they are expected to move once the
 * simulation measures them (#27).
 */
export const boomtown: Ruleset = {
  ...classic,
  id: 'boomtown',
  forcedVisibility: 'hidden',
  mergeNaming: DEFAULT_MERGE_NAMING,
  endVote: {
    quorumSafeCorps: 2,
    quota: 2 / 3,
    quotaBase: 'register',
    minBackers: 2,
    motionsPerPlayer: 1,
    minPlayers: 3,
  },
};
