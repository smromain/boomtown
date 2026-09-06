import { RULES } from '../constants.js';
import { err } from '../errors.js';
import type { EngineEvent } from '../events.js';
import { INDUSTRIES } from '../pool.js';
import { activeSeat, type GameState } from '../state.js';
import type { FoundCorporation } from '../commands.js';
import type { ReduceResult } from './result.js';

export function applyFoundCorporation(state: GameState, command: FoundCorporation): ReduceResult {
  if (command.seat !== activeSeat(state)) return err('not-your-turn', 'only the active seat may found');
  if (state.step !== 'found' || !state.pendingFound) {
    return err('wrong-step', 'no corporation is waiting to be founded');
  }
  if (!INDUSTRIES.includes(command.industry)) {
    return err('unknown-industry', `no such industry: ${command.industry}`);
  }
  if (state.corporations[command.industry].founded) {
    return err('industry-already-founded', `${command.industry} is already on the board`);
  }
  const group = state.pendingFound.group;
  if (!group.includes(command.hqTile)) {
    return err('hq-tile-not-in-group', 'the headquarters must sit on a tile of the new group');
  }

  const events: EngineEvent[] = [];
  const corp = state.corporations[command.industry];
  corp.founded = true;
  corp.hqTile = command.hqTile;
  corp.tiles = [...group];
  for (const tile of group) {
    state.cells[tile] = { kind: 'corporation', industry: command.industry };
  }

  let founderBonusPaid = false;
  if (state.bankShares[command.industry] >= RULES.founderBonusShares) {
    state.bankShares[command.industry] -= RULES.founderBonusShares;
    state.seats[command.seat]!.holdings[command.industry] += RULES.founderBonusShares;
    founderBonusPaid = true;
  }

  events.push({
    type: 'corporation-founded',
    industry: command.industry,
    hqTile: command.hqTile,
    tiles: [...group],
    founderBonusPaid,
  });

  state.pendingFound = null;
  state.step = 'buy';
  return { ok: true, state, events };
}
