import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { localActiveView } from '@boomtown/client-core';
import { useGameState, useLocalSeats } from '../client/GameClientProvider.js';
import { useHotSeat } from './HotSeatContext.js';
import { BuyControls } from '../panels/BuyControls.js';
import { EndTurnPrompt } from './EndTurnPrompt.js';
import styles from '../decisions/decisions.module.css';

/**
 * The back half of a turn — buy stock, then decide whether to end the game —
 * as **one** modal that swaps its content rather than two that open in
 * sequence.
 *
 * Both used to be separate: buying was this modal, and the end-of-turn choice
 * was a card at the foot of the right rail. Below the fold, the card was
 * routinely missed, so the modal would close on a purchase and the game looked
 * stuck — the turn was waiting on a button the player could not see. Under
 * Boomtown that got worse, because the turn now holds at end-check on most
 * turns once the motion window opens.
 *
 * One dialog, not two, is load-bearing: separate dialogs would unmount and
 * remount between the steps, flashing the board through the gap, which reads as
 * the very glitch this is meant to remove. The steps are consecutive and the
 * seat is the same, so the whole back half of the turn happens in one place.
 *
 * It keys off the ordinary turn step rather than a pending engine decision —
 * buying and ending are every turn, not exceptional prompts, which is what
 * separates this from `DecisionModal`.
 *
 * It waits for `TurnHandoff` to hand the machine to the active seat — after a
 * merger where someone else disposed, the machine is still with that disposer,
 * and opening here would let them make the mergemaker's purchase.
 *
 * Minimizes to a corner pill the same way `DecisionModal`'s founding and
 * disposal prompts do. Nothing commits until a button is pressed, so peeking at
 * the board is always safe — and "should I end the game?" is exactly a question
 * worth looking at the board for.
 */
export function TurnModal() {
  const local = useLocalSeats();
  const { needsHandoff } = useHotSeat();
  const activeSeat = useGameState((state) => state.activeSeat);
  const step = useGameState((state) => localActiveView(state, local)?.step);
  const atBuy = step === 'buy';
  const atEndCheck = step === 'end-check';
  const open = (atBuy || atEndCheck) && !needsHandoff(activeSeat);

  const [minimized, setMinimized] = useState(false);
  useEffect(() => {
    if (!open) setMinimized(false);
  }, [open]);
  // Also reset across the step change, so a peek during buying does not hide
  // the end-of-turn choice that follows it — which would put the missing
  // button straight back.
  useEffect(() => {
    setMinimized(false);
  }, [atEndCheck]);

  if (open && minimized) {
    return (
      <button type="button" className={styles.minimizedPill} onClick={() => setMinimized(false)}>
        {atBuy ? 'Resume buying stock ↑' : 'Resume ending your turn ↑'}
      </button>
    );
  }

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={atBuy ? `${styles.content} ${styles.buyContent}` : styles.content}
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title className={styles.srOnly}>{atBuy ? 'Buy stock' : 'End of game'}</Dialog.Title>
          <button type="button" className={styles.minimizeButton} onClick={() => setMinimized(true)}>
            Peek at the board ↓
          </button>
          {atBuy ? <BuyControls /> : <EndTurnPrompt />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
