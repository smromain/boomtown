import { activeView, type GameClientState } from '@boomtown/client-core';
import { useGameState } from '../client/GameClientProvider.js';
import type { GameConfig } from '../setup/gameConfig.js';
import styles from './game.module.css';

const STEP_LABEL: Record<string, string> = {
  place: 'placing a tile',
  found: 'founding a corporation',
  merge: 'resolving a merger',
  buy: 'buying stock',
  'end-check': 'deciding whether to end the game',
};

function activeName(state: GameClientState, config: GameConfig): string {
  const seat = state.activeSeat;
  if (seat == null) return 'the next player';
  return config.seats[seat]?.name ?? activeView(state)?.seats[seat]?.name ?? `Player ${seat + 1}`;
}

/**
 * Shown in place of the board and rack while the seat on the clock is a bot (or,
 * online, a remote player). The public game state keeps updating behind the
 * story and corporation panels; only the actionable surface is withheld.
 */
export function WaitingForSeat({ config }: { config: GameConfig }) {
  const name = useGameState((state) => activeName(state, config));
  const doing = useGameState((state) => {
    const step = activeView(state)?.step;
    return step ? STEP_LABEL[step] ?? 'taking their turn' : 'taking their turn';
  });
  const kind = useGameState((state) =>
    state.activeSeat != null ? config.seats[state.activeSeat]?.kind : undefined,
  );

  return (
    <div className={styles.waiting} role="status" aria-label="Waiting for another player">
      <p className={styles.waitingKicker}>{kind === 'bot' ? 'Bot' : 'Player'}</p>
      <h2 className="serif">{name}</h2>
      <p className={styles.waitingHint}>
        {name} is {doing}…
      </p>
    </div>
  );
}
