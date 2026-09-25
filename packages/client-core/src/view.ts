import {
  INDUSTRIES,
  classifyPlacement,
  legalMoves,
  viewFor,
  type GameState,
  type Industry,
  type Seat,
  type TableView,
  type TileId,
} from '@boomtown/engine';
import type { ClientViewDTO, HandTile, HandTileEffect } from '@boomtown/protocol';

/**
 * The client's per-seat view. The wire shape lives in `@boomtown/protocol`
 * (`ClientViewDTO`) so the room and the client agree on it; `ClientView` is
 * that shape under the client-core name. `clientView()` builds it from
 * authoritative state — used by `localTransport` and by the room object
 * (via `@boomtown/protocol`'s shape). Online the room sends a `ClientViewDTO`
 * directly and no rebuild is needed.
 */
export type ClientView = ClientViewDTO;
export type { HandTile, HandTileEffect };

export function clientView(state: GameState, seat: Seat): ClientView {
  const base = viewFor(state, seat);
  const isActive = base.activeSeat === seat && base.status === 'playing';

  return {
    ...base,
    legalMoves: isActive ? legalMoves(state) : [],
    handTiles: base.yourHand.map((tile) => handTileOf(state, tile)),
  };
}

/** What placing one hand tile would do this turn — the rack's per-tile label. */
export function handTileOf(state: GameState, tile: TileId): HandTile {
  const kind = classifyPlacement(state, tile).kind;
  const effect: HandTileEffect =
    kind === 'found-blocked' ? 'blocked' : kind === 'dead' ? 'dead' : kind;
  return { tile, effect, playable: effect !== 'dead' && effect !== 'blocked' };
}

/**
 * The key the couch table's view is stored under (#62). Not a seat: no seat is
 * negative, so nothing that indexes seats by it finds anything, and nothing that
 * compares it with the seat on the clock ever matches.
 */
export const TABLE_READER: Seat = -1;

const NO_HOLDINGS = Object.fromEntries(INDUSTRIES.map((i) => [i, 0])) as Record<Industry, number>;

/**
 * The couch table's view in the shape the desktop already renders a spectator
 * from (#62). The desktop reads the public board out of `ClientView` everywhere,
 * and with no local seat it never draws a hand, a prompt or a private panel —
 * so the table fills the private fields with nothing, here at the transport
 * edge, rather than every panel learning a second view type.
 *
 * This is safe in the direction that matters: the wire carried a `TableView`,
 * which has no private field to fill these from. Empty is all they can be.
 */
export function tableClientView(view: TableView): ClientView {
  const { decision: _decision, ...shared } = view;
  return {
    ...shared,
    you: TABLE_READER,
    yourHand: [],
    yourCash: 0,
    yourHoldings: NO_HOLDINGS,
    pendingDecision: null,
    legalMoves: [],
    handTiles: [],
  };
}
