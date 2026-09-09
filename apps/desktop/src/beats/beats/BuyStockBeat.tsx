import { useEffect } from 'react';
import { INDUSTRIES, INDUSTRY_INFO, type Industry, type PlayerView, type Seat } from '@boomtown/engine';
import { IndustryMark } from '../../game/marks.js';
import { soundManager } from '../../audio/soundManager.js';
import { useReducedMotion } from '../useReducedMotion.js';
import styles from '../beats.module.css';

const HOLD_MS = 1100;

/** The lightest beat (R6, U11): a brief flourish, not a screen takeover — play never pauses for it. */
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
    const t = window.setTimeout(dismiss, reduced ? 0 : HOLD_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  if (reduced) return null;

  return (
    <div
      className={styles.flourish}
      style={{ top: '18%', left: '50%', transform: 'translateX(-50%)' }}
      role="status"
      aria-label={`${name} bought stock`}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--chrome-bg)',
          color: 'var(--chrome-ink)',
          borderRadius: 20,
          padding: '10px 18px',
          boxShadow: 'var(--elev-3)',
        }}
      >
        {INDUSTRIES.filter((industry) => (picks[industry] ?? 0) > 0).map((industry) => (
          <IndustryMark key={industry} industry={industry} color={INDUSTRY_INFO[industry].color} size={16} />
        ))}
        <span className="serif tabnum" style={{ fontSize: 15 }}>
          {name} bought stock — ${cost.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
