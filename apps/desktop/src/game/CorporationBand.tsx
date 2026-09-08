import { INDUSTRIES, INDUSTRY_INFO, type CorpView, type Industry } from '@boomtown/engine';
import { activeView } from '@boomtown/client-core';
import { useGameState } from '../client/GameClientProvider.js';
import { IndustryMark } from './marks.js';
import { Marquee } from './Marquee.js';
import { useReference } from '../reference/ReferenceContext.js';
import styles from './band.module.css';

/**
 * The corporation band from the Main artboard: one card per active corporation,
 * its width proportional to how many corporations it contains (itself plus what
 * it has eaten), so a merged corporation earns its own room (`docs/naming.md`
 * card consolidation). Unfounded corporations live in the tray strip at the
 * bottom of the screen, not here — with all seven founded the band is already
 * full.
 */
export function CorporationBand() {
  const view = useGameState(activeView);
  if (!view) return null;

  const active = INDUSTRIES.filter((industry) => view.corporations[industry].founded);

  if (active.length === 0) {
    return (
      <section className={styles.bandEmpty} aria-label="Corporations">
        No corporations founded yet. Place two adjacent tiles to start one.
      </section>
    );
  }

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
    </section>
  );
}

/** The unfounded companies, as a slim strip. Placed at the foot of the screen. */
export function TrayStrip() {
  const view = useGameState(activeView);
  if (!view) return null;

  const tray = INDUSTRIES.filter((industry) => !view.corporations[industry].founded);
  if (tray.length === 0) return null;

  return (
    <section className={styles.tray} aria-label="In the tray">
      <span className={styles.trayTitle}>In the tray</span>
      {tray.map((industry) => (
        <span key={industry} className={styles.trayItem}>
          <IndustryMark industry={industry} color={INDUSTRY_INFO[industry].color} size={15} />
          <span className="serif">{view.corporations[industry].baseName}</span>
        </span>
      ))}
      <span className={styles.trayNote}>Free to found again, under their own names.</span>
    </section>
  );
}

function CorpCard({ industry, corp, mine }: { industry: Industry; corp: CorpView; mine: number }) {
  const color = INDUSTRY_INFO[industry].color;
  const issued = 25 - corp.bankShares;
  const pct = issued > 0 ? Math.round((mine / issued) * 100) : 0;
  const { openCorp } = useReference();

  return (
    <button
      type="button"
      className={styles.card}
      style={{ flexGrow: corp.eaten.length + 1, borderTopColor: color }}
      aria-label={`${corp.displayName} — stock reference`}
      onClick={() => openCorp(industry)}
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
        <Marquee className={`serif ${styles.name}`}>{corp.displayName}</Marquee>
        <Marquee axis="y" lines={2} className={styles.flavour}>
          {corp.flavour}
        </Marquee>
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
    </button>
  );
}
