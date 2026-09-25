import { useEffect } from 'react';
import { INDUSTRIES, type Industry, type PlayerView, type Seat } from '@boomtown/engine';
import { IndustryMark } from '../../game/marks.js';
import { industryTheme } from '../../game/industryTheme.js';
import { soundManager } from '../../audio/soundManager.js';
import { useReducedMotion } from '../useReducedMotion.js';
import styles from '../beats.module.css';
import { copy, fill } from '../../copy/copy.js';

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
 *
 * The pill is on a shared screen, so it never prints an amount it is not
 * entitled to: a redacted purchase arrives with a null cost and the pill shows
 * the industry marks and the name alone (#60).
 */
export function BuyStockBeat({
  seat,
  cost,
  picks,
  view,
  dismiss,
}: {
  seat: Seat;
  /** Null at a closed table, for a seat that is not the reader's (#60). */
  cost: number | null;
  picks: Partial<Record<Industry, number | null>>;
  view: PlayerView;
  dismiss: () => void;
}) {
  const reduced = useReducedMotion();
  const name = view.seats[seat]?.name ?? fill(copy.common.playerFallback, { n: seat + 1 });

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
      aria-label={fill(copy.beats.buyStock.label, { name })}
    >
      <button
        type="button"
        className={styles.flourishPill}
        onClick={dismiss}
        aria-label={fill(copy.beats.buyStock.dismiss, { name })}
      >
        {INDUSTRIES.filter((industry) => industry in picks).map((industry) => (
          <IndustryMark key={industry} industry={industry} color={industryTheme(industry).onNight} size={16} />
        ))}
        <span className="serif tabnum" style={{ fontSize: 15 }}>
          {cost === null
            ? fill(copy.beats.buyStock.lineBlind, { name })
            : fill(copy.beats.buyStock.line, { name, cost: cost.toLocaleString() })}
        </span>
      </button>
    </div>
  );
}
