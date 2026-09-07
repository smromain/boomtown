import type { PendingDecision } from '@boomtown/engine';
import { useGameClient, useLocalActiveView } from '../client/GameClientProvider.js';
import styles from './decisions.module.css';

type Decision = Extract<PendingDecision, { type: 'choose-survivor' }>;

/** A size tie: the mergemaker picks which corporation survives (R3). */
export function SurvivorPrompt({ decision }: { decision: Decision }) {
  const client = useGameClient();
  const view = useLocalActiveView();

  return (
    <div>
      <h2>Choose the surviving corporation</h2>
      <p className={styles.seat}>Seat {decision.seat} — the mergemaker</p>
      <div className={styles.options}>
        {decision.options.map((industry) => (
          <button
            key={industry}
            type="button"
            className={styles.option}
            onClick={() => client.dispatch({ type: 'choose-survivor', seat: decision.seat, survivor: industry })}
          >
            {view?.corporations[industry].displayName ?? industry} · {view?.corporations[industry].size} tiles
          </button>
        ))}
      </div>
    </div>
  );
}
