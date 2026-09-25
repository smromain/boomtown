import { describe, expect, it } from 'vitest';
import { INDUSTRIES, INDUSTRY_INFO } from '@boomtown/engine';
import { industryPattern, industryTheme, PATTERN_NAMES } from './industryTheme.js';

/**
 * The renderer's half of the palette spec (#19). `packages/engine/test/
 * palette.test.ts` holds the fills apart; this holds the type shades legible
 * and the patterns distinct.
 */

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** `--bg` and `--surface`: the cream page and the white panels on it. */
const PAPER = ['#faf6f0', '#ffffff'];
/** `--chrome-bg`, the ground every beat is played on. */
const NIGHT = '#1c1917';
const AA = 4.5;

describe('industry type shades read as text', () => {
  it.each(INDUSTRIES)('%s on paper clears WCAG AA', (industry) => {
    for (const ground of PAPER) {
      const ratio = contrast(industryTheme(industry).onPaper, ground);
      expect({ industry, ground, ok: ratio >= AA }).toEqual({ industry, ground, ok: true });
    }
  });

  it.each(INDUSTRIES)('%s on night clears WCAG AA', (industry) => {
    const ratio = contrast(industryTheme(industry).onNight, NIGHT);
    expect({ industry, ok: ratio >= AA }).toEqual({ industry, ok: true });
  });

  it('leaves the engine fill and ink as they are — identity is not the renderer\'s to change', () => {
    for (const industry of INDUSTRIES) {
      const { color, ink } = industryTheme(industry);
      expect({ color, ink }).toEqual({ color: INDUSTRY_INFO[industry].color, ink: INDUSTRY_INFO[industry].ink });
    }
  });
});

describe('industry patterns', () => {
  it('gives each industry its own texture, drawn in its own ink', () => {
    const patterns = INDUSTRIES.map(industryPattern);
    expect(new Set(patterns).size).toBe(INDUSTRIES.length);
    for (const industry of INDUSTRIES) {
      expect(industryPattern(industry)).toContain(INDUSTRY_INFO[industry].ink);
    }
    expect(new Set(Object.values(PATTERN_NAMES)).size).toBe(INDUSTRIES.length);
  });
});
