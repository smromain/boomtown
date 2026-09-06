import * as Dialog from '@radix-ui/react-dialog';
import { activeView } from '@boomtown/client-core';
import { useGameState } from '../client/GameClientProvider.js';
import { DefunctOrderPrompt } from './DefunctOrderPrompt.js';
import { DisposalPrompt } from './DisposalPrompt.js';
import { FoundPrompt } from './FoundPrompt.js';
import { SurvivorPrompt } from './SurvivorPrompt.js';
import styles from './decisions.module.css';

/**
 * The one modal that surfaces every decision the engine can raise for the seat
 * at the machine: the founding choice, and each merger step. Every prompt offers
 * only its legal options (KTD3); the engine remains the authority.
 */
export function DecisionModal() {
  const decision = useGameState((state) => state.pendingDecision);
  const view = useGameState(activeView);
  const needsFound = view?.step === 'found' && view.pendingFound != null;
  const open = decision != null || needsFound;

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content} aria-describedby={undefined} onEscapeKeyDown={(e) => e.preventDefault()}>
          <Dialog.Title className={styles.srOnly}>Game decision</Dialog.Title>
          {decision?.type === 'choose-survivor' && <SurvivorPrompt decision={decision} />}
          {decision?.type === 'choose-defunct-order' && <DefunctOrderPrompt decision={decision} />}
          {decision?.type === 'dispose-shares' && <DisposalPrompt decision={decision} />}
          {!decision && needsFound && view.pendingFound && <FoundPrompt group={view.pendingFound.group} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
