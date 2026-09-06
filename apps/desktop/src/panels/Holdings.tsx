import { INDUSTRIES } from '@boomtown/engine';
import { activeView } from '@boomtown/client-core';
import { useGameState } from '../client/GameClientProvider.js';
import styles from './panels.module.css';

/** Cash and shares per seat. Opponent cash and holdings show only when the table is set to "open" (R13). */
export function Holdings() {
  const view = useGameState(activeView);
  if (!view) return null;

  return (
    <section className={styles.panel} aria-label="Holdings">
      <h2>Holdings</h2>
      <table className={styles.holdings}>
        <thead>
          <tr>
            <th>Seat</th>
            <th>Cash</th>
            {INDUSTRIES.map((industry) => (
              <th key={industry}>{industry.slice(0, 4)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.seats.map((seat, index) => (
            <tr key={seat.name} data-active={index === view.activeSeat}>
              <td>{seat.name}</td>
              <td>{seat.cash == null ? '—' : `$${seat.cash}`}</td>
              {INDUSTRIES.map((industry) => (
                <td key={industry}>{seat.holdings == null ? '—' : seat.holdings[industry] || ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
