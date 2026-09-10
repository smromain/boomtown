import type { MergeNamingConfig } from '../naming/index.js';
import type { Visibility } from '../state.js';

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
