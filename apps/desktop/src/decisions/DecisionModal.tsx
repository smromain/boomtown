import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { localActiveView } from '@boomtown/client-core';
import type { Seat } from '@boomtown/engine';
import { useAnyView, useGameState, useLocalSeats } from '../client/GameClientProvider.js';
import { useHotSeat } from '../game/HotSeatContext.js';
import { DefunctOrderPrompt } from './DefunctOrderPrompt.js';
import { DisposalPrompt } from './DisposalPrompt.js';
import { FoundPrompt } from './FoundPrompt.js';
import { SurvivorPrompt } from './SurvivorPrompt.js';
import { VotePrompt } from './VotePrompt.js';
import styles from './decisions.module.css';

/**
 * The one modal that surfaces every decision the engine can raise for a seat
 * **a local player controls**: the founding choice, each merger step, and the
 * vote on a motion to liquidate. A
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
 * A founding choice or a share-disposal step can be **minimized** to a corner
 * pill so the player can study the board before deciding. While minimized the
 * modal renders no Dialog and no overlay at all — only the pill — so the board
 * underneath is fully interactive (a modal overlay would make it inert). Both
 * are safe to peek past: the founding placement and the merger's survivor/
 * defunct order are already committed to engine state by the time either
 * prompt shows. The survivor and defunct-order choices themselves stay
 * non-minimizable — they're a single quick pick, not one worth interrupting
 * to go look at the board for.
 *
 * The vote is likewise non-minimizable, and for a stronger reason: the whole
 * table is stopped waiting on it. Peeking at the board mid-vote is a stall, and
 * the one thing worth looking at — the register and the running tally — is on
 * the prompt already.
 */
export function DecisionModal() {
  const local = useLocalSeats();
  const decision = useGameState((state) =>
    state.pendingDecision && local.includes(state.pendingDecision.seat) ? state.pendingDecision : null,
  );
  const view = useGameState((state) => localActiveView(state, local));
  // Names are public and identical across every seat's view, so this must not
  // depend on the *active* seat being local (unlike `view` below, which does):
  // a merger's mergemaker can be a bot while the disposal it triggers is owed
  // to a local human. `view` would then be null and every name would silently
  // fall back to "Player N" — including the disposing seat's own name.
  const anyView = useAnyView();
  const seatName = (seat: number) => anyView?.seats[seat]?.name ?? `Player ${seat + 1}`;
  const { claim, needsHandoff } = useHotSeat();
  const needsFound = view?.step === 'found' && view.pendingFound != null;
  const open = decision != null || needsFound;

  // the seat that must act now
  const owedSeat: Seat | null = decision?.seat ?? (needsFound ? view!.you : null);
  const handoff = needsHandoff(owedSeat);

  // minimize is founding or disposal only, and never while a hand-off is owed
  const canMinimize = (needsFound || decision?.type === 'dispose-shares') && !handoff;
  const resumeLabel = decision?.type === 'dispose-shares' ? 'Resume trading in stock ↑' : 'Resume founding ↑';
  const [minimized, setMinimized] = useState(false);
  useEffect(() => {
    if (!canMinimize) setMinimized(false);
  }, [canMinimize]);

  // Owned here, not by `DisposalPrompt`, so an in-progress split survives a
  // minimize round trip — `DisposalPrompt` unmounts while minimized, but this
  // component doesn't.
  const [sell, setSell] = useState(0);
  const [trade, setTrade] = useState(0);
  const disposalKey = decision?.type === 'dispose-shares' ? `${decision.seat}:${decision.defunct}:${decision.shares}` : null;
  useEffect(() => {
    setSell(0);
    setTrade(0);
  }, [disposalKey]);

  if (open && minimized && canMinimize) {
    return (
      <button type="button" className={styles.minimizedPill} onClick={() => setMinimized(false)}>
        {resumeLabel}
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
              {decision?.type === 'cast-vote' && <VotePrompt decision={decision} />}
              {decision?.type === 'choose-defunct-order' && <DefunctOrderPrompt decision={decision} />}
              {decision?.type === 'dispose-shares' && (
                <DisposalPrompt decision={decision} sell={sell} trade={trade} onSellChange={setSell} onTradeChange={setTrade} />
              )}
              {!decision && needsFound && view.pendingFound && <FoundPrompt group={view.pendingFound.group} />}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
