import type { EngineEvent } from '../events.js';
import { finalSettlement } from '../scoring.js';
import type { GameState } from '../state.js';
import { endConditionMet } from './endgame.js';
import { motionAvailable } from './motion.js';
import { advanceTurn, drawToFull, sweepDeadTiles } from './turn.js';

/**
 * Close out the active seat's turn after the buy step: draw back to a full hand,
 * run the 2015 dead-tile sweep, then hold at `end-check` when the seat has an
 * ending available — an end condition to announce, or a motion to liquidate
 * (#26) — or advance to the next seat.
 *
 * A seat that announces does so from `end-check`, which is already the end of its
 * turn, so `applyAnnounceEnd` ends the game directly — `finishTurn` never runs
 * again after an announcement.
 */
export function finishTurn(state: GameState, events: EngineEvent[]): void {
  drawToFull(state, events);
  sweepDeadTiles(state, events);

  // Hold at `end-check` when the seat has an ending available — either the
  // normal announcement, or a motion to liquidate under a ruleset that has one.
  // Without the second case the motion could never be reached: the step only
  // existed when the game could already be ended, which is precisely when a
  // motion is moot.
  if (endConditionMet(state) || motionAvailable(state)) {
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
