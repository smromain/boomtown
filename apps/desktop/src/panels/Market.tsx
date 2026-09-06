import { INDUSTRIES, INDUSTRY_INFO } from '@boomtown/engine';
import { activeView } from '@boomtown/client-core';
import { useGameState } from '../client/GameClientProvider.js';
import styles from './panels.module.css';

/** One card per active corporation: derived display name, size, price, bank stock, safe badge, accreted flavour. */
export function Market() {
  const view = useGameState(activeView);
  if (!view) return null;

  const founded = INDUSTRIES.filter((industry) => view.corporations[industry].founded);

  return (
    <section className={styles.panel} aria-label="Market">
      <h2>Market</h2>
      {founded.length === 0 && <p className={styles.empty}>No corporations founded yet.</p>}
      {founded.map((industry) => {
        const corp = view.corporations[industry];
        return (
          <article key={industry} className={styles.card} style={{ borderColor: INDUSTRY_INFO[industry].color }}>
            <header>
              <span>{corp.displayName}</span>
              {corp.safe && <span className={styles.safe}>safe</span>}
            </header>
            <dl>
              <div>
                <dt>Size</dt>
                <dd>{corp.size}</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>${corp.sharePrice}</dd>
              </div>
              <div>
                <dt>Bank</dt>
                <dd>{corp.bankShares}</dd>
              </div>
            </dl>
            <ul className={styles.flavour}>
              {corp.flavour.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </article>
        );
      })}
    </section>
  );
}
