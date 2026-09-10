import * as Dialog from '@radix-ui/react-dialog';
import { RULES, TOTAL_SHARES, type Ruleset } from '@boomtown/engine';
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

/** The rows that actually differ between the two published editions. */
function editionRules(ruleset: Ruleset): readonly (readonly [string, string])[] {
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
  ];
}

/**
 * The rules of play, read off the ruleset rather than written down — the two
 * editions disagree on safe size, the end trigger, bonus tiers and the sole-
 * holder payout, and this modal has to be right for whichever one the table is
 * on (`docs/rules.md`, "the ruleset is data, not code").
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
  if (!view) return null;

  const { ruleset } = view;
  const threeTiers = ruleset.bonusTiers === 3;

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
            <section className={styles.rulesSection}>
              <h2 className={styles.rulesHeading}>Your turn, in order</h2>
              <ol className={styles.rulesList}>
                <li>
                  <strong>Place a tile.</strong> Mandatory if any tile in hand can be played. It
                  either sits alone, <em>founds</em> a corporation (pick any free headquarters and
                  take a free share), <em>grows</em> the one corporation it touches, or{' '}
                  <em>merges</em> two or more.
                </li>
                <li>
                  <strong>Buy stock.</strong> Optional — up to{' '}
                  {RULES.maxStockPurchasesPerTurn} shares in any corporations already on the board,
                  as far as your cash and the bank's stock allow.
                </li>
                <li>
                  <strong>Draw back to {RULES.handSize}.</strong> A tile that could never be played
                  — one that would merge two safe corporations —{' '}
                  {ruleset.deadTilePolicy === 'discardAndReplace'
                    ? 'is turned face up, set out of play, and replaced.'
                    : 'stays in your hand.'}
                </li>
                <li>
                  <strong>Call the end, or don't.</strong> Once a corporation reaches{' '}
                  {ruleset.endChainSize} tiles you <em>may</em> end the game. Never forced.
                </li>
              </ol>
            </section>

            <section className={styles.rulesSection}>
              <h2 className={styles.rulesHeading}>When corporations merge</h2>
              <p className={styles.rulesNote}>
                The only part of the game where order really matters. The tile you just placed{' '}
                <strong>never counts</strong> toward either corporation — not for size, price or
                bonuses. It joins the survivor once the dust settles.
              </p>
              <ol className={styles.rulesList}>
                <li>
                  <strong>Biggest survives.</strong> On a tie the player who placed the tile
                  chooses. A corporation of {ruleset.safeSize} tiles or more is safe and can never
                  be dissolved — so two safe corporations can never merge at all.
                </li>
                <li>
                  <strong>Defunct chains resolve one at a time, largest first</strong>, each
                  finished before the next begins.
                </li>
                <li>
                  <strong>Bonuses are paid</strong> to its largest shareholders —{' '}
                  {threeTiers ? 'primary, secondary and tertiary' : 'majority and minority'} —
                  priced at the size it was <em>before</em> the merger. Nothing is paid on the
                  survivor.
                </li>
                <li>
                  <strong>Then everyone disposes of the dead stock</strong>, starting with the
                  player who placed the tile and going clockwise. Each of you splits your shares
                  however you like between <em>holding</em> them, <em>selling</em> at the defunct
                  price, and <em>trading</em> two of them for one share of the survivor.
                </li>
                <li>
                  <strong>The headquarters goes back to the tray.</strong> That name can be founded
                  again later — and any shares you kept come back to life with it.
                </li>
              </ol>
            </section>

            <section className={styles.rulesSection}>
              <h2 className={styles.rulesHeading}>Worth knowing</h2>
              <ul className={styles.rulesList}>
                <li>
                  <strong>Stock is finite.</strong> An empty bank blocks buying, the founder's free
                  share and 2-for-1 trades alike.
                </li>
                <li>
                  <strong>Shares don't sell on demand.</strong> Stock only becomes cash in a merger
                  or in the final settlement.
                </li>
                <li>
                  <strong>Being broke is playable.</strong> With no cash you still place and draw.
                  Nobody is knocked out.
                </li>
                <li>
                  <strong>Safe is permanent</strong> — and a safe corporation still grows and still
                  swallows others.
                </li>
                <li>
                  <strong>At the end</strong>, every corporation still standing pays bonuses as if
                  it were merging, then the bank buys back all stock at its current price. Shares in
                  a corporation that never made it onto the board are worth nothing.
                </li>
              </ul>
            </section>

            <section className={styles.rulesSection}>
              <h2 className={styles.rulesHeading}>The table</h2>
              <div className={styles.rulesGrid}>
                {constants(ruleset).map(([label, value]) => (
                  <div key={label} className={styles.rulesRow}>
                    <span className={styles.rulesKey}>{label}</span>
                    <span className={styles.rulesValue}>{value}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.rulesSection}>
              <h2 className={styles.rulesHeading}>
                What {editionLabel(ruleset.id)} sets
              </h2>
              <div className={styles.rulesGrid}>
                {editionRules(ruleset).map(([label, value]) => (
                  <div key={label} className={styles.rulesRow}>
                    <span className={styles.rulesKey}>{label}</span>
                    <span className={styles.rulesValue}>{value}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <footer className={styles.foot}>
            Share prices and the bonuses that go with them are in the{' '}
            <button type="button" className={styles.linkButton} onClick={onOpenChart}>
              stock reference
            </button>
            .
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
