import { useEffect } from 'react';
import { INDUSTRIES, INDUSTRY_INFO, type PlayerView, type Seat } from '@boomtown/engine';
import { IndustryMark } from '../../game/marks.js';
import { soundManager } from '../../audio/soundManager.js';
import { useReducedMotion } from '../useReducedMotion.js';
import styles from '../beats.module.css';

const HOLD_MS = 2400;

/** The endgame trigger beat (R6): a table-level moment, fires for every seat. */
export function EndgameBeat({ seat, view, dismiss }: { seat: Seat; view: PlayerView; dismiss: () => void }) {
  const reduced = useReducedMotion();
  const who = view.seats[seat]?.name ?? `Player ${seat + 1}`;
  const active = INDUSTRIES.filter((industry) => view.corporations[industry].founded);

  useEffect(() => {
    soundManager.play('endgame');
    const t = window.setTimeout(dismiss, reduced ? HOLD_MS * 0.34 : HOLD_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return (
    <div className={styles.curtain} role="dialog" aria-label="The endgame is triggered" onClick={dismiss}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14 }}>
        <div className={styles.kicker}>the game is over</div>
        <div className={`serif ${reduced ? '' : styles.rise}`} style={{ fontSize: 64, marginTop: 6 }}>
          The endgame is triggered
        </div>
        <div style={{ fontSize: 14, color: '#b8ac9f', maxWidth: '52ch', lineHeight: 1.55 }}>
          {who} called the end, finishing their turn. No other player gets another turn — final scoring follows.
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 700 }}>
          {active.map((industry) => (
            <span
              key={industry}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                border: '1px solid var(--chrome-rule)',
                borderRadius: 20,
                padding: '8px 16px',
                fontSize: 12,
                color: '#d8cfc3',
              }}
            >
              <IndustryMark industry={industry} color={INDUSTRY_INFO[industry].color} size={16} />
              <span className="serif">{view.corporations[industry].displayName}</span>
            </span>
          ))}
        </div>
      </div>
      <span className={styles.hint}>click or press space</span>
    </div>
  );
}
