import * as Dialog from '@radix-ui/react-dialog';
import { localActiveView } from '@boomtown/client-core';
import { useGameState, useLocalSeats } from '../client/GameClientProvider.js';
import { BuyControls } from '../panels/BuyControls.js';
import styles from '../decisions/decisions.module.css';

/**
 * The buy step as a modal. Unlike `DecisionModal` this keys off the ordinary
 * turn step (`view.step === 'buy'`), not a pending engine decision — buying is
 * every turn, not an exceptional prompt. There is no dismiss path: the modal is
 * always escapable through BuyControls' own "Buy nothing and end turn".
 */
export function BuyModal() {
  const local = useLocalSeats();
  const open = useGameState((state) => localActiveView(state, local)?.step === 'buy');

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.content}
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title className={styles.srOnly}>Buy stock</Dialog.Title>
          <BuyControls />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
