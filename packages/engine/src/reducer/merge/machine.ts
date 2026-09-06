import type { TileId } from '../../board.js';
import type { ChooseDefunctOrder, ChooseSurvivor, Command, DisposeShares } from '../../commands.js';
import { err } from '../../errors.js';
import type { EngineEvent } from '../../events.js';
import { sharePrice } from '../../pricing.js';
import { tierOf, type Industry } from '../../pool.js';
import { activeSeat, corpSize, type GameState, type Seat } from '../../state.js';
import type { ReduceResult } from '../result.js';
import { distributeBonuses, holdersOf, PHANTOM_SEAT } from './bonuses.js';

// --- entry --------------------------------------------------------------

/** Start a merger and drive it to the first pending decision (or completion). */
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
    absorbedTiles: [],
    resolvedOrder: [],
    pending: null,
  };
  events.push({ type: 'merger-started', placedTile, corporations: [...merging] });
  advanceMerger(state, events);
}

// --- the state machine -------------------------------------------------

function mergemaker(state: GameState): Seat {
  return activeSeat(state);
}

function clockwiseFromMergemaker(state: GameState): Seat[] {
  const n = state.turnOrder.length;
  const start = state.turnPointer;
  return Array.from({ length: n }, (_, i) => state.turnOrder[(start + i) % n]!);
}

function largest(state: GameState, options: readonly Industry[]): Industry[] {
  const max = Math.max(...options.map((i) => corpSize(state, i)));
  return options.filter((i) => corpSize(state, i) === max);
}

/** Pay bonuses for a defunct corporation and open its disposal queue. */
function beginDefunct(state: GameState, defunct: Industry, events: EngineEvent[]): void {
  const size = corpSize(state, defunct);
  const { holders } = holdersOf(state, defunct);
  const payouts = distributeBonuses(holders, size, defunct, state.ruleset);
  for (const payout of payouts) {
    if (payout.seat !== PHANTOM_SEAT) state.seats[payout.seat]!.cash += payout.amount;
  }
  events.push({ type: 'bonus-paid', defunct, payouts });
  state.merger!.disposal = { defunct, seatQueue: clockwiseFromMergemaker(state) };
}

/** Finish a defunct corporation: stash its tiles, return its headquarters, mark it defunct. */
function finalizeDefunct(state: GameState, defunct: Industry, events: EngineEvent[]): void {
  const merger = state.merger!;
  const corp = state.corporations[defunct];
  merger.absorbedTiles.push(...corp.tiles);
  merger.resolvedOrder.push(defunct);
  corp.founded = false;
  corp.hqTile = null;
  corp.tiles = [];
  corp.eaten = [];
  state.merger!.defunctQueue = state.merger!.defunctQueue.filter((i) => i !== defunct);
  state.merger!.disposal = null;
  events.push({ type: 'corporation-defunct', industry: defunct, absorbedInto: state.merger!.survivor! });
}

/** The survivor absorbs the placed tile, the connected blank tiles, and every defunct tile. */
function completeMerger(state: GameState, events: EngineEvent[]): void {
  const merger = state.merger!;
  const survivor = merger.survivor!;
  const corp = state.corporations[survivor];

  const incoming = [merger.placedTile, ...merger.group, ...merger.absorbedTiles];
  const seen = new Set(corp.tiles);
  for (const tile of incoming) {
    state.cells[tile] = { kind: 'corporation', industry: survivor };
    if (!seen.has(tile)) {
      corp.tiles.push(tile);
      seen.add(tile);
    }
  }
  corp.eaten.push(...merger.resolvedOrder);

  state.merger = null;
  state.step = 'buy';
  events.push({ type: 'merger-completed', survivor });
}

/** Drive automatic transitions until a pending decision or completion. */
function advanceMerger(state: GameState, events: EngineEvent[]): void {
  for (;;) {
    const merger = state.merger!;

    if (merger.survivor === null) {
      const tiedLargest = largest(state, merger.merging);
      if (tiedLargest.length > 1) {
        merger.pending = { type: 'choose-survivor', seat: mergemaker(state), options: tiedLargest };
        return;
      }
      merger.survivor = tiedLargest[0]!;
      merger.defunctQueue = merger.merging.filter((i) => i !== merger.survivor);
      events.push({ type: 'survivor-chosen', survivor: merger.survivor });
      continue;
    }

    if (merger.disposal === null && merger.defunctQueue.length > 0) {
      const tiedLargest = largest(state, merger.defunctQueue);
      if (tiedLargest.length > 1) {
        merger.pending = { type: 'choose-defunct-order', seat: mergemaker(state), options: tiedLargest };
        return;
      }
      beginDefunct(state, tiedLargest[0]!, events);
      continue;
    }

    if (merger.disposal !== null) {
      const disposal = merger.disposal;
      while (
        disposal.seatQueue.length > 0 &&
        state.seats[disposal.seatQueue[0]!]!.holdings[disposal.defunct] === 0
      ) {
        disposal.seatQueue.shift();
      }
      if (disposal.seatQueue.length > 0) {
        const seat = disposal.seatQueue[0]!;
        merger.pending = {
          type: 'dispose-shares',
          seat,
          defunct: disposal.defunct,
          survivor: merger.survivor,
          shares: state.seats[seat]!.holdings[disposal.defunct],
        };
        return;
      }
      finalizeDefunct(state, disposal.defunct, events);
      continue;
    }

    completeMerger(state, events);
    return;
  }
}

