import { useEffect } from 'react';
import type { Industry, PlayerView } from '@boomtown/engine';
import { INDUSTRY_INFO } from '@boomtown/engine';
import { IndustryMark } from '../../game/marks.js';
import { soundManager } from '../../audio/soundManager.js';
import { useReducedMotion } from '../useReducedMotion.js';
import styles from '../beats.module.css';

const HOLD_MS = 3000;

/** F2-adjacent beat: a corporation is founded (R6). The plinth-and-panel still-frame from Beats.dc.html (U3). */
export function FoundingBeat({
  industry,
  view,
  dismiss,
}: {
  industry: Industry;
  view: PlayerView;
  dismiss: () => void;
}) {
  const reduced = useReducedMotion();
  const corp = view.corporations[industry];
  const { color, ink } = INDUSTRY_INFO[industry];

  useEffect(() => {
    soundManager.play('founding');
    const t = window.setTimeout(dismiss, reduced ? HOLD_MS * 0.34 : HOLD_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return (
    <div className={styles.curtain} role="dialog" aria-label="A corporation is founded" onClick={dismiss}>
      <div
        className={styles.curtainGlow}
        style={{ background: `radial-gradient(50% 50% at 50% 50%, color-mix(in srgb, ${color} 30%, transparent) 0%, transparent 72%)` }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 56 }}>
        <div
          className={reduced ? undefined : styles.rise}
          style={{
            width: 150,
            height: 216,
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `linear-gradient(165deg, color-mix(in srgb, ${color} 84%, #fff), ${color} 55%, color-mix(in srgb, ${color} 48%, #1c1917))`,
            boxShadow: '0 40px 70px -20px rgba(0,0,0,.7), inset 0 2px 0 rgba(255,255,255,.3)',
          }}
        >
          <IndustryMark industry={industry} color={ink} size={54} />
        </div>
        <div className={reduced ? undefined : styles.rise} style={{ width: 470 }}>
          <div className={styles.kicker}>a corporation is founded</div>
          <div className={styles.rule} />
          <div className="serif" style={{ fontSize: 60, lineHeight: 1.1, marginTop: 12 }}>
            {corp.baseName}
          </div>
          <div style={{ fontSize: 14, color: '#b8ac9f', marginTop: 10, maxWidth: '34ch' }}>{corp.flavour}</div>
          <div style={{ display: 'flex', gap: 38, marginTop: 26, paddingTop: 18, borderTop: '1px solid var(--chrome-rule)' }}>
            <BeatStat label="headquarters" value={corp.hqTile ?? '—'} />
            <BeatStat label="opening price" value={corp.sharePrice != null ? `$${corp.sharePrice}` : '—'} />
            <BeatStat label="founder" value="+1 share" color="#d98a4e" />
          </div>
        </div>
      </div>
      <span className={styles.hint}>click or press space</span>
    </div>
  );
}

function BeatStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span className={styles.kicker} style={{ letterSpacing: '0.16em' }}>
        {label}
      </span>
      <span className="serif" style={{ fontSize: 22, color: color ?? 'var(--chrome-ink)' }}>
        {value}
      </span>
    </span>
  );
}
