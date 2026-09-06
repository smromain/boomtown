import type { AnnounceEnd, EndTurn } from '../commands.js';
import { err } from '../errors.js';
import type { EngineEvent } from '../events.js';
import { activeSeat, type GameState } from '../state.js';
import { endConditionMet } from './endgame.js';
import { endGame } from './lifecycle.js';
import { advanceTurn } from './turn.js';
import { isPlayable } from './placement.js';
import type { ReduceResult } from './result.js';

export function applyAnnounceEnd(state: GameState, command: AnnounceEnd): ReduceResult {
  if (command.seat !== activeSeat(state)) return err('not-your-turn', 'only the active seat may announce');
  if (state.step !== 'end-check') return err('wrong-step', 'the end is announced at the end-check step');
  if (!endConditionMet(state)) return err('end-condition-not-met', 'no end condition holds');

  const events: EngineEvent[] = [{ type: 'end-announced', seat: command.seat }];
  state.endAnnouncedBy = command.seat;
  endGame(state, events);
  return { ok: true, state, events };
}

export function applyEndTurn(state: GameState, command: EndTurn): ReduceResult {
  if (command.seat !== activeSeat(state)) return err('not-your-turn', 'only the active seat may end the turn');

  if (state.step === 'end-check') {
    const events: EngineEvent[] = [];
    advanceTurn(state, events);
    return { ok: true, state, events };
  }

  if (state.step === 'place') {
    const hasPlayable = state.hands[command.seat]!.some((tile) => isPlayable(state, tile));
    if (hasPlayable) return err('wrong-step', 'placement is mandatory when a hand tile is playable');
    state.step = 'buy';
    return { ok: true, state, events: [] };
  }

  return err('wrong-step', 'cannot end the turn now');
}
