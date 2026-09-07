import { useEffect, useState } from 'react';
import type { RoomState } from '@boomtown/protocol';
import type { OnlineGame } from '../online/onlineGame.js';
import { useConnectionStatus } from './useConnectionStatus.js';
import styles from './lobby.module.css';

/**
 * The room lobby: seats filling up, the host's Start control, and a
 * non-blocking connection banner. Once the room reports `phase: 'playing'`,
 * `onEnterGame` fires and the app swaps to the board.
 */
export function SeatList({
  game,
  onEnterGame,
  onLeave,
}: {
  game: OnlineGame;
  onEnterGame: () => void;
  onLeave: () => void;
}) {
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const status = useConnectionStatus(game.transport);

  useEffect(() => {
    game.transport.onRoomState((state) => {
      setRoomState(state);
      if (state.phase === 'playing') onEnterGame();
    });
  }, [game, onEnterGame]);

  const seats = roomState?.seats ?? [];
  const filled = seats.every((s) => s.kind !== 'open');
  const mySeat = game.transport.seat();

  return (
    <section className={styles.screen} aria-label="Room lobby">
      <div className={styles.roomHeader}>
        <h1>Room</h1>
        <span className={styles.code} aria-label="Room code">
          {game.roomCode}
        </span>
        <span className={styles.hint}>Share this code with the other players.</span>
      </div>

      {status !== 'open' && (
        <div className={styles.banner} data-status={status} role="status">
          {status === 'connecting' ? 'Connecting…' : 'Connection lost — retrying…'}
        </div>
      )}

      <ol className={styles.seats}>
        {seats.map((seat) => (
          <li key={seat.index} className={styles.seatRow}>
            <span className={styles.dot} data-connected={seat.connected} />
            <span>
              {seat.name ?? 'Open seat'}
              {seat.index === mySeat ? ' (you)' : ''}
            </span>
            <span className={styles.kind}>{seat.kind}</span>
          </li>
        ))}
        {seats.length === 0 && <li className={styles.seatRow}>Waiting for the room…</li>}
      </ol>

      {game.isHost ? (
        <button
          type="button"
          className={styles.primary}
          disabled={!filled || status !== 'open'}
          onClick={() => game.transport.start()}
        >
          {filled ? 'Start game' : 'Waiting for players…'}
        </button>
      ) : (
        <p className={styles.hint}>Waiting for the host to start.</p>
      )}

      <button type="button" className={styles.back} onClick={onLeave}>
        Leave room
      </button>
    </section>
  );
}
