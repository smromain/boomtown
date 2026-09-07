import { INDUSTRIES, INDUSTRY_INFO } from '@boomtown/engine';
import { activeView } from '@boomtown/client-core';
import { useGameState } from '../client/GameClientProvider.js';
import styles from './game.module.css';

/** The Shareholders panel from the Main artboard: each seat's holdings as coloured dots, plus cash. */
export function Shareholders() {
  const view = useGameState(activeView);
  if (!view) return null;

  return (
    <section className={styles.card} aria-label="Shareholders">
      <div className={`serif ${styles.cardHeading}`}>Shareholders</div>
      {view.seats.map((seat, index) => (
        <div key={seat.name} className={styles.holder} data-active={index === view.activeSeat}>
          <span className={styles.holderName}>
            {seat.name}
            {index === view.activeSeat ? ' ·' : ''}
          </span>
          <div className={styles.holderChips}>
            {seat.holdings == null
              ? '—'
              : INDUSTRIES.filter((industry) => seat.holdings![industry] > 0).map((industry) => (
                  <span key={industry} className={styles.chip}>
                    <span className={styles.dot} style={{ background: INDUSTRY_INFO[industry].color }} />
                    <span className="tabnum">{seat.holdings![industry]}</span>
                  </span>
                ))}
          </div>
          <span className={`serif tabnum ${styles.holderCash}`}>
            {seat.cash == null ? '—' : `$${seat.cash.toLocaleString()}`}
          </span>
        </div>
      ))}
    </section>
  );
}
