import { anyView, endRecord, gameResult } from '@boomtown/client-core';
import { useGameState } from '../client/GameClientProvider.js';
import { AfterGame } from '../after/AfterGame.js';
import { Skyline } from '../art/Skyline.js';
import { Button } from '../ui/Button.js';
import styles from './game.module.css';
import { copy, fill } from '../copy/copy.js';

/**
 * The end screen: who won, and then the whole game to talk over (#68, #69).
 * Shown whenever the game is over, ahead of the board / waiting branch —
 * before this, a game that ended on a bot's (or remote player's) turn left the
 * screen frozen on "waiting for …".
 *
 * The headline is the payoff and comes first; `AfterGame` is the carousel
 * underneath it, which is deliberately the part that moves. `names` is passed
 * down rather than re-derived there so every frame spells a seat the same way.
 */
export function GameOver({ onLeave }: { onLeave: (() => void) | undefined }) {
  const result = useGameState(gameResult);
  // select stable references; derive arrays in render to avoid a re-render loop
  const seats = useGameState((state) => anyView(state)?.seats);
  const announcedBy = useGameState((state) => anyView(state)?.endAnnouncedBy ?? null);
  const record = useGameState(endRecord);
  const corporations = useGameState((state) => anyView(state)?.corporations);
  const reader = useGameState((state) => anyView(state)?.you ?? null);
  const names = seats?.map((s) => s.name) ?? [];

  if (!result) return null;

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

      <AfterGame
        record={record}
        rankings={result.rankings}
        names={names}
        corporations={corporations}
        reader={reader}
      />

      {onLeave && (
        <Button variant="primary" onClick={onLeave}>
          {copy.game.gameOver.newGame}
        </Button>
      )}
    </div>
  );
}
