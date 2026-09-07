import { RULES, classic, edition2015 } from '@boomtown/engine';
import styles from './setup.module.css';

/**
 * A short, self-contained how-to-play shown on the New Game screen. The prose is
 * original and describes only this implementation. The "where the rule sets
 * differ" table pulls its numbers from the two ruleset presets so it cannot
 * drift from the engine.
 */
export function RulesSummary() {
  return (
    <details className={styles.rules} open>
      <summary className={styles.rulesSummary}>How to play</summary>

      <div className={styles.rulesBody}>
        <p>
          Build seven rival companies across a shared grid and profit from the stock you hold in
          them. Everyone starts with ${RULES.startingCash.toLocaleString()} and a rack of{' '}
          {RULES.handSize} tiles. The richest player when the game ends wins.
        </p>

        <h3>A turn</h3>
        <ol>
          <li>
            <strong>Place a tile.</strong> A lone tile does nothing. Next to loose tiles it{' '}
            <em>founds</em> a company — you pick which of the free companies to raise and take one
            free share. Next to one company it <em>grows</em> that company. Between two or more, it{' '}
            <em>merges</em> them.
          </li>
          <li>
            <strong>Buy stock</strong> — up to {RULES.maxStockPurchasesPerTurn} shares in any active
            companies, if you can afford them and the bank still has them.
          </li>
          <li>
            <strong>Draw</strong> back up to {RULES.handSize} tiles.
          </li>
        </ol>
        <p className={styles.rulesNote}>
          A company that reaches its “safe” size can never be dissolved. Once a company is safe, or
          the largest company passes the end-size, any player may call the game on their turn.
        </p>

        <h3>Mergers</h3>
        <p>
          The larger company survives and swallows the smaller; you break ties. The placed tile is
          set aside while sizes, prices and bonuses are worked out, then joins the survivor. For
          each dissolved company, largest first:
        </p>
        <ul>
          <li>
            its shareholders are paid a bonus, scaled to the company’s size just before the merger —
            biggest holder gets the most;
          </li>
          <li>
            then, starting with whoever caused the merger and going clockwise, each holder may keep
            their now-defunct shares, sell them to the bank, or trade two of them for one share of
            the survivor.
          </li>
        </ul>
        <p className={styles.rulesNote}>
          A dissolved company’s headquarters returns to the tray. If that company is founded again
          later, shares you kept come back to life with it.
        </p>

        <h3>Where the two rule sets differ</h3>
        <table className={styles.rulesTable}>
          <thead>
            <tr>
              <th />
              <th>Classic</th>
              <th>Modern</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Safe size</td>
              <td>{classic.safeSize} tiles</td>
              <td>{edition2015.safeSize} tiles</td>
            </tr>
            <tr>
              <td>Ends when a company reaches</td>
              <td>{classic.endChainSize} tiles</td>
              <td>{edition2015.endChainSize} tiles</td>
            </tr>
            <tr>
              <td>Merger bonuses</td>
              <td>two — majority and minority</td>
              <td>three — primary, secondary and tertiary</td>
            </tr>
            <tr>
              <td>Price bands</td>
              <td>widen every 10 tiles past 5</td>
              <td>widen every 10 tiles past 7</td>
            </tr>
            <tr>
              <td>Two-player game</td>
              <td>played straight</td>
              <td>the bank holds shares too, drawn fresh each merger</td>
            </tr>
          </tbody>
        </table>
        <p className={styles.rulesNote}>
          Pick the rule set below. Cash and price both climb faster in the Modern set; Classic runs
          a little longer.
        </p>
      </div>
    </details>
  );
}
