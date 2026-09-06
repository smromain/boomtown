import type { BuyShares } from '../commands.js';
import { RULES } from '../constants.js';
import { err } from '../errors.js';
import type { EngineEvent } from '../events.js';
import { INDUSTRIES, type Industry } from '../pool.js';
import { activeSeat, isFounded, sharePriceOf, type GameState } from '../state.js';
import { finishTurn } from './lifecycle.js';
import type { ReduceResult } from './result.js';

export function applyBuyShares(state: GameState, command: BuyShares): ReduceResult {
  if (command.seat !== activeSeat(state)) return err('not-your-turn', 'only the active seat may buy');
  if (state.step !== 'buy') return err('wrong-step', 'not the buy step');

  const picks = command.picks;
  let total = 0;
  let cost = 0;

  for (const industry of INDUSTRIES) {
    const qty = picks[industry] ?? 0;
    if (qty === 0) continue;
    if (qty < 0 || !Number.isInteger(qty)) return err('negative-quantity', `bad quantity for ${industry}`);
    if (!isFounded(state, industry)) return err('corporation-not-active', `${industry} is not on the board`);
    if (qty > state.bankShares[industry]) {
      return err('not-enough-bank-stock', `only ${state.bankShares[industry]} ${industry} shares left`);
    }
    total += qty;
    cost += qty * sharePriceOf(state, industry)!;
  }

  if (total > RULES.maxStockPurchasesPerTurn) {
    return err('too-many-shares', `at most ${RULES.maxStockPurchasesPerTurn} shares per turn`);
  }
  if (cost > state.seats[command.seat]!.cash) {
    return err('not-enough-cash', `costs ${cost}, you have ${state.seats[command.seat]!.cash}`);
  }

  const events: EngineEvent[] = [];
  const cleanPicks: Partial<Record<Industry, number>> = {};
  for (const industry of INDUSTRIES) {
    const qty = picks[industry] ?? 0;
    if (qty === 0) continue;
    state.bankShares[industry] -= qty;
    state.seats[command.seat]!.holdings[industry] += qty;
    cleanPicks[industry] = qty;
  }
  state.seats[command.seat]!.cash -= cost;
  events.push({ type: 'shares-bought', seat: command.seat, picks: cleanPicks, cost });

  finishTurn(state, events);
  return { ok: true, state, events };
}
