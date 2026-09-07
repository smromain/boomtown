import { useEffect, useState } from 'react';
import { activeView } from '@boomtown/client-core';
import type { Seat } from '@boomtown/engine';
import { useGameState, useLocalSeats } from '../client/GameClientProvider.js';
import type { GameConfig } from '../setup/gameConfig.js';
import styles from './turnHandoff.module.css';

/**
 * Hot‑seat needs an unmistakable turn boundary — otherwise the rack quietly
 * swapping to the next player's six tiles reads as "my hand reset". This is an
 * opaque interstitial between turns: the incoming player confirms before the
 * board (and the previous player's remaining tiles) are shown.
 *
 * It steps aside while a decision prompt is open. `DecisionModal` is a Radix
 * modal — it marks the rest of the document `aria-hidden` and `pointer-events:
 * none`, so an interstitial rendered outside it would sit opaque and *inert*
 * over the prompt (a real hot-seat lock-up on a merger). During a merger step
 * or a founding, the prompt itself is the turn boundary — it names who acts.
 */
export function TurnHandoff({ config }: { config: GameConfig }) {
  const view = useGameState(activeView);
  const decisionSeat = useGameState((state) => state.pendingDecision?.seat ?? null);
  const local = useLocalSeats();
  const over = useGameState((state) => state.status === 'over');

  // a decision prompt (merger step, or the founding choice) owns the screen
  const promptOpen =
    (decisionSeat != null && local.includes(decisionSeat)) ||
    (view?.step === 'found' && view.pendingFound != null);

  const actor: Seat | null = decisionSeat ?? view?.activeSeat ?? null;

  const [ready, setReady] = useState<Seat | null>(null);
  useEffect(() => {
    if (ready === null && actor !== null) setReady(actor);
  }, [actor, ready]);

  if (over || promptOpen || actor === null || actor === ready) return null;
  if (config.seats[actor]?.kind !== 'human') return null; // bots don't pass the machine

  const name = view?.seats[actor]?.name ?? `Player ${actor + 1}`;

  return (
    <div className={styles.overlay} role="dialog" aria-label="Turn handoff">
      <div className={styles.card}>
        <p className={styles.kicker}>Hand the machine to</p>
        <h2 className="serif">{name}</h2>
        <p className={styles.hint}>Only {name} should see the next screen.</p>
        <button type="button" className={styles.ready} onClick={() => setReady(actor)}>
          I&rsquo;m {name} — show my turn
        </button>
      </div>
    </div>
  );
}
