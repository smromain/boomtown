import type { PendingDecision } from '@boomtown/engine';
import { useGameClient, useAnyView } from '../client/GameClientProvider.js';
import styles from './decisions.module.css';
import { copy, fill } from '../copy/copy.js';

type Decision = Extract<PendingDecision, { type: 'choose-defunct-order' }>;

/** Equal-sized defunct chains: the mergemaker picks which resolves next (R3). */
export function DefunctOrderPrompt({ decision }: { decision: Decision }) {
  const client = useGameClient();
  const view = useAnyView();

  return (
    <div>
      <h2>{copy.decisions.defunctOrder.title}</h2>
      <p className={styles.seat}>
        {fill(copy.decisions.mergemaker, {
          name:
            view?.seats[decision.seat]?.name ??
            fill(copy.common.seatFallback, { n: decision.seat }),
        })}
      </p>
      <div className={styles.options}>
        {decision.options.map((industry) => (
          <button
            key={industry}
            type="button"
            className={styles.option}
            onClick={() => client.dispatch({ type: 'choose-defunct-order', seat: decision.seat, next: industry })}
          >
            {fill(copy.decisions.chainOption, {
              name: view?.corporations[industry].displayName ?? industry,
              n: view?.corporations[industry].size ?? 0,
            })}
          </button>
        ))}
      </div>
    </div>
  );
}
