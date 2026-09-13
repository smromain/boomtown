import { useEffect, useMemo, useRef, useState } from 'react';
import type { Industry, PlayerView } from '@boomtown/engine';
import { INDUSTRY_INFO, displayName } from '@boomtown/engine';
import { tierWord, type MergerStory } from '../../game/story.js';
import { soundManager } from '../../audio/soundManager.js';
import { useReducedMotion } from '../useReducedMotion.js';
import styles from '../beats.module.css';

/**
 * The staged sequence (F1): each stage gets room to read before the next lands,
 * rather than the whole climax arriving at once.
 *
 * **One pass per absorption.** A merger of three or more corporations eats them
 * one at a time, largest first, each fully resolved before the next — and this
 * beat used to show none of that. It collided every defunct name into a single
 * "+", blended only `defunct[0]`'s colour, and printed one flattened bonus list,
 * so a three-way merger was indistinguishable from a two-way. The sequence the
 * engine had carefully performed was invisible, which read at the table as the
 * same thing happening twice.
 *
 * Now the collide/blend/bonus trio repeats per chain, in resolution order, and
 * the survivor's name on the left of each collide is the name *as it stood
 * before that absorption* — so accretion is watched rather than inferred. Only
 * the final name, the new mass and the settle happen once, at the end.
 *
 * A single-chain merger keeps its original timings exactly (~16.6s). Extra
 * chains are tighter, because the pass is repeated and the whole thing still
 * has to finish inside `BeatContext`'s 30s watchdog: four corporations meeting
 * at one tile is the most the board allows, so three chains — ~24s — is the
 * worst case.
 */
type StageKind = 'collide' | 'blend' | 'bonus' | 'name' | 'mass' | 'settle';
interface Stage {
  readonly kind: StageKind;
  readonly ms: number;
  /** Which absorption this stage belongs to; absent on the shared tail. */
  readonly chain?: number;
}

const SOLO = { collide: 1400, blend: 1800, bonus: 4400 };
const MULTI = { collide: 1200, blend: 1500, bonus: 2600 };
const TAIL: readonly Stage[] = [
  { kind: 'name', ms: 2400 },
  { kind: 'mass', ms: 3000 },
  { kind: 'settle', ms: 3600 },
];

/**
 * Takes the chains rather than a count so a chain that paid nobody can skip its
 * bonus stage — holding the screen for four seconds on an empty figure is how
 * this beat felt padded on a merger where nobody held the dead stock.
 */
export function stagesFor(chains: readonly { readonly bonuses: readonly unknown[] }[]): Stage[] {
  const list = chains.length > 0 ? chains : [{ bonuses: [] }];
  const per = list.length > 1 ? MULTI : SOLO;
  const passes = list.flatMap((c, chain) => [
    { kind: 'collide' as const, ms: per.collide, chain },
    { kind: 'blend' as const, ms: per.blend, chain },
    ...(c.bonuses.length > 0 ? [{ kind: 'bonus' as const, ms: per.bonus, chain }] : []),
  ]);
  return [...passes, ...TAIL];
}

const REDUCED_HOLD_MS = 1600;

/**
 * F1, the load-bearing moment — the climax overlay only (see `beatTriggers.ts`
 * for why this fires on `merger-completed`, not `merger-started`, and why it
 * does not replace `StoryCard`'s survivor/disposal narration).
 */
