import { useEffect, useState } from 'react';
import { activeView } from '@boomtown/client-core';
import { useGameClient, useGameState } from '../client/GameClientProvider.js';
import { buyCost, buyTotal, buyableCorporations, canIncrement, type BuyPicks } from './buying.js';
import styles from '../decisions/decisions.module.css';

/** Pick up to 3 shares across founded corporations; the + button disables past the cash and bank caps. */
export function BuyControls() {
  const view = useGameState(activeView);
  const busy = useGameState((state) => state.inFlight != null);
  const client = useGameClient();
  const [picks, setPicks] = useState<BuyPicks>({});

  const turnKey = `${view?.you ?? ''}:${view?.step ?? ''}`;
  useEffect(() => {
    setPicks({});
  }, [turnKey]);

  if (!view || view.step !== 'buy') return null;

  const corps = buyableCorporations(view);
  const total = buyTotal(picks);
  const cost = buyCost(view, picks);
  const bump = (industry: string, delta: number) =>
    setPicks((current) => ({ ...current, [industry]: Math.max(0, (current[industry as keyof BuyPicks] ?? 0) + delta) }));

  return (
    <div aria-label="Buy stock">
      <h2>Buy stock</h2>
      <p className={styles.seat}>
        Seat {view.you} · ${view.yourCash.toLocaleString()} in hand · {total} of 3 picked
      </p>

      {corps.length === 0 ? (
        <p className={styles.waiting}>Nothing founded to buy into.</p>
      ) : (
        <div className={styles.buyGrid}>
          {corps.map((industry) => {
            const qty = picks[industry] ?? 0;
            return (
              <BuyRow
                key={industry}
                industry={industry}
                label={view.corporations[industry].displayName}
                price={view.corporations[industry].sharePrice ?? 0}
                qty={qty}
                canAdd={canIncrement(view, picks, industry)}
                onLess={() => bump(industry, -1)}
                onMore={() => bump(industry, 1)}
              />
            );
          })}
        </div>
      )}

      <button
        type="button"
        className={styles.confirm}
        disabled={busy}
        onClick={() => client.dispatch({ type: 'buy-shares', seat: view.you, picks })}
      >
        {total === 0 ? 'Buy nothing and end turn' : `Buy ${total} for $${cost.toLocaleString()}`}
      </button>
    </div>
  );
}

function BuyRow({
  industry,
  label,
  price,
  qty,
  canAdd,
  onLess,
  onMore,
}: {
  industry: string;
  label: string;
  price: number;
  qty: number;
  canAdd: boolean;
  onLess: () => void;
  onMore: () => void;
}) {
  return (
    <>
      <span>{label}</span>
      <span className="tabnum">${price.toLocaleString()}</span>
      <button type="button" aria-label={`fewer ${industry}`} disabled={qty === 0} onClick={onLess}>
        −
      </button>
      <output>{qty}</output>
      <button type="button" aria-label={`more ${industry}`} disabled={!canAdd} onClick={onMore}>
        +
      </button>
    </>
  );
}
