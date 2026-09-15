import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DriftingSkyline } from './DriftingSkyline.js';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'drift.module.css'), 'utf8');

describe('DriftingSkyline', () => {
  it('lays two copies side by side, because one cannot cover the seam', () => {
    const { container } = render(<DriftingSkyline />);
    const skylines = container.querySelectorAll('svg[role="presentation"]');
    expect(skylines).toHaveLength(2);
  });

  it('takes its speed as a custom property, so the caller sets it once', () => {
    const { container } = render(<DriftingSkyline seconds={12} />);
    expect((container.firstChild as HTMLElement).style.getPropertyValue('--drift-duration')).toBe('12s');
  });

  it('stays out of the accessibility tree — it is atmosphere, not information', () => {
    const { container } = render(<DriftingSkyline />);
    expect((container.firstChild as HTMLElement).getAttribute('aria-hidden')).toBe('true');
  });

  it('travels exactly one tile, which is what makes the loop invisible', () => {
    // A track of two tiles sliding by half its width lands the repeat on the
    // frame edge. Any other pair of numbers shows a jump once a cycle, which
    // is the whole failure mode of a scrolling background.
    expect(css).toMatch(/\.track\s*\{[^}]*width:\s*200%/);
    expect(css).toMatch(/\.tile\s*\{[^}]*flex:\s*0 0 50%/);
    expect(css).toMatch(/@keyframes drift[\s\S]*translateX\(-50%\)/);
    expect(css).toMatch(/animation:\s*drift/);
  });

  it('holds still for prefers-reduced-motion (U12)', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {'));
    expect(reduced).toMatch(/\.track\s*\{[\s\S]*animation:\s*none/);
  });
});
