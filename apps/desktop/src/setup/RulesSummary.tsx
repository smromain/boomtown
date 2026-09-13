import * as Dialog from '@radix-ui/react-dialog';
import { RULES, boomtown, classic, edition2015, quotaFor } from '@boomtown/engine';
import { Rich } from '../copy/Rich.js';
import { copy, fill } from '../copy/copy.js';
import decisionStyles from '../decisions/decisions.module.css';
import styles from './setup.module.css';

/**
 * A short, self-contained how-to-play shown on the New Game screen. The prose is
 * original and describes only this implementation. The "where the rule sets
 * differ" table pulls its numbers from the ruleset presets so it cannot drift
 * from the engine.
 *
 * Classic and Modern are reconstructions of two published editions and differ
 * only in numbers. Boomtown is this project's own variant — same game, plus a
 * second way to end it — and the table says so rather than presenting three
 * peers.
 *
 * A dialog rather than the inline `<details>` it used to be: expanded, that
 * disclosure was taller than the window, so the one screen that is meant to be
 * taken in at a glance could be pushed into a page scroll by a control on it.
 * The prose is unchanged — it just no longer competes with the form for height.
 */
const c = copy.rulesSummary;
/** Boomtown is the only preset with a vote, and this dialog documents it by
 *  name — the `!` is the same assertion the prose makes. */
const vote = boomtown.endVote!;
const tiles = (n: number): string => fill(c.comparison.tiles, { n });

export function RulesSummary({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={decisionStyles.overlay} />
        <Dialog.Content
          className={`${decisionStyles.content} ${styles.rulesDialog}`}
          aria-describedby={undefined}
        >
          <header className={styles.rulesHead}>
            <Dialog.Title className={`serif ${styles.rulesTitle}`}>{c.title}</Dialog.Title>
            <Dialog.Close className={styles.rulesClose} aria-label={c.close}>
              ✕
            </Dialog.Close>
          </header>

          <div className={styles.rulesBody}>
            <p>
              <Rich
                text={fill(c.intro, {
                  cash: RULES.startingCash.toLocaleString(),
                  hand: RULES.handSize,
                })}
              />
            </p>

            <h3>{c.turn.heading}</h3>
            <ol>
              <li>
                <Rich text={c.turn.place} />
              </li>
              <li>
                <Rich text={fill(c.turn.buy, { max: RULES.maxStockPurchasesPerTurn })} />
              </li>
              <li>
                <Rich text={fill(c.turn.draw, { hand: RULES.handSize })} />
              </li>
            </ol>
            <p className={styles.rulesNote}>
              <Rich text={c.turn.note} />
            </p>

            <h3>{c.mergers.heading}</h3>
            <p>{c.mergers.intro}</p>
            <ul>
              <li>{c.mergers.bonus}</li>
              <li>{c.mergers.disposal}</li>
            </ul>
            <p className={styles.rulesNote}>{c.mergers.note}</p>

            <h3>{c.goingPublic.heading}</h3>
            <p>
              {fill(c.goingPublic.body, {
                quorum: vote.quorumSafeCorps,
                quotaFour: Math.round(quotaFor(vote, 4) * 100),
                quotaSix: Math.round(quotaFor(vote, 6) * 100),
                backers: vote.minBackers,
              })}
            </p>
            <p className={styles.rulesNote}>{c.goingPublic.note}</p>

            <h3>{c.comparison.heading}</h3>
            <table className={styles.rulesTable}>
              <thead>
                <tr>
                  <th />
                  <th>{c.comparison.classic}</th>
                  <th>{c.comparison.modern}</th>
                  <th>{c.comparison.boomtown}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{c.comparison.rows.safeSize}</td>
                  <td>{tiles(classic.safeSize)}</td>
                  <td>{tiles(edition2015.safeSize)}</td>
                  <td>{tiles(boomtown.safeSize)}</td>
                </tr>
                <tr>
                  <td>{c.comparison.rows.endsAt}</td>
                  <td>{tiles(classic.endChainSize)}</td>
                  <td>{tiles(edition2015.endChainSize)}</td>
                  <td>{fill(c.comparison.tilesOrVote, { n: boomtown.endChainSize })}</td>
                </tr>
                <tr>
                  <td>{c.comparison.rows.bonuses}</td>
                  <td>{c.comparison.bonusesTwo}</td>
                  <td>{c.comparison.bonusesThree}</td>
                  <td>{c.comparison.bonusesAsClassic}</td>
                </tr>
                <tr>
                  <td>{c.comparison.rows.priceBands}</td>
                  <td>{c.comparison.bandsClassic}</td>
                  <td>{c.comparison.bandsModern}</td>
                  <td>{c.comparison.bandsAsClassic}</td>
                </tr>
                <tr>
                  <td>{c.comparison.rows.twoPlayer}</td>
                  <td>{c.comparison.twoPlayerStraight}</td>
                  <td>{c.comparison.twoPlayerBank}</td>
                  <td>{fill(c.comparison.twoPlayerNoVote, { n: vote.minPlayers })}</td>
                </tr>
                <tr>
                  <td>{c.comparison.rows.books}</td>
                  <td>{c.comparison.booksSetting}</td>
                  <td>{c.comparison.booksSetting}</td>
                  <td>{c.comparison.booksClosed}</td>
                </tr>
              </tbody>
            </table>
            <p className={styles.rulesNote}>{c.footNote}</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
