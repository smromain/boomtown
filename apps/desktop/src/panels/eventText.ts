import type { EngineEvent, Industry } from '@boomtown/engine';
import type { ClientView } from '@boomtown/client-core';
import { copy, fill } from '../copy/copy.js';

const L = copy.log;

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
      return fill(L.tilePlaced, { name: p(event.seat), tile: event.tile, outcome: event.outcome });
    case 'corporation-founded':
      return fill(event.founderBonusPaid ? L.foundedWithBonus : L.founded, {
        corp: co(event.industry),
        tile: event.hqTile,
      });
    case 'corporation-grew':
      return fill(L.grew, { corp: co(event.industry), size: event.newSize });
    case 'shares-bought': {
      const parts = Object.entries(event.picks).map(([industry, qty]) =>
        fill(L.pick, { n: qty, corp: co(industry as Industry) }),
      );
      return parts.length
        ? fill(L.bought, { name: p(event.seat), picks: parts.join(', '), cost: event.cost })
        : fill(L.boughtNothing, { name: p(event.seat) });
    }
    case 'tiles-drawn':
      return fill(event.count === 1 ? L.drewOne : L.drewMany, {
        name: p(event.seat),
        n: event.count,
      });
    case 'dead-tiles-swept':
      return fill(L.swept, { name: p(event.seat), tiles: event.tiles.join(', ') });
    case 'merger-started':
      return fill(L.mergerStarted, {
        tile: event.placedTile,
        corps: event.corporations.map(co).join(' + '),
      });
    case 'survivor-chosen':
      return fill(L.survivorChosen, { corp: co(event.survivor) });
    case 'defunct-order-set':
      return fill(L.defunctOrder, { corps: event.order.map(co).join(L.defunctOrderJoin) });
    case 'bonus-paid': {
      const paid = event.payouts
        .map((x) => fill(L.bonusLine, { name: p(x.seat), tier: x.tier, amount: x.amount }))
        .join(', ');
      return fill(L.bonuses, { corp: co(event.defunct), paid: paid || L.bonusesNone });
    }
    case 'shares-disposed':
      return fill(L.disposed, {
        name: p(event.seat),
        corp: co(event.defunct),
        hold: event.hold,
        sell: event.sell,
        trade: event.trade,
      });
    case 'corporation-defunct':
      return fill(L.folded, { corp: co(event.industry), survivor: co(event.absorbedInto) });
    case 'merger-completed':
      return fill(L.mergerComplete, { corp: co(event.survivor) });
    case 'turn-advanced':
      return fill(L.turn, { name: p(event.seat) });
    case 'end-announced':
      return fill(L.endAnnounced, { name: p(event.seat) });
    case 'motion-raised':
      return fill(L.motionRaised, { name: p(event.seat) });
    case 'register-published':
      return L.registerPublished;
    case 'vote-cast':
      return fill(event.weight === 1 ? L.voteOne : L.voteMany, {
        name: p(event.seat),
        side: event.inFavour ? L.voteFor : L.voteAgainst,
        n: event.weight,
      });
    case 'motion-carried':
      return fill(L.motionCarried, { yes: event.yes, total: event.total });
    case 'motion-failed':
      return fill(L.motionFailed, { yes: event.yes, total: event.total });
    case 'books-opened':
      return fill(event.seats.length > 1 ? L.booksOpenedMany : L.booksOpenedOne, {
        names: event.seats.map((s) => who(view, s)).join(' and '),
      });
    case 'game-over':
      return fill(event.result.winners.length > 1 ? L.gameOverMany : L.gameOverOne, {
        names: event.result.winners.map((s) => who(view, s)).join(', '),
      });
  }
}
