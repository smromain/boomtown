import type { TileId } from './board.js';
import { sharePrice } from './pricing.js';
import { INDUSTRIES, INDUSTRY_INFO, type Candidate, type Industry } from './pool.js';
import type { Ruleset } from './ruleset/types.js';
import type { Rng } from './rng.js';

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
  /** Industries this corporation has absorbed, in acquisition order. Drives the derived display name (R6). */
  eaten: Industry[];
}

export type Cell =
  | { readonly kind: 'unincorporated' }
  | { readonly kind: 'corporation'; readonly industry: Industry };

export type TurnStep = 'place' | 'found' | 'merge' | 'buy' | 'end-check';

/** A decision the merger state machine is waiting on, addressed to one seat (R3, KTD3). */
export type PendingDecision =
  | { readonly type: 'choose-survivor'; readonly seat: Seat; readonly options: readonly Industry[] }
  | { readonly type: 'choose-defunct-order'; readonly seat: Seat; readonly options: readonly Industry[] }
  | {
      readonly type: 'dispose-shares';
      readonly seat: Seat;
      readonly defunct: Industry;
      readonly survivor: Industry;
      readonly shares: number;
    };

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
  pending: PendingDecision | null;
}

export interface RankingRow {
  readonly seat: Seat;
  readonly cash: number;
  readonly equity: number;
  readonly total: number;
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
  /** Set once a seat announces the end (U6). The game ends after that seat finishes its turn. */
  endAnnouncedBy: Seat | null;
  /** Occupied cells only; absent key means an empty tile. */
  cells: Record<TileId, Cell>;
  corporations: Record<Industry, CorpState>;
  bankShares: Record<Industry, number>;
  /** Secret: hand tiles per seat, indexed by seat number. */
  hands: TileId[][];
  /** Secret: the remaining draw pile, order is draw order. */
  bag: TileId[];
  rng: Rng;
  merger: MergerSnapshot | null;
  result: GameResult | null;
}

// --- derived helpers -------------------------------------------------------

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
  readonly eaten: readonly Industry[];
  readonly sharePrice: number | null;
  readonly bankShares: number;
  readonly baseName: string;
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
  /** Only present when a pending merger decision is addressed to `you`. */
  readonly pendingDecision: PendingDecision | null;
  /** Set for the active seat while a placement is awaiting a headquarters choice. */
  readonly pendingFound: { readonly group: readonly TileId[] } | null;
  readonly endAnnouncedBy: Seat | null;
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
        eaten: corp.eaten,
        sharePrice: sharePriceOf(state, industry),
        bankShares: state.bankShares[industry],
        baseName: state.companies[industry].baseName,
      };
      return [industry, view];
    }),
  ) as Record<Industry, CorpView>;

  const pending =
    state.merger?.pending && state.merger.pending.seat === you ? state.merger.pending : null;

  return {
    ruleset: state.ruleset,
    you,
    step: state.step,
    status: state.status,
    activeSeat: activeSeat(state),
    turnOrder: state.turnOrder,
    seats: state.seats.map((seat, index) => ({
      name: seat.name,
      cash: open || index === you ? seat.cash : null,
      holdings: open || index === you ? { ...seat.holdings } : null,
      handCount: state.hands[index]!.length,
    })),
    yourHand: [...state.hands[you]!],
    yourCash: state.seats[you]!.cash,
    yourHoldings: { ...state.seats[you]!.holdings },
    cells: state.cells,
    corporations,
    companies: state.companies,
    drawPileCount: state.bag.length,
    pendingDecision: pending,
    pendingFound: state.pendingFound,
    endAnnouncedBy: state.endAnnouncedBy,
    result: state.result,
  };
}
