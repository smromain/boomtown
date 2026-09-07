import { useEffect, useState } from 'react';
import type { PendingDecision } from '@boomtown/engine';
import { useGameClient, useAnyView } from '../client/GameClientProvider.js';
import { checkDisposal } from './disposal.js';
import styles from './decisions.module.css';

type Decision = Extract<PendingDecision, { type: 'dispose-shares' }>;

/**
 * Split defunct holdings across hold / sell / trade. The confirm button is
 * disabled until the split accounts for every share and every rule holds
 * (`docs/rules.md` step 5); the engine stays the authority.
 */
export function DisposalPrompt({ decision }: { decision: Decision }) {
  const client = useGameClient();
  const view = useAnyView();
  const survivorBank = view?.corporations[decision.survivor].bankShares ?? 0;

  const [sell, setSell] = useState(0);
  const [trade, setTrade] = useState(0);
  useEffect(() => {
    setSell(0);
    setTrade(0);
  }, [decision.defunct, decision.shares]);

  const hold = decision.shares - sell - trade;
  const check = checkDisposal(decision.shares, survivorBank, { hold, sell, trade });

  const clamp = (next: number) => Math.max(0, Math.min(next, decision.shares));

  return (
    <div>
      <h2>Dispose of {view?.corporations[decision.defunct].displayName ?? decision.defunct} stock</h2>
      <p className={styles.seat}>
        Seat {decision.seat} holds {decision.shares} · trade is 2-for-1 into{' '}
        {view?.corporations[decision.survivor].displayName ?? decision.survivor} ({survivorBank} in bank)
      </p>

      <div className={styles.split}>
        <span>Hold</span>
        <span />
        <span />
        <output aria-label="hold">{hold}</output>
        <span />

        <span>Sell</span>
        <button type="button" aria-label="sell fewer" onClick={() => setSell(clamp(sell - 1))} disabled={sell === 0}>
          −
        </button>
        <output aria-label="sell">{sell}</output>
        <button type="button" aria-label="sell more" onClick={() => setSell(clamp(sell + 1))} disabled={sell + trade >= decision.shares}>
          +
        </button>
        <span />

        <span>Trade</span>
        <button type="button" aria-label="trade fewer" onClick={() => setTrade(clamp(trade - 2))} disabled={trade === 0}>
          −
        </button>
        <output aria-label="trade">{trade}</output>
        <button
          type="button"
          aria-label="trade more"
          onClick={() => setTrade(clamp(trade + 2))}
          disabled={trade + 2 > decision.shares - sell || trade / 2 + 1 > survivorBank}
        >
          +
        </button>
        <span>→ {check.received} share{check.received === 1 ? '' : 's'}</span>
      </div>

      <p className={styles.error}>{check.valid ? '' : check.reason}</p>

      <button
        type="button"
        className={styles.confirm}
        disabled={!check.valid}
        onClick={() => client.dispatch({ type: 'dispose-shares', seat: decision.seat, hold, sell, trade })}
      >
        Confirm
      </button>
    </div>
  );
}
