import { INDUSTRIES, INDUSTRY_INFO } from '@boomtown/engine';
import { useOwnView } from '../client/ownView.js';
import { IndustryMark } from './marks.js';
import { Panel } from '../ui/Panel.js';
import styles from './game.module.css';

/**
 * The Shareholders panel from the Main artboard: each seat's holdings as
 * icon-and-colour chips (not colour alone — colour-blind readers need the
 * industry mark, not just the dot), plus cash.
 */
export function Shareholders() {
  // `useOwnView`, never `activeView`: a hot-seat client holds a view for every
  // seat, so reading the seat on the clock showed each bot its own cash and
  // holdings in turn — one full turn cycle disclosed the whole table, which is
  // precisely what Boomtown's closed books exist to prevent.
  const view = useOwnView();
  if (!view) return null;

  return (
    <Panel as="section" frame="top-rule" className={styles.card} aria-label="Shareholders">
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
              : INDUSTRIES.filter((industry) => seat.holdings![industry] > 0).map((industry) => {
                  const { color, ink } = INDUSTRY_INFO[industry];
                  return (
                    <span key={industry} className={styles.chip}>
                      <span className={styles.chipBadge} style={{ background: color }}>
                        <IndustryMark industry={industry} color={ink} size={10} />
                      </span>
                      <span className="tabnum">{seat.holdings![industry]}</span>
                    </span>
                  );
                })}
          </div>
          <span className={`serif tabnum ${styles.holderCash}`}>
            {seat.cash == null ? '—' : `$${seat.cash.toLocaleString()}`}
          </span>
        </div>
      ))}
    </Panel>
  );
}
