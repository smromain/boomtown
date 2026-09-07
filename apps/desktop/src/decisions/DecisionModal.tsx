import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { localActiveView } from '@boomtown/client-core';
import type { Seat } from '@boomtown/engine';
import { useGameState, useLocalSeats } from '../client/GameClientProvider.js';
import { useHotSeat } from '../game/HotSeatContext.js';
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
 * Hot-seat privacy: when the decision is owed by a seat that isn't the one at
 * the machine (`useHotSeat`), the modal first shows an opaque "hand the machine
 * to {name}" screen — otherwise whoever is sitting there would see that
 * player's holdings and make their call. The hand-off is the modal's own
 * content, so it is always interactive (an interstitial rendered outside the
 * Radix portal is inert behind it).
 *
 * A founding choice can be **minimized** to a corner pill so the founder can
 * study the board before picking. While minimized the modal renders no Dialog
 * and no overlay at all — only the pill — so the board underneath is fully
 * interactive (a modal overlay would make it inert). The founding placement is
 * already committed to engine state, so peeking at the board is safe. Merger
 * steps cannot be minimized: they are sequenced and the board is mid-change.
 */
export function DecisionModal() {
  const local = useLocalSeats();
  const decision = useGameState((state) =>
    state.pendingDecision && local.includes(state.pendingDecision.seat) ? state.pendingDecision : null,
  );
  const view = useGameState((state) => localActiveView(state, local));
  const seatName = (seat: number) => view?.seats[seat]?.name ?? `Player ${seat + 1}`;
  const { claim, needsHandoff } = useHotSeat();
  const needsFound = view?.step === 'found' && view.pendingFound != null;
  const open = decision != null || needsFound;

  // the seat that must act now
  const owedSeat: Seat | null = decision?.seat ?? (needsFound ? view!.you : null);
  const handoff = needsHandoff(owedSeat);

  // minimize is founding-only, and never while a hand-off is owed
  const canMinimize = needsFound && !decision && !handoff;
  const [minimized, setMinimized] = useState(false);
  useEffect(() => {
    if (!canMinimize) setMinimized(false);
  }, [canMinimize]);

  if (open && minimized && canMinimize) {
    return (
      <button type="button" className={styles.minimizedPill} onClick={() => setMinimized(false)}>
        Resume founding ↑
      </button>
    );
  }

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className={handoff ? styles.overlayOpaque : styles.overlay} />
        <Dialog.Content
          className={styles.content}
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title className={styles.srOnly}>Game decision</Dialog.Title>

          {canMinimize && (
            <button
              type="button"
              className={styles.minimizeButton}
              onClick={() => setMinimized(true)}
            >
              Peek at the board ↓
            </button>
          )}

          {handoff && owedSeat != null ? (
            <div className={styles.handoff}>
              <p className={styles.handoffKicker}>Hand the machine to</p>
              <h2 className="serif">{seatName(owedSeat)}</h2>
              <p className={styles.handoffHint}>
                Only {seatName(owedSeat)} should see the next screen — it shows their holdings.
              </p>
              <button
                type="button"
                className={styles.handoffReady}
                onClick={() => claim(owedSeat)}
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
