import { useEffect } from 'react';
import { soundManager } from '../../audio/soundManager.js';
import { useReducedMotion } from '../useReducedMotion.js';
import styles from '../beats.module.css';

const HOLD_MS = 1400;

/** The first tile placed in the game (R6) — a note on the board, not its own screen (U3's approach). */
export function FirstTileBeat({ dismiss }: { dismiss: () => void }) {
  const reduced = useReducedMotion();

  useEffect(() => {
    soundManager.play('first-tile');
    const t = window.setTimeout(dismiss, reduced ? 0 : HOLD_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  if (reduced) return null;

  return (
    <div className={styles.flourish} style={{ top: '18%', left: '50%', transform: 'translateX(-50%)' }} role="status">
      <div
        className={styles.kicker}
        style={{
          background: 'var(--chrome-bg)',
          color: '#d98a4e',
          borderRadius: 20,
          padding: '10px 20px',
          boxShadow: 'var(--elev-3)',
        }}
      >
        the board is open
      </div>
    </div>
  );
}
