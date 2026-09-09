import { activeView } from '@boomtown/client-core';
import type { Seat } from '@boomtown/engine';
import { useGameState, useLocalSeats } from '../client/GameClientProvider.js';
import { useHotSeat } from './HotSeatContext.js';
import { useActiveBeat } from '../beats/BeatContext.js';
import { coversTheScreen } from '../beats/beatTriggers.js';
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
 *
 * It also steps aside while a beat that covers the screen is active. A
 * table-level beat (founding, merger, endgame, victory) shows nothing private
 * — it's meant for whoever is watching, before anyone claims the machine — so
 * it must play in full first. Without this, a merger's climax and the next
 * hand-off could both mount at once, and this opaque, higher-stacked card
 * would silently hide the beat's entire animation behind itself.
 *
 * The buy-stock flourish is the exception, and standing down for it was a
 * privacy leak: it covers nothing, and the turn advances in the same tick it
 * starts, so the incoming seat's rack and legal moves were on show for the
 * whole hold. This card now appears immediately and the flourish floats above
 * it (`.aboveHandoff` in `beats.module.css`), so the buyer still gets their
 * confirmation over an opaque screen.
 */
export function TurnHandoff({ config }: { config: GameConfig }) {
  const view = useGameState(activeView);
  const decisionSeat = useGameState((state) => state.pendingDecision?.seat ?? null);
  const local = useLocalSeats();
  const over = useGameState((state) => state.status === 'over');
  const { claim, needsHandoff } = useHotSeat();
  const { active: activeBeat } = useActiveBeat();

  // a decision prompt (merger step, or the founding choice) owns the screen
  const promptOpen =
    (decisionSeat != null && local.includes(decisionSeat)) ||
    (view?.step === 'found' && view.pendingFound != null);

  const actor: Seat | null = decisionSeat ?? view?.activeSeat ?? null;

  const beatOwnsTheScreen = activeBeat != null && coversTheScreen(activeBeat);

  if (over || promptOpen || beatOwnsTheScreen || actor === null || !needsHandoff(actor)) return null;
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
