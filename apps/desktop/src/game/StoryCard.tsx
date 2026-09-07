import { INDUSTRY_INFO } from '@boomtown/engine';
import { activeView } from '@boomtown/client-core';
import { useGameState } from '../client/GameClientProvider.js';
import { describeEvent } from '../panels/eventText.js';
import { IndustryMark } from './marks.js';
import { latestMerger } from './story.js';
import styles from './game.module.css';

const TIER_LABEL = { primary: 'primary', secondary: 'secondary', tertiary: 'tertiary' } as const;

/**
 * The story panel from the Main artboard. When a merger is in play it narrates
 * it — headline, the renamed survivor, the bonus split. Otherwise it shows the
 * recent event log.
 */
export function StoryCard() {
  const view = useGameState(activeView);
  const log = useGameState((state) => state.log);
  const merger = latestMerger(log);

  if (!view) return null;

  if (!merger) {
    return (
      <section className={styles.card} aria-label="Story">
        <div className={`serif ${styles.cardHeading}`}>Table talk</div>
        {log.length === 0 ? (
          <p className={styles.quiet}>No moves yet. Place a tile to begin.</p>
        ) : (
          <ol className={styles.log}>
            {log.slice(-8).map((event, index) => (
              <li key={index}>{describeEvent(event)}</li>
            ))}
          </ol>
        )}
      </section>
    );
  }

  const survivorName = merger.survivor ? view.corporations[merger.survivor].displayName : '…';
  const names = merger.corporations.map((industry) => view.corporations[industry].baseName);

  return (
    <section className={styles.card} aria-label="Story">
      <div className={styles.storyHeading}>
        {merger.survivor && (
          <IndustryMark industry={merger.survivor} color={INDUSTRY_INFO[merger.survivor].color} size={22} />
        )}
        <span className="serif">{`${names.join(' + ')} merge at ${merger.placedTile}`}</span>
      </div>

      {merger.survivor && (
        <div className={styles.rename}>
          <span className={styles.renameLabel}>The survivor{merger.complete ? ' is renamed' : ' will be'}</span>
          <span className="serif" style={{ color: INDUSTRY_INFO[merger.survivor].color }}>
            {survivorName}
          </span>
        </div>
      )}

      {merger.bonuses.length > 0 && (
        <div className={styles.bonuses}>
          {merger.bonuses.map((line, index) => (
            <div key={index} className={styles.bonusLine}>
              <span className={styles.bonusWho}>
                {line.seats.length > 1 ? `Seats ${line.seats.join(', ')}` : `Seat ${line.seats[0]}`} · {TIER_LABEL[line.tier]}
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
