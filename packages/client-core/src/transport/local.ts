import type { Command, GameState, Seat, SetupOptions } from '@boomtown/engine';
import { GameSession, type SessionResult } from '../session.js';
import type { ClientView } from '../view.js';
import type { GameTransport, TransportMessage } from './types.js';

/** The slice of `GameSession` a transport needs — injectable so tests can supply a fake. */
export interface LocalEngine {
  apply(command: Command): SessionResult;
  viewsFor(seats: readonly Seat[]): Record<Seat, ClientView>;
  /** The authoritative state — the bot driver reads it to choose moves. */
  snapshot(): GameState;
}

export interface LocalTransportOptions {
  readonly setup: SetupOptions;
  /** Seats this client controls. Hot-seat passes every seat. */
  readonly controls: readonly Seat[];
  /** Override the engine backend (the Web Worker uses this seam; default is in-process). */
  readonly engine?: LocalEngine;
}

/**
 * Runs the engine in-process. Updates arrive on a microtask, never synchronously,
 * so the store's optimistic echo is a real observable state — the same shape the
 * Web Worker (`workerTransport`) and the socket (U18) produce.
 */
export function localTransport({ setup, controls, engine }: LocalTransportOptions): GameTransport {
  const backend: LocalEngine = engine ?? new GameSession(setup);
  const seats = [...controls];
  const handlers = new Set<(message: TransportMessage) => void>();

  const deliver = (message: TransportMessage): Promise<void> =>
    new Promise((resolve) => {
      queueMicrotask(() => {
        for (const handler of handlers) handler(message);
        resolve();
      });
    });

  return {
    connect: () => deliver({ events: [], views: backend.viewsFor(seats) }),
    disconnect: () => handlers.clear(),
    send: (command: Command) => {
      const result = backend.apply(command);
      void deliver(
        result.ok
          ? { events: result.events, views: backend.viewsFor(seats) }
          : { events: [], views: backend.viewsFor(seats), rejection: { command, error: result.error } },
      );
    },
    onMessage: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}
