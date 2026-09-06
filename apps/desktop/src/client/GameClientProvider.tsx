import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { GameClient, GameClientState } from '@boomtown/client-core';

const GameClientContext = createContext<GameClient | null>(null);

export function GameClientProvider({ client, children }: { client: GameClient; children: ReactNode }) {
  return <GameClientContext.Provider value={client}>{children}</GameClientContext.Provider>;
}

export function useGameClient(): GameClient {
  const client = useContext(GameClientContext);
  if (!client) throw new Error('useGameClient must be used inside <GameClientProvider>');
  return client;
}

/** Subscribe a component to a slice of client state. */
export function useGameState<T>(selector: (state: GameClientState) => T): T {
  return useStore(useGameClient().store, selector);
}
