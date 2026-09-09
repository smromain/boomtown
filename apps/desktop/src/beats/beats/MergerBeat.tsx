import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '@boomtown/engine';
import { INDUSTRY_INFO } from '@boomtown/engine';
import type { MergerStory } from '../../game/story.js';
import { soundManager } from '../../audio/soundManager.js';
import { useReducedMotion } from '../useReducedMotion.js';
import styles from '../beats.module.css';

/**
 * The staged sequence (F1): each stage gets room to read before the next
 * lands, rather than the whole climax arriving at once. Timings are 2x the
 * handoff's own Direction D prototype (~18.2s full sequence) — more breathing
 * room to actually read each stage. Reduced motion collapses straight to the
 * settled name + bonuses for a short, dismissible hold — it does not run the
 * choreography (R8, still communicates via the still-frame).
 */
const STAGES = [
  { id: 'collide', ms: 2400 },
  { id: 'blend', ms: 2800 },
  { id: 'name', ms: 4400 },
  { id: 'mass', ms: 3000 },
  { id: 'bonus', ms: 4400 },
  { id: 'settle', ms: 2600 },
] as const;

const REDUCED_HOLD_MS = 1600;

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * F1, the load-bearing moment — the climax overlay only (see `beatTriggers.ts`
 * for why this fires on `merger-completed`, not `merger-started`, and why it
 * does not replace `StoryCard`'s survivor/disposal narration). Two names
 * collide, blend into one colour, and the accreted name arrives at scale
 * before the bonuses land under it.
 */
export function MergerBeat({ merger, view, dismiss }: { merger: MergerStory; view: PlayerView; dismiss: () => void }) {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  const survivor = merger.survivor ? view.corporations[merger.survivor] : null;
  const survivorColor = merger.survivor ? INDUSTRY_INFO[merger.survivor].color : '#faf6f0';
  const defunctColor = merger.defunct[0] ? INDUSTRY_INFO[merger.defunct[0]].color : survivorColor;
  const survivorBase = merger.survivor ? view.corporations[merger.survivor].baseName : '';
  const defunctNames = joinNames(merger.defunct.map((industry) => view.corporations[industry].baseName));

  useEffect(() => {
    soundManager.play('merger');
    if (reduced) {
      const t = window.setTimeout(dismiss, REDUCED_HOLD_MS);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // Auto-advance through the stages on a timer; a click jumps straight to the
  // next one (R8 — bounded and skippable). The last stage's timer dismisses.
  useEffect(() => {
    if (reduced) return;
    const current = STAGES[stage];
    if (!current) return;
    timer.current = window.setTimeout(() => {
      if (stage + 1 >= STAGES.length) dismiss();
      else setStage(stage + 1);
    }, current.ms);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, reduced]);

  const advance = (): void => {
    if (reduced) return;
    window.clearTimeout(timer.current);
    if (stage + 1 >= STAGES.length) dismiss();
    else setStage(stage + 1);
  };

  const stageId = reduced ? 'settle' : (STAGES[stage]?.id ?? 'settle');
  const past = (id: (typeof STAGES)[number]['id']): boolean => {
    if (reduced) return true;
    return STAGES.findIndex((s) => s.id === id) <= stage;
  };

  return (
    <div className={styles.curtain} role="dialog" aria-label="Merger" onClick={advance}>
      <div
        className={styles.curtainGlow}
        style={{ background: `radial-gradient(50% 50% at 50% 50%, color-mix(in srgb, ${survivorColor} 30%, transparent) 0%, transparent 72%)` }}
      />
      <div style={{ position: 'relative', width: 860, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div className={styles.kicker}>merger at {merger.placedTile}</div>
        <div className={styles.rule} />

        {/* Stage 1 — collide: the two names lean into the placed tile. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 40,
            overflow: 'hidden',
            height: stageId === 'collide' ? 64 : 0,
            opacity: stageId === 'collide' ? 1 : 0,
            marginTop: stageId === 'collide' ? 30 : 0,
            transition: 'all 420ms ease',
          }}
        >
          <span className="serif" style={{ fontSize: 30, color: survivorColor }}>
            {survivorBase}
          </span>
          <span style={{ fontSize: 22, color: survivorColor }}>+</span>
          <span className="serif" style={{ fontSize: 30, color: '#9c9086' }}>
            {defunctNames}
          </span>
        </div>

        {/* Stage 2 — blend: the two industry colours cross into one. */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            height: stageId === 'blend' ? 90 : 0,
            opacity: stageId === 'blend' ? 1 : 0,
            marginTop: stageId === 'blend' ? 26 : 0,
            transition: 'height 320ms ease, opacity 260ms ease, margin-top 320ms ease',
          }}
        >
          <div
            style={{ width: 68, height: 68, borderRadius: '50%', marginRight: -18, background: survivorColor, boxShadow: '0 14px 26px -8px rgba(0,0,0,.55)', animation: stageId === 'blend' ? `${styles.blendSlideL} 1200ms ease-in-out both` : undefined }}
          />
          <div
            style={{ width: 68, height: 68, borderRadius: '50%', marginLeft: -18, background: defunctColor, boxShadow: '0 14px 26px -8px rgba(0,0,0,.55)', animation: stageId === 'blend' ? `${styles.blendSlideR} 1200ms ease-in-out both` : undefined }}
          />
          <div
            style={{
              position: 'absolute',
              width: 76,
              height: 76,
              borderRadius: '50%',
              background: `color-mix(in srgb, ${survivorColor} 58%, ${defunctColor})`,
              boxShadow: `0 0 46px color-mix(in srgb, ${survivorColor} 45%, transparent)`,
              opacity: stageId === 'blend' ? undefined : 0,
              animation: stageId === 'blend' ? `${styles.blendPulse} 1200ms cubic-bezier(0.2,0.9,0.2,1) 260ms both` : undefined,
            }}
          />
        </div>

        {/* Stage 3 — name: the accreted name arrives at scale. */}
        <div
          className={past('name') && !past('mass') ? styles.bigName : undefined}
          style={{
            fontSize: past('name') ? 96 : 0,
            lineHeight: 1.05,
            letterSpacing: '-0.035em',
            marginTop: past('name') ? 18 : 0,
            opacity: past('name') ? 1 : 0,
            textShadow: `0 0 60px color-mix(in srgb, ${survivorColor} 45%, transparent)`,
            transition: 'opacity 420ms ease, font-size 520ms cubic-bezier(0.16,0.9,0.2,1), margin-top 420ms ease',
          }}
        >
          {survivor?.displayName ?? '…'}
        </div>
        <div
          style={{
            maxWidth: '46ch',
            fontSize: 13,
            lineHeight: 1.55,
            color: '#9c9086',
            marginTop: past('name') ? 14 : 0,
            opacity: past('name') ? 1 : 0,
            overflow: 'hidden',
            transition: 'opacity 420ms ease 400ms, margin-top 400ms ease',
          }}
        >
          Its name grows with a piece of every company it takes over. Your shares in it stay yours.
        </div>

        {/* Stage 4 — mass: the two blocks consolidate into one wider block. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: past('mass') ? 0 : 26,
            marginTop: past('mass') ? 34 : 0,
            height: past('mass') ? 76 : 0,
            opacity: past('mass') ? 1 : 0,
            overflow: 'visible',
            position: 'relative',
            transition: 'all 620ms cubic-bezier(0.16,0.9,0.2,1)',
          }}
        >
          <div
            style={{
              width: past('mass') ? 240 : 150,
              height: 54,
              background: `linear-gradient(160deg, color-mix(in srgb, ${survivorColor} 84%, #fff), ${survivorColor})`,
              boxShadow: `0 8px 0 color-mix(in srgb, ${survivorColor} 46%, #1c1917), 0 20px 30px -10px rgba(0,0,0,.7)`,
              transition: 'width 700ms cubic-bezier(0.16,0.9,0.2,1) 180ms',
            }}
          />
          <div
            style={{
              width: past('bonus') ? 0 : 120,
              height: 44,
              background: `linear-gradient(160deg, ${defunctColor}, color-mix(in srgb, ${defunctColor} 50%, #1c1917))`,
              opacity: past('bonus') ? 0 : 0.55,
              boxShadow: `0 6px 0 color-mix(in srgb, ${defunctColor} 40%, #1c1917)`,
              transition: 'all 700ms cubic-bezier(0.16,0.9,0.2,1) 260ms',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: -26,
              fontSize: 10,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#6f665d',
              opacity: past('mass') ? 1 : 0,
              transition: 'opacity 400ms ease 700ms',
            }}
          >
            {survivor?.size ?? 0} tiles under one name
          </div>
        </div>

        {/* Stage 5 — bonus: bonuses land as headline figures. */}
        {merger.bonuses.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 76,
              marginTop: past('bonus') ? 46 : 0,
              height: past('bonus') ? 128 : 0,
              opacity: past('bonus') ? 1 : 0,
              overflow: 'hidden',
              transition: 'all 460ms ease',
            }}
          >
            {merger.bonuses.map((bonus, i) => (
              <div
                key={i}
                style={{ textAlign: 'left' }}
                className={past('bonus') && !reduced ? styles.rise : undefined}
              >
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
      <span className={styles.hint}>click or press space to advance · esc to skip the rest</span>
    </div>
  );
}
