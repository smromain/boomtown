import type { EngineEvent } from '@boomtown/engine';

/** A short human line for the event log. Merger steps read as their own entries. */
export function describeEvent(event: EngineEvent): string {
  switch (event.type) {
    case 'tile-placed':
      return `Seat ${event.seat} placed ${event.tile} (${event.outcome})`;
    case 'corporation-founded':
      return `${event.industry} founded at ${event.hqTile}${event.founderBonusPaid ? ' (+1 founder share)' : ''}`;
    case 'corporation-grew':
      return `${event.industry} grew to ${event.newSize}`;
    case 'shares-bought': {
      const parts = Object.entries(event.picks).map(([industry, qty]) => `${qty} ${industry}`);
      return parts.length ? `Seat ${event.seat} bought ${parts.join(', ')} for $${event.cost}` : `Seat ${event.seat} bought nothing`;
    }
    case 'tiles-drawn':
      return `Seat ${event.seat} drew ${event.count} tile${event.count === 1 ? '' : 's'}`;
    case 'dead-tiles-swept':
      return `Seat ${event.seat} swept ${event.tiles.join(', ')}`;
    case 'merger-started':
      return `Merger at ${event.placedTile}: ${event.corporations.join(' + ')}`;
    case 'survivor-chosen':
      return `${event.survivor} survives the merger`;
    case 'defunct-order-set':
      return `Defunct order: ${event.order.join(' then ')}`;
    case 'bonus-paid': {
      const paid = event.payouts.map((p) => `seat ${p.seat} ${p.tier} $${p.amount}`).join(', ');
      return `${event.defunct} bonuses — ${paid || 'none'}`;
    }
    case 'shares-disposed':
      return `Seat ${event.seat} disposed ${event.defunct}: hold ${event.hold}, sell ${event.sell}, trade ${event.trade}`;
    case 'corporation-defunct':
      return `${event.industry} folded into ${event.absorbedInto}`;
    case 'merger-completed':
      return `Merger complete — ${event.survivor} carries on`;
    case 'turn-advanced':
      return `— Seat ${event.seat}'s turn —`;
    case 'end-announced':
      return `Seat ${event.seat} announced the end`;
    case 'game-over':
      return `Game over — winner${event.result.winners.length > 1 ? 's' : ''} ${event.result.winners.join(', ')}`;
  }
}
