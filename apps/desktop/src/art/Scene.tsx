import type { Industry } from '@boomtown/engine';
import { SCENES } from './scenes.js';

/** Each scene wrapped in the wobble filter, built once so React never rewrites it. */
const MARKUP = Object.fromEntries(
  Object.entries(SCENES).map(([industry, art]) => [industry, { __html: `<g class="gn-rough">${art}</g>` }]),
) as Record<Industry, { __html: string }>;

/**
 * One corporation's drawing (Game Night skin, prototype). Coloured by the
 * `--gn-c`/`--gn-ci` custom properties of whatever it sits in, so the card that
 * holds it decides the colour. Anchored to the ground so a wider card shows
 * more sky, not less street — except the video store, whose marquee is at the
 * top.
 */
export function Scene({ industry, className }: { industry: Industry; className?: string | undefined }) {
  return (
    <svg
      className={className}
      viewBox="0 0 300 96"
      preserveAspectRatio={industry === 'video' ? 'xMidYMid slice' : 'xMidYMax slice'}
      aria-hidden
      dangerouslySetInnerHTML={MARKUP[industry]}
    />
  );
}

/**
 * The one filter the skin's linework uses: a faint wobble, so a ruled line
 * reads as drawn. Mounted once per screen; everything refers to it by id.
 */
export function GameNightDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <filter id="gn-rough" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={7} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={2.6} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
