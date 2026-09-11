import { INDUSTRIES, INDUSTRY_INFO, type CorpView, type Industry } from '@boomtown/engine';
import { useOwnView } from '../client/ownView.js';
import { IndustryMark } from './marks.js';
import { Marquee } from './Marquee.js';
import { Skyline } from '../art/Skyline.js';
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
  const view = useOwnView();
  if (!view) return null;

  const active = INDUSTRIES.filter((industry) => view.corporations[industry].founded);

  if (active.length === 0) {
    return (
      <section className={styles.bandEmpty} aria-label="Corporations">
        <Skyline tone="ink" className={styles.bandEmptyArt} />
        <div className={styles.bandEmptyMarks}>
          {INDUSTRIES.map((industry) => (
            <span key={industry} className={styles.bandEmptyMark} style={{ color: INDUSTRY_INFO[industry].color }}>
              <IndustryMark industry={industry} color={INDUSTRY_INFO[industry].color} size={13} />
            </span>
          ))}
        </div>
        <span>No corporations founded yet. Place two adjacent tiles to start one.</span>
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
  const view = useOwnView();
  if (!view) return null;

  const tray = INDUSTRIES.filter((industry) => !view.corporations[industry].founded);

  if (tray.length === 0) {
    return (
      <section className={styles.trayEmpty} aria-label="In the tray">
        <Skyline tone="ink" className={styles.trayEmptyArt} />
        <span className={styles.trayNote}>Every corporation is founded. The skyline is complete — for now.</span>
      </section>
    );
  }

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
  const { color, ink, tier } = INDUSTRY_INFO[industry];
  const issued = 25 - corp.bankShares;
  const pct = issued > 0 ? Math.round((mine / issued) * 100) : 0;
  const { openCorp } = useReference();

  return (
    <button
      type="button"
      className={styles.card}
      style={{ flexGrow: corp.eaten.length + 1 }}
      aria-label={`${corp.displayName} — stock reference`}
      onClick={() => openCorp(industry)}
    >
      {/* Cap band (U1 framing device): a colour-filled strip holding the
          ink-on-colour mark and the tier — not just a border-top hairline. */}
      <div className={styles.cap} style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${color} 88%, #fff), ${color})`, color: ink }}>
        <IndustryMark industry={industry} color={ink} size={22} />
        <span className={styles.capTier}>
          Tier {tier}
          {corp.safe && ' · safe'}
        </span>
      </div>

      <div className={styles.cardBody}>
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
      </div>
    </button>
  );
}
