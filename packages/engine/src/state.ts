import type { TileId } from './board.js';
import { sharePrice } from './pricing.js';
import { INDUSTRIES, INDUSTRY_INFO, type Candidate, type Industry } from './pool.js';
import type { Ruleset } from './ruleset/types.js';
import type { Rng } from './rng.js';
import { blendedFlavour, displayName, type EatenRecord } from './naming/index.js';

/** An `EatenRecord` plus which industry the absorbed corporation belonged to (for lineage marks). */
export type AbsorbedCorp = EatenRecord & { readonly industry: Industry };

export type Seat = number;

/** Table setting: whether opponent cash and holdings are visible. Not a rule. */
export type Visibility = 'open' | 'hidden';

export interface SeatState {
  readonly name: string;
  cash: number;
  /** Shares held per industry. A defunct corporation's shares stay here until it refounds or final settlement. */
  holdings: Record<Industry, number>;
}

export interface CorpState {
  founded: boolean;
  /** The headquarters tile. Null when unfounded or returned to the tray. */
  hqTile: TileId | null;
  /** Member tiles. Length is the size. */
  tiles: TileId[];
  /** Corporations this one has absorbed, in acquisition order. Drives the derived display name and accreted flavour (R6). */
  eaten: AbsorbedCorp[];
}

export type Cell =
  | { readonly kind: 'unincorporated' }
  | { readonly kind: 'corporation'; readonly industry: Industry };

export type TurnStep = 'place' | 'found' | 'merge' | 'buy' | 'end-check' | 'vote';

/** A decision the merger state machine is waiting on, addressed to one seat (R3, KTD3). */
export type PendingDecision =
  /**
   * A vote on a motion to liquidate, addressed to one seat (#26). It rides the
   * same channel as the merger decisions — engine -> `viewFor` -> client store
   * -> `DecisionModal` -> bots — because every consumer downstream is written
   * against `PendingDecision` generically rather than against mergers.
   */
  | { readonly type: 'cast-vote'; readonly seat: Seat; readonly motionBy: Seat }
  | { readonly type: 'choose-survivor'; readonly seat: Seat; readonly options: readonly Industry[] }
  | { readonly type: 'choose-defunct-order'; readonly seat: Seat; readonly options: readonly Industry[] }
  | {
      readonly type: 'dispose-shares';
      readonly seat: Seat;
      readonly defunct: Industry;
      readonly survivor: Industry;
      readonly shares: number;
    };

/**
 * A motion to liquidate, open for voting. Null the rest of the time.
 *
 * Votes are sequenced and open — mover first, then clockwise — which is the
 * same idiom merger disposal uses, works in hot-seat without a secret ballot,
 * and lets the count short-circuit the moment the outcome is settled.
 */
export interface MotionSnapshot {
  /** Who raised it. Raising a motion *is* voting for it. */
  readonly by: Seat;
  /** Voting order: the mover, then clockwise. */
  readonly order: readonly Seat[];
  /** How much of the register each seat carries, fixed when the motion was raised. */
  readonly weights: Readonly<Record<number, number>>;
  /** Index into `order` for the next seat to vote. */
  cursor: number;
  /** Votes cast so far, by seat. */
  votes: Record<number, boolean>;
  pending: PendingDecision | null;
}

/** Live merger being resolved (R3, KTD3). Null the rest of the time. */
export interface MergerSnapshot {
  readonly placedTile: TileId;
  /** Corporations adjacent to the placed tile — the ones party to this merger. */
  readonly merging: readonly Industry[];
  /** The placed tile plus connected unincorporated tiles. Joins the survivor once the merger completes. */
  readonly group: readonly TileId[];
  survivor: Industry | null;
  /** Defunct corporations still to resolve, largest-first once ordered. */
  defunctQueue: Industry[];
  /** The defunct corporation currently being disposed, and the clockwise seat order for it. */
  disposal: { readonly defunct: Industry; seatQueue: Seat[] } | null;
  /** Tiles of defunct corporations, held until the survivor absorbs everything at completion. */
  absorbedTiles: TileId[];
  /** Defunct corporations in the order they were resolved — appended to the survivor's `eaten` at completion. */
  resolvedRecords: AbsorbedCorp[];
  pending: PendingDecision | null;
}

/** One corporation's contribution to a seat's final settlement (for the victory beat's "show the work"). */
export interface CorpSettlement {
  readonly industry: Industry;
  readonly shares: number;
  readonly price: number;
  readonly saleValue: number;
  /** Primary/secondary/tertiary bonuses this seat drew from this corporation, combined. */
  readonly bonus: number;
}

export interface RankingRow {
  readonly seat: Seat;
  readonly cash: number;
  readonly equity: number;
  readonly total: number;
  /** Every corporation this seat drew money from at final settlement, in settlement order. */
  readonly holdings: readonly CorpSettlement[];
}

