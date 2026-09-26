import { describe, expect, it } from 'vitest';
import { INDUSTRY_INFO, type Industry } from '@boomtown/engine';
import { emblemPaths } from './emblems.js';

describe('emblemPaths', () => {
  it('reads a drawable outline out of every industry mark', () => {
    for (const industry of Object.keys(INDUSTRY_INFO) as Industry[]) {
      const paths = emblemPaths(industry);
      expect(paths.length, industry).toBeGreaterThan(0);
      for (const path of paths) expect(path.d).toMatch(/^m/i);
    }
  });

  it('keeps the marks apart', () => {
    expect(emblemPaths('books')[0]!.d).not.toBe(emblemPaths('energy')[0]!.d);
  });
});
