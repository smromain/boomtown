import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  createGame,
  redactEventsFor,
  seesPurchaseDetail,
  type EngineEvent,
  type GameState,
} from '@boomtown/engine';

const seats = [{ name: 'Ana' }, { name: 'Bo' }, { name: 'Cy' }];

/** A table, by ruleset, with `visibility` honoured where the ruleset allows it. */
function table(ruleset: 'classic' | 'boomtown', visibility: 'open' | 'hidden' = 'hidden'): GameState {
  return createGame({ seats, seed: 7, ruleset: PRESETS[ruleset], visibility });
}

const BOUGHT: EngineEvent = { type: 'shares-bought', seat: 1, picks: { books: 3, air: 1 }, cost: 4200 };
const DISPOSED: EngineEvent = {
  type: 'shares-disposed',
  seat: 1,
  defunct: 'books',
  hold: 2,
  sell: 4,
  trade: 6,
  proceeds: 1600,
};
/** Nothing here names an amount anybody is entitled to hide. */
const NEUTRAL: EngineEvent[] = [
  { type: 'tile-placed', seat: 1, tile: '5E', outcome: 'grow' },
  { type: 'turn-advanced', seat: 2 },
];

function bought(events: readonly EngineEvent[]) {
  return events.find((e) => e.type === 'shares-bought') as Extract<EngineEvent, { type: 'shares-bought' }>;
}
function disposed(events: readonly EngineEvent[]) {
  return events.find((e) => e.type === 'shares-disposed') as Extract<EngineEvent, { type: 'shares-disposed' }>;
}

describe('redactEventsFor (the closed-books log, #60)', () => {
  it('leaves a published edition alone, array identity and all', () => {
    const state = table('classic');
    const events = [BOUGHT, DISPOSED];
    // Identity, not just equality: classic logs exactly what it always logged,
    // and the redactor is not even allowed to rebuild the array.
    expect(redactEventsFor(state, events, 0)).toBe(events);
    expect(redactEventsFor(state, events, null)).toBe(events);
  });

  it('strips quantities and cost from another seat at a Boomtown table', () => {
    const out = redactEventsFor(table('boomtown'), [BOUGHT], 0);
    expect(bought(out).cost).toBeNull();
    // The corporations are still named — that is the whole point of the rule.
    expect(Object.keys(bought(out).picks).sort()).toEqual(['air', 'books']);
    expect(Object.values(bought(out).picks)).toEqual([null, null]);
  });

  it('never redacts a seat from itself', () => {
    const out = redactEventsFor(table('boomtown'), [BOUGHT], 1);
    expect(out[0]).toBe(BOUGHT);
  });

  it('redacts for the public view, where no seat is the reader', () => {
    // Hot-seat: one log, several people, nobody is "you".
    expect(bought(redactEventsFor(table('boomtown'), [BOUGHT], null)).cost).toBeNull();
  });

  it('strips a disposal the same way — it states a defunct holding outright', () => {
    const out = disposed(redactEventsFor(table('boomtown'), [DISPOSED], 0));
    expect([out.hold, out.sell, out.trade, out.proceeds]).toEqual([null, null, null, null]);
    expect(out.defunct).toBe('books'); // still says which chain was settled
  });

  it('leaves every other event untouched', () => {
    const out = redactEventsFor(table('boomtown'), [...NEUTRAL, BOUGHT], 0);
    expect(out.slice(0, 2)).toEqual(NEUTRAL);
  });

  it('shows everything once a seat is in openBooks', () => {
    // A seat that backed a failed motion is as visible as at an open table,
    // and the log follows `viewFor`'s rule rather than inventing a second one.
    const state: GameState = { ...table('boomtown'), openBooks: [1] };
    expect(redactEventsFor(state, [BOUGHT], 0)[0]).toBe(BOUGHT);
  });

  it('shows everything at an open table', () => {
    const state: GameState = { ...table('boomtown'), visibility: 'open' };
    expect(redactEventsFor(state, [BOUGHT], 0)[0]).toBe(BOUGHT);
  });

  it('agrees with seesPurchaseDetail on every case', () => {
    const state: GameState = { ...table('boomtown'), openBooks: [2] };
    expect(seesPurchaseDetail(state, 1, 0)).toBe(false);
    expect(seesPurchaseDetail(state, 1, 1)).toBe(true);
    expect(seesPurchaseDetail(state, 2, 0)).toBe(true); // open books
    expect(seesPurchaseDetail(state, 1, null)).toBe(false);
    expect(seesPurchaseDetail(table('classic'), 1, 0)).toBe(true);
  });

  it('cost cannot be re-derived: no amount survives anywhere in the frame', () => {
    // cost ÷ the public share price is the quantity, so suppressing the picks
    // and keeping the cost would achieve nothing. Neither number may remain.
    const out = redactEventsFor(table('boomtown'), [BOUGHT, DISPOSED], 0);
    // `seat` is a public fact and the only number the frame is allowed to keep;
    // with it removed, nothing numeric may be left anywhere in the JSON.
    const frame = JSON.stringify(out.map((event) => ({ ...event, seat: undefined })));
    expect(frame).not.toMatch(/\d/);
  });
});
