import { useEffect, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { RULES, TOTAL_SHARES, quotaFor, type PlayerView, type Ruleset } from '@boomtown/engine';
import { useAnyView } from '../client/GameClientProvider.js';
import { editionLabel } from '../setup/editionLabel.js';
import styles from './reference.module.css';

/** A line in the setup table — everything both editions agree on. */
function constants(ruleset: Ruleset): readonly (readonly [string, string])[] {
  return [
    ['Players', `${RULES.minPlayers}–${RULES.maxPlayers}`],
    ['Board', `${ruleset.board.cols} × ${ruleset.board.rows}`],
    ['Starting cash', `$${RULES.startingCash.toLocaleString()}`],
    ['Tiles in hand', String(RULES.handSize)],
    ['Corporations', String(RULES.corporationCount)],
    ['Shares each', `${RULES.sharesPerCorporation} (${TOTAL_SHARES} in all)`],
    ['Stock per turn', `up to ${RULES.maxStockPurchasesPerTurn}, across any active corporations`],
    ["Founder's bonus", `${RULES.founderBonusShares} free share, if the bank still has one`],
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
  return [
    ['Safe size', `${ruleset.safeSize}+ tiles — cannot be dissolved`],
    ['End may be called at', `${ruleset.endChainSize}+ tiles in one corporation`],
    [
      'Bonus tiers',
      ruleset.bonusTiers === 3 ? 'primary · secondary · tertiary' : 'majority · minority',
    ],
    [
      'Sole shareholder takes',
      ruleset.soleHolderPolicy === 'both' ? 'both bonuses' : 'primary and tertiary — not secondary',
    ],
    [
      'Tied bonus split',
      ruleset.splitRounding === 'up100' ? 'rounded up to the nearest $100' : 'split as it falls',
    ],
    [
      'Dead tiles',
      ruleset.deadTilePolicy === 'discardAndReplace'
        ? 'revealed, set out of play, and replaced'
        : 'stay in hand',
    ],
    [
      'Two-player game',
      ruleset.phantomShareholderInTwoPlayer
        ? 'the bank holds shares and collects bonuses too'
        : 'no phantom shareholder',
    ],
    ...(ruleset.forcedVisibility === 'hidden'
      ? ([['Books', 'closed — your cash and holdings are yours alone']] as const)
      : []),
    ...(vote
      ? ([
          ['A vote may end it', `once ${vote.quorumSafeCorps} corporations are safe`],
          [
            'A motion carries on',
            `${Math.round(quotaFor(vote, seatCount) * 100)}% of the register, backed by ${vote.minBackers}+ players`,
          ],
          ['Motions per player', `${vote.motionsPerPlayer} for the whole game`],
          ['Backing one that fails', 'your books stay open for the rest of the game'],
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

  return [
    {
      id: 'turn',
      title: 'Your turn, in order',
      body: (
        <ol className={styles.rulesList}>
          <li>
            <strong>Place a tile.</strong> Mandatory if any tile in hand can be played. It either
            sits alone, <em>founds</em> a corporation (pick any free headquarters and take a free
            share), <em>grows</em> the one corporation it touches, or <em>merges</em> two or more.
          </li>
          <li>
            <strong>Buy stock.</strong> Optional — up to {RULES.maxStockPurchasesPerTurn} shares in
            any corporations already on the board, as far as your cash and the bank's stock allow.
          </li>
          <li>
            <strong>Draw back to {RULES.handSize}.</strong> A tile that could never be played — one
            that would merge two safe corporations —{' '}
            {ruleset.deadTilePolicy === 'discardAndReplace'
              ? 'is turned face up, set out of play, and replaced.'
              : 'stays in your hand.'}
          </li>
          <li>
            <strong>Call the end, or don't.</strong> Once a corporation reaches{' '}
            {ruleset.endChainSize} tiles you <em>may</em> end the game. Never forced.
            {vote && (
              <>
                {' '}
                Before that point you may instead <em>move to liquidate</em> and put the ending to a
                vote — see Going public.
              </>
            )}
          </li>
        </ol>
      ),
    },
    {
      id: 'merger',
      title: 'When corporations merge',
      body: (
        <>
          <p className={styles.rulesNote}>
            The only part of the game where order really matters. The tile you just placed{' '}
            <strong>never counts</strong> toward either corporation — not for size, price or
            bonuses. It joins the survivor once the dust settles.
          </p>
          <ol className={styles.rulesList}>
            <li>
              <strong>Biggest survives.</strong> On a tie the player who placed the tile chooses. A
              corporation of {ruleset.safeSize} tiles or more is safe and can never be dissolved —
              so two safe corporations can never merge at all.
            </li>
            <li>
              <strong>Defunct chains resolve one at a time, largest first</strong>, each finished
              before the next begins.
            </li>
            <li>
              <strong>Bonuses are paid</strong> to its largest shareholders —{' '}
              {threeTiers ? 'primary, secondary and tertiary' : 'majority and minority'} — priced at
              the size it was <em>before</em> the merger. Nothing is paid on the survivor.
            </li>
            <li>
              <strong>Then everyone disposes of the dead stock</strong>, starting with the player
              who placed the tile and going clockwise. Each of you splits your shares however you
              like between <em>holding</em> them, <em>selling</em> at the defunct price, and{' '}
              <em>trading</em> two of them for one share of the survivor.
            </li>
            <li>
              <strong>The headquarters goes back to the tray.</strong> That name can be founded
              again later — and any shares you kept come back to life with it.
            </li>
          </ol>
        </>
      ),
    },
    ...(vote
      ? [
          {
            id: 'going-public',
            title: 'Going public',
            body: (
              <>
                <p className={styles.rulesNote}>
                  The other way the game can end, and the reason the books are closed. Nobody has to
                  wait for one enormous corporation: at any point the table can be asked to wind the
                  game up, and it decides.
                </p>
                <ol className={styles.rulesList}>
                  <li>
                    <strong>The window opens</strong> once {vote.quorumSafeCorps} corporations are
                    safe. It closes again the moment the game could simply be ended the ordinary way
                    — asking is pointless when you could just announce.
                  </li>
                  <li>
                    <strong>Any player, at the end of their own turn, may move to liquidate</strong>{' '}
                    —{' '}
                    {vote.motionsPerPlayer === 1
                      ? 'once each per game'
                      : `${vote.motionsPerPlayer} times each per game`}
                    . Moving <em>is</em> voting for it; you cannot propose an ending and then vote
                    it down.
                  </li>
                  <li>
                    <strong>The register is published</strong> the first time anyone moves, and
                    stays public for the rest of the game. It is one vote per share held in a{' '}
                    <em>safe</em> corporation — those are the only companies certain to still exist
                    at settlement. Stock in a chain that can still be eaten carries no vote.
                  </li>
                  <li>
                    <strong>Everyone votes in turn</strong>, starting with the mover and going
                    clockwise. It carries on {Math.round(quotaFor(vote, view.seats.length) * 100)}%
                    of the register with at least {vote.minBackers} players behind it, and the game
                    ends there and then.
                  </li>
                  <li>
                    <strong>If it fails, everyone who backed it opens their books</strong> — cash
                    and holdings visible to the table for the rest of the game. That is the whole
                    price of a yes: voting against costs nothing, so a speculative or spiteful
                    motion is expensive and a sincere one is nearly free.
                  </li>
                </ol>
                <p className={styles.rulesNote}>
                  Which makes it a question about <strong>standing</strong>, not about money.
                  Settling now pays everyone at once, so the only player it helps is whoever is
                  already ahead — and the only way to know whether that is you is to have read the
                  table right.
                </p>
              </>
            ),
          },
        ]
      : []),
    {
      id: 'worth-knowing',
      title: 'Worth knowing',
      body: (
        <ul className={styles.rulesList}>
          {ruleset.forcedVisibility === 'hidden' && (
            <li>
              <strong>The books are closed.</strong> Cash and holdings are private — yours alone,
              and this rule set fixes it that way. What anyone owns has to be inferred from what
              they have been seen to buy, so a purchase is a statement as much as an investment.
            </li>
          )}
          <li>
            <strong>Stock is finite.</strong> An empty bank blocks buying, the founder's free share
            and 2-for-1 trades alike.
          </li>
          <li>
            <strong>Shares don't sell on demand.</strong> Stock only becomes cash in a merger or in
            the final settlement.
          </li>
          <li>
            <strong>Being broke is playable.</strong> With no cash you still place and draw. Nobody
            is knocked out.
          </li>
          <li>
            <strong>Safe is permanent</strong> — and a safe corporation still grows and still
            swallows others.
          </li>
          <li>
            <strong>At the end</strong>, every corporation still standing pays bonuses as if it were
            merging, then the bank buys back all stock at its current price. Shares in a corporation
            that never made it onto the board are worth nothing.
          </li>
        </ul>
      ),
    },
    { id: 'table', title: 'The table', body: keyValueGrid(constants(ruleset)) },
    {
      id: 'edition',
      title: `What ${editionLabel(ruleset.id)} sets`,
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
              <Dialog.Title className="serif">How to play</Dialog.Title>
              <p className={styles.sub}>
                {editionLabel(ruleset.id)} rule set · seven start-ups, one skyline · build chains,
                own the biggest slice when they get eaten
              </p>
            </div>
            <div className={styles.headRight}>
              <span className={styles.safeNote}>safe at {ruleset.safeSize} tiles</span>
              <Dialog.Close className={styles.close} aria-label="Close">
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

          <nav className={styles.rulesNav} aria-label="Rules sections">
            <button
              type="button"
              className={styles.rulesStep}
              onClick={() => setIndex(at - 1)}
              disabled={first}
              aria-label="Previous section"
            >
              <ChevronLeftIcon width={14} height={14} aria-hidden />
              Back
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
              aria-label="Next section"
            >
              Next
              <ChevronRightIcon width={14} height={14} aria-hidden />
            </button>
          </nav>

          <footer className={`${styles.foot} ${styles.rulesFoot}`}>
            <span>
              Section {at + 1} of {sections.length}
            </span>
            <span>
              Share prices and the bonuses that go with them are in the{' '}
              <button type="button" className={styles.linkButton} onClick={onOpenChart}>
                stock reference
              </button>
              .
            </span>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
