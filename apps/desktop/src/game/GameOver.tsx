import { anyView, gameResult } from '@boomtown/client-core';
import { useGameState } from '../client/GameClientProvider.js';
import { Skyline } from '../art/Skyline.js';
import { Button } from '../ui/Button.js';
import styles from './game.module.css';

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

  return (
    <div className={styles.gameOver} role="dialog" aria-label="Game over">
      <Skyline tone="ink" className={styles.gameOverArt} />
      <p className={styles.waitingKicker}>Game over</p>
      <h2 className="serif">
        {result.winners.length > 1
          ? `${result.winners.map((s) => names[s] ?? `Player ${s + 1}`).join(' & ')} tie`
          : `${names[result.winners[0]!] ?? `Player ${result.winners[0]! + 1}`} wins`}
      </h2>
      {announcedBy != null && (
        <p className={styles.waitingHint}>
          {names[announcedBy] ?? `Player ${announcedBy + 1}`} called the end.
        </p>
      )}

      <table className={styles.standings}>
        <thead>
          <tr>
            <th>#</th>
            <th>Player</th>
            <th>Cash</th>
            <th>Stock</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {result.rankings.map((row, i) => (
            <tr key={row.seat} data-winner={row.total === top}>
              <td>{i + 1}</td>
              <td>{names[row.seat] ?? `Player ${row.seat + 1}`}</td>
              <td className="tabnum">${row.cash.toLocaleString()}</td>
              <td className="tabnum">${row.equity.toLocaleString()}</td>
              <td className="tabnum">${row.total.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {onLeave && (
        <Button variant="primary" onClick={onLeave}>
          New game
        </Button>
      )}
    </div>
  );
}
