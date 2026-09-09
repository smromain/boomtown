import { useEffect } from 'react';
import type { PlayerView } from '@boomtown/engine';
import { INDUSTRY_INFO } from '@boomtown/engine';
import type { MergerStory } from '../../game/story.js';
import { soundManager } from '../../audio/soundManager.js';
import { useReducedMotion } from '../useReducedMotion.js';
import styles from '../beats.module.css';

const HOLD_MS = 4200;

/**
 * F1, the load-bearing moment — the climax overlay only (see `beatTriggers.ts`
 * for why this fires on `merger-completed`, not `merger-started`, and why it
 * does not replace `StoryCard`'s survivor/disposal narration). The accreted
 * name arrives at scale, cream on ink, with the bonuses landing under it.
 */
export function MergerBeat({ merger, view, dismiss }: { merger: MergerStory; view: PlayerView; dismiss: () => void }) {
  const reduced = useReducedMotion();
  const survivor = merger.survivor ? view.corporations[merger.survivor] : null;
  const survivorColor = merger.survivor ? INDUSTRY_INFO[merger.survivor].color : '#faf6f0';

  useEffect(() => {
    soundManager.play('merger');
    const t = window.setTimeout(dismiss, reduced ? HOLD_MS * 0.34 : HOLD_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return (
    <div className={styles.curtain} role="dialog" aria-label="Merger" onClick={dismiss}>
      <div
        className={styles.curtainGlow}
        style={{ background: `radial-gradient(50% 50% at 50% 50%, color-mix(in srgb, ${survivorColor} 30%, transparent) 0%, transparent 72%)` }}
      />
      <div style={{ position: 'relative', width: 860, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div className={styles.kicker}>merger at {merger.placedTile}</div>
        <div className={styles.rule} />
        <div className={`serif ${reduced ? '' : styles.bigName}`} style={reduced ? { fontSize: 96, marginTop: 18 } : undefined}>
          {survivor?.displayName ?? '…'}
        </div>
        <div style={{ maxWidth: '46ch', fontSize: 13, lineHeight: 1.55, color: '#9c9086', marginTop: 14 }}>
          Its name grows with a piece of every company it takes over. Your shares in it stay yours.
        </div>
        {merger.bonuses.length > 0 && (
          <div className={reduced ? undefined : styles.rise} style={{ display: 'flex', gap: 76, marginTop: 46 }}>
            {merger.bonuses.map((bonus, i) => (
              <div key={i} style={{ textAlign: 'left' }}>
                <span className={styles.kicker}>
                  {bonus.seats.length} seat{bonus.seats.length > 1 ? 's' : ''} · {bonus.tier}
                </span>
                <span className="serif tabnum" style={{ display: 'block', fontSize: 56, lineHeight: 1.05, marginTop: 6, letterSpacing: '-0.03em' }}>
                  ${bonus.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <span className={styles.hint}>click or press space to advance</span>
    </div>
  );
}