export function MergerBeat({ merger, view, dismiss }: { merger: MergerStory; view: PlayerView; dismiss: () => void }) {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  const stages = useMemo(() => stagesFor(merger.chains), [merger.chains]);
  const index = reduced ? stages.length - 1 : Math.min(stage, stages.length - 1);
  const at = stages[index]!;
  const firstIndexOf = (kind: StageKind) => stages.findIndex((s) => s.kind === kind);
  const past = (kind: StageKind): boolean => reduced || firstIndexOf(kind) <= index;

  const survivor = merger.survivor ? view.corporations[merger.survivor] : null;
  const survivorColor = merger.survivor ? INDUSTRY_INFO[merger.survivor].color : '#faf6f0';
  const survivorBase = survivor?.baseName ?? '';

  const chain = at.chain ?? merger.chains.length - 1;
  const defunctOf = (k: number): Industry | null => merger.chains[k]?.defunct ?? null;
  const activeDefunct = defunctOf(chain);
  const defunctColor = activeDefunct ? INDUSTRY_INFO[activeDefunct].color : survivorColor;

  /**
   * The survivor's name as it stood *before* absorption `k` — base name plus
   * everything eaten up to that point. Rebuilt from base names, so a defunct
   * chain that had itself already eaten something contributes its base rather
   * than its own accreted name; the final name at the `name` stage comes from
   * the view and is always exact.
   */
  const nameBefore = (k: number): string =>
    displayName(
      survivorBase,
      merger.chains.slice(0, k).map((c) => ({
        displayName: view.corporations[c.defunct].baseName,
        flavours: [],
      })),
      view.ruleset.mergeNaming,
    );

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
    const current = stages[stage];
    if (!current) return;
    timer.current = window.setTimeout(() => {
      if (stage + 1 >= stages.length) dismiss();
      else setStage(stage + 1);
    }, current.ms);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, reduced, stages]);

  const advance = (): void => {
    if (reduced) return;
    window.clearTimeout(timer.current);
    if (stage + 1 >= stages.length) dismiss();
    else setStage(stage + 1);
  };

  const multi = merger.chains.length > 1;
  const bonusLines = reduced ? merger.bonuses : (merger.chains[chain]?.bonuses ?? []);

  return (
    <div className={styles.curtain} role="dialog" aria-label="Merger" onClick={advance}>
      <div
        className={styles.curtainGlow}
        style={{ background: `radial-gradient(50% 50% at 50% 50%, color-mix(in srgb, ${survivorColor} 30%, transparent) 0%, transparent 72%)` }}
      />
      <div style={{ position: 'relative', width: 860, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div className={styles.kicker}>
          merger at {merger.placedTile}
          {multi && !past('name') && ` · absorption ${chain + 1} of ${merger.chains.length}`}
        </div>
        <div className={styles.rule} />

        {/* collide: the surviving name so far leans into the chain being eaten. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 40,
            overflow: 'hidden',
            height: at.kind === 'collide' ? 64 : 0,
            opacity: at.kind === 'collide' ? 1 : 0,
            marginTop: at.kind === 'collide' ? 30 : 0,
            transition: 'all 420ms ease',
          }}
        >
          <span className="serif" style={{ fontSize: 30, color: survivorColor }}>
            {nameBefore(chain)}
          </span>
          <span style={{ fontSize: 22, color: survivorColor }}>+</span>
          <span className="serif" style={{ fontSize: 30, color: '#9c9086' }}>
            {activeDefunct ? view.corporations[activeDefunct].baseName : ''}
          </span>
        </div>

        {/* blend: this chain's colour crosses into the survivor's. */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            height: at.kind === 'blend' ? 90 : 0,
            opacity: at.kind === 'blend' ? 1 : 0,
            marginTop: at.kind === 'blend' ? 26 : 0,
            transition: 'height 320ms ease, opacity 260ms ease, margin-top 320ms ease',
          }}
        >
          <div
            style={{ width: 68, height: 68, borderRadius: '50%', marginRight: -18, background: survivorColor, boxShadow: '0 14px 26px -8px rgba(0,0,0,.55)', animation: at.kind === 'blend' ? `${styles.blendSlideL} 1200ms ease-in-out both` : undefined }}
          />
          <div
            style={{ width: 68, height: 68, borderRadius: '50%', marginLeft: -18, background: defunctColor, boxShadow: '0 14px 26px -8px rgba(0,0,0,.55)', animation: at.kind === 'blend' ? `${styles.blendSlideR} 1200ms ease-in-out both` : undefined }}
          />
          <div
            style={{
              position: 'absolute',
              width: 76,
              height: 76,
              borderRadius: '50%',
              background: `color-mix(in srgb, ${survivorColor} 58%, ${defunctColor})`,
              boxShadow: `0 0 46px color-mix(in srgb, ${survivorColor} 45%, transparent)`,
              opacity: at.kind === 'blend' ? undefined : 0,
              animation: at.kind === 'blend' ? `${styles.blendPulse} 1200ms cubic-bezier(0.2,0.9,0.2,1) 260ms both` : undefined,
            }}
          />
        </div>

        {/* bonus: what *this* chain paid, and to how many seats. */}
        {bonusLines.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 76,
              marginTop: at.kind === 'bonus' || reduced ? 40 : 0,
              height: at.kind === 'bonus' || reduced ? 164 : 0,
              opacity: at.kind === 'bonus' || reduced ? 1 : 0,
              overflow: 'hidden',
              transition: 'all 460ms ease',
            }}
          >
            {bonusLines.map((bonus, i) => (
              <div
                key={`${chain}:${i}`}
                style={{ textAlign: 'left' }}
                className={at.kind === 'bonus' && !reduced ? styles.rise : undefined}
              >
                <span className={styles.kicker}>
                  {activeDefunct && multi ? `${view.corporations[activeDefunct].baseName} · ` : ''}
                  {tierWord(bonus.tier, view.ruleset.bonusTiers)}
                </span>
                <span className="serif tabnum" style={{ display: 'block', fontSize: 56, lineHeight: 1.05, marginTop: 6, letterSpacing: '-0.03em' }}>
                  ${bonus.amount.toLocaleString()}
                  {bonus.seats.length > 1 ? <span style={{ fontSize: 22, marginLeft: 8, opacity: 0.7 }}>each</span> : null}
                </span>
                {/* Who was actually paid. A seat count told you a bonus landed
                    somewhere; the point of watching a merger is knowing who it
                    landed on. */}
                <span style={{ display: 'block', marginTop: 8, fontSize: 15, color: '#c9bfb2', maxWidth: 260 }}>
                  {bonus.seats.map((seat) => view.seats[seat]?.name ?? `Seat ${seat + 1}`).join(', ')}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* name: the fully accreted name arrives at scale, once. */}
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
          <p>The name grows with every company it consumes.</p>
          <p>Your shares in it stay yours but remember:</p>
          <p><b>the belly of capitalism is never full.</b></p>
        </div>

        {/* mass: the blocks consolidate into one wider block. */}
        <div
          data-mass-row
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: past('mass') ? 0 : 26,
            marginTop: past('mass') ? 34 : 0,
            height: past('mass') ? 76 : 0,
            opacity: past('mass') ? 1 : 0,
            overflow: 'visible',
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
          {/* One block per absorption, so the count in the caption is something
              you watched happen rather than something you are told. */}
          {merger.chains.map((absorbed, k) => {
            const color = INDUSTRY_INFO[absorbed.defunct].color;
            return (
              <div
                key={absorbed.defunct}
                data-mass-block={absorbed.defunct}
                style={{
                  width: past('settle') ? 0 : 120 / Math.max(1, merger.chains.length),
                  height: 44,
                  background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 50%, #1c1917))`,
                  opacity: past('settle') ? 0 : 0.55,
                  boxShadow: `0 6px 0 color-mix(in srgb, ${color} 40%, #1c1917)`,
                  transition: `all 700ms cubic-bezier(0.16,0.9,0.2,1) ${260 + k * 120}ms`,
                }}
              />
            );
          })}
        </div>

        {/* The caption is a sibling of the blocks, not a child of them: inside
            that flex row it was sized by the blocks, so as they collapsed at
            the settle its own box collapsed with them and the sentence wrapped
            into a column. It belongs to the whole beat, so it gets the beat's
            width. */}
        <div
          data-mass-caption
          className={styles.kicker}
          style={{
            alignSelf: 'stretch',
            marginTop: past('mass') ? 26 : 0,
            color: '#8a8076',
            opacity: past('mass') ? 1 : 0,
            transition: 'opacity 400ms ease 700ms, margin-top 620ms cubic-bezier(0.16,0.9,0.2,1)',
          }}
        >
          {survivor?.size ?? 0} tiles under one name
          {multi ? ` · ${merger.chains.length} companies eaten` : ''}
        </div>
      </div>
      <span className={styles.hint}>click or press space to advance · esc to skip the rest</span>
    </div>
  );
}
