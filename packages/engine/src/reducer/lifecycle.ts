import type { EngineEvent } from '../events.js';
import { finalSettlement } from '../scoring.js';
import type { GameState } from '../state.js';
import { endConditionMet } from './endgame.js';
import { advanceTurn, drawToFull, sweepDeadTiles } from './turn.js';

/**
 * Close out the active seat's turn after the buy step: draw back to a full hand,
 * run the 2015 dead-tile sweep, then hold at `end-check` when an end condition
 * holds (so the seat can announce or decline) or advance to the next seat.
 *
 * A seat that announces does so from `end-check`, which is already the end of its
 * turn, so `applyAnnounceEnd` ends the game directly — `finishTurn` never runs
 * again after an announcement.
 */
export function finishTurn(state: GameState, events: EngineEvent[]): void {
  drawToFull(state, events);
  sweepDeadTiles(state, events);

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
