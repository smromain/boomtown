import type { Command, Seat, SetupOptions } from '@boomtown/engine';
import type { GameTransport, TransportMessage } from './types.js';

/** Messages the renderer sends into the engine Web Worker. */
export type EngineWorkerRequest =
  | { readonly kind: 'init'; readonly setup: SetupOptions; readonly controls: readonly Seat[] }
  | { readonly kind: 'command'; readonly command: Command };

/** The worker replies with a plain `TransportMessage`. */
export type EngineWorkerResponse = TransportMessage;

/** Structural subset of the DOM `Worker` — keeps `client-core` free of the DOM lib. */
export interface WorkerLike {
  postMessage(message: EngineWorkerRequest): void;
  addEventListener(
    type: 'message',
    listener: (event: { readonly data: EngineWorkerResponse }) => void,
    options?: { once?: boolean },
  ): void;
  removeEventListener(type: 'message', listener: (event: { readonly data: EngineWorkerResponse }) => void): void;
  terminate(): void;
}

/**
 * Runs the engine off the main thread (KTD9). Same `GameTransport` contract as
 * `localTransport`, so `client-core` and the UI cannot tell them apart. The
 * worker itself is `apps/desktop/src/engineWorker.ts`.
 */
export function workerTransport(
  worker: WorkerLike,
  init: { setup: SetupOptions; controls: readonly Seat[] },
): GameTransport {
  const handlers = new Set<(message: TransportMessage) => void>();

  worker.addEventListener('message', (event) => {
    for (const handler of handlers) handler(event.data);
  });

  return {
    connect: () =>
      new Promise((resolve) => {
        worker.addEventListener('message', () => resolve(), { once: true });
        worker.postMessage({ kind: 'init', setup: init.setup, controls: [...init.controls] });
      }),
    disconnect: () => {
      handlers.clear();
      worker.terminate();
    },
    send: (command: Command) => worker.postMessage({ kind: 'command', command }),
    onMessage: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}
