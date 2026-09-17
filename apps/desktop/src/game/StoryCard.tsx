import { INDUSTRY_INFO } from '@boomtown/engine';
import { useAnyView, useGameState } from '../client/GameClientProvider.js';
import { describeEvent } from '../panels/eventText.js';
import { IndustryMark } from './marks.js';
import { Marquee } from './Marquee.js';
import { Panel } from '../ui/Panel.js';
import { Skyline } from '../art/Skyline.js';
import {
  beingAbsorbed,
  currentMerger,
  eventIndustry,
  isHeadline,
  listOf,
  mergerProse,
  tradingNameIn,
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
 *
 * "In play" is `currentMerger`, not `latestMerger`: the log keeps every event
 * of the session, so the newest `merger-started` is still the newest one twenty
 * turns later, and reading it directly pinned the panel to the first merger's
 * narration for the rest of the game (#59). Once the merger is done and the
 * turn has advanced, the feed comes back — with the merger's own events in it
 * as headlines, which is the right detail for something three turns old.
 */
export function StoryCard() {
  const view = useAnyView();
  const log = useGameState((state) => state.log);
  const merger = currentMerger(log);

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
  const names = merger.corporations.map((industry) => tradingNameIn(merger, view, industry));
  const eaten = beingAbsorbed(merger);
  const eatenNames = eaten.map((industry) => tradingNameIn(merger, view, industry));
  // One doomed corporation is named in its own colour, the way the log tints a
  // headline; several have no single colour between them, so they read as ink.
  const eatenColor = eaten.length === 1 ? INDUSTRY_INFO[eaten[0]!].color : 'var(--ink)';
  const prose = mergerProse(merger, view);
  // The name it is trading under going in, which is not the joint name it takes
  // when the merger completes.
  const consumerName = merger.survivor ? tradingNameIn(merger, view, merger.survivor) : '';
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

      {/* Before the merger resolves there is no joint name to show: the engine
          appends the defunct chains to the survivor's `eaten` at completion, so
          `displayName` is still the survivor's own name — and labelling that
          "will trade as" told the player the merger had changed nothing. Until
          then the panel says what is actually happening, and the new name stays
          the merger beat's to reveal. */}
      {merger.survivor &&
        (merger.complete ? (
          <div className={styles.rename}>
            <span className={styles.renameLabel}>{copy.story.nowTradingAs}</span>
            <Marquee className={`serif ${styles.renameName}`} style={{ color: survivorColor }}>
              {survivorName}
            </Marquee>
            <span className={styles.renameNote}>{copy.story.renameNote}</span>
          </div>
        ) : (
          <div className={styles.rename}>
            <span className={styles.renameLabel}>
              {fill(copy.story.consuming, { survivor: consumerName })}
            </span>
            <Marquee className={`serif ${styles.renameName}`} style={{ color: eatenColor }}>
              {listOf(eatenNames)}
            </Marquee>
            <span className={styles.renameNote}>{copy.story.consumingNote}</span>
          </div>
        ))}

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
            ? null
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
