import { useEffect } from 'react';
import type { PlayerView, Seat } from '@boomtown/engine';
import { soundManager } from '../../audio/soundManager.js';
import { useReducedMotion } from '../useReducedMotion.js';
import styles from '../beats.module.css';
import { copy, fill } from '../../copy/copy.js';
import { listOf } from '../../game/story.js';

const m = copy.beats.motion;

const HOLD_MS = 3000;

/**
 * How a motion to liquidate settled (#26). One beat for both outcomes, because
 * they are the same moment read two ways: the table either just ended the game
 * by vote, or it just refused to — and the refusal is the one with a price, so
 * it gets the same weight on screen rather than a quieter treatment.
 *
 * A carried motion is followed straight away by the victory beat, so this one
 * is deliberately short: it exists to explain *why* the game ended, ahead of
 * the reveal that shows what that was worth.
 *
 * No sound on a failed motion. The endgame cue would be a lie (nothing ended)
 * and the alternatives all read as a fanfare for a defeat; the silence after
 * the vote is the point.
 */
export function MotionBeat({
  carried,
  backers,
  yes,
  total,
  view,
  dismiss,
}: {
  carried: boolean;
  backers: readonly Seat[];
  yes: number;
  total: number;
  view: PlayerView;
  dismiss: () => void;
}) {
  const reduced = useReducedMotion();
  const name = (seat: Seat) => view.seats[seat]?.name ?? fill(copy.common.playerFallback, { n: seat + 1 });

  useEffect(() => {
    if (carried) soundManager.play('endgame');
    const t = window.setTimeout(dismiss, reduced ? HOLD_MS * 0.34 : HOLD_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return (
    <div
      className={styles.curtain}
      role="dialog"
      aria-label={carried ? m.carriedLabel : m.failedLabel}
      onClick={dismiss}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14 }}>
        <div className={styles.kicker}>{m.kicker}</div>
        <div className={`serif ${reduced ? '' : styles.rise}`} style={{ fontSize: 64, marginTop: 6 }}>
          {carried ? m.carries : m.fails}
        </div>
        <div className={`serif tabnum`} style={{ fontSize: 20, color: '#d8cfc3' }}>
          {fill(m.sharesInFavour, { yes, total })}
        </div>
        <div style={{ fontSize: 14, color: '#b8ac9f', maxWidth: '52ch', lineHeight: 1.55 }}>
          {carried ? (
            <>{m.carriedNote}</>
          ) : backers.length > 0 ? (
            <>
              {fill(backers.length === 1 ? m.backersOne : m.backersMany, {
                names: listOf(backers.map(name)),
              })}
            </>
          ) : (
            <>{m.continues}</>
          )}
        </div>
      </div>
      <span className={styles.hint}>{copy.beats.hint}</span>
    </div>
  );
}

/** "Ana", "Ana and Ben", "Ana, Ben and Cy". */

