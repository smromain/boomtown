import { useEffect, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { RULES, TOTAL_SHARES, quotaFor, type PlayerView, type Ruleset } from '@boomtown/engine';
import { useAnyView } from '../client/GameClientProvider.js';
import { Rich } from '../copy/Rich.js';
import { copy, fill } from '../copy/copy.js';
import { editionLabel } from '../setup/editionLabel.js';
import styles from './reference.module.css';

const c = copy.rules;

/** A line in the setup table — everything both editions agree on. */
function constants(ruleset: Ruleset): readonly (readonly [string, string])[] {
  const t = c.table;
  return [
    [t.players, fill(t.playersValue, { min: RULES.minPlayers, max: RULES.maxPlayers })],
    [t.board, fill(t.boardValue, { cols: ruleset.board.cols, rows: ruleset.board.rows })],
    [t.startingCash, fill(t.startingCashValue, { n: RULES.startingCash.toLocaleString() })],
    [t.hand, String(RULES.handSize)],
    [t.corporations, String(RULES.corporationCount)],
    [t.shares, fill(t.sharesValue, { each: RULES.sharesPerCorporation, total: TOTAL_SHARES })],
    [t.stockPerTurn, fill(t.stockPerTurnValue, { n: RULES.maxStockPurchasesPerTurn })],
    [t.founderBonus, fill(t.founderBonusValue, { n: RULES.founderBonusShares })],
  ];
}

/**
 * The rows that actually differ between one rule set and the next.
 *
 * Two of the three are reconstructions of published editions and disagree only
 * on numbers; Boomtown is this project's own variant and adds rules the other
 * two have no row for at all, which is why the tail of this list is conditional
 * rather than a value that differs.
 */
function editionRules(ruleset: Ruleset, seatCount: number): readonly (readonly [string, string])[] {
  const vote = ruleset.endVote;
  const e = c.edition;
  return [
    [e.safeSize, fill(e.safeSizeValue, { n: ruleset.safeSize })],
    [e.endsAt, fill(e.endsAtValue, { n: ruleset.endChainSize })],
    [e.bonusTiers, ruleset.bonusTiers === 3 ? e.bonusTiersThree : e.bonusTiersTwo],
    [e.soleHolder, ruleset.soleHolderPolicy === 'both' ? e.soleHolderBoth : e.soleHolderSplit],
    [e.tiedSplit, ruleset.splitRounding === 'up100' ? e.tiedSplitRounded : e.tiedSplitAsFalls],
    [
      e.deadTiles,
      ruleset.deadTilePolicy === 'discardAndReplace' ? e.deadTilesReplaced : e.deadTilesKept,
    ],
    [
      e.twoPlayer,
      ruleset.phantomShareholderInTwoPlayer ? e.twoPlayerPhantom : e.twoPlayerStraight,
    ],
    ...(ruleset.forcedVisibility === 'hidden' ? [[e.books, e.booksClosed] as const] : []),
    ...(vote
      ? ([
          [e.voteWindow, fill(e.voteWindowValue, { n: vote.quorumSafeCorps })],
          [
            e.voteQuota,
            fill(e.voteQuotaValue, {
              quota: Math.round(quotaFor(vote, seatCount) * 100),
              backers: vote.minBackers,
            }),
          ],
          [e.motionsPerPlayer, fill(e.motionsPerPlayerValue, { n: vote.motionsPerPlayer })],
          [e.backingFails, e.backingFailsValue],
        ] as const)
      : []),
  ];
}

interface RulesSection {
  readonly id: string;
  /** Shown as the card's heading and as the label of its dot. */
  readonly title: string;
  readonly body: ReactNode;
}

function keyValueGrid(rows: readonly (readonly [string, string])[]): ReactNode {
  return (
    <div className={styles.rulesGrid}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.rulesRow}>
          <span className={styles.rulesKey}>{label}</span>
          <span className={styles.rulesValue}>{value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The rules, one card per section — the order a player meets them in: a turn,
 * then the merger that turn can cause, then the endings, then the rest.
 *
 * Built as data rather than markup so the carousel has something to count,
 * name its dots after, and page through. Sections a rule set doesn't have
 * (Going Public, on the two published editions) are absent rather than empty,
 * which is also what keeps the dots honest.
 */
function rulesSections(ruleset: Ruleset, view: PlayerView): RulesSection[] {
  const threeTiers = ruleset.bonusTiers === 3;
  const vote = ruleset.endVote;
  const list = (items: readonly string[], ordered = true) => {
    const List = ordered ? 'ol' : 'ul';
    return (
      <List className={styles.rulesList}>
        {items.map((item) => (
          <li key={item.slice(0, 40)}>
            <Rich text={item} />
          </li>
        ))}
      </List>
    );
  };
  const note = (text: string) => (
    <p className={styles.rulesNote}>
      <Rich text={text} />
    </p>
  );

  return [
    {
      id: 'turn',
      title: c.turn.title,
      body: list([
        c.turn.place,
        fill(c.turn.buy, { max: RULES.maxStockPurchasesPerTurn }),
        fill(c.turn.draw, {
          hand: RULES.handSize,
          deadTile:
            ruleset.deadTilePolicy === 'discardAndReplace'
              ? c.turn.deadTileDiscard
              : c.turn.deadTileKeep,
        }),
        fill(c.turn.end, { endSize: ruleset.endChainSize }) + (vote ? c.turn.endVote : ''),
      ]),
    },
    {
      id: 'merger',
      title: c.merger.title,
      body: (
        <>
          {note(c.merger.note)}
          {list([
            fill(c.merger.survivor, { safe: ruleset.safeSize }),
            c.merger.order,
            fill(c.merger.bonuses, {
              tiers: threeTiers ? c.merger.tiersThree : c.merger.tiersTwo,
            }),
            c.merger.disposal,
            c.merger.headquarters,
          ])}
        </>
      ),
    },
    ...(vote
      ? [
          {
            id: 'going-public',
            title: c.goingPublic.title,
            body: (
              <>
                {note(c.goingPublic.note)}
                {list([
                  fill(c.goingPublic.window, { quorum: vote.quorumSafeCorps }),
                  fill(c.goingPublic.moving, {
                    allowance:
                      vote.motionsPerPlayer === 1
                        ? c.goingPublic.allowanceOne
                        : fill(c.goingPublic.allowanceMany, { n: vote.motionsPerPlayer }),
                  }),
                  c.goingPublic.register,
                  fill(c.goingPublic.voting, {
                    quota: Math.round(quotaFor(vote, view.seats.length) * 100),
                    backers: vote.minBackers,
                  }),
                  c.goingPublic.price,
                ])}
                {note(c.goingPublic.standing)}
              </>
            ),
          },
        ]
      : []),
    {
      id: 'worth-knowing',
      title: c.worthKnowing.title,
      body: list(
        [
          ...(ruleset.forcedVisibility === 'hidden' ? [c.worthKnowing.closedBooks] : []),
          c.worthKnowing.finiteStock,
          c.worthKnowing.noSelling,
          c.worthKnowing.broke,
          c.worthKnowing.safe,
          c.worthKnowing.settlement,
        ],
        false,
      ),
    },
    { id: 'table', title: c.table.title, body: keyValueGrid(constants(ruleset)) },
    {
      id: 'edition',
      title: fill(c.edition.title, { edition: editionLabel(ruleset.id) }),
      body: keyValueGrid(editionRules(ruleset, view.seats.length)),
    },
  ];
}

/**
 * The rules of play, read off the ruleset rather than written down — the rule
 * sets disagree on safe size, the end trigger, bonus tiers and the sole-holder
 * payout, and Boomtown adds a whole second ending on top, so this modal has to
 * be right for whichever one the table is on (`docs/rules.md`, "the ruleset is
 * data, not code").
 *
 * Which is why the Going Public section is built off `ruleset.endVote` rather
 * than off the preset's id: a rule the player can be asked to vote on within a
 * turn of opening this modal has to be explained by the same object the engine
 * settles it with, or the two drift.
 *
 * **One section at a time.** It used to be every section stacked in a scroller,
 * which is a wall of text at exactly the moment someone is confused and looking
 * for one answer — and scroll position tells you nothing about how much of it
 * you have left. Paged, each section is a card you finish, the dots say how far
 * along you are, and a player who only wants the merger sequence can jump
 * straight to it. The body is a fixed height for the same reason: a card that
 * resized under every step would make the arrows move as you used them.
 *
 * It is the *rules*; the price and bonus numbers live in `StockReference` and
 * are not duplicated here.
 *
 * Reads `useAnyView()`: the rules are public and identical for every seat, so
 * this must not depend on the active seat being local — a player waiting out
 * someone else's turn is exactly who reaches for it.
 */
export function RulesReference({
  open,
  onClose,
  onOpenChart,
}: {
  open: boolean;
  onClose: () => void;
  onOpenChart: () => void;
}) {
  const view = useAnyView();
  const [index, setIndex] = useState(0);

  // Every opening starts at the first section. Somebody reaching for the rules
  // twice is asking two different questions, and the second should not begin
  // wherever the first happened to stop.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const sections = view ? rulesSections(view.ruleset, view) : [];
  const at = Math.min(index, Math.max(sections.length - 1, 0));
  const section = sections[at];

  // The arrow keys page the carousel. Escape still closes it (Radix's own), so
  // the whole thing is reachable without ever touching the mouse.
  useEffect(() => {
    if (!open || sections.length === 0) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setIndex((current) => {
        const next = event.key === 'ArrowRight' ? current + 1 : current - 1;
        return Math.min(Math.max(next, 0), sections.length - 1);
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, sections.length]);

  if (!view || !section) return null;

  const { ruleset } = view;
  const first = at === 0;
  const last = at === sections.length - 1;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.rules} aria-describedby={undefined}>
          <header className={styles.head}>
            <div>
              <Dialog.Title className="serif">{c.title}</Dialog.Title>
              <p className={styles.sub}>
                {fill(c.sub, { edition: editionLabel(ruleset.id) })}
              </p>
            </div>
            <div className={styles.headRight}>
              <span className={styles.safeNote}>
                {fill(copy.reference.safeNote, { n: ruleset.safeSize })}
              </span>
              <Dialog.Close className={styles.close} aria-label={copy.reference.close}>
                ✕
              </Dialog.Close>
            </div>
          </header>

          <div className={styles.rulesBody}>
            <section
              className={styles.rulesSection}
              aria-label={section.title}
              aria-live="polite"
              key={section.id}
            >
              <h2 className={styles.rulesHeading}>{section.title}</h2>
              {section.body}
            </section>
          </div>

          <nav className={styles.rulesNav} aria-label={c.sections}>
            <button
              type="button"
              className={styles.rulesStep}
              onClick={() => setIndex(at - 1)}
              disabled={first}
              aria-label={c.previous}
            >
              <ChevronLeftIcon width={14} height={14} aria-hidden />
              {c.back}
            </button>

            <ol className={styles.rulesDots}>
              {sections.map((candidate, i) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className={styles.rulesDot}
                    onClick={() => setIndex(i)}
                    aria-label={candidate.title}
                    aria-current={i === at ? 'step' : undefined}
                  />
                </li>
              ))}
            </ol>

            <button
              type="button"
              className={styles.rulesStep}
              onClick={() => setIndex(at + 1)}
              disabled={last}
              aria-label={c.next}
            >
              {c.forward}
              <ChevronRightIcon width={14} height={14} aria-hidden />
            </button>
          </nav>

          <footer className={`${styles.foot} ${styles.rulesFoot}`}>
            <span>{fill(c.counter, { n: at + 1, total: sections.length })}</span>
            <span>
              {c.stockLine}{' '}
              <button type="button" className={styles.linkButton} onClick={onOpenChart}>
                {c.stockLink}
              </button>
              .
            </span>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
