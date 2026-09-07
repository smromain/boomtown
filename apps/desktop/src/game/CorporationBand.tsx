import { INDUSTRIES, INDUSTRY_INFO, type CorpView, type Industry } from '@boomtown/engine';
import { activeView } from '@boomtown/client-core';
import { useGameState } from '../client/GameClientProvider.js';
import { IndustryMark } from './marks.js';
import styles from './band.module.css';

/**
 * The corporation band from the Main artboard: one card per active corporation,
 * its width proportional to how many corporations it contains (itself plus what
 * it has eaten), so a merged corporation earns its own room (`docs/naming.md`
 * card consolidation). Unfounded corporations sit in the tray.
 */
export function CorporationBand() {
  const view = useGameState(activeView);
  if (!view) return null;

  const active = INDUSTRIES.filter((industry) => view.corporations[industry].founded);
  const tray = INDUSTRIES.filter((industry) => !view.corporations[industry].founded);

  return (
    <section className={styles.band} aria-label="Corporations">
      {active.map((industry) => (
        <CorpCard
          key={industry}
          industry={industry}
          corp={view.corporations[industry]}
          mine={view.yourHoldings[industry]}
        />
      ))}
      <div className={styles.tray}>
        <div className={styles.trayTitle}>In the tray</div>
        {tray.map((industry) => (
          <div key={industry} className={styles.trayItem}>
            <IndustryMark industry={industry} color={INDUSTRY_INFO[industry].color} size={17} />
            <span className="serif">{view.corporations[industry].baseName}</span>
          </div>
        ))}
        <div className={styles.trayNote}>Free to found again, under their own names.</div>
      </div>
    </section>
  );
}

function CorpCard({ industry, corp, mine }: { industry: Industry; corp: CorpView; mine: number }) {
  const color = INDUSTRY_INFO[industry].color;
  const issued = 25 - corp.bankShares;
  const pct = issued > 0 ? Math.round((mine / issued) * 100) : 0;

  return (
    <article
      className={styles.card}
      style={{ flexGrow: corp.eaten.length + 1, borderTopColor: color }}
      aria-label={corp.displayName}
    >
      <div className={styles.cardTop}>
        <IndustryMark industry={industry} color={color} size={26} />
        {corp.safe && (
          <span className={styles.safe} style={{ color }}>
            ◇ safe
          </span>
        )}
      </div>

      <div>
        <div className={`serif ${styles.name}`}>{corp.displayName}</div>
        <div className={styles.flavour}>{corp.flavour.join(' · ')}</div>
      </div>

      <div className={styles.priceRow}>
        <span className={`serif tabnum ${styles.price}`}>${corp.sharePrice}</span>
        <span className={`tabnum ${styles.size}`}>{corp.size} tiles</span>
        {corp.eaten.length > 0 && (
          <span className={styles.lineage}>
            {corp.eaten.map((eatenIndustry, index) => (
              <IndustryMark
                key={`${eatenIndustry}-${index}`}
                industry={eatenIndustry}
                color={INDUSTRY_INFO[eatenIndustry].color}
                size={15}
              />
            ))}
          </span>
        )}
      </div>

      <div className={styles.stake}>
        <div className={styles.stakeLabels}>
          <span>your stake</span>
          <span className="tabnum">
            {mine} of {issued}
          </span>
        </div>
        <div className={styles.bar}>
          <div className={styles.barFill} style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
    </article>
  );
}
