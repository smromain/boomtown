import type { Command, EngineError, EngineEvent, Seat } from '@boomtown/engine';
import type { ClientView } from '../view.js';

/** A rejected command's error. Usually an engine rejection; online it may also
 * be a protocol error, whose `code` is then prefixed `protocol:`. */
export type RejectionError = EngineError | { readonly code: string; readonly message: string };

/**
 * One authoritative update from the transport. `views` carries the filtered
 * `ClientView` for each seat this client controls (all of them in hot-seat, one
 * online). `rejection` is set instead when the last `send` was refused.
 */
export interface TransportMessage {
  readonly events: readonly EngineEvent[];
  readonly views: Readonly<Record<Seat, ClientView>>;
  readonly rejection?: { readonly command: Command; readonly error: RejectionError };
}

/**
 * The seam between the client and the rules (KTD5). `LocalTransport` runs the
 * engine in-process (or in a Web Worker); `SocketTransport` (U18) speaks to the
 * authoritative server. `client-core` above this interface is identical for both.
 */
export interface GameTransport {
  /** Resolves once the initial views have been delivered. */
  connect(): Promise<void>;
  disconnect(): void;
  send(command: Command): void;
  /** Register an update handler; returns an unsubscribe function. */
  onMessage(handler: (message: TransportMessage) => void): () => void;
}
