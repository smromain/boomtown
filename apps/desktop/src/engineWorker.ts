import {
  GameSession,
  type EngineWorkerRequest,
  type EngineWorkerResponse,
} from '@boomtown/client-core';
import { redactEventsFor, type EngineEvent, type Seat } from '@boomtown/engine';

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

/**
 * The same redaction `localTransport` applies, for the same reason (#60): this
 * is the other local transport, and a closed table must hide the same things
 * whichever of the two is running the engine. One seat under this client's
 * control means that seat is the reader; anything else is a hot-seat table
 * sharing one log, and the reader is nobody.
 */
const visible = (events: readonly EngineEvent[]): readonly EngineEvent[] => {
  if (!session || events.length === 0) return events;
  return redactEventsFor(session.snapshot(), events, controls.length === 1 ? controls[0]! : null);
};

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
  const record = result.ok ? session.retrospective() : null;
  scope.postMessage(
    result.ok
      ? {
          events: visible(result.events),
          views: session.viewsFor(controls),
          ...(record ? { retrospective: record } : {}),
        }
      : {
          events: [],
          views: session.viewsFor(controls),
          rejection: { command: request.command, error: result.error },
        },
  );
});
