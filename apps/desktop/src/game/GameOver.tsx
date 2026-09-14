import { anyView, gameResult } from '@boomtown/client-core';
import { useGameState } from '../client/GameClientProvider.js';
import { Skyline } from '../art/Skyline.js';
import { Button } from '../ui/Button.js';
import styles from './game.module.css';
import { copy, fill } from '../copy/copy.js';

/**
 * The end screen: final standings and a way out. Shown whenever the game is
 * over, ahead of the board / waiting branch — before this, a game that ended on
 * a bot's (or remote player's) turn left the screen frozen on "waiting for …".
 */
export function GameOver({ onLeave }: { onLeave: (() => void) | undefined }) {
  const result = useGameState(gameResult);
  // select stable references; derive arrays in render to avoid a re-render loop
  const seats = useGameState((state) => anyView(state)?.seats);
  const announcedBy = useGameState((state) => anyView(state)?.endAnnouncedBy ?? null);
  const names = seats?.map((s) => s.name) ?? [];

  if (!result) return null;

  const top = result.rankings[0]?.total ?? 0;
  const nameOf = (seat: number) =>
    names[seat] ?? fill(copy.common.playerFallback, { n: seat + 1 });

  return (
    <div className={styles.gameOver} role="dialog" aria-label={copy.game.gameOver.label}>
      <Skyline tone="ink" className={styles.gameOverArt} />
      <p className={styles.waitingKicker}>{copy.game.gameOver.kicker}</p>
      <h2 className="serif">
        {result.winners.length > 1
          ? fill(copy.game.gameOver.tie, {
              names: result.winners.map((s) => nameOf(s)).join(' & '),
            })
          : fill(copy.game.gameOver.wins, { name: nameOf(result.winners[0]!) })}
      </h2>
      {announcedBy != null && (
        <p className={styles.waitingHint}>
          {fill(copy.game.gameOver.calledTheEnd, { name: nameOf(announcedBy) })}
        </p>
      )}

      <table className={styles.standings}>
        <thead>
          <tr>
            <th>#</th>
            <th>{copy.game.gameOver.player}</th>
            <th>{copy.game.gameOver.cash}</th>
            <th>{copy.game.gameOver.stock}</th>
            <th>{copy.game.gameOver.total}</th>
          </tr>
        </thead>
        <tbody>
          {result.rankings.map((row, i) => (
            <tr key={row.seat} data-winner={row.total === top}>
              <td>{i + 1}</td>
              <td>{nameOf(row.seat)}</td>
              <td className="tabnum">${row.cash.toLocaleString()}</td>
              <td className="tabnum">${row.equity.toLocaleString()}</td>
              <td className="tabnum">${row.total.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {onLeave && (
        <Button variant="primary" onClick={onLeave}>
          {copy.game.gameOver.newGame}
        </Button>
      )}
    </div>
  );
}
