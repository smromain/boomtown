import type { PendingDecision } from '@boomtown/engine';
import { activeView } from '@boomtown/client-core';
import { useGameClient, useGameState } from '../client/GameClientProvider.js';
import styles from './decisions.module.css';

type Decision = Extract<PendingDecision, { type: 'choose-defunct-order' }>;

/** Equal-sized defunct chains: the mergemaker picks which resolves next (R3). */
export function DefunctOrderPrompt({ decision }: { decision: Decision }) {
  const client = useGameClient();
  const view = useGameState(activeView);

  return (
    <div>
      <h2>Which corporation folds next?</h2>
      <p className={styles.seat}>Seat {decision.seat} — the mergemaker</p>
      <div className={styles.options}>
        {decision.options.map((industry) => (
          <button
            key={industry}
            type="button"
            className={styles.option}
            onClick={() => client.dispatch({ type: 'choose-defunct-order', seat: decision.seat, next: industry })}
          >
            {view?.corporations[industry].displayName ?? industry} · {view?.corporations[industry].size} tiles
          </button>
        ))}
      </div>
    </div>
  );
}
