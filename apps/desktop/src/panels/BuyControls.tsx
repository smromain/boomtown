import { useEffect, useState } from 'react';
import { activeView } from '@boomtown/client-core';
import { useGameClient, useGameState } from '../client/GameClientProvider.js';
import { buyCost, buyTotal, buyableCorporations, canIncrement, type BuyPicks } from './buying.js';
import styles from './panels.module.css';

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
    <section className={styles.panel} aria-label="Buy stock">
      <h2>Buy stock — ${view.yourCash}</h2>
      {corps.length === 0 && <p className={styles.empty}>Nothing to buy.</p>}
      {corps.map((industry) => {
        const qty = picks[industry] ?? 0;
        return (
          <div key={industry} className={styles.buyRow}>
            <span>
              {view.corporations[industry].displayName} · ${view.corporations[industry].sharePrice}
            </span>
            <button type="button" aria-label={`fewer ${industry}`} disabled={qty === 0} onClick={() => bump(industry, -1)}>
              −
            </button>
            <output>{qty}</output>
            <button
              type="button"
              aria-label={`more ${industry}`}
              disabled={!canIncrement(view, picks, industry)}
              onClick={() => bump(industry, 1)}
            >
              +
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className={styles.buySubmit}
        disabled={busy}
        onClick={() => client.dispatch({ type: 'buy-shares', seat: view.you, picks })}
      >
        {total === 0 ? 'Buy nothing and end turn' : `Buy ${total} for $${cost}`}
      </button>
    </section>
  );
}
