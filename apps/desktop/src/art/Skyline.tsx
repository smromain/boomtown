import type { CSSProperties } from 'react';
import type { Industry } from '@boomtown/engine';
import { INDUSTRY_INFO } from '@boomtown/engine';

/**
 * The one illustration asset for all five R13 surfaces (`docs/illustration-brief.md`):
 * a flat, faceted skyline silhouette — the corporations as buildings, not literal
 * logos or mascots. A placeholder stand-in for commissioned art: swapping in real
 * artwork later means replacing this component, not its five call sites.
 *
 * `accents` optionally tints a couple of windows with real industry colours (used
 * by the founding/merger/victory beats, where a specific corporation is the
 * subject); `tone` picks a silhouette dark enough to read on the cream ground or
 * light enough to read on the ink chrome (the launch screen, beat curtains).
 */
export function Skyline({
  tone = 'ink',
  accents = [],
  className,
  style,
}: {
  tone?: 'ink' | 'chrome';
  accents?: readonly Industry[];
  className?: string | undefined;
  style?: CSSProperties | undefined;
}) {
  const body = tone === 'ink' ? '#c9bcac' : '#3a332c';
  const windowBase = tone === 'ink' ? '#e7ded2' : '#2b2621';

  // A row of flat trapezoid/rectangle buildings, varying width and height —
  // WPA-poster flat shapes, no gradient, no cast shadow.
  const buildings = [
    { x: 0, w: 70, h: 90 },
    { x: 66, w: 46, h: 140 },
    { x: 108, w: 60, h: 70 },
    { x: 164, w: 40, h: 170 },
    { x: 200, w: 90, h: 110 },
    { x: 286, w: 50, h: 200, crown: true },
    { x: 332, w: 56, h: 96 },
    { x: 384, w: 34, h: 150 },
    { x: 414, w: 78, h: 76 },
    { x: 488, w: 44, h: 128 },
    { x: 528, w: 68, h: 88 },
    { x: 592, w: 40, h: 160 },
    { x: 628, w: 90, h: 100 },
    { x: 714, w: 52, h: 130 },
    { x: 762, w: 38, h: 76 },
  ] as const;

  const windowRows = (h: number) => Math.max(1, Math.floor((h - 20) / 26));

  return (
    <svg
      viewBox="0 0 800 220"
      className={className}
      style={style}
      role="presentation"
      aria-hidden="true"
      preserveAspectRatio="xMidYMax slice"
    >
      {buildings.map((b, i) => {
        const accent = accents[i % Math.max(accents.length, 1)];
        const info = accent ? INDUSTRY_INFO[accent] : null;
        const rows = windowRows(b.h);
        return (
          <g key={i}>
            <rect x={b.x} y={220 - b.h} width={b.w} height={b.h} fill={info ? info.color : body} opacity={info ? 0.5 : 1} />
            {Array.from({ length: rows }, (_, r) => (
              <rect
                key={r}
                x={b.x + 8}
                y={220 - b.h + 12 + r * 26}
                width={b.w - 16}
                height={10}
                fill={windowBase}
                opacity={0.6}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
