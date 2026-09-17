import type { TileId } from './board.js';
import type { Industry } from './pool.js';
import type { GameResult, Seat } from './state.js';

/** What the reducer produces alongside the next state. The ordered event log is the replay and persistence substrate (KTD2). */
export type EngineEvent =
  | { readonly type: 'tile-placed'; readonly seat: Seat; readonly tile: TileId; readonly outcome: PlacementKind }
  | {
      readonly type: 'corporation-founded';
      readonly industry: Industry;
      readonly hqTile: TileId;
      readonly tiles: readonly TileId[];
      readonly founderBonusPaid: boolean;
    }
  | {
      readonly type: 'corporation-grew';
      readonly industry: Industry;
      readonly added: readonly TileId[];
      readonly newSize: number;
    }
  /**
   * A purchase. `picks` names the corporations bought into; the quantity and
   * `cost` are `null` when the event has been redacted for a reader not
   * entitled to the detail (`redactEventsFor`, closed books). Naming the
   * corporation without the amount is the deliberate line: it keeps the
   * electorate's shape estimable for a would-be mover while the weights stay
   * secret. `cost` alone would give the quantity away — it is the price times
   * the count, and the price is public — so the two are redacted together.
   */
  | {
      readonly type: 'shares-bought';
      readonly seat: Seat;
      readonly picks: Partial<Record<Industry, number | null>>;
      readonly cost: number | null;
    }
  | { readonly type: 'tiles-drawn'; readonly seat: Seat; readonly count: number }
  | { readonly type: 'dead-tiles-swept'; readonly seat: Seat; readonly tiles: readonly TileId[] }
  | { readonly type: 'merger-started'; readonly placedTile: TileId; readonly corporations: readonly Industry[] }
  | { readonly type: 'survivor-chosen'; readonly survivor: Industry }
  | { readonly type: 'defunct-order-set'; readonly order: readonly Industry[] }
  | {
      readonly type: 'bonus-paid';
      readonly defunct: Industry;
      readonly payouts: readonly { readonly seat: Seat; readonly tier: 'primary' | 'secondary' | 'tertiary'; readonly amount: number }[];
    }
  /**
   * One seat's disposal of a defunct chain. The counts and proceeds are `null`
   * under the same redaction as `shares-bought`: they are a direct statement of
   * how much of the defunct corporation this seat held.
   */
  | {
      readonly type: 'shares-disposed';
      readonly seat: Seat;
      readonly defunct: Industry;
      readonly hold: number | null;
      readonly sell: number | null;
      readonly trade: number | null;
      readonly proceeds: number | null;
    }
  | { readonly type: 'corporation-defunct'; readonly industry: Industry; readonly absorbedInto: Industry }
  | { readonly type: 'merger-completed'; readonly survivor: Industry }
  | { readonly type: 'turn-advanced'; readonly seat: Seat }
  | { readonly type: 'motion-raised'; readonly seat: Seat }
  /** The share register became public. Fires once per game — it never un-publishes. */
  | { readonly type: 'register-published' }
  | {
      readonly type: 'vote-cast';
      readonly seat: Seat;
      readonly inFavour: boolean;
      readonly weight: number;
    }
  | {
      readonly type: 'motion-carried';
      readonly backers: readonly Seat[];
      readonly yes: number;
      readonly total: number;
    }
  | {
      readonly type: 'motion-failed';
      readonly backers: readonly Seat[];
      readonly yes: number;
      readonly total: number;
    }
  /** Everyone who backed a motion that failed, now playing with open books. */
  | { readonly type: 'books-opened'; readonly seats: readonly Seat[] }
  | { readonly type: 'end-announced'; readonly seat: Seat }
  | { readonly type: 'game-over'; readonly result: GameResult };

export type PlacementKind = 'nothing' | 'found' | 'grow' | 'merge';
