import {
  classifyPlacement,
  legalMoves,
  viewFor,
  type Command,
  type GameState,
  type PlayerView,
  type Seat,
  type TileId,
} from '@boomtown/engine';

/** What placing a hand tile would do this turn. `blocked` = would found an eighth corporation. */
export type HandTileEffect = 'nothing' | 'found' | 'grow' | 'merge' | 'dead' | 'blocked';

export interface HandTile {
  readonly tile: TileId;
  readonly effect: HandTileEffect;
  readonly playable: boolean;
}

/**
 * A `PlayerView` plus the two things the UI cannot re-derive without the full
 * `GameState` (R8): the active seat's legal moves, and what each hand tile would
 * do. The board highlights playable tiles; the hand rack labels every tile.
 */
export interface ClientView extends PlayerView {
  /** Legal commands for the active seat; empty in every other seat's view. */
  readonly legalMoves: readonly Command[];
  readonly handTiles: readonly HandTile[];
}

export function clientView(state: GameState, seat: Seat): ClientView {
  const base = viewFor(state, seat);
  const isActive = base.activeSeat === seat && base.status === 'playing';

  return {
    ...base,
    legalMoves: isActive ? legalMoves(state) : [],
    handTiles: base.yourHand.map((tile) => toHandTile(state, tile)),
  };
}

function toHandTile(state: GameState, tile: TileId): HandTile {
  const kind = classifyPlacement(state, tile).kind;
  const effect: HandTileEffect =
    kind === 'found-blocked' ? 'blocked' : kind === 'dead' ? 'dead' : kind;
  return { tile, effect, playable: effect !== 'dead' && effect !== 'blocked' };
}