export interface GameResult {
  /** Highest total first. Ties share a rank. */
  readonly rankings: readonly RankingRow[];
  readonly winners: readonly Seat[];
}

export interface GameState {
  readonly ruleset: Ruleset;
  readonly visibility: Visibility;
  /** The company drawn for each industry this game. `baseName` is identity and never changes. */
  readonly companies: Record<Industry, Candidate>;
  readonly seats: SeatState[];
  /** Seats in play order. */
  readonly turnOrder: Seat[];
  /** Index into `turnOrder` for the active seat. */
  turnPointer: number;
  step: TurnStep;
  /** Set while `step === 'found'`: the new unincorporated group awaiting a headquarters. */
  pendingFound: { readonly group: readonly TileId[] } | null;
  status: 'playing' | 'over';
  /** Which seat announced the end, recorded for replay and the post-game screen. Set in the step that ends the game. */
  endAnnouncedBy: Seat | null;
  /** Occupied cells only; absent key means an empty tile. */
  cells: Record<TileId, Cell>;
  corporations: Record<Industry, CorpState>;
  bankShares: Record<Industry, number>;
  /** Secret: hand tiles per seat, indexed by seat number. */
  hands: TileId[][];
  /** Secret: the remaining draw pile, order is draw order. */
  bag: TileId[];
  /** Public: tiles revealed face-up and taken out of play (the dead-tile sweep). */
  removed: TileId[];
  rng: Rng;
  merger: MergerSnapshot | null;
  /** The motion currently being voted on, if any (#26). */
  motion: MotionSnapshot | null;
  /**
   * Whether safe-corporation holdings have been published. Set by the first
   * motion and never cleared: you cannot un-ring that bell, so information
   * opens monotonically over a game.
   */
  registerPublic: boolean;
  /** Seats whose books are fully open — everyone who backed a motion that failed. */
  openBooks: Seat[];
  /** Motions each seat has raised, for the per-player limit. */
  motionsRaised: Record<number, number>;
  result: GameResult | null;
}

// --- derived helpers -------------------------------------------------------

/**
 * Vote weight per seat: shares held in safe corporations. Duplicated from the
 * reducer's `registerWeights` rather than imported, because `reducer/motion.ts`
 * imports from here and the cycle is not worth the six lines it would save.
 */
function registerWeightsOf(state: GameState): Record<number, number> {
  const safe = activeCorporations(state).filter((industry) => isSafe(state, industry));
  const weights: Record<number, number> = {};
  state.seats.forEach((seat, index) => {
    weights[index] = safe.reduce((sum, industry) => sum + seat.holdings[industry], 0);
  });
  return weights;
}

export function activeSeat(state: GameState): Seat {
  return state.turnOrder[state.turnPointer]!;
}

export function corpSize(state: GameState, industry: Industry): number {
  return state.corporations[industry].tiles.length;
}

export function isFounded(state: GameState, industry: Industry): boolean {
  return state.corporations[industry].founded;
}

export function isSafe(state: GameState, industry: Industry): boolean {
  return isFounded(state, industry) && corpSize(state, industry) >= state.ruleset.safeSize;
}

export function activeCorporations(state: GameState): Industry[] {
  return INDUSTRIES.filter((i) => state.corporations[i].founded);
}

export function sharePriceOf(state: GameState, industry: Industry): number | null {
  if (!isFounded(state, industry)) return null;
  return sharePrice(corpSize(state, industry), INDUSTRY_INFO[industry].tier, state.ruleset);
}

/** The corporation's current derived display name (R6). */
export function displayNameOf(state: GameState, industry: Industry): string {
  return displayName(
    state.companies[industry].baseName,
    state.corporations[industry].eaten,
    state.ruleset.mergeNaming,
  );
}

/**
 * The corporation's flavour line: verbatim while unmerged, and spliced —
 * head of its own line plus the tail of every swallowed line — once it has
 * eaten anything. Nonsense by design, like the derived display name.
 */
export function flavourOf(state: GameState, industry: Industry): string {
  return blendedFlavour(state.companies[industry].flavour, state.corporations[industry].eaten);
}

export function emptyHoldings(): Record<Industry, number> {
  return Object.fromEntries(INDUSTRIES.map((i) => [i, 0])) as Record<Industry, number>;
}

// --- filtered per-seat view (R12, R13, KTD4) ------------------------------

export interface SeatView {
  readonly name: string;
  /** Null when hidden by the table setting and this is not `you`. */
  readonly cash: number | null;
  readonly holdings: Record<Industry, number> | null;
  readonly handCount: number;
}

export interface CorpView {
  readonly founded: boolean;
  readonly safe: boolean;
  readonly size: number;
  readonly hqTile: TileId | null;
  readonly tiles: readonly TileId[];
  readonly sharePrice: number | null;
  readonly bankShares: number;
  /** Identity — the drawn company name, fixed for the game. */
  readonly baseName: string;
  /** Derived: stem + one fragment per absorbed corporation (R6). */
  readonly displayName: string;
  /** Flavour line — verbatim while unmerged, spliced nonsense once it has eaten (R6). */
  readonly flavour: string;
  /** Industries this corporation has absorbed, in order — one lineage mark per entry. */
  readonly eaten: readonly Industry[];
}

