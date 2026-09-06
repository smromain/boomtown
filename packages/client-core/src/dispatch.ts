import type { Command } from '@boomtown/engine';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { reconcile } from './reconcile.js';
import { initialClientState, type GameClientState } from './store.js';
import type { GameTransport } from './transport/types.js';

export interface GameClient {
  /** A vanilla Zustand store — `useStore(client.store, selector)` binds it to React. */
  readonly store: StoreApi<GameClientState>;
  /** Send a command; sets the optimistic echo, then reconciles on the authoritative reply. */
  dispatch(command: Command): void;
  connect(): Promise<void>;
  disconnect(): void;
}

/** Bind a transport to a store. Identical for local and networked play (KTD5). */
export function createGameClient(transport: GameTransport): GameClient {
  const store = createStore<GameClientState>(() => initialClientState());

  const unsubscribe = transport.onMessage((message) => {
    store.setState((current) => reconcile(current, message));
  });

  return {
    store,
    dispatch(command) {
      store.setState((current) => ({ ...current, inFlight: command, lastError: null }));
      transport.send(command);
    },
    connect: () => transport.connect(),
    disconnect() {
      unsubscribe();
      transport.disconnect();
    },
  };
}
