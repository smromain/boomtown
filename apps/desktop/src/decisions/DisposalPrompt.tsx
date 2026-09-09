import type { PendingDecision } from '@boomtown/engine';
import { useGameClient, useAnyView } from '../client/GameClientProvider.js';
import { checkDisposal } from './disposal.js';
import styles from './decisions.module.css';

type Decision = Extract<PendingDecision, { type: 'dispose-shares' }>;

/**
 * Split defunct holdings across hold / sell / trade. The confirm button is
 * disabled until the split accounts for every share and every rule holds
 * (`docs/rules.md` step 5); the engine stays the authority.
 *
 * `sell`/`trade` are owned by `DecisionModal`, not this component: minimizing
 * to peek at the board unmounts this prompt, and state lifted to the modal
 * (which stays mounted throughout) is what lets an in-progress split survive
 * that round trip instead of silently resetting to zero.
 */
export function DisposalPrompt({
  decision,
  sell,
  trade,
  onSellChange,
  onTradeChange,
}: {
  decision: Decision;
  sell: number;
  trade: number;
  onSellChange: (next: number) => void;
  onTradeChange: (next: number) => void;
}) {
  const client = useGameClient();
  const view = useAnyView();
  const survivorBank = view?.corporations[decision.survivor].bankShares ?? 0;
  /**
   * What the bank pays per defunct share right now. This is the same figure
   * the engine uses to settle the sale (`sharePrice(corpSize(defunct), …)` in
   * the merge machine), read off the view rather than recomputed here — the
   * defunct corporation is still on the board while its holders dispose, so
   * the price is live until the merger completes.
   */
  const price = view?.corporations[decision.defunct].sharePrice ?? 0;

  const hold = decision.shares - sell - trade;
  const check = checkDisposal(decision.shares, survivorBank, { hold, sell, trade });

  const clamp = (next: number) => Math.max(0, Math.min(next, decision.shares));

  return (
    <div>
      <h2>Dispose of {view?.corporations[decision.defunct].displayName ?? decision.defunct} stock</h2>
      <p className={styles.seat}>
        {view?.seats[decision.seat]?.name ?? `Seat ${decision.seat}`} holds {decision.shares} · sells at $
        {price.toLocaleString()} a share · trade is 2-for-1 into{' '}
        {view?.corporations[decision.survivor].displayName ?? decision.survivor} ({survivorBank} in bank)
      </p>

      <div className={styles.split}>
        <span>Hold</span>
        <span />
        <span />
        <output aria-label="hold">{hold}</output>
        <span />

        <span>Sell</span>
        <button type="button" aria-label="sell fewer" onClick={() => onSellChange(clamp(sell - 1))} disabled={sell === 0}>
          −
        </button>
        <output aria-label="sell">{sell}</output>
        <button
          type="button"
          aria-label="sell more"
          onClick={() => onSellChange(clamp(sell + 1))}
          disabled={sell + trade >= decision.shares}
        >
          +
        </button>
        {/* The literal ask: what this many shares fetches, live as it changes.
            The trade row's "→ N shares" is the same idea one column over. */}
        <span className="tabnum">→ ${(sell * price).toLocaleString()}</span>

        <span>Trade</span>
        <button type="button" aria-label="trade fewer" onClick={() => onTradeChange(clamp(trade - 2))} disabled={trade === 0}>
          −
        </button>
        <output aria-label="trade">{trade}</output>
        <button
          type="button"
          aria-label="trade more"
          onClick={() => onTradeChange(clamp(trade + 2))}
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
