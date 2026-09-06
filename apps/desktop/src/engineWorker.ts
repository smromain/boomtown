import {
  GameSession,
  type EngineWorkerRequest,
  type EngineWorkerResponse,
} from '@boomtown/client-core';
import type { Seat } from '@boomtown/engine';

/**
 * The engine, off the main thread (KTD9). Holds one authoritative `GameSession`
 * and answers `workerTransport` requests. Bundled by electron-vite as a Web
 * Worker; the renderer never touches game state directly.
 *
 * Typed against `globalThis` so this file compiles under the renderer's DOM lib
 * without pulling in a conflicting WebWorker lib.
 */
const scope = globalThis as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<EngineWorkerRequest>) => void): void;
  postMessage(message: EngineWorkerResponse): void;
};

let session: GameSession | null = null;
let controls: Seat[] = [];

scope.addEventListener('message', (event) => {
  const request = event.data;

  if (request.kind === 'init') {
    session = new GameSession(request.setup);
    controls = [...request.controls];
    scope.postMessage({ events: [], views: session.viewsFor(controls) });
    return;
  }

  if (!session) return;
  const result = session.apply(request.command);
  scope.postMessage(
    result.ok
      ? { events: result.events, views: session.viewsFor(controls) }
      : {
          events: [],
          views: session.viewsFor(controls),
          rejection: { command: request.command, error: result.error },
        },
  );
});
