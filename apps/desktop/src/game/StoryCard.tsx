import { INDUSTRY_INFO } from '@boomtown/engine';
import { useAnyView, useGameState } from '../client/GameClientProvider.js';
import { describeEvent } from '../panels/eventText.js';
import { IndustryMark } from './marks.js';
import { Marquee } from './Marquee.js';
import { Panel } from '../ui/Panel.js';
import { Skyline } from '../art/Skyline.js';
import {
  eventIndustry,
  isHeadline,
  latestMerger,
  listOf,
  mergerProse,
  tierWord,
  type BonusLine,
} from './story.js';
import styles from './game.module.css';
import { copy, fill } from '../copy/copy.js';

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
      <section className={styles.quietLog} aria-label={copy.story.label}>
        {recent.length === 0 ? (
          <div className={styles.storyEmpty}>
            <Skyline tone="ink" className={styles.storyEmptyArt} />
            <p className={styles.quiet}>{copy.story.noMovesYet}</p>
          </div>
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
  const nameOf = (seat: number) => view.seats[seat]?.name ?? fill(copy.common.seatFallback, { n: seat });

  return (
    <Panel as="section" frame="top-rule" className={`${styles.card} ${styles.story}`} aria-label={copy.story.label}>
      <div className={styles.storyHeading} style={{ color: survivorColor }}>
        {merger.survivor && <IndustryMark industry={merger.survivor} color={survivorColor} size={22} />}
        <span className="serif">
          {fill(copy.story.heading, { names: names.join(' + '), tile: merger.placedTile })}
        </span>
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
            {merger.complete ? copy.story.nowTradingAs : copy.story.willTradeAs}
          </span>
          <Marquee className={`serif ${styles.renameName}`} style={{ color: survivorColor }}>
            {survivorName}
          </Marquee>
          <span className={styles.renameNote}>{copy.story.renameNote}</span>
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
            ? fill(copy.story.carriesOn, { name: survivorName })
            : copy.story.resolveInPrompt)}
      </p>
    </Panel>
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
    ? fill(copy.story.tiedWho, { names: listOf(line.seats.map(nameOf)) })
    : nameOf(line.seats[0]!);
  return (
    <div className={styles.bonusCol}>
      <span className={styles.bonusWho}>
        {fill(copy.story.whoTier, { who, tier: tierWord(line.tier, bonusTiers) })}
      </span>
      <span className={`serif tabnum ${styles.bonusAmount}`}>
        ${line.amount.toLocaleString()}
        {split ? copy.story.each : ''}
      </span>
    </div>
  );
}

function bonusFootnote(bonuses: readonly BonusLine[]): string | null {
  if (bonuses.some((b) => b.seats.length > 1)) {
    return copy.story.tiedFootnote;
  }
  return null;
}
