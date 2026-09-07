import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useStore } from 'zustand';
import {
  anyView,
  localActiveView,
  isLocalTurn,
  type ClientView,
  type GameClient,
  type GameClientState,
} from '@boomtown/client-core';
import type { Seat } from '@boomtown/engine';

interface GameContext {
  readonly client: GameClient;
  /** Seats the person at this screen plays: every human seat in hot-seat, the
   *  one own seat online. A turn that belongs to any other seat (a bot, or a
   *  remote player) is not shown as actionable. */
  readonly localSeats: readonly Seat[];
}

const GameClientContext = createContext<GameContext | null>(null);

export function GameClientProvider({
  client,
  localSeats,
  children,
}: {
  client: GameClient;
  localSeats: readonly Seat[];
  children: ReactNode;
}) {
  const value = useMemo(() => ({ client, localSeats }), [client, localSeats]);
  return <GameClientContext.Provider value={value}>{children}</GameClientContext.Provider>;
}

function useGameContext(): GameContext {
  const ctx = useContext(GameClientContext);
  if (!ctx) throw new Error('useGameClient must be used inside <GameClientProvider>');
  return ctx;
}

export function useGameClient(): GameClient {
  return useGameContext().client;
}

/** The seats a local player controls (see `GameClientProvider`). */
export function useLocalSeats(): readonly Seat[] {
  return useGameContext().localSeats;
}

/** Subscribe a component to a slice of client state. */
export function useGameState<T>(selector: (state: GameClientState) => T): T {
  return useStore(useGameClient().store, selector);
}

/**
 * The active seat's view **only when a local player controls that seat**, else
 * null — the gate every play surface (board, rack, action bar, modals) uses so
 * a bot's or a remote player's turn is never rendered as the local player's.
 */
export function useLocalActiveView(): ClientView | null {
  const local = useLocalSeats();
  return useGameState((state) => localActiveView(state, local));
}

/** Whether the seat on the clock is one a local player controls. */
export function useIsLocalTurn(): boolean {
  const local = useLocalSeats();
  return useGameState((state) => isLocalTurn(state, local));
}

/**
 * Any seat's view — for reading **public** state (the board, corporation names
 * and sizes, the result) regardless of whose turn it is. Merger prompts use
 * this: `DecisionModal` already gates whether the modal opens on the decision
 * being local, and a corporation's display name is public, so the prompt must
 * not depend on the *active* seat also being local (during a merger it often
 * is not — the seat disposing shares is not the mergemaker).
 */
export function useAnyView(): ClientView | null {
  return useGameState(anyView);
}