export interface PlayerView {
  readonly ruleset: Ruleset;
  readonly you: Seat;
  readonly step: TurnStep;
  readonly status: 'playing' | 'over';
  readonly activeSeat: Seat;
  readonly turnOrder: readonly Seat[];
  readonly seats: readonly SeatView[];
  readonly yourHand: readonly TileId[];
  readonly yourCash: number;
  readonly yourHoldings: Record<Industry, number>;
  readonly cells: Readonly<Record<TileId, Cell>>;
  readonly corporations: Record<Industry, CorpView>;
  readonly companies: Record<Industry, Candidate>;
  readonly drawPileCount: number;
  /** Tiles revealed face-up and taken out of play by the dead-tile sweep. */
  readonly removedTiles: readonly TileId[];
  /** Only present when a pending merger decision is addressed to `you`. */
  readonly pendingDecision: PendingDecision | null;
  /** Set for the active seat while a placement is awaiting a headquarters choice. */
  readonly pendingFound: { readonly group: readonly TileId[] } | null;
  readonly endAnnouncedBy: Seat | null;
  /** The motion open for voting, as everyone can see it. Null when there is none. */
  readonly motion: {
    readonly by: Seat;
    readonly order: readonly Seat[];
    readonly weights: Readonly<Record<number, number>>;
    readonly votes: Readonly<Record<number, boolean>>;
    readonly waitingOn: Seat | null;
  } | null;
  /** Whether safe-corporation holdings are public. Once true, never false again. */
  readonly registerPublic: boolean;
  /**
   * Each seat's vote weight — shares held in safe corporations — once the
   * register has been published, else null.
   *
   * The weight rather than a per-corporation breakdown, because the weight is
   * what a vote turns on and `holdings` is all-or-nothing: filling the unsafe
   * corporations with zeroes to reuse that shape would be a lie rather than a
   * partial disclosure. A breakdown can be added if the UI ever wants one.
   */
  readonly register: Readonly<Record<number, number>> | null;
  /** Seats playing with open books — everyone who backed a motion that failed. */
  readonly openBooks: readonly Seat[];
  readonly result: GameResult | null;
}

/** Project the authoritative state to what one seat is allowed to see. */
export function viewFor(state: GameState, you: Seat): PlayerView {
  const open = state.visibility === 'open';
  const corporations = Object.fromEntries(
    INDUSTRIES.map((industry) => {
      const corp = state.corporations[industry];
      const view: CorpView = {
        founded: corp.founded,
        safe: isSafe(state, industry),
        size: corp.tiles.length,
        hqTile: corp.hqTile,
        tiles: corp.tiles,
        sharePrice: sharePriceOf(state, industry),
        bankShares: state.bankShares[industry],
        baseName: state.companies[industry].baseName,
        displayName: displayNameOf(state, industry),
        flavour: flavourOf(state, industry),
        eaten: corp.eaten.map((record) => record.industry),
      };
      return [industry, view];
    }),
  ) as Record<Industry, CorpView>;

  const pending =
    state.merger?.pending && state.merger.pending.seat === you
      ? state.merger.pending
      : state.motion?.pending && state.motion.pending.seat === you
        ? state.motion.pending
        : null;

  return {
    ruleset: state.ruleset,
    you,
    step: state.step,
    status: state.status,
    activeSeat: activeSeat(state),
    turnOrder: state.turnOrder,
    seats: state.seats.map((seat, index) => {
      // Open books are exactly that: a seat that backed a failed motion is as
      // visible as it would be at an open table, permanently.
      const bare = open || index === you || state.openBooks.includes(index);
      return {
        name: seat.name,
        cash: bare ? seat.cash : null,
        holdings: bare ? { ...seat.holdings } : null,
        handCount: state.hands[index]!.length,
      };
    }),
    yourHand: [...state.hands[you]!],
    yourCash: state.seats[you]!.cash,
    yourHoldings: { ...state.seats[you]!.holdings },
    cells: state.cells,
    corporations,
    companies: state.companies,
    drawPileCount: state.bag.length,
    removedTiles: [...state.removed],
    pendingDecision: pending,
    motion: state.motion
      ? {
          by: state.motion.by,
          order: state.motion.order,
          weights: state.motion.weights,
          votes: state.motion.votes,
          waitingOn: state.motion.pending?.seat ?? null,
        }
      : null,
    registerPublic: state.registerPublic,
    register: state.registerPublic ? registerWeightsOf(state) : null,
    openBooks: [...state.openBooks],
    pendingFound: state.pendingFound,
    endAnnouncedBy: state.endAnnouncedBy,
    result: state.result,
  };
}
