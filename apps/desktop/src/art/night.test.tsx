import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NightSkyline } from './NightSkyline.js';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'night.module.css'), 'utf8');

describe('NightSkyline', () => {
  it('stays out of the accessibility tree — it is atmosphere, not information', () => {
    const { container } = render(<NightSkyline />);
    expect((container.firstChild as HTMLElement).getAttribute('aria-hidden')).toBe('true');
  });

  it('gives each rank its own speed, which is the only depth flat art gets', () => {
    const { container } = render(<NightSkyline />);
    const speeds = [...container.querySelectorAll('[class*="track"]')].map((el) =>
      (el as HTMLElement).style.getPropertyValue('--drift-duration'),
    );
    expect(speeds).toEqual(['170s', '85s']);
  });

  it('mirrors every other tile, so the joins meet on identical edges', () => {
    const { container } = render(<NightSkyline />);
    for (const track of container.querySelectorAll('[class*="track"]')) {
      const tiles = [...track.children];
      expect(tiles).toHaveLength(8);
      expect(tiles.filter((t) => t.className.includes('mirrored'))).toHaveLength(4);
      // alternating, not four of one and four of the other
      expect(tiles.map((t) => (t.className.includes('mirrored') ? 'M' : '.')).join('')).toBe(
        '.M.M.M.M',
      );
    }
  });

  it('travels two tiles a cycle, because mirrored tiles alternate', () => {
    // The trap this encodes: with every other tile mirrored, a loop that
    // travels *one* tile lands on the opposite parity and jumps once a cycle —
    // and it jumps in the one frame a screenshot is least likely to catch.
    // Two tiles of eight is 25%.
    expect(css).toMatch(/@keyframes drift[\s\S]*translateX\(-25%\)/);
  });

  it('keeps the pixels sharp and holds still for prefers-reduced-motion (U12)', () => {
    expect(css).toMatch(/image-rendering:\s*pixelated/);
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {'));
    expect(reduced).toMatch(/\.track\s*\{[\s\S]*animation:\s*none/);
  });
});
