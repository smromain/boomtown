import type { EngineEvent } from '../events.js';
import type { GameState } from '../state.js';
import { advanceTurn, drawToFull, sweepDeadTiles } from './turn.js';

/**
 * Close out the active seat's turn after the buy step: draw back to a full hand,
 * run the 2015 dead-tile sweep, then advance to the next seat.
 *
 * U6 extends this with the optional end announcement and final settlement.
 */
export function finishTurn(state: GameState, events: EngineEvent[]): void {
  drawToFull(state, events);
  sweepDeadTiles(state, events);
  advanceTurn(state, events);
}
