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
  emptyHoldings,
  viewFor,
} from './state.js';

export { type SetupOptions, createGame } from './setup.js';
