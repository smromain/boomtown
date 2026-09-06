import { describe, expect, it } from 'vitest';
import { makeRng, nextInt, nextUint32, shuffle } from '@boomtown/engine';

describe('seeded rng', () => {
  it('is a pure function of state — same seed, same stream', () => {
    const a: number[] = [];
    const b: number[] = [];
    let ra = makeRng(12345);
    let rb = makeRng(12345);
    for (let i = 0; i < 20; i++) {
      const sa = nextUint32(ra);
      const sb = nextUint32(rb);
      a.push(sa.value);
      b.push(sb.value);
      ra = sa.rng;
      rb = sb.rng;
    }
    expect(a).toEqual(b);
  });

  it('different seeds diverge', () => {
    expect(nextUint32(makeRng(1)).value).not.toBe(nextUint32(makeRng(2)).value);
  });

  it('does not mutate the input rng', () => {
    const r = makeRng(99);
    const snapshot = r.s;
    nextUint32(r);
    nextInt(r, 100);
    shuffle(r, [1, 2, 3, 4, 5]);
    expect(r.s).toBe(snapshot);
  });

  it('nextInt stays in range', () => {
    let r = makeRng(7);
    for (let i = 0; i < 500; i++) {
      const draw = nextInt(r, 6);
      expect(draw.value).toBeGreaterThanOrEqual(0);
      expect(draw.value).toBeLessThan(6);
      r = draw.rng;
    }
  });

  it('shuffle is a permutation and deterministic for a seed', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const first = shuffle(makeRng(42), items).value;
    const second = shuffle(makeRng(42), items).value;
    expect(first).toEqual(second);
    expect([...first].sort((x, y) => x - y)).toEqual(items);
  });
});
