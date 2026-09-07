import type { EngineError } from '@boomtown/engine';

/**
 * Errors the room can send that are not engine rule rejections. An engine
 * `EngineError` from `reduce` is forwarded verbatim under `engine`.
 */
export type ProtocolErrorCode =
  | 'wrong-version'
  | 'room-full'
  | 'bad-token'
  | 'not-in-room'
  | 'game-not-started'
  | 'malformed-message';

export interface ProtocolError {
  readonly kind: 'protocol';
  readonly code: ProtocolErrorCode;
  readonly message: string;
}

/** A forwarded engine rejection — same `code`/`message`, tagged for the wire. */
export interface WireEngineError {
  readonly kind: 'engine';
  readonly error: EngineError;
}

export type WireError = ProtocolError | WireEngineError;

export function protocolError(code: ProtocolErrorCode, message: string): ProtocolError {
  return { kind: 'protocol', code, message };
}

export function wireEngineError(error: EngineError): WireEngineError {
  return { kind: 'engine', error };
}
