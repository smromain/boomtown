import type { EngineEvent } from '../events.js';
import { finalSettlement } from '../scoring.js';
import { activeSeat, type GameState } from '../state.js';
import { endConditionMet } from './endgame.js';
import { advanceTurn, drawToFull, sweepDeadTiles } from './turn.js';

/**
 * Close out the active seat's turn after the buy step: draw back to a full hand,
 * run the 2015 dead-tile sweep, then either end the game (this seat announced),
 * hold at `end-check` so the seat can still announce, or advance to the next seat.
 */
export function finishTurn(state: GameState, events: EngineEvent[]): void {
  drawToFull(state, events);
  sweepDeadTiles(state, events);

  if (state.endAnnouncedBy === activeSeat(state)) {
    endGame(state, events);
    return;
  }

  if (endConditionMet(state)) {
    state.step = 'end-check';
    return;
  }

  advanceTurn(state, events);
}

/** Resolve the game: final settlement, then stop (R9). */
export function endGame(state: GameState, events: EngineEvent[]): void {
  const result = finalSettlement(state);
  state.result = result;
  state.status = 'over';
  state.step = 'end-check';
  events.push({ type: 'game-over', result });
}
