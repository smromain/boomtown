import { type CSSProperties } from 'react';
import styles from './night.module.css';
import starsUrl from '../assets/night/night-stars.png';
import moonUrl from '../assets/night/night-moon.png';
import farUrl from '../assets/night/night-far.png';
import nearUrl from '../assets/night/night-near.png';

/** How many tiles a drifting rank carries. See `night.module.css` for why 8. */
const TILES = 8;

/**
 * The launch screen's backdrop: a pixel-art town at night, drifting.
 *
 * The art is `design/skyline.psd`, recoloured onto the app's palette by
 * `design/make_skyline.py` — the PSD is blue and this app has no blue in it —
 * and split into four PNGs so the ranks can move independently of the sky.
 * The sky itself is not an image: it is the ink chrome the whole screen
 * already sits on.
 *
 * All the movement is one CSS transform per rank, so a screen somebody leaves
 * open costs nothing, and `prefers-reduced-motion` stops both in the
 * stylesheet.
 */
export function NightSkyline({ className }: { className?: string | undefined }) {
  return (
    <div className={`${styles.frame} ${className ?? ''}`} aria-hidden="true">
      <div className={`${styles.layer} ${styles.stars}`} style={image(starsUrl)} />
      <div className={`${styles.layer} ${styles.moon}`} style={image(moonUrl)} />
      {/* The far rank drifts at half the speed of the near one, which is the
          whole of the depth: the art itself is flat. */}
      <Rank src={farUrl} seconds={170} />
      <Rank src={nearUrl} seconds={85} />
    </div>
  );
}

function Rank({ src, seconds }: { src: string; seconds: number }) {
  return (
    <div className={styles.track} style={{ '--drift-duration': `${seconds}s` } as CSSProperties}>
      {Array.from({ length: TILES }, (_, i) => (
        <div
          key={i}
          className={`${styles.tile} ${i % 2 === 1 ? styles.mirrored : ''}`}
          style={image(src)}
        />
      ))}
    </div>
  );
}

const image = (url: string): CSSProperties => ({ backgroundImage: `url(${url})` });
