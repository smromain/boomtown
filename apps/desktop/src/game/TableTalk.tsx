import { INDUSTRIES, type EngineEvent } from '@boomtown/engine';
import { useAnyView, useGameState } from '../client/GameClientProvider.js';
import { useOwnView } from '../client/ownView.js';
import { describeEvent } from '../panels/eventText.js';
import { Portrait } from '../art/Portrait.js';
import { Panel } from '../ui/Panel.js';
import { IndustryMark } from './marks.js';
import { industryTheme } from './industryTheme.js';
import { eventIndustry, isHeadline } from './story.js';
import styles from './gamenight.module.css';
import { copy } from '../copy/copy.js';

/**
 * The Game Night skin's two views of the table (prototype): **Advisors**, the
 * shareholders panel with each seat speaking its last move, and **Around the
 * table**, the log as a feed of who did what.
 *
 * Both read only what the ordinary panels read. Advisors takes `useOwnView`,
 * exactly as `Shareholders` does, so closed books stay closed; the last-move
 * line comes from the redacted log, so a purchase under closed books names the
 * company and never the amount.
 */

/** The seat that made a move, for the events a player makes. */
function actor(event: EngineEvent): number | null {
  switch (event.type) {
    case 'tile-placed':
    case 'shares-bought':
    case 'shares-disposed':
    case 'dead-tiles-swept':
    case 'motion-raised':
    case 'vote-cast':
    case 'end-announced':
      return event.seat;
    default:
      return null;
  }
}

/** A log line without its leading name, for a bubble that already says who. */
function withoutName(line: string, name: string): string {
  return line.startsWith(`${name} `) ? line.slice(name.length + 1) : line;
}

export function Advisors() {
  const view = useOwnView();
  const log = useGameState((state) => state.log);
  if (!view) return null;

  const lastMove = view.seats.map((_, seat) => {
    for (let i = log.length - 1; i >= 0; i--) {
      const event = log[i]!;
      if (actor(event) === seat) return event;
    }
    return null;
  });

  return (
    <Panel as="section" className={styles.panel} aria-label={copy.game.shareholders}>
      <div className={styles.heading}>{copy.game.advisors}</div>
      <div className={styles.advisors}>
        {view.seats.map((seat, index) => {
          const move = lastMove[index];
          const mine = index === view.you;
          const onClock = index === view.activeSeat;
          const held = seat.holdings
            ? INDUSTRIES.filter((industry) => seat.holdings![industry] > 0)
            : [];
          return (
            <div key={seat.name} className={styles.advisor} data-mine={mine || undefined} data-clock={onClock || undefined}>
              <Portrait seat={index} size={36} />
              <div className={styles.bubble}>
                <div className={styles.bubbleHead}>
                  <span className={styles.who}>{seat.name}</span>
                  <span className={styles.tag}>
                    {mine ? copy.game.advisorYou : seat.cash == null ? copy.game.advisorBooksClosed : null}
                  </span>
                  {seat.cash != null && <span className={`serif tabnum ${styles.cash}`}>${seat.cash.toLocaleString()}</span>}
                </div>
                <div className={styles.said}>
                  {move ? withoutName(describeEvent(move, view), seat.name) : copy.game.advisorQuiet}
                </div>
                {held.length > 0 && (
                  <div className={styles.holdings}>
                    {held.map((industry) => {
                      const { color, ink } = industryTheme(industry);
                      return (
                        <span key={industry} className={styles.holding}>
                          <span className={styles.badge} style={{ background: color }}>
                            <IndustryMark industry={industry} color={ink} size={11} />
                          </span>
                          <span className="tabnum">{seat.holdings![industry]}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/** How many moves the feed keeps on screen. */
const FEED_LENGTH = 6;

export function TableFeed() {
  const view = useAnyView();
  const log = useGameState((state) => state.log);
  if (!view) return null;

  // Draws and turn changes are bookkeeping: every turn has them, and a feed
  // of them buries the moves.
  const moves = log.filter((event) => event.type !== 'tiles-drawn' && event.type !== 'turn-advanced').slice(-FEED_LENGTH);

  return (
    <Panel as="section" className={styles.panel} aria-label={copy.story.label}>
      <div className={styles.heading}>
        <span className={styles.live} aria-hidden />
        {copy.story.aroundTheTable}
      </div>
      {moves.length === 0 ? (
        <p className={styles.empty}>{copy.story.noMovesYet}</p>
      ) : (
        <ol className={styles.feed}>
          {moves.map((event, index) => {
            const seat = actor(event);
            const industry = eventIndustry(event);
            const headline = isHeadline(event);
            const name = seat == null ? '' : (view.seats[seat]?.name ?? '');
            const line = describeEvent(event, view);
            return (
              <li key={log.length - moves.length + index} className={styles.item} data-headline={headline || undefined}>
                {seat != null ? (
                  <Portrait seat={seat} size={28} />
                ) : industry ? (
                  <span className={styles.medal} style={{ background: industryTheme(industry).color }}>
                    <IndustryMark industry={industry} color={industryTheme(industry).ink} size={14} />
                  </span>
                ) : (
                  <span className={styles.medal} />
                )}
                <span className={styles.line}>
                  {seat != null && line.startsWith(`${name} `) ? (
                    <>
                      <b>{name}</b> {withoutName(line, name)}
                    </>
                  ) : (
                    line
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
