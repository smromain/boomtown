import { INDUSTRY_INFO } from '@boomtown/engine';
import { useAnyView, useGameState } from '../client/GameClientProvider.js';
import { describeEvent } from '../panels/eventText.js';
import { IndustryMark } from './marks.js';
import { eventIndustry, isHeadline, latestMerger, mergerProse } from './story.js';
import styles from './game.module.css';

const TIER_LABEL = { primary: 'primary', secondary: 'secondary', tertiary: 'tertiary' } as const;

/**
 * The story panel from the Main artboard. When a merger is in play it narrates
 * it — the sentence, the renamed survivor, the bonus split, exactly as the
 * design lays it out. Otherwise it is a quiet recent-events list (no heading,
 * no border), with headline events tinted the acting corporation's colour.
 */
export function StoryCard() {
  const view = useAnyView();
  const log = useGameState((state) => state.log);
  const merger = latestMerger(log);

  if (!view) return null;

  if (!merger) {
    const recent = log.slice(-6);
    return (
      <section className={styles.quietLog} aria-label="Story">
        {recent.length === 0 ? (
          <p className={styles.quiet}>No moves yet. Place a tile to begin.</p>
        ) : (
          <ol className={styles.log}>
            {recent.map((event, index) => {
              const industry = eventIndustry(event);
              const headline = isHeadline(event);
              return (
                <li
                  key={index}
                  className={headline ? styles.headline : undefined}
                  style={headline && industry ? { color: INDUSTRY_INFO[industry].color } : undefined}
                >
                  {describeEvent(event, view)}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    );
  }

  const survivorName = merger.survivor ? view.corporations[merger.survivor].displayName : '…';
  const survivorColor = merger.survivor ? INDUSTRY_INFO[merger.survivor].color : 'var(--ink)';
  const names = merger.corporations.map((industry) => view.corporations[industry].baseName);
  const prose = mergerProse(merger, view);

  return (
    <section className={`${styles.card} ${styles.story}`} aria-label="Story">
      <div className={styles.storyHeading} style={{ color: survivorColor }}>
        {merger.survivor && (
          <IndustryMark industry={merger.survivor} color={survivorColor} size={22} />
        )}
        <span className="serif">{`${names.join(' + ')} merge at ${merger.placedTile}`}</span>
      </div>

      {prose && (
        <p className={styles.storyProse}>
          {prose.lead}
          <strong className="tabnum">{prose.tile}</strong>
          {prose.rest}
        </p>
      )}

      {merger.survivor && (
        <div className={styles.rename}>
          <span className={styles.renameLabel}>The survivor{merger.complete ? ' is renamed' : ' will be'}</span>
          <span className="serif" style={{ color: survivorColor }}>
            {survivorName}
          </span>
        </div>
      )}

      {merger.bonuses.length > 0 && (
        <div className={styles.bonuses}>
          {merger.bonuses.map((line, index) => (
            <div key={index} className={styles.bonusLine}>
              <span className={styles.bonusWho}>
                {line.seats.map((s) => view.seats[s]?.name ?? `Seat ${s}`).join(', ')} · {TIER_LABEL[line.tier]}
              </span>
              <span className="serif tabnum">${line.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <p className={styles.quiet}>
        {merger.complete
          ? `${survivorName} carries on; its card widens to hold everything it swallowed.`
          : 'Resolve the merger in the prompt.'}
      </p>
    </section>
  );
}
