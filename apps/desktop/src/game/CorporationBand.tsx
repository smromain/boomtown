import { INDUSTRIES, tierOf, type CorpView, type Industry } from '@boomtown/engine';
import { useOwnView } from '../client/ownView.js';
import { IndustryMark } from './marks.js';
import { industryTheme, patternedBackground } from './industryTheme.js';
import { useIndustryPatterns } from '../settings/useSetting.js';
import { Marquee } from './Marquee.js';
import { Skyline } from '../art/Skyline.js';
import { useReference } from '../reference/ReferenceContext.js';
import styles from './band.module.css';
import { copy, fill } from '../copy/copy.js';

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
      <section className={styles.bandEmpty} aria-label={copy.game.corporations}>
        <Skyline tone="ink" className={styles.bandEmptyArt} />
        <div className={styles.bandEmptyMarks}>
          {INDUSTRIES.map((industry) => (
            <span key={industry} className={styles.bandEmptyMark} style={{ color: industryTheme(industry).onPaper }}>
              <IndustryMark industry={industry} color={industryTheme(industry).onPaper} size={13} />
            </span>
          ))}
        </div>
        <span>{copy.game.noCorporations}</span>
      </section>
    );
  }

  return (
    <section className={styles.band} aria-label={copy.game.corporations}>
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
      <section className={styles.trayEmpty} aria-label={copy.game.inTray}>
        <Skyline tone="ink" className={styles.trayEmptyArt} />
        <span className={styles.trayNote}>{copy.game.trayAllFounded}</span>
      </section>
    );
  }

  return (
    <section className={styles.tray} aria-label={copy.game.inTray}>
      <span className={styles.trayTitle}>{copy.game.inTray}</span>
      {tray.map((industry) => (
        <span key={industry} className={styles.trayItem}>
          <IndustryMark industry={industry} color={industryTheme(industry).onPaper} size={15} />
          <span className="serif">{view.corporations[industry].baseName}</span>
        </span>
      ))}
      <span className={styles.trayNote}>{copy.game.trayNote}</span>
    </section>
  );
}

function CorpCard({ industry, corp, mine }: { industry: Industry; corp: CorpView; mine: number }) {
  const { color, ink } = industryTheme(industry);
  const tier = tierOf(industry);
  const patterns = useIndustryPatterns();
  const capFill = `linear-gradient(160deg, color-mix(in srgb, ${color} 88%, #fff), ${color})`;
  const issued = 25 - corp.bankShares;
  const pct = issued > 0 ? Math.round((mine / issued) * 100) : 0;
  const { openCorp } = useReference();

  return (
    <button
      type="button"
      className={styles.card}
      style={{ flexGrow: corp.eaten.length + 1 }}
      aria-label={fill(copy.game.corpCardLabel, { name: corp.displayName })}
      onClick={() => openCorp(industry)}
    >
      {/* Cap band (U1 framing device): a colour-filled strip holding the
          ink-on-colour mark and the tier — not just a border-top hairline. */}
      <div className={styles.cap} style={{ ...patternedBackground(industry, capFill, patterns), color: ink }}>
        <IndustryMark industry={industry} color={ink} size={22} />
        <span className={styles.capTier}>
          {fill(copy.game.tier, { n: tier })}
          {corp.safe && copy.game.safeSuffix}
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
          <span className={`tabnum ${styles.size}`}>{fill(copy.game.sizeTiles, { n: corp.size })}</span>
          {corp.eaten.length > 0 && (
            <span className={styles.lineage}>
              {corp.eaten.map(({ industry: eatenIndustry }, index) => (
                <IndustryMark
                  key={`${eatenIndustry}-${index}`}
                  industry={eatenIndustry}
                  color={industryTheme(eatenIndustry).onPaper}
                  size={15}
                />
              ))}
            </span>
          )}
        </div>

        <div className={styles.stake}>
          <div className={styles.stakeLabels}>
            <span>{copy.game.yourStake}</span>
            <span className="tabnum">{fill(copy.game.stakeOf, { mine, issued })}</span>
          </div>
          <div className={styles.bar}>
            <div className={styles.barFill} style={{ width: `${pct}%`, background: color }} />
          </div>
        </div>
      </div>
    </button>
  );
}
