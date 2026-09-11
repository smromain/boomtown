import { useMemo } from 'react';
import type { ClientView } from '@boomtown/client-core';
import { INDUSTRIES, type Industry } from '@boomtown/engine';
import { useGameState, useLocalSeats } from './GameClientProvider.js';
import { useHotSeat } from '../game/HotSeatContext.js';

const NO_HOLDINGS = Object.fromEntries(INDUSTRIES.map((i) => [i, 0])) as Record<Industry, number>;

/**
 * The same view with every private field stripped — what a spectator is
 * entitled to.
 *
 * Seats already playing with open books keep theirs: that disclosure is a rule
 * of the game (a failed motion), not a privilege of sitting at this screen.
 */
function publicOnly(view: ClientView): ClientView {
  return {
    ...view,
    seats: view.seats.map((seat, index) =>
      view.openBooks.includes(index) ? seat : { ...seat, cash: null, holdings: null },
    ),
    yourHand: [],
    yourHoldings: NO_HOLDINGS,
    yourCash: 0,
    handTiles: [],
    legalMoves: [],
  };
}

/**
 * The view this screen may read **private** state from — cash, holdings, hand.
 *
 * `activeView` answers a different question: it is the seat on the clock,
 * whoever that is. A hot-seat client holds a view for *every* seat, bots
 * included, so a panel reading `activeView` renders whichever bot is playing
 * its own books — and over one turn cycle that discloses the entire table. At
 * an all-bot Boomtown table that is not a cosmetic slip: closed books are the
 * mechanic, and the watcher was being shown all of it.
 *
 * Entitlement comes from the seats this screen actually controls, never from
 * the clock:
 *
 * - the seat on the clock, when it is one of ours — hot-seat's normal case
 * - else whoever last took the machine (`useHotSeat`), while a bot or a remote
 *   player is thinking, so the panel does not blank out mid-turn
 * - else our first seat, which online is the only one
 * - else nothing is ours, and only public state renders
 */
export function useOwnView(): ClientView | null {
  const local = useLocalSeats();
  const { holder } = useHotSeat();

  const own = useGameState((state) => {
    const mine = new Set(local);
    const seat =
      state.activeSeat != null && mine.has(state.activeSeat)
        ? state.activeSeat
        : holder != null && mine.has(holder)
          ? holder
          : local[0];
    return seat == null ? null : (state.views[seat] ?? null);
  });

  // Any view at all, for the spectator fallback. Selected raw and stripped
  // below rather than inside the selector: a selector that builds a new object
  // every call never compares equal, so the store re-renders on every render —
  // "Maximum update depth exceeded", which is exactly what the first version
  // of this hook did.
  const some = useGameState((state) => {
    for (const key in state.views) return state.views[key] ?? null;
    return null;
  });

  return useMemo(() => own ?? (some ? publicOnly(some) : null), [own, some]);
}
