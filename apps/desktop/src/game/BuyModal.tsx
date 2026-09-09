import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { localActiveView } from '@boomtown/client-core';
import { useGameState, useLocalSeats } from '../client/GameClientProvider.js';
import { useHotSeat } from './HotSeatContext.js';
import { BuyControls } from '../panels/BuyControls.js';
import styles from '../decisions/decisions.module.css';

/**
 * The buy step as a modal. Unlike `DecisionModal` this keys off the ordinary
 * turn step (`view.step === 'buy'`), not a pending engine decision — buying is
 * every turn, not an exceptional prompt. There is no dismiss path: the modal is
 * always escapable through BuyControls' own "Buy nothing and end turn".
 *
 * It waits for `TurnHandoff` to hand the machine to the active seat — after a
 * merger where someone else disposed, the machine is still with that disposer,
 * and opening here would let them make the mergemaker's purchase.
 *
 * Minimizes to a corner pill the same way `DecisionModal`'s founding/disposal
 * prompts do — nothing about a purchase commits until "Confirm", so peeking at
 * the board first is always safe.
 */
export function BuyModal() {
  const local = useLocalSeats();
  const { needsHandoff } = useHotSeat();
  const activeSeat = useGameState((state) => state.activeSeat);
  const atBuyStep = useGameState((state) => localActiveView(state, local)?.step === 'buy');
  const open = atBuyStep && !needsHandoff(activeSeat);

  const [minimized, setMinimized] = useState(false);
  useEffect(() => {
    if (!open) setMinimized(false);
  }, [open]);

  if (open && minimized) {
    return (
      <button type="button" className={styles.minimizedPill} onClick={() => setMinimized(false)}>
        Resume buying stock ↑
      </button>
    );
  }

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={`${styles.content} ${styles.buyContent}`}
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title className={styles.srOnly}>Buy stock</Dialog.Title>
          <button type="button" className={styles.minimizeButton} onClick={() => setMinimized(true)}>
            Peek at the board ↓
          </button>
          <BuyControls />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
