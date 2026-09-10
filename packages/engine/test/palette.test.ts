import { describe, expect, it } from 'vitest';
import { INDUSTRIES, INDUSTRY_INFO, type Industry } from '../src/index.js';

/**
 * The board palette is data, and this is the spec it has to meet (#18).
 *
 * The colours are the only thing telling one corporation from another on the
 * board, so "they look different enough" is a claim worth testing rather than
 * eyeballing. The palette this replaced had six of seven colours inside an
 * 11-point lightness band; under simulated protanopia its worst pair was 2.5
 * apart in CIEDE2000, which is indistinguishable, not merely close.
 *
 * Everything below is self-contained on purpose: colour maths is not the
 * engine's job, and shipping it in `src` to serve one test would be worse than
 * a hundred lines of arithmetic in the test that needs it.
 */

// --- sRGB -> CIELAB ------------------------------------------------------

type Lab = readonly [number, number, number];
type Lin = readonly [number, number, number];

function toLinear(hex: string): Lin {
  const h = hex.replace('#', '');
  const chan = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [chan(0), chan(2), chan(4)];
}

const WHITE = [0.95047, 1, 1.08883] as const;

function toLab([r, g, b]: Lin): Lab {
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / WHITE[0];
  const Y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / WHITE[1];
  const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / WHITE[2];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const lab = (hex: string): Lab => toLab(toLinear(hex));

/** Relative luminance, for the WCAG contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = toLinear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// --- CIEDE2000 -----------------------------------------------------------

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

function deltaE2000(l1: Lab, l2: Lab): number {
  const [L1, a1, b1] = l1;
  const [L2, a2, b2] = l2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)) || 0);
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h1p = (deg(Math.atan2(b1, a1p)) + 360) % 360;
  const h2p = (deg(Math.atan2(b2, a2p)) + 360) % 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp) / 2);

  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp: number;
  if (C1p * C2p === 0) hbp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
  else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;

  const T =
    1 -
    0.17 * Math.cos(rad(hbp - 30)) +
    0.24 * Math.cos(rad(2 * hbp)) +
    0.32 * Math.cos(rad(3 * hbp + 6)) -
    0.2 * Math.cos(rad(4 * hbp - 63));

  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt =
    -2 *
    Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) *
    Math.sin(rad(60 * Math.exp(-(((hbp - 275) / 25) ** 2))));

  return Math.sqrt(
    (dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh),
  );
}

// --- colour-vision simulation (Viénot 1999, applied in linear RGB) -------

const CVD = {
  protanopia: [
    [0.11238, 0.88762, 0], [0.11238, 0.88762, 0], [0.004, -0.004, 1],
  ],
  deuteranopia: [
    [0.29275, 0.70725, 0], [0.29275, 0.70725, 0], [-0.02234, 0.02234, 1],
  ],
  tritanopia: [
    [1, 0.14461, -0.14461], [0, 1, 0], [0, 0.85924, 0.15076],
  ],
} as const;

type Vision = keyof typeof CVD | 'normal';

function seenAs(hex: string, vision: Vision): Lab {
  const lin = toLinear(hex);
  if (vision === 'normal') return toLab(lin);
  const m = CVD[vision];
  return toLab([
    m[0]![0]! * lin[0] + m[0]![1]! * lin[1] + m[0]![2]! * lin[2],
    m[1]![0]! * lin[0] + m[1]![1]! * lin[1] + m[1]![2]! * lin[2],
    m[2]![0]! * lin[0] + m[2]![1]! * lin[1] + m[2]![2]! * lin[2],
  ] as Lin);
}

// --- the spec ------------------------------------------------------------

/** Every unordered pair of industries. */
const PAIRS: readonly (readonly [Industry, Industry])[] = INDUSTRIES.flatMap((a, i) =>
  INDUSTRIES.slice(i + 1).map((b) => [a, b] as const),
);

const MIN_DELTA_E: Record<Vision, number> = {
  normal: 25,
  protanopia: 15,
  deuteranopia: 15,
  tritanopia: 15,
};

describe('the board palette is far enough apart to read', () => {
  it.each(Object.keys(MIN_DELTA_E) as Vision[])(
    'no two corporations are confusable under %s',
    (vision) => {
      const floor = MIN_DELTA_E[vision];
      const worst = PAIRS.map(([a, b]) => ({
        pair: `${a} vs ${b}`,
        dE: deltaE2000(seenAs(INDUSTRY_INFO[a].color, vision), seenAs(INDUSTRY_INFO[b].color, vision)),
      })).sort((x, y) => x.dE - y.dE)[0]!;

      expect(`${worst.pair}: ${worst.dE.toFixed(1)}`).toBe(
        `${worst.pair}: ${Math.max(worst.dE, floor).toFixed(1)}`,
      );
    },
  );

  it('no two share a lightness — an equal-luminance swap is the one a merger makes', () => {
    // The failure this palette replaced: six of seven inside an 11-point band,
    // so a merger repainted the board without changing its weight.
    for (const [a, b] of PAIRS) {
      const gap = Math.abs(lab(INDUSTRY_INFO[a].color)[0] - lab(INDUSTRY_INFO[b].color)[0]);
      expect({ pair: `${a} vs ${b}`, gap: gap >= 5 }).toEqual({ pair: `${a} vs ${b}`, gap: true });
    }
  });

  it('spans a wide lightness range rather than bunching', () => {
    const ls = INDUSTRIES.map((i) => lab(INDUSTRY_INFO[i].color)[0]);
    expect(Math.max(...ls) - Math.min(...ls)).toBeGreaterThan(35);
  });

  it('carries ink that meets WCAG AA on its own colour', () => {
    for (const industry of INDUSTRIES) {
      const { color, ink } = INDUSTRY_INFO[industry];
      expect({ industry, ok: contrast(color, ink) >= 4.5 }).toEqual({ industry, ok: true });
    }
  });
});
