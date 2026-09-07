import type { EngineEvent, PlayerView } from '@boomtown/engine';

/**
 * The serialized shape of one seat's view. `PlayerView` is already a pure
 * projection of authoritative state — every field is a primitive, a plain
 * record, an array, or null, with no `Map`, `Set`, class instance, or function
 * — so it crosses the wire as-is. This alias is the wire name for it; the
 * round-trip test in `test/roundtrip.test.ts` pins that it stays JSON-safe.
 */
export type PlayerViewDTO = PlayerView;

/** Events are likewise plain data (KTD2); this is their wire name. */
export type EngineEventDTO = EngineEvent;

/**
 * Compile-time guard: every leaf of the DTO must be a JSON primitive — no
 * `Map`, `Set`, `Date`, or function. `DeepJsonSafe<T>` is `T` when that holds
 * and `never` on the offending path, so assigning it back to `T` fails to
 * type-check if a future field breaks the contract.
 */
type JsonPrimitive = string | number | boolean | null | undefined;

type DeepJsonSafe<T> = T extends JsonPrimitive
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepJsonSafe<U>[]
    : T extends (...args: never[]) => unknown
      ? never
      : T extends object
        ? T extends Map<unknown, unknown> | Set<unknown> | Date
          ? never
          : { readonly [K in keyof T]: DeepJsonSafe<T[K]> }
        : never;

type _PlayerViewIsJson = PlayerViewDTO extends DeepJsonSafe<PlayerViewDTO> ? true : never;
type _EngineEventIsJson = EngineEventDTO extends DeepJsonSafe<EngineEventDTO> ? true : never;
