import type { EngineEvent, Industry } from '@boomtown/engine';
import type { ClientView } from '@boomtown/client-core';

/** A corporation's name for the log — its derived display name, never the
 *  industry key. `baseName` is the fallback for a defunct chain whose display
 *  name has been folded away. */
function corp(view: ClientView | null | undefined, industry: Industry): string {
  const c = view?.corporations[industry];
  return c?.displayName || c?.baseName || industry;
}

/** A seat's name for the log, or "Seat N" before the first view. */
function who(view: ClientView | null | undefined, seat: number): string {
  return view?.seats[seat]?.name ?? `Seat ${seat}`;
}

/**
 * A short human line for the event log. Merger steps read as their own entries.
 * `view` supplies company and player names — without it the line falls back to
 * industry keys and "Seat N".
 */
export function describeEvent(event: EngineEvent, view?: ClientView | null): string {
  const p = (seat: number) => who(view, seat);
  const co = (industry: Industry) => corp(view, industry);

  switch (event.type) {
    case 'tile-placed':
      return `${p(event.seat)} placed ${event.tile} (${event.outcome})`;
    case 'corporation-founded':
      return `${co(event.industry)} founded at ${event.hqTile}${event.founderBonusPaid ? ' (+1 founder share)' : ''}`;
    case 'corporation-grew':
      return `${co(event.industry)} grew to ${event.newSize}`;
    case 'shares-bought': {
      const parts = Object.entries(event.picks).map(([industry, qty]) => `${qty} ${co(industry as Industry)}`);
      return parts.length
        ? `${p(event.seat)} bought ${parts.join(', ')} for $${event.cost}`
        : `${p(event.seat)} bought nothing`;
    }
    case 'tiles-drawn':
      return `${p(event.seat)} drew ${event.count} tile${event.count === 1 ? '' : 's'}`;
    case 'dead-tiles-swept':
      return `${p(event.seat)} swept ${event.tiles.join(', ')}`;
    case 'merger-started':
      return `Merger at ${event.placedTile}: ${event.corporations.map(co).join(' + ')}`;
    case 'survivor-chosen':
      return `${co(event.survivor)} survives the merger`;
    case 'defunct-order-set':
      return `Defunct order: ${event.order.map(co).join(' then ')}`;
    case 'bonus-paid': {
      const paid = event.payouts.map((x) => `${p(x.seat)} ${x.tier} $${x.amount}`).join(', ');
      return `${co(event.defunct)} bonuses — ${paid || 'none'}`;
    }
    case 'shares-disposed':
      return `${p(event.seat)} disposed ${co(event.defunct)}: hold ${event.hold}, sell ${event.sell}, trade ${event.trade}`;
    case 'corporation-defunct':
      return `${co(event.industry)} folded into ${co(event.absorbedInto)}`;
    case 'merger-completed':
      return `Merger complete — ${co(event.survivor)} carries on`;
    case 'turn-advanced':
      return `— ${p(event.seat)}'s turn —`;
    case 'end-announced':
      return `${p(event.seat)} announced the end`;
    case 'motion-raised':
      return `${p(event.seat)} moved to liquidate`;
    case 'register-published':
      return 'The share register is now public';
    case 'vote-cast':
      return `${p(event.seat)} voted ${event.inFavour ? 'for' : 'against'} (${event.weight} ${
        event.weight === 1 ? 'share' : 'shares'
      })`;
    case 'motion-carried':
      return `The motion carried, ${event.yes} of ${event.total}`;
    case 'motion-failed':
      return `The motion failed, ${event.yes} of ${event.total}`;
    case 'books-opened':
      return `${event.seats.map((s) => who(view, s)).join(' and ')} ${
        event.seats.length > 1 ? 'open their books' : 'opens their books'
      }`;
    case 'game-over':
      return `Game over — winner${event.result.winners.length > 1 ? 's' : ''} ${event.result.winners
        .map((s) => who(view, s))
        .join(', ')}`;
  }
}
