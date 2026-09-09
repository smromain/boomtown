import { useEffect } from 'react';
import type { PlayerView } from '@boomtown/engine';
import { Skyline } from '../../art/Skyline.js';
import { soundManager } from '../../audio/soundManager.js';
import styles from '../beats.module.css';

/**
 * The victory beat (R6, R13 — composes with the illustration): final
 * standings on the ink curtain, with the skyline behind it and the header's
 * own tagline as the closing line. No auto-timer — the game is over, so the
 * hold is only ever ended by the player (click / Space / Enter / Escape).
 */
export function VictoryBeat({ view, dismiss }: { view: PlayerView; dismiss: () => void }) {
  useEffect(() => {
    soundManager.play('victory');
  }, []);

  const result = view.result;
  if (!result) return null;
  const nameOf = (seat: number) => view.seats[seat]?.name ?? `Player ${seat + 1}`;
  const headline =
    result.winners.length > 1
      ? `${result.winners.map(nameOf).join(' & ')} tie`
      : `${nameOf(result.winners[0]!)} wins`;

  return (
    <div className={styles.curtain} role="dialog" aria-label="Victory" onClick={dismiss}>
      <Skyline tone="chrome" style={{ position: 'absolute', inset: 'auto 0 0 0', width: '100%', height: '40%', opacity: 0.45 }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 16 }}>
        <div className={styles.kicker}>game over</div>
        <div className="serif" style={{ fontSize: 76 }}>
          {headline}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 10, width: 420 }}>
          {result.rankings.map((row, i) => (
            <div
              key={row.seat}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '9px 4px',
                borderBottom: '1px solid #2b2621',
                color: i === 0 ? '#d98a4e' : '#b8ac9f',
              }}
            >
              <span className="serif" style={{ fontSize: 16 }}>
                {i + 1}. {nameOf(row.seat)}
              </span>
              <span className="tabnum" style={{ fontSize: 16 }}>
                ${row.total.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
        <div className={styles.kicker} style={{ marginTop: 18, color: '#6f665d' }}>
          seven start-ups, one skyline
        </div>
      </div>
      <span className={styles.hint}>click or press space to continue</span>
    </div>
  );
}
