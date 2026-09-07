import type { ClientView } from '@boomtown/client-core';
import type { Command, TileId } from '@boomtown/engine';
import type { CellTarget } from './BoardScene.js';

/**
 * The cells to mark on the board for the active seat during the placement step:
 * `playable` (a blinking ring) for tiles that can be placed, `dead` (struck red)
 * for tiles that never can. Empty off the placement step.
 */
export function cellTargets(view: ClientView | null): Map<TileId, CellTarget> {
  const targets = new Map<TileId, CellTarget>();
  if (!view || view.step !== 'place') return targets;
  for (const tile of view.handTiles) {
    if (tile.playable) targets.set(tile.tile, 'playable');
    else if (tile.effect === 'dead') targets.set(tile.tile, 'dead');
  }
  return targets;
}

/**
 * The command a click on `tile` should dispatch, or null when the click is a
 * no-op — not the placement step, a command already in flight, or an illegal cell.
 */
export function placementFor(view: ClientView | null, busy: boolean, tile: TileId): Command | null {
  if (!view || busy || view.step !== 'place') return null;
  if (cellTargets(view).get(tile) !== 'playable') return null;
  return { type: 'place-tile', seat: view.you, tile };
}
