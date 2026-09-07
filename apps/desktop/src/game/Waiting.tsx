import { useEffect, useRef, useState } from 'react';
import { activeView, type GameClientState } from '@boomtown/client-core';
import type { GameState } from '@boomtown/engine';
import { useGameClient, useGameState } from '../client/GameClientProvider.js';
import { debugDump } from '../debug/dump.js';
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

/** How long the same seat can hold the clock before we offer a manual nudge. */
const NUDGE_AFTER_MS = 8000;

/**
 * Shown in place of the board and rack while the seat on the clock is a bot (or,
 * online, a remote player). The public game state keeps updating behind the
 * story and corporation panels; only the actionable surface is withheld.
 *
 * If the same seat holds the clock for too long, a "nudge" control appears: it
 * writes a diagnostic snapshot and forces the bot to move. The driver has its
 * own watchdog for this, but the button is a guaranteed escape hatch.
 */
export function WaitingForSeat({
  config,
  nudge,
  snapshot,
}: {
  config: GameConfig;
  nudge: (() => void) | undefined;
  snapshot: (() => GameState) | undefined;
}) {
  const client = useGameClient();
  const name = useGameState((state) => activeName(state, config));
  const activeSeat = useGameState((state) => state.activeSeat);
  const doing = useGameState((state) => {
    const step = activeView(state)?.step;
    return step ? STEP_LABEL[step] ?? 'taking their turn' : 'taking their turn';
  });
  const kind = useGameState((state) =>
    state.activeSeat != null ? config.seats[state.activeSeat]?.kind : undefined,
  );

  const [showNudge, setShowNudge] = useState(false);
  const dumpedFor = useRef<number | null>(null);

  useEffect(() => {
    setShowNudge(false);
    if (activeSeat == null || kind !== 'bot') return;
    const timer = setTimeout(() => {
      setShowNudge(true);
      // auto-capture a snapshot the first time a given seat overstays
      if (dumpedFor.current !== activeSeat && snapshot) {
        dumpedFor.current = activeSeat;
        debugDump('bot-slow', {
          note: `seat ${activeSeat} has held the clock > ${NUDGE_AFTER_MS}ms`,
          state: snapshot(),
          log: client.store.getState().log,
        });
      }
    }, NUDGE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [activeSeat, kind, snapshot, client]);

  return (
    <div className={styles.waiting} role="status" aria-label="Waiting for another player">
      <p className={styles.waitingKicker}>{kind === 'bot' ? 'Bot' : 'Player'}</p>
      <h2 className="serif">{name}</h2>
      <p className={styles.waitingHint}>
        {name} is {doing}…
      </p>
      {showNudge && nudge && (
        <button
          type="button"
          className={styles.nudge}
          onClick={() => {
            if (snapshot) {
              debugDump('bot-nudge', {
                note: `manual nudge for seat ${activeSeat}`,
                state: snapshot(),
                log: client.store.getState().log,
              });
            }
            nudge();
            setShowNudge(false);
          }}
        >
          {name} is taking a while — nudge them
        </button>
      )}
    </div>
  );
}
