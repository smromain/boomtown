import type { PendingDecision } from '@boomtown/engine';
import { useGameClient, useAnyView } from '../client/GameClientProvider.js';
import { checkDisposal, maxTrade } from './disposal.js';
import { Button } from '../ui/Button.js';
import styles from './decisions.module.css';
import { copy, fill } from '../copy/copy.js';

type Decision = Extract<PendingDecision, { type: 'dispose-shares' }>;

/**
 * Split defunct holdings across hold / sell / trade. The confirm button is
 * disabled until the split accounts for every share and every rule holds
 * (`docs/rules.md` step 5); the engine stays the authority.
 *
 * `sell`/`trade` are owned by `DecisionModal`, not this component: minimizing
 * to peek at the board unmounts this prompt, and state lifted to the modal
 * (which stays mounted throughout) is what lets an in-progress split survive
 * that round trip instead of silently resetting to zero. The quick splits below
 * go through the same two setters for exactly that reason — a shortcut writing
 * local state would put that bug straight back.
 *
 * Keeping is a choice you can take, not a leftover (#66). It is still the
 * remainder arithmetically — there is no third stepper, because "which of sell
 * or trade does incrementing keep take from?" has no good answer — but it has a
 * one-press action of its own, its count sits in the same column as the other
 * two, and the row says what keeping is actually worth: a defunct chain's
 * headquarters goes back to the tray, and held shares of that name come back to
 * life if it is ever founded again (`docs/rules.md` step 5). Without that
 * sentence the row reads as "do nothing".
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

  // Every shortcut is expressed as a (sell, trade) pair and applied through the
  // lifted setters; keep is whatever is left, exactly as when you step to it by
  // hand. `maxTrade` is the engine's own ceiling — even, and within the
  // survivor's bank — so none of these can produce a split `checkDisposal`
  // would refuse.
  const apply = (nextSell: number, nextTrade: number) => {
    onSellChange(nextSell);
    onTradeChange(nextTrade);
  };
  const tradeMost = maxTrade(decision.shares, survivorBank);
  const keepingAll = sell === 0 && trade === 0;

  return (
    <div>
      <h2>
        {fill(copy.decisions.disposal.title, {
          name: view?.corporations[decision.defunct].displayName ?? decision.defunct,
        })}
      </h2>
      <p className={styles.seat}>
        {fill(copy.decisions.disposal.seat, {
          name:
            view?.seats[decision.seat]?.name ?? fill(copy.common.seatFallback, { n: decision.seat }),
          shares: decision.shares,
          price: price.toLocaleString(),
          survivor: view?.corporations[decision.survivor].displayName ?? decision.survivor,
          bank: survivorBank,
        })}
      </p>

      {/* One press for each of the three lines, so the most common move in the
          game — keep the lot — is a thing you do rather than a thing you leave
          alone. `maxTrade` has been exported and unit-tested since disposal was
          written and used by nothing; this is where it lands. */}
      <div className={styles.shortcuts} role="group" aria-label={copy.decisions.disposal.shortcuts}>
        <Button variant="secondary" className={styles.shortcut} onClick={() => apply(0, 0)} disabled={keepingAll}>
          {copy.decisions.disposal.keepAll}
        </Button>
        <Button
          variant="secondary"
          className={styles.shortcut}
          onClick={() => apply(decision.shares, 0)}
          disabled={sell === decision.shares}
        >
          {copy.decisions.disposal.sellAll}
        </Button>
        <Button
          variant="secondary"
          className={styles.shortcut}
          onClick={() => apply(0, tradeMost)}
          disabled={tradeMost === 0 || (trade === tradeMost && sell === 0)}
        >
          {copy.decisions.disposal.tradeMax}
        </Button>
      </div>

      <div className={styles.split}>
        {/* Three cells before the note, the same as the rows below: the two
            placeholders used to sit either side of the count and pushed it into
            the `+` column, so the number you are most likely to read was the
            one not lined up with the others. */}
        <span>{copy.decisions.disposal.hold}</span>
        <span />
        <output className={styles.keepCount} data-chosen={keepingAll || undefined} aria-label={copy.decisions.disposal.holdOutput}>
          {hold}
        </output>
        <span />
        <span className={styles.keepWorth}>
          {fill(copy.decisions.disposal.keepWorth, {
            name: view?.corporations[decision.defunct].baseName ?? decision.defunct,
          })}
        </span>

        <span>{copy.decisions.disposal.sell}</span>
        <button type="button" aria-label={copy.decisions.disposal.sellFewer} onClick={() => onSellChange(clamp(sell - 1))} disabled={sell === 0}>
          −
        </button>
        <output aria-label={copy.decisions.disposal.sellOutput}>{sell}</output>
        <button
          type="button"
          aria-label={copy.decisions.disposal.sellMore}
          onClick={() => onSellChange(clamp(sell + 1))}
          disabled={sell + trade >= decision.shares}
        >
          +
        </button>
        {/* The literal ask: what this many shares fetches, live as it changes.
            The trade row's "→ N shares" is the same idea one column over. */}
        <span className="tabnum">→ ${(sell * price).toLocaleString()}</span>

        <span>{copy.decisions.disposal.trade}</span>
        <button type="button" aria-label={copy.decisions.disposal.tradeFewer} onClick={() => onTradeChange(clamp(trade - 2))} disabled={trade === 0}>
          −
        </button>
        <output aria-label={copy.decisions.disposal.tradeOutput}>{trade}</output>
        <button
          type="button"
          aria-label={copy.decisions.disposal.tradeMore}
          onClick={() => onTradeChange(clamp(trade + 2))}
          disabled={trade + 2 > decision.shares - sell || trade / 2 + 1 > survivorBank}
        >
          +
        </button>
        <span>→ {check.received} share{check.received === 1 ? '' : 's'}</span>
      </div>

      <p className={styles.error}>{check.valid ? '' : check.reason}</p>

      <Button
        variant="primary"
        className={styles.confirm}
        disabled={!check.valid}
        onClick={() => client.dispatch({ type: 'dispose-shares', seat: decision.seat, hold, sell, trade })}
      >
        {copy.decisions.disposal.confirm}
      </Button>
    </div>
  );
}
