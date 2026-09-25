import type { CSSProperties } from 'react';
import { INDUSTRY_INFO, type Industry } from '@boomtown/engine';

/**
 * How an industry is drawn, as opposed to what it is (#19).
 *
 * `INDUSTRY_INFO` in the engine stays the canonical identity: `color` is the
 * fill every surface agrees on, and `ink` is what reads on top of it. This file
 * adds the two things the renderer needs and the engine has no business
 * holding, so every client can draw them its own way without a protocol change.
 *
 * **Type shades.** Four of the seven fills are too light to read as text or as
 * an icon on the cream paper (toys is 1.8:1, books 2.1, tech 2.8, energy 3.4),
 * and air and video are too dark to read on the beats' night ground. So
 * wherever an industry colour is used *as ink* rather than as a fill, it uses
 * `onPaper` or `onNight`: the same hue, walked in lightness until it clears
 * WCAG AA (4.5:1). The ones that already passed are unchanged.
 *
 * The price of legibility is that the shades converge. Once they are dark
 * enough to read, books and electronics are about 2 apart in CIEDE2000 under
 * deuteranopia. So coloured type never carries identity on its own: wherever
 * it appears, the industry glyph or the company's name sits beside it.
 * `industryTheme.test.ts` holds the contrast floor.
 *
 * **Patterns.** One texture per industry, for the opt-in *Industry patterns*
 * setting. It layers over a large colour field (a board cell, a corporation's
 * cap, a merger disc) in that industry's own `ink`, so identity comes from
 * structure as well as hue. The seven differ in orientation and shape, not in
 * colour.
 */
export interface IndustryTheme {
  /** The fill, from the engine. */
  readonly color: string;
  /** Legible ink over `color`, from the engine. */
  readonly ink: string;
  /** The industry colour as text or icon on the cream paper (`--bg`/`--surface`). */
  readonly onPaper: string;
  /** The industry colour as text or icon on the night ground of the beats. */
  readonly onNight: string;
}

const TYPE: Record<Industry, { readonly onPaper: string; readonly onNight: string }> = {
  books: { onPaper: '#936800', onNight: '#D7A329' },
  electronics: { onPaper: '#C04920', onNight: '#D95E33' },
  air: { onPaper: '#355C99', onNight: '#6284C5' },
  energy: { onPaper: '#327C5B', onNight: '#4A9471' },
  tech: { onPaper: '#8558C7', onNight: '#AC7CEF' },
  video: { onPaper: '#971D50', onNight: '#D55A84' },
  toys: { onPaper: '#007B88', onNight: '#66CAD8' },
};

export function industryTheme(industry: Industry): IndustryTheme {
  const { color, ink } = INDUSTRY_INFO[industry];
  return { color, ink, ...TYPE[industry] };
}

/**
 * The texture layer for one industry, as a CSS `background` layer list to sit
 * in front of the fill: `${industryPattern(i)}, ${fill}`. Sized in `em` so it
 * scales with the element it textures — a board cell's font size follows the
 * board's width, and the pattern follows it.
 */
export function industryPattern(industry: Industry): string {
  const mark = `color-mix(in srgb, ${INDUSTRY_INFO[industry].ink} 24%, transparent)`;
  return PATTERNS[industry](mark);
}

/**
 * The `background` for a colour field, with the industry's texture layered in
 * front when `on`. The texture travels as a custom property and the
 * shorthand names it with `var()`: a real browser substitutes the layer list
 * as written, and a stylesheet parser that cannot read a multi-layer
 * background (jsdom's among them) keeps the declaration rather than dropping
 * it whole.
 */
export function patternedBackground(industry: Industry, base: string, on: boolean): CSSProperties {
  if (!on) return { background: base };
  return {
    ['--industry-pattern' as string]: industryPattern(industry),
    background: `var(--industry-pattern), ${base}`,
  } as CSSProperties;
}

/**
 * Names for the seven, for tests and anyone reading this later. Each is chosen
 * to be told apart by structure: two rulings at right angles, one diagonal, a
 * grid, a checker, dots and a sawtooth.
 */
export const PATTERN_NAMES: Record<Industry, string> = {
  books: 'horizontal rules',
  electronics: 'grid',
  air: 'diagonal rules',
  energy: 'sawtooth',
  tech: 'checker',
  video: 'vertical rules',
  toys: 'dots',
};

const PATTERNS: Record<Industry, (mark: string) => string> = {
  // lines of a page
  books: (m) => `repeating-linear-gradient(0deg, ${m} 0 0.13em, transparent 0.13em 0.55em)`,
  // a circuit board
  electronics: (m) =>
    `repeating-linear-gradient(0deg, ${m} 0 0.09em, transparent 0.09em 0.7em), ` +
    `repeating-linear-gradient(90deg, ${m} 0 0.09em, transparent 0.09em 0.7em)`,
  // rising, like take-off
  air: (m) => `repeating-linear-gradient(45deg, ${m} 0 0.13em, transparent 0.13em 0.6em)`,
  // the bolt, repeated
  energy: (m) =>
    `linear-gradient(135deg, ${m} 25%, transparent 25%) -0.35em 0 / 0.7em 0.7em, ` +
    `linear-gradient(225deg, ${m} 25%, transparent 25%) -0.35em 0 / 0.7em 0.7em`,
  // pixels
  tech: (m) => `conic-gradient(${m} 25%, transparent 0 50%, ${m} 0 75%, transparent 0) 0 0 / 0.9em 0.9em`,
  // film-strip frames
  video: (m) => `repeating-linear-gradient(90deg, ${m} 0 0.18em, transparent 0.18em 0.6em)`,
  // party wrapping paper
  toys: (m) => `radial-gradient(circle, ${m} 0 0.19em, transparent 0.24em) 0 0 / 0.8em 0.8em`,
};
