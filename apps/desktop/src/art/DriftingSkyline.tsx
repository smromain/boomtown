import { type CSSProperties } from 'react';
import { Skyline } from './Skyline.js';
import styles from './drift.module.css';

/**
 * The `Skyline`, tiled and drifting sideways without end.
 *
 * Used behind the launch screen, where the art is atmosphere rather than
 * information: it says the town is running before anyone has pressed anything.
 * The movement is one CSS transform on a two-tile track (see `drift.module.css`
 * for why two, and why the second is mirrored) — not a timer, not a rerender,
 * so it costs nothing while somebody sits on the menu deciding.
 *
 * `prefers-reduced-motion` stops it, in the stylesheet: a background that
 * cannot be looked away from is exactly what that setting is for.
 */
export function DriftingSkyline({
  tone = 'chrome',
  className,
  seconds = 80,
}: {
  tone?: 'ink' | 'chrome';
  className?: string | undefined;
  /** How long one frame-width of travel takes. Slower reads as distance. */
  seconds?: number;
}) {
  return (
    <div
      className={`${styles.frame} ${className ?? ''}`}
      style={{ '--drift-duration': `${seconds}s` } as CSSProperties}
      aria-hidden="true"
    >
      <div className={styles.track}>
        <Skyline tone={tone} className={styles.tile} />
        <Skyline tone={tone} className={`${styles.tile} ${styles.mirrored}`} />
      </div>
    </div>
  );
}
