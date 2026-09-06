import { err } from '../../errors.js';
import type { EngineEvent } from '../../events.js';
import type { Industry } from '../../pool.js';
import type { TileId } from '../../board.js';
import type { GameState } from '../../state.js';
import type { Command } from '../../commands.js';
import type { ReduceResult } from '../result.js';

/**
 * Start a merger: park the game at `step: 'merge'` with a snapshot of the
 * corporations involved. Resolution (survivor, defunct order, bonuses,
 * disposal) is built in U5 and replaces the body below `merger-started`.
 */
export function beginMerger(
  state: GameState,
  placedTile: TileId,
  merging: readonly Industry[],
  group: readonly TileId[],
  events: EngineEvent[],
): void {
  state.step = 'merge';
  state.merger = {
    placedTile,
    merging: [...merging],
    group: [...group],
    survivor: null,
    defunctQueue: [],
    disposal: null,
    pending: null,
  };
  events.push({ type: 'merger-started', placedTile, corporations: [...merging] });
}

/** Resolve a merger command. Implemented in U5. */
export function resolveMergerCommand(_state: GameState, _command: Command): ReduceResult {
  return err('wrong-step', 'merger resolution is implemented in U5');
}
