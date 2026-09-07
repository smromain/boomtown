import { INDUSTRY_INFO } from '@boomtown/engine';
import { useAnyView, useGameState } from '../client/GameClientProvider.js';
import { describeEvent } from '../panels/eventText.js';
import { IndustryMark } from './marks.js';
import { eventIndustry, isHeadline, latestMerger, mergerProse, type BonusLine } from './story.js';
import styles from './game.module.css';

/**
 * The engine's payout tiers are always `primary | secondary | tertiary`, but
 * the *classic* ruleset only pays two bonuses — there "primary" reads as
 * majority and anything below it as minority (matching the stock-reference
 * chart). The 2015 edition uses all three words.
 */
function tierWord(tier: BonusLine['tier'], bonusTiers: 2 | 3): string {
  if (bonusTiers === 3) return tier;
  return tier === 'primary' ? 'majority' : 'minority';
}

/**
 * The story panel from the Main artboard. When a merger is in play it narrates
 * it — the sentence, the renamed survivor, and the bonus split, in the design's
 * two-column layout. Otherwise it is a quiet recent-events feed with headline
 * events tinted the acting corporation's colour.
 */
export function StoryCard() {
  const view = useAnyView();
  const log = useGameState((state) => state.log);
  const merger = latestMerger(log);

  if (!view) return null;

  if (!merger) {
    const recent = log.slice(-7);
    return (
      <section className={styles.quietLog} aria-label="Story">
        {recent.length === 0 ? (
          <p className={styles.quiet}>No moves yet. Place a tile to begin.</p>
        ) : (
          <ol className={styles.log}>
            {recent.map((event, index) => {
              const industry = eventIndustry(event);
              const headline = isHeadline(event);
              const turn = event.type === 'turn-advanced';
              return (
                <li
                  key={index}
                  className={turn ? styles.logTurn : headline ? styles.logHeadline : styles.logLine}
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
  const nameOf = (seat: number) => view.seats[seat]?.name ?? `Seat ${seat}`;

  return (
    <section className={`${styles.card} ${styles.story}`} aria-label="Story">
      <div className={styles.storyHeading} style={{ color: survivorColor }}>
        {merger.survivor && <IndustryMark industry={merger.survivor} color={survivorColor} size={22} />}
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
          <span className={styles.renameLabel}>
            {merger.complete ? 'The survivor is renamed' : 'The survivor will be'}
          </span>
          <span className={`serif ${styles.renameName}`} style={{ color: survivorColor }}>
            {survivorName}
          </span>
          <span className={styles.renameNote}>
            The stem keeps everything it has ever eaten, and the card widens to hold it.
          </span>
        </div>
      )}

      {merger.bonuses.length > 0 && (
        <div className={styles.bonusSplit}>
          {merger.bonuses.map((line, i) => (
            <BonusColumn key={i} line={line} nameOf={nameOf} bonusTiers={view.ruleset.bonusTiers} />
          ))}
        </div>
      )}

      <p className={styles.quiet}>
        {bonusFootnote(merger.bonuses) ??
          (merger.complete
            ? `${survivorName} carries on; its card widens to hold everything it swallowed.`
            : 'Resolve the merger in the prompt.')}
      </p>
    </section>
  );
}

function BonusColumn({
  line,
  nameOf,
  bonusTiers,
}: {
  line: BonusLine;
  nameOf: (seat: number) => string;
  bonusTiers: 2 | 3;
}) {
  const split = line.seats.length > 1;
  const who = split
    ? `${line.seats.slice(0, -1).map(nameOf).join(', ')} and ${nameOf(line.seats.at(-1)!)}, tied at their shares`
    : nameOf(line.seats[0]!);
  return (
    <div className={styles.bonusCol}>
      <span className={styles.bonusWho}>
        {who} · {tierWord(line.tier, bonusTiers)}
      </span>
      <span className={`serif tabnum ${styles.bonusAmount}`}>
        ${line.amount.toLocaleString()}
        {split ? ' each' : ''}
      </span>
    </div>
  );
}

function bonusFootnote(bonuses: readonly BonusLine[]): string | null {
  if (bonuses.some((b) => b.seats.length > 1)) {
    return 'Tied for a tier, so those bonuses are combined and split evenly.';
  }
  return null;
}
