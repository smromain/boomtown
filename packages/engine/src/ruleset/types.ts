import type { MergeNamingConfig } from '../naming/index.js';
import type { Visibility } from '../state.js';

/**
 * The Going Public ending: a vote to liquidate early, available before the
 * normal end trigger. Absent from both published editions — they end the way
 * their rulebooks say.
 */
export interface EndVoteConfig {
  /** Safe corporations that must exist before a motion is legal. */
  readonly quorumSafeCorps: number;
  /** Share of the vote needed to carry, as a fraction. Carries on `>= ceil(quota * total)`. */
  readonly quota: number;
  /** Whether `quota` is measured against the whole register or only votes cast. */
  readonly quotaBase: 'register' | 'cast';
  /**
   * Distinct players who must vote yes. The supermajority alone does not do the
   * job it looks like it does: the window opens early, and a register that
   * small can be two-thirds held by one player — so without this a leader could
   * carry a motion alone at the earliest legal moment.
   */
  readonly minBackers: number;
  /**
   * Motions each player may raise per game. Already "failed motions", since a
   * carried one ends the game.
   */
  readonly motionsPerPlayer: number;
  /** Below this many seats there is no vote — a coalition needs three to exist. */
  readonly minPlayers: number;
}

/**
 * A Boomtown ruleset expressed as data. The engine reads one `Ruleset`; the two
 * published editions ship as presets (`classic`, `edition2015`). Every key here
 * is one row of the edition-configuration table in `docs/rules.md`.
 */
export interface Ruleset {
  /** Stable identifier for the preset. */
  readonly id: RulesetId;

  /** Board geometry. Classic is 12 x 9 = 108 cells, `1A`–`12I`. */
  readonly board: { readonly cols: number; readonly rows: number };

  /** A corporation of this size or larger is safe and cannot be dissolved. */
  readonly safeSize: number;

  /** A player may announce the end once a corporation reaches this size. */
  readonly endChainSize: number;

  /** 2 = majority / minority (classic); 3 = primary / secondary / tertiary (2015). */
  readonly bonusTiers: 2 | 3;

  /**
   * Eight ascending size cutoffs that define the nine price bands. A size is in
   * band `i` when it is `<= bandCuts[i]`, else the ninth band.
   */
  readonly bandCuts: readonly [number, number, number, number, number, number, number, number];

  /** What a sole shareholder of a defunct corporation receives. */
  readonly soleHolderPolicy: 'both' | 'primaryAndTertiary';

  /** Whether permanently unplayable tiles are swept and replaced. */
  readonly deadTilePolicy: 'none' | 'discardAndReplace';

  /** Whether a 2-player game gives the bank a phantom shareholding each merger. */
  readonly phantomShareholderInTwoPlayer: boolean;

  /** Rounding applied when a tied bonus is split. */
  readonly splitRounding: 'none' | 'up100';

  /** Merged-name accretion rules (`docs/naming.md`). */
  readonly mergeNaming: MergeNamingConfig;

  /**
   * Visibility this ruleset requires, overriding the table's choice. Absent for
   * the two published editions, where cash and holdings visibility is a table
   * setting and not a rule (`CLAUDE.md`).
   *
   * The Boomtown preset sets it, because closed books are not a preference
   * there but the thing the ruleset is built on: at an open table its register
   * is already public and the disclosure that pays for a motion costs nothing.
   * `toSetupOptions` and the server's `setupOptionsFor` both honour it, so a
   * table cannot be started around it either locally or online.
   */
  readonly forcedVisibility?: Visibility;

  /**
   * The Going Public ending, or absent for a ruleset that ends only the
   * published way. Values here are the design note's starting guesses and are
   * meant to move once the tuning runs measure them (#27).
   */
  readonly endVote?: EndVoteConfig;
}

export type RulesetId = 'classic' | 'edition-2015' | 'boomtown';

/** The three tiers a corporation's industry can belong to. */
export type Tier = 1 | 2 | 3;

/** Bonus payout for one defunct corporation, priced at its pre-merger size. */
export interface BonusRow {
  readonly primary: number;
  /** Only present when `bonusTiers === 3`. */
  readonly secondary: number | null;
  readonly tertiary: number;
}
