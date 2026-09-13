import { useEffect, useState } from 'react';
import { netlog } from '@boomtown/client-core';
import type { RoomState } from '@boomtown/protocol';
import type { OnlineGame } from '../online/onlineGame.js';
import { useConnectionStatus, useLobbyError } from './useConnectionStatus.js';
import { Button } from '../ui/Button.js';
import form from '../setup/form.module.css';
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
  // Seeded from the transport, not from null: the room's first `room-state`
  // lands before React mounts this component, so waiting for the next one
  // stranded a one-human room forever (the transport replays it on subscribe
  // too — this just avoids one wasted render).
  const [roomState, setRoomState] = useState<RoomState | null>(() => game.transport.roomState());
  const status = useConnectionStatus(game.transport);
  const lobbyError = useLobbyError(game.transport);

  useEffect(
    () =>
      game.transport.onRoomState((state) => {
        netlog.log('lobby', 'note', 'room-state in the lobby', {
          phase: state.phase,
          seats: state.seats.map((s) => `${s.index}:${s.kind}`),
        });
        setRoomState(state);
        if (state.phase === 'playing') onEnterGame();
      }),
    [game, onEnterGame],
  );

  const seats = roomState?.seats ?? [];
  // `[].every()` is vacuously true — without the length guard an empty seat
  // list reads as "full" and offers Start for a room we know nothing about.
  const filled = seats.length > 0 && seats.every((s) => s.kind !== 'open');
  const mySeat = game.transport.seat();

  useEffect(() => {
    netlog.log('lobby', 'note', 'lobby render', {
      roomCode: game.roomCode,
      isHost: game.isHost,
      status,
      seatCount: seats.length,
      filled,
      mySeat,
      lobbyError: lobbyError?.code ?? null,
    });
  }, [game, status, seats.length, filled, mySeat, lobbyError]);

  return (
    <section className={form.screen} aria-label="Room lobby">
      <header className={form.head}>
        <span className={`kicker ${form.eyebrow}`}>waiting room</span>
        <h1 className={form.title}>Room</h1>
        <div className={styles.roomHeader}>
          <span className={styles.code} aria-label="Room code">
            {game.roomCode}
          </span>
          <span className={styles.hint}>Share this code with the other players.</span>
        </div>
      </header>

      {status !== 'open' && (
        <div className={styles.banner} data-status={status} role="status">
          {status === 'connecting' ? 'Connecting…' : 'Connection lost — retrying…'}
        </div>
      )}

      {lobbyError && (
        <div className={styles.banner} data-status="closed" role="alert">
          {lobbyError.message}
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

      <div className={form.actions}>
        {game.isHost ? (
          <Button
            variant="primary"
            disabled={!filled || status !== 'open'}
            onClick={() => {
              netlog.log('lobby', 'note', 'start pressed', { roomCode: game.roomCode });
              game.transport.start();
            }}
          >
            {filled ? 'Start game' : 'Waiting for players…'}
          </Button>
        ) : (
          <p className={styles.hint}>Waiting for the host to start.</p>
        )}

        <Button variant="ghost" onClick={onLeave}>
          Leave room
        </Button>
      </div>
    </section>
  );
}
