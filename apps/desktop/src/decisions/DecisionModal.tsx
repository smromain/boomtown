import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { localActiveView } from '@boomtown/client-core';
import type { Seat } from '@boomtown/engine';
import { useGameState, useLocalSeats } from '../client/GameClientProvider.js';
import { DefunctOrderPrompt } from './DefunctOrderPrompt.js';
import { DisposalPrompt } from './DisposalPrompt.js';
import { FoundPrompt } from './FoundPrompt.js';
import { SurvivorPrompt } from './SurvivorPrompt.js';
import styles from './decisions.module.css';

/**
 * The one modal that surfaces every decision the engine can raise for a seat
 * **a local player controls**: the founding choice, and each merger step. A
 * decision the engine addresses to a bot (or, online, a remote player) never
 * opens this — that seat's driver answers it. Every prompt offers only its
 * legal options (KTD3); the engine remains the authority.
 *
 * Hot-seat privacy: when a merger decision is owed by a seat *other than* the
 * one who last acted (the mergemaker, or the previous disposer), the modal
 * first shows an opaque "hand the machine to {name}" screen — otherwise
 * whoever is sitting there would see that player's holdings and make their
 * call. The hand-off is the modal's own content, so it is always interactive
 * (an interstitial rendered outside the Radix portal is inert behind it).
 */
export function DecisionModal() {
  const local = useLocalSeats();
  const decision = useGameState((state) =>
    state.pendingDecision && local.includes(state.pendingDecision.seat) ? state.pendingDecision : null,
  );
  const view = useGameState((state) => localActiveView(state, local));
  const activeSeat = useGameState((state) => state.activeSeat);
  const seatName = (seat: number) => view?.seats[seat]?.name ?? `Player ${seat + 1}`;
  const needsFound = view?.step === 'found' && view.pendingFound != null;
  const open = decision != null || needsFound;

  // The seat the machine is currently claimed for. Seeded from the active seat
  // when a decision flow opens (the mergemaker / founder never needs to claim),
  // advanced as each player confirms, and cleared when the flow ends.
  const [claimedFor, setClaimedFor] = useState<Seat | null>(null);
  useEffect(() => {
    if (!open) {
      setClaimedFor(null);
      return;
    }
    setClaimedFor((prev) => (prev == null ? (activeSeat ?? null) : prev));
  }, [open, activeSeat]);

  // the seat that must act now
  const owedSeat: Seat | null = decision?.seat ?? (needsFound ? view!.you : null);
  const needsHandoff = owedSeat != null && claimedFor != null && owedSeat !== claimedFor;

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className={needsHandoff ? styles.overlayOpaque : styles.overlay} />
        <Dialog.Content
          className={styles.content}
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title className={styles.srOnly}>Game decision</Dialog.Title>

          {needsHandoff && owedSeat != null ? (
            <div className={styles.handoff}>
              <p className={styles.handoffKicker}>Hand the machine to</p>
              <h2 className="serif">{seatName(owedSeat)}</h2>
              <p className={styles.handoffHint}>
                Only {seatName(owedSeat)} should see the next screen — it shows their holdings.
              </p>
              <button
                type="button"
                className={styles.handoffReady}
                onClick={() => setClaimedFor(owedSeat)}
              >
                I&rsquo;m {seatName(owedSeat)} — show my decision
              </button>
            </div>
          ) : (
            <>
              {decision?.type === 'choose-survivor' && <SurvivorPrompt decision={decision} />}
              {decision?.type === 'choose-defunct-order' && <DefunctOrderPrompt decision={decision} />}
              {decision?.type === 'dispose-shares' && <DisposalPrompt decision={decision} />}
              {!decision && needsFound && view.pendingFound && <FoundPrompt group={view.pendingFound.group} />}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
