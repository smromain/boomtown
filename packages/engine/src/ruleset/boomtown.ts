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
 * The dials below are **measured, not guessed** (#27) — a few thousand seeded
 * bot games per configuration, sweeping the window and the quota:
 *
 * - `quorumSafeCorps: 2` — three made the mechanic nearly inert, with a motion
 *   raised in 7-17% of games against 53-72% at two.
 * - `quota` two-thirds at three and four seats, but **half at five and six**.
 *   A fixed two-thirds carried 63% of motions at three seats and 6% at six:
 *   coordinating a supermajority gets harder with every seat, which is the
 *   collective-action problem the design predicted.
 * - `minBackers: 2` at every count. The window opens early and a small register
 *   can be two-thirds held by one player.
 *
 * The measurements also confirmed the design's central claim: the decisive
 * second backer was the runner-up in 80-100% of carried motions, which is the
 * "certain second versus a variance play at first" decision the whole mechanic
 * exists to create.
 */
export const boomtown: Ruleset = {
  ...classic,
  id: 'boomtown',
  forcedVisibility: 'hidden',
  mergeNaming: DEFAULT_MERGE_NAMING,
  endVote: {
    quorumSafeCorps: 2,
    quota: 2 / 3,
    quotaBySeats: { 5: 0.5, 6: 0.5 },
    quotaBase: 'register',
    minBackers: 2,
    motionsPerPlayer: 1,
    minPlayers: 3,
  },
};
