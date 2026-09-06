import type { ClientView } from '@boomtown/client-core';
import type { Command, TileId } from '@boomtown/engine';

/** The set of tiles the active seat can legally place right now. */
export function playableTiles(view: ClientView | null): Set<TileId> {
  if (!view || view.step !== 'place') return new Set();
  return new Set(view.handTiles.filter((tile) => tile.playable).map((tile) => tile.tile));
}

/**
 * The command a click on `tile` should dispatch, or null when the click is a
 * no-op — not the placement step, a command already in flight, or an
 * illegal cell (dead, blocked, occupied, or not in hand).
 */
export function placementFor(view: ClientView | null, busy: boolean, tile: TileId): Command | null {
  if (!view || busy || view.step !== 'place') return null;
  if (!playableTiles(view).has(tile)) return null;
  return { type: 'place-tile', seat: view.you, tile };
}
