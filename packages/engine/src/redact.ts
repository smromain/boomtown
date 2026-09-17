import type { EngineEvent } from './events.js';
import type { GameState, Seat } from './state.js';

/**
 * Whether `reader` is entitled to the amounts in `actor`'s purchases and
 * disposals. The rule deliberately mirrors `viewFor`'s books test rather than
 * inventing a second one: your own books are always bare, so are everyone's at
 * an open table, and so are a seat's permanently once a failed motion opened
 * them.
 *
 * `reader` is `null` for the public view — the log as it would be read by
 * somebody with no seat, which is what a shared screen gets (see
 * `localTransport`).
 */
export function seesPurchaseDetail(state: GameState, actor: Seat, reader: Seat | null): boolean {
  if (state.ruleset.publicPurchaseDetail) return true;
  if (reader !== null && actor === reader) return true;
  if (state.visibility === 'open') return true;
  return state.openBooks.includes(actor);
}

/**
 * The events of one update as `reader` is entitled to see them (#60).
 *
 * This runs at the **transport**, not in the renderer: a UI that merely
 * declined to print the numbers would leave them on the wire, one devtools
 * panel away. `viewFor` is the only way state reaches a client (`CLAUDE.md`,
 * *Hidden information is real*) and the event stream went around it; this is
 * the clause that closes it. Both the room and the local transport call it, so
 * hot-seat and online behave alike.
 *
 * Under a ruleset with `publicPurchaseDetail` the array is returned untouched,
 * identity and all — both published editions log exactly what they always did.
 */
export function redactEventsFor(
  state: GameState,
  events: readonly EngineEvent[],
  reader: Seat | null,
): readonly EngineEvent[] {
  if (state.ruleset.publicPurchaseDetail) return events;
  if (!events.some((event) => event.type === 'shares-bought' || event.type === 'shares-disposed')) {
    return events;
  }
  return events.map((event) => {
    switch (event.type) {
      case 'shares-bought':
        if (seesPurchaseDetail(state, event.seat, reader)) return event;
        return {
          ...event,
          // The keys survive, the values do not: "bought into Concordia Books",
          // never "3 Concordia Books".
          picks: Object.fromEntries(Object.keys(event.picks).map((industry) => [industry, null])),
          cost: null,
        };
      case 'shares-disposed':
        if (seesPurchaseDetail(state, event.seat, reader)) return event;
        return { ...event, hold: null, sell: null, trade: null, proceeds: null };
      default:
        return event;
    }
  });
}
