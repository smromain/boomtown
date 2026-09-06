/**
 * A seeded, immutable PRNG (mulberry32). The engine carries an `Rng` in game
 * state and threads a new one through every draw and shuffle. This is the only
 * randomness anywhere under `packages/engine` — `Math.random` is banned by lint
 * because an unseeded call breaks replay, reconnection, and bot reproducibility
 * at once (R7).
 */
export interface Rng {
  /** Opaque 32-bit state. */
  readonly s: number;
}

export function makeRng(seed: number): Rng {
  return { s: seed | 0 };
}

export function nextUint32(rng: Rng): { value: number; rng: Rng } {
  const a = (rng.s + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = (t ^ (t >>> 14)) >>> 0;
  return { value, rng: { s: a } };
}

/** A float in [0, 1). */
export function nextFloat(rng: Rng): { value: number; rng: Rng } {
  const { value, rng: next } = nextUint32(rng);
  return { value: value / 0x100000000, rng: next };
}

/** An integer in [0, maxExclusive). */
export function nextInt(rng: Rng, maxExclusive: number): { value: number; rng: Rng } {
  if (maxExclusive <= 0) throw new Error('maxExclusive must be positive');
  const { value, rng: next } = nextFloat(rng);
  return { value: Math.floor(value * maxExclusive), rng: next };
}

/** A new array with the items shuffled (Fisher–Yates), plus the advanced Rng. */
export function shuffle<T>(rng: Rng, items: readonly T[]): { value: T[]; rng: Rng } {
  const out = items.slice();
  let cursor = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const draw = nextInt(cursor, i + 1);
    cursor = draw.rng;
    const j = draw.value;
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return { value: out, rng: cursor };
}
