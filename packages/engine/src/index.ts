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
  type LadderRung,
  bandIndex,
  rowIndex,
  sharePrice,
  bonusRow,
  bandLabels,
  priceLadder,
  nextPriceStep,
} from './pricing.js';

export {
  type TileId,
  type Coord,
  formatTile,
  parseTile,
  onBoard,
  allTiles,
  tileCount,
  neighbors,
} from './board.js';

export {
  type Rng,
  makeRng,
  nextUint32,
  nextFloat,
  nextInt,
  shuffle,
} from './rng.js';

export {
  type Industry,
  type IndustryInfo,
  type Candidate,
  INDUSTRIES,
  INDUSTRY_INFO,
  POOL,
  tierOf,
} from './pool.js';

export {
  type Seat,
  type Visibility,
  type SeatState,
  type CorpState,
  type AbsorbedCorp,
  type Cell,
  type TurnStep,
  type PendingDecision,
  type MergerSnapshot,
  type GameState,
  type GameResult,
  type RankingRow,
  type PlayerView,
  type SeatView,
  type CorpView,
  activeSeat,
  corpSize,
  isFounded,
  isSafe,
  activeCorporations,
  sharePriceOf,
  displayNameOf,
  flavourOf,
  emptyHoldings,
  viewFor,
} from './state.js';

export { type SetupOptions, createGame } from './setup.js';

export {
  type MergeNamingConfig,
  type EatenRecord,
  DEFAULT_MERGE_NAMING,
  DEFAULT_BLOCKLIST,
  isBlockedName,
  stem,
  fragment,
  fragmentCandidates,
  displayName,
  accretedFlavour,
  blendedFlavour,
  syllables,
} from './naming/index.js';

export type {
  Command,
  PlaceTile,
  FoundCorporation,
  BuyShares,
  ChooseSurvivor,
  ChooseDefunctOrder,
  DisposeShares,
  AnnounceEnd,
  EndTurn,
} from './commands.js';
export { endConditionMet } from './reducer/endgame.js';
export { finalSettlement } from './scoring.js';
export type { EngineEvent, PlacementKind } from './events.js';
export type { EngineError, EngineErrorCode } from './errors.js';
export { reduce, replay } from './reducer/index.js';
export type { ReduceResult } from './reducer/result.js';
export {
  type Placement,
  classifyPlacement,
  isPlayable,
  isDead,
} from './reducer/placement.js';
export {
  type Payout,
  distributeBonuses,
  PHANTOM_SEAT,
} from './reducer/merge/bonuses.js';
export { legalMoves, legalMovesForSeat } from './queries/legalMoves.js';
export { evaluate } from './queries/evaluate.js';
