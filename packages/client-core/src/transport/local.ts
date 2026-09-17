import {
  redactEventsFor,
  type Command,
  type EngineEvent,
  type GameState,
  type Retrospective,
  type Seat,
  type SetupOptions,
} from '@boomtown/engine';
import { GameSession, type SessionResult } from '../session.js';
import type { ClientView } from '../view.js';
import type { GameTransport, TransportMessage } from './types.js';

/** The slice of `GameSession` a transport needs — injectable so tests can supply a fake. */
export interface LocalEngine {
  apply(command: Command): SessionResult;
  viewsFor(seats: readonly Seat[]): Record<Seat, ClientView>;
  /** The authoritative state — the bot driver reads it to choose moves. */
  snapshot(): GameState;
  /** The end-of-game record, once there is one. */
  retrospective?(): Retrospective | null;
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
 *
 * Events are redacted here as well as in the room (#60), so a closed table hides
 * the same things whether it is played hot-seat or online. There is one log for
 * the whole client, not one per seat, so the reader it redacts for is:
 *
 * - the one seat this client controls, when it controls exactly one — a solo
 *   game against bots, where that seat is the only person at the screen and
 *   sees its own purchases in full, as online;
 * - **nobody** otherwise, the public view, because a hot-seat table is several
 *   people sharing one screen and one log. It is the stricter reading, and it
 *   is the one that matches the constraint the hand-off card exists to keep.
 */
export function localTransport({ setup, controls, engine }: LocalTransportOptions): GameTransport {
  const backend: LocalEngine = engine ?? new GameSession(setup);
  const seats = [...controls];
  const reader: Seat | null = seats.length === 1 ? seats[0]! : null;
  const handlers = new Set<(message: TransportMessage) => void>();
  const visible = (events: readonly EngineEvent[]): readonly EngineEvent[] =>
    events.length === 0 ? events : redactEventsFor(backend.snapshot(), events, reader);

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
      // The record rides on the update that ends the game, so the end screen
      // has it the moment it opens rather than a frame later.
      const record = result.ok ? (backend.retrospective?.() ?? null) : null;
      void deliver(
        result.ok
          ? {
              events: visible(result.events),
              views: backend.viewsFor(seats),
              ...(record ? { retrospective: record } : {}),
            }
          : { events: [], views: backend.viewsFor(seats), rejection: { command, error: result.error } },
      );
    },
    onMessage: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}
