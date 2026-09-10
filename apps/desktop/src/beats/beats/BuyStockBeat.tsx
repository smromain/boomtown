import { useEffect } from 'react';
import { INDUSTRIES, INDUSTRY_INFO, type Industry, type PlayerView, type Seat } from '@boomtown/engine';
import { IndustryMark } from '../../game/marks.js';
import { soundManager } from '../../audio/soundManager.js';
import { useReducedMotion } from '../useReducedMotion.js';
import styles from '../beats.module.css';

const HOLD_MS = 1100;

/**
 * The lightest beat (R6, U11): a brief flourish, not a screen takeover — play
 * never pauses for it.
 *
 * It is the only beat with no curtain to click, so the pill itself is the
 * dismiss control: the overlay root and the flourish stay `pointer-events:
 * none` (clicks fall through to the board, which is the point of a
 * non-blocking beat) and only the pill takes pointer events back. Before that
 * there was no way at all to clear this beat with a mouse if its timer failed.
 */
export function BuyStockBeat({
  seat,
  cost,
  picks,
  view,
  dismiss,
}: {
  seat: Seat;
  cost: number;
  picks: Partial<Record<Industry, number>>;
  view: PlayerView;
  dismiss: () => void;
}) {
  const reduced = useReducedMotion();
  const name = view.seats[seat]?.name ?? `Player ${seat + 1}`;

  useEffect(() => {
    soundManager.play('buy');
    // Reduced motion shortens the hold; it never removes the beat outright —
    // it still communicates through its still-frame and copy (R8, AE4).
    const t = window.setTimeout(dismiss, reduced ? HOLD_MS * 0.34 : HOLD_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return (
    <div
      className={reduced ? undefined : styles.flourish}
      style={{ marginTop: '18vh', pointerEvents: 'none' }}
      role="status"
      aria-label={`${name} bought stock`}
    >
      <button
        type="button"
        className={styles.flourishPill}
        onClick={dismiss}
        aria-label={`Dismiss — ${name} bought stock`}
      >
        {INDUSTRIES.filter((industry) => (picks[industry] ?? 0) > 0).map((industry) => (
          <IndustryMark key={industry} industry={industry} color={INDUSTRY_INFO[industry].color} size={16} />
        ))}
        <span className="serif tabnum" style={{ fontSize: 15 }}>
          {name} bought stock — ${cost.toLocaleString()}
        </span>
      </button>
    </div>
  );
}
