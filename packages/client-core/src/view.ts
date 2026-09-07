import {
  classifyPlacement,
  legalMoves,
  viewFor,
  type GameState,
  type Seat,
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
