import type { PendingDecision } from '@boomtown/engine';
import { useGameClient, useAnyView } from '../client/GameClientProvider.js';
import styles from './decisions.module.css';
import { copy, fill } from '../copy/copy.js';

type Decision = Extract<PendingDecision, { type: 'choose-survivor' }>;

/** A size tie: the mergemaker picks which corporation survives (R3). */
export function SurvivorPrompt({ decision }: { decision: Decision }) {
  const client = useGameClient();
  const view = useAnyView();

  return (
    <div>
      <h2>{copy.decisions.survivor.title}</h2>
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
            onClick={() => client.dispatch({ type: 'choose-survivor', seat: decision.seat, survivor: industry })}
          >
            {view?.corporations[industry].displayName ?? industry} · {view?.corporations[industry].size} tiles
          </button>
        ))}
      </div>
    </div>
  );
}
