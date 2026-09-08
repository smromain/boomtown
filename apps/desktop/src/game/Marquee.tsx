import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import styles from './marquee.module.css';

/**
 * Text that scrolls itself **only when it overflows** its box — a corporation's
 * derived name and blended flavour both grow long after a few mergers and would
 * otherwise be clipped by the card width.
 *
 * `axis="x"` is a single line that slides left, out and back. `axis="y"` wraps
 * to a fixed number of visible `lines` and scrolls the block up, top to bottom
 * and back. Speed is fixed (px/second) so a longer string takes longer rather
 * than blurring past; `prefers-reduced-motion` disables the animation.
 */
const SPEED = 22; // px per second
const EDGE_PAUSE = 1.6; // seconds held at each end

export function Marquee({
  children,
  className,
  axis = 'x',
  lines = 2,
}: {
  children: ReactNode;
  className?: string | undefined;
  axis?: 'x' | 'y';
  lines?: number;
}) {
  const viewport = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const measure = () => {
      const vp = viewport.current;
      const el = inner.current;
      if (!vp || !el) return;
      setOverflow(
        axis === 'x'
          ? Math.max(0, el.scrollWidth - vp.clientWidth)
          : Math.max(0, el.scrollHeight - vp.clientHeight),
      );
    };
    measure();

    // jsdom (tests) has no ResizeObserver; the one-shot measure above is enough there.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    if (viewport.current) ro.observe(viewport.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [children, axis]);

  const scrolls = overflow > 1;
  const duration = scrolls ? (overflow / SPEED) * 2 + EDGE_PAUSE * 2 : 0;

  const viewportStyle: CSSProperties | undefined =
    axis === 'y' ? ({ '--marquee-lines': String(lines) } as CSSProperties) : undefined;

  const innerStyle: CSSProperties | undefined = scrolls
    ? ({
        '--marquee-shift': `${-overflow}px`,
        '--marquee-duration': `${duration}s`,
      } as CSSProperties)
    : undefined;

  return (
    <span
      ref={viewport}
      className={`${axis === 'y' ? styles.viewportY : styles.viewport} ${className ?? ''}`}
      data-scrolls={scrolls || undefined}
      style={viewportStyle}
    >
      <span ref={inner} className={axis === 'y' ? styles.innerY : styles.inner} style={innerStyle}>
        {children}
      </span>
    </span>
  );
}
