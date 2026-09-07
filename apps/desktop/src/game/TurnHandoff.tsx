import { activeView } from '@boomtown/client-core';
import type { Seat } from '@boomtown/engine';
import { useGameState, useLocalSeats } from '../client/GameClientProvider.js';
import { useHotSeat } from './HotSeatContext.js';
import type { GameConfig } from '../setup/gameConfig.js';
import styles from './turnHandoff.module.css';

/**
 * Hot‑seat needs an unmistakable turn boundary — otherwise the rack quietly
 * swapping to the next player's six tiles reads as "my hand reset". This is an
 * opaque interstitial: the incoming player confirms before the board (and the
 * previous player's remaining tiles) are shown.
 *
 * It steps aside while a decision prompt is open — `DecisionModal` (a Radix
 * modal that would render this inert behind it) owns the hand-off during a
 * merger step or a founding. Everywhere else — a plain turn pass, and the buy
 * step after a merger where someone else disposed — this hands the machine
 * *back* to the active seat. Both components share `useHotSeat`'s holder.
 */
export function TurnHandoff({ config }: { config: GameConfig }) {
  const view = useGameState(activeView);
  const decisionSeat = useGameState((state) => state.pendingDecision?.seat ?? null);
  const local = useLocalSeats();
  const over = useGameState((state) => state.status === 'over');
  const { claim, needsHandoff } = useHotSeat();

  // a decision prompt (merger step, or the founding choice) owns the screen
  const promptOpen =
    (decisionSeat != null && local.includes(decisionSeat)) ||
    (view?.step === 'found' && view.pendingFound != null);

  const actor: Seat | null = decisionSeat ?? view?.activeSeat ?? null;

  if (over || promptOpen || actor === null || !needsHandoff(actor)) return null;
  if (config.seats[actor]?.kind !== 'human') return null; // bots don't pass the machine

  const name = view?.seats[actor]?.name ?? `Player ${actor + 1}`;

  return (
    <div className={styles.overlay} role="dialog" aria-label="Turn handoff">
      <div className={styles.card}>
        <p className={styles.kicker}>Hand the machine to</p>
        <h2 className="serif">{name}</h2>
        <p className={styles.hint}>Only {name} should see the next screen.</p>
        <button type="button" className={styles.ready} onClick={() => claim(actor)}>
          I&rsquo;m {name} — show my turn
        </button>
      </div>
    </div>
  );
}
