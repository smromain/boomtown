import type { PlaceTile } from '../commands.js';
import { err } from '../errors.js';
import type { EngineEvent } from '../events.js';
import { activeSeat, type GameState } from '../state.js';
import { beginMerger } from './merge/machine.js';
import { classifyPlacement } from './placement.js';
import type { ReduceResult } from './result.js';

export function applyPlaceTile(state: GameState, command: PlaceTile): ReduceResult {
  if (command.seat !== activeSeat(state)) return err('not-your-turn', 'only the active seat may place');
  if (state.step !== 'place') return err('wrong-step', 'not the placement step');

  const hand = state.hands[command.seat]!;
  const handIndex = hand.indexOf(command.tile);
  if (handIndex === -1) return err('tile-not-in-hand', `${command.tile} is not in hand`);
  if (state.cells[command.tile]) return err('cell-occupied', `${command.tile} is already on the board`);

  const outcome = classifyPlacement(state, command.tile);
  const events: EngineEvent[] = [];

  switch (outcome.kind) {
    case 'dead':
      return err('tile-permanently-dead', outcome.reason);
    case 'found-blocked':
      return err('founding-blocked-all-corporations-active', 'all seven corporations are on the board');

    case 'nothing': {
      hand.splice(handIndex, 1);
      state.cells[command.tile] = { kind: 'unincorporated' };
      events.push({ type: 'tile-placed', seat: command.seat, tile: command.tile, outcome: 'nothing' });
      state.step = 'buy';
      return { ok: true, state, events };
    }

    case 'found': {
      hand.splice(handIndex, 1);
      state.cells[command.tile] = { kind: 'unincorporated' };
      events.push({ type: 'tile-placed', seat: command.seat, tile: command.tile, outcome: 'found' });
      state.step = 'found';
      state.pendingFound = { group: outcome.group };
      return { ok: true, state, events };
    }

    case 'grow': {
      hand.splice(handIndex, 1);
      const corp = state.corporations[outcome.industry];
      const before = new Set(corp.tiles);
      for (const tile of outcome.absorbs) {
        state.cells[tile] = { kind: 'corporation', industry: outcome.industry };
        if (!before.has(tile)) corp.tiles.push(tile);
      }
      events.push({ type: 'tile-placed', seat: command.seat, tile: command.tile, outcome: 'grow' });
      events.push({
        type: 'corporation-grew',
        industry: outcome.industry,
        added: outcome.absorbs.filter((t) => !before.has(t)),
        newSize: corp.tiles.length,
      });
      state.step = 'buy';
      return { ok: true, state, events };
    }

    case 'merge': {
      hand.splice(handIndex, 1);
      state.cells[command.tile] = { kind: 'unincorporated' };
      events.push({ type: 'tile-placed', seat: command.seat, tile: command.tile, outcome: 'merge' });
      beginMerger(state, command.tile, outcome.corporations, outcome.group, events);
      return { ok: true, state, events };
    }
  }
}