// --- command handlers -------------------------------------------------

export function resolveMergerCommand(state: GameState, command: Command): ReduceResult {
  if (state.step !== 'merge' || !state.merger) {
    return err('wrong-step', 'no merger is in progress');
  }
  switch (command.type) {
    case 'choose-survivor':
      return applyChooseSurvivor(state, command);
    case 'choose-defunct-order':
      return applyChooseDefunctOrder(state, command);
    case 'dispose-shares':
      return applyDisposeShares(state, command);
    default:
      return err('wrong-step', 'not a merger command');
  }
}

function applyChooseSurvivor(state: GameState, command: ChooseSurvivor): ReduceResult {
  const merger = state.merger!;
  const pending = merger.pending;
  if (pending?.type !== 'choose-survivor') return err('wrong-step', 'no survivor choice is pending');
  if (command.seat !== pending.seat) return err('not-your-turn', 'the mergemaker chooses the survivor');
  if (!pending.options.includes(command.survivor)) {
    return err('invalid-survivor', `${command.survivor} is not tied for largest`);
  }
  const events: EngineEvent[] = [];
  merger.survivor = command.survivor;
  merger.defunctQueue = merger.merging.filter((i) => i !== command.survivor);
  merger.pending = null;
  events.push({ type: 'survivor-chosen', survivor: command.survivor });
  advanceMerger(state, events);
  return { ok: true, state, events };
}

function applyChooseDefunctOrder(state: GameState, command: ChooseDefunctOrder): ReduceResult {
  const merger = state.merger!;
  const pending = merger.pending;
  if (pending?.type !== 'choose-defunct-order') return err('wrong-step', 'no defunct-order choice is pending');
  if (command.seat !== pending.seat) return err('not-your-turn', 'the mergemaker orders the defunct chains');
  if (!pending.options.includes(command.next)) {
    return err('invalid-defunct-choice', `${command.next} is not among the tied chains`);
  }
  const events: EngineEvent[] = [];
  merger.pending = null;
  beginDefunct(state, command.next, events);
  advanceMerger(state, events);
  return { ok: true, state, events };
}

function applyDisposeShares(state: GameState, command: DisposeShares): ReduceResult {
  const merger = state.merger!;
  const pending = merger.pending;
  if (pending?.type !== 'dispose-shares') return err('wrong-step', 'no share disposal is pending');
  if (command.seat !== pending.seat) return err('not-your-turn', `it is seat ${pending.seat}'s disposal`);

  const { hold, sell, trade } = command;
  if (hold < 0 || sell < 0 || trade < 0) return err('negative-quantity', 'quantities cannot be negative');
  if (hold + sell + trade !== pending.shares) {
    return err('disposal-mismatch', `must account for all ${pending.shares} shares`);
  }
  if (trade % 2 !== 0) return err('trade-not-even', 'trades are two defunct shares for one survivor share');

  const defunct = pending.defunct;
  const survivor = merger.survivor!;
  const traded = trade / 2;
  if (traded > state.bankShares[survivor]) {
    return err('trade-exceeds-bank', `only ${state.bankShares[survivor]} ${survivor} shares remain`);
  }

  const events: EngineEvent[] = [];
  const seat = state.seats[command.seat]!;
  const price = sharePrice(corpSize(state, defunct), tierOf(defunct), state.ruleset) ?? 0;

  seat.holdings[defunct] -= sell + trade;
  state.bankShares[defunct] += sell + trade;
  const proceeds = sell * price;
  seat.cash += proceeds;
  seat.holdings[survivor] += traded;
  state.bankShares[survivor] -= traded;

  merger.pending = null;
  events.push({
    type: 'shares-disposed',
    seat: command.seat,
    defunct,
    hold,
    sell,
    trade,
    proceeds,
  });
  merger.disposal!.seatQueue.shift();
  advanceMerger(state, events);
  return { ok: true, state, events };
}
