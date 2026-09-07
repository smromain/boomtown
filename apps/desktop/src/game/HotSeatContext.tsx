import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Seat } from '@boomtown/engine';
import { useGameState, useLocalSeats } from '../client/GameClientProvider.js';

interface HotSeat {
  /** The seat physically at the machine right now. Null before the first turn. */
  readonly holder: Seat | null;
  /** Hand the machine to a seat (they confirmed the interstitial). */
  readonly claim: (seat: Seat) => void;
  /** Whether `neededSeat` must be handed the machine before it acts — hot-seat
   *  with more than one local seat, and that seat isn't the current holder. */
  readonly needsHandoff: (neededSeat: Seat | null | undefined) => boolean;
}

const HotSeatContext = createContext<HotSeat | null>(null);

/**
 * Tracks who is physically at the machine in a hot-seat game — one source of
 * truth for every interstitial (`TurnHandoff` for turn boundaries and the
 * post-merger buy, `DecisionModal` for merger decisions). Two separate trackers
 * drifted: a merger would hand the machine to a disposer and never hand it back,
 * so the mergemaker's buy step was handled by whoever last disposed.
 */
export function HotSeatProvider({ children }: { children: ReactNode }) {
  const local = useLocalSeats();
  const multiSeat = local.length > 1;
  const activeSeat = useGameState((state) => state.activeSeat);

  const [holder, setHolder] = useState<Seat | null>(null);

  // seed from the first real active seat
  useEffect(() => {
    setHolder((prev) => (prev == null && activeSeat != null ? activeSeat : prev));
  }, [activeSeat]);

  const claim = useCallback((seat: Seat) => setHolder(seat), []);

  const needsHandoff = useCallback(
    (neededSeat: Seat | null | undefined) =>
      multiSeat && neededSeat != null && holder != null && neededSeat !== holder,
    [multiSeat, holder],
  );

  const value = useMemo<HotSeat>(() => ({ holder, claim, needsHandoff }), [holder, claim, needsHandoff]);
  return <HotSeatContext.Provider value={value}>{children}</HotSeatContext.Provider>;
}

/** Outside a provider (isolated panel tests) — no hot-seat, no hand-offs. */
const SOLO: HotSeat = { holder: null, claim: () => {}, needsHandoff: () => false };

export function useHotSeat(): HotSeat {
  return useContext(HotSeatContext) ?? SOLO;
}
