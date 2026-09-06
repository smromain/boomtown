import type { EngineError } from '../errors.js';
import type { EngineEvent } from '../events.js';
import type { GameState } from '../state.js';

export type ReduceResult =
  | { readonly ok: true; readonly state: GameState; readonly events: EngineEvent[] }
  | { readonly ok: false; readonly error: EngineError };
