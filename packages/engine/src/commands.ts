import type { TileId } from './board.js';
import type { Industry } from './pool.js';
import type { Seat } from './state.js';

/**
 * Every action a seat can take is a typed command. The reducer validates it
 * against state and returns events plus the next state, or a typed rejection
 * (KTD2). Merger commands (U5) and the end announcement (U6) extend this union.
 */
export type Command =
  | PlaceTile
  | FoundCorporation
  | BuyShares
  | ChooseSurvivor
  | ChooseDefunctOrder
  | DisposeShares
  | AnnounceEnd
  | MoveToLiquidate
  | CastVote
  | EndTurn;

export interface PlaceTile {
  readonly type: 'place-tile';
  readonly seat: Seat;
  readonly tile: TileId;
}

/** Follows a `place-tile` whose outcome was `found`. */
export interface FoundCorporation {
  readonly type: 'found-corporation';
  readonly seat: Seat;
  readonly industry: Industry;
  /** Which tile of the new group carries the headquarters marker. */
  readonly hqTile: TileId;
}

/** Optional. Empty `picks` buys nothing and advances the turn. */
export interface BuyShares {
  readonly type: 'buy-shares';
  readonly seat: Seat;
  readonly picks: Partial<Record<Industry, number>>;
}

export interface ChooseSurvivor {
  readonly type: 'choose-survivor';
  readonly seat: Seat;
  readonly survivor: Industry;
}

export interface ChooseDefunctOrder {
  readonly type: 'choose-defunct-order';
  readonly seat: Seat;
  /** The next defunct corporation to resolve, chosen among the tied options. */
  readonly next: Industry;
}

export interface DisposeShares {
  readonly type: 'dispose-shares';
  readonly seat: Seat;
  readonly hold: number;
  readonly sell: number;
  /** Shares traded 2-for-1 into the survivor. Must be even. */
  readonly trade: number;
}

/**
 * Move to liquidate — the Going Public ending (#26). Raised at the `end-check`
 * step, and only while the normal ending is *not* yet available.
 */
export interface MoveToLiquidate {
  readonly type: 'move-to-liquidate';
  readonly seat: Seat;
}

/** A vote on an open motion. Raising a motion already counts as a yes. */
export interface CastVote {
  readonly type: 'cast-vote';
  readonly seat: Seat;
  readonly inFavour: boolean;
}

/** Announce the end at the `end-check` step. The game ends after this turn. */
export interface AnnounceEnd {
  readonly type: 'announce-end';
  readonly seat: Seat;
}

/**
 * Decline to announce the end at `end-check`, or skip a forced placement when no
 * hand tile is playable. Advances the turn.
 */
export interface EndTurn {
  readonly type: 'end-turn';
  readonly seat: Seat;
}
