import { memo } from 'react';
import type { RankingRow, Retrospective } from '@boomtown/engine';
import styles from './after.module.css';
import { copy } from '../copy/copy.js';

const money = (n: number): string => `$${n.toLocaleString()}`;

/**
 * Frame one: the standings, as numbers.
 *
 * It carried a sparkline per seat in the first design and they were the graph
 * in the next frame at a tenth the resolution. What a standings table is *for*
 * is the figures, so the width goes on the parts net worth is made of — cash,
 * shares, stock at close — which is also the only place the table can check
 * settlement's arithmetic rather than take it on trust.
 */
/**
 * Memoised, like every frame: the carousel re-renders ten times a second to
 * move the sliver under the live tab, and a sixty-turn chart has no business
 * being rebuilt for that.
 */
export const Standings = memo(function Standings({
  rankings,
  record,
  names,
}: {
  rankings: readonly RankingRow[];
  record: Retrospective | null;
  names: readonly string[];
}) {
  const after = copy.game.after.standings;
  const top = rankings[0]?.total ?? 0;
  const start = record?.turns[0]?.seats ?? [];

  return (
    <table className={styles.standings}>
      <thead>
        <tr>
          <th aria-label={after.seat} />
          <th>{after.seat}</th>
          <th>{after.cash}</th>
          <th>{after.shares}</th>
          <th>{after.stock}</th>
          <th>{after.total}</th>
          <th>{after.change}</th>
        </tr>
      </thead>
      <tbody>
        {rankings.map((row, index) => {
          const shares = row.holdings.reduce((sum, entry) => sum + entry.shares, 0);
          const opening = start[row.seat]?.netWorth ?? null;
          const change = opening === null ? null : row.total - opening;
          return (
            <tr key={row.seat} data-winner={row.total === top}>
              <td>{index + 1}</td>
              <td>{names[row.seat] ?? ''}</td>
              <td className="tabnum">{money(row.cash)}</td>
              <td className="tabnum">{shares}</td>
              <td className="tabnum">{money(row.equity)}</td>
              <td className={`tabnum ${styles.total}`}>{money(row.total)}</td>
              <td className="tabnum">
                {change === null ? '' : `${change >= 0 ? '+' : '−'}${Math.abs(change).toLocaleString()}`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
});
