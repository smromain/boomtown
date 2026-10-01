import { useSyncExternalStore } from 'react';
import type { TileId } from '@boomtown/engine';

/**
 * The tile under the pointer in your rack, so the board can show where it would
 * go. Most useful off-turn, when the rack is a readout and the board marks no
 * targets at all: you plan your next turn by finding your tiles on the board.
 *
 * Only `TileRack` writes it, and only with a tile from your own hand, so the
 * board can paint it without reading a hand of its own (it must not — see
 * `useBoardModel`). A module-level value rather than context because the rack
 * and the board sit in different branches of the game screen and nothing else
 * needs it.
 */
let current: TileId | null = null;
const listeners = new Set<() => void>();

export function setRackPreview(tile: TileId | null): void {
  if (tile === current) return;
  current = tile;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRackPreview(): TileId | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
