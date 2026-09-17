import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeftStartOnRectangleIcon } from '@heroicons/react/24/solid';
import { Button } from '../ui/Button.js';
import styles from './game.module.css';
import decisions from '../decisions/decisions.module.css';
import { copy } from '../copy/copy.js';

/**
 * The way out of a game (#73). Until this existed the only route back to the
 * menu was playing to the end and clicking the button on the final standings —
 * so a stuck table, a room that would not come back, or simply the wrong
 * edition meant quitting the app.
 *
 * It lives in the header's **brand** region, not the status block beside it.
 * That block only renders once there is a view, and the moment you most want to
 * leave is exactly the moment there may not be one. The same reasoning already
 * moved the volume control out of there.
 *
 * `ArrowLeftStartOnRectangle` rather than an ✕: in the packaged shell this sits
 * a few pixels from a real window close button, and two ✕s meaning different
 * things is worse than no icon.
 *
 * **The speedbump does not defer the hot-seat hand-off.** `TurnHandoff` knows
 * nothing about this dialog and keeps rendering on its own terms; this is a
 * Radix portal, so it stacks *above* the hand-off card rather than in place of
 * it. A player who opens it mid-hand-off sees the confirm over an opaque
 * screen, which is the safe way round — the constraint is that nothing of the
 * next seat's is ever uncovered, and nothing here uncovers anything.
 */
export function ExitGame({ onExit, online }: { onExit: () => void; online: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className={styles.exitButton} aria-label={copy.exitGame.label}>
          <ArrowLeftStartOnRectangleIcon width={16} height={16} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={decisions.overlay} />
        <Dialog.Content className={`${decisions.content} ${styles.exitDialog}`}>
          <Dialog.Title className={`serif ${styles.exitTitle}`}>{copy.exitGame.title}</Dialog.Title>
          {/* Leaving means two different things, so it says two different
              things: a local table is gone, an online seat is held. */}
          <Dialog.Description className={styles.exitBody}>
            {online ? copy.exitGame.bodyOnline : copy.exitGame.bodyLocal}
          </Dialog.Description>
          <div className={styles.exitActions}>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {copy.exitGame.cancel}
            </Button>
            <Button variant="primary" onClick={onExit}>
              {copy.exitGame.confirm}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
