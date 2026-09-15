import { useEffect, useState } from 'react';
import { formatTicket } from '@boomtown/protocol';
import { netlog } from '@boomtown/client-core';
import type { RoomState } from '@boomtown/protocol';
import type { OnlineGame } from '../online/onlineGame.js';
import { useConnectionStatus, useLobbyError } from './useConnectionStatus.js';
import { Button } from '../ui/Button.js';
import { copy } from '../copy/copy.js';
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
  const knocks = roomState?.knocks ?? [];
  const locked = roomState?.locked ?? false;
  /**
   * What to *draw*. Authority is the room's: it knows which seat hosts and
   * refuses `admit`, `decline` and `set-locked` from anyone else, so a client
   * that lies here achieves nothing. Deriving the layout from the server's
   * `hostSeat` instead would leave the host looking at an empty action bar
   * until the first room-state landed, which is a flicker bought for no safety.
   */
  const isHost = game.isHost;
  // Connected, no seat, and the room has not refused us: we are at the door.
  const waiting = mySeat === null && !lobbyError;

  useEffect(() => {
    netlog.log('lobby', 'note', 'lobby render', {
      ticket: roomState?.ticket ?? null,
      isHost: game.isHost,
      status,
      seatCount: seats.length,
      filled,
      mySeat,
      lobbyError: lobbyError?.code ?? null,
    });
  }, [game, status, seats.length, filled, mySeat, lobbyError, roomState?.ticket]);

  return (
    <div className={form.viewport}>
      <section className={form.screen} aria-label={copy.lobby.screenLabel}>
        <header className={form.head}>
          <div>
            <span className={`kicker ${form.eyebrow}`}>{copy.lobby.eyebrow}</span>
            <h1 className={form.title}>{copy.lobby.title}</h1>
            <p className={form.lede}>{copy.lobby.lede}</p>
          </div>
          {/* The shareable ticket, not the room's address — the address is 32
              characters of entropy nobody reads out, and it is already in the
              URL this client connected to. A retired or expired ticket shows
              as nothing rather than as a code that no longer works. */}
          <span className={styles.code} aria-label={copy.lobby.roomCode}>
            {roomState?.ticket ? formatTicket(roomState.ticket) : copy.lobby.ticketExpired}
          </span>
        </header>

        <div className={form.body}>
          {status !== 'open' && (
            <div className={styles.banner} data-status={status} role="status">
              {status === 'connecting' ? copy.lobby.connecting : copy.lobby.reconnecting}
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
                  {seat.name ?? copy.lobby.openSeat}
                  {seat.index === mySeat ? copy.lobby.youSuffix : ''}
                </span>
                <span className={styles.kind}>{seat.kind}</span>
                {/* The host can hand a seat to a bot — never reopen it, which
                    would let whoever knocks next inherit those holdings. */}
                {isHost && seat.kind === 'human' && seat.index !== mySeat && (
                  <Button
                    variant="ghost"
                    disabled={status !== 'open'}
                    onClick={() => game.transport.eject(seat.index)}
                  >
                    {copy.lobby.eject}
                  </Button>
                )}
              </li>
            ))}
            {seats.length === 0 && <li className={styles.seatRow}>{copy.lobby.waitingForRoom}</li>}
          </ol>

          {/* Only the host is sent the knock queue, so this renders for nobody
              else even if the component is reused. */}
          {knocks.length > 0 && (
            <section className={styles.door} aria-label={copy.lobby.knocksLabel}>
              <h2 className={styles.doorTitle}>{copy.lobby.knocksTitle}</h2>
              <ol className={styles.seats}>
                {knocks.map((knock) => (
                  <li key={knock.id} className={styles.seatRow}>
                    <span>{knock.name}</span>
                    <span className={styles.doorActions}>
                      <Button
                        variant="primary"
                        disabled={status !== 'open'}
                        onClick={() => game.transport.admit(knock.id)}
                      >
                        {copy.lobby.admit}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={status !== 'open'}
                        onClick={() => game.transport.decline(knock.id)}
                      >
                        {copy.lobby.decline}
                      </Button>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {waiting && (
            <div className={styles.banner} data-status="connecting" role="status">
              {copy.lobby.waitingAtDoor}
            </div>
          )}
        </div>

        <div className={form.actions}>
          <Button variant="ghost" onClick={onLeave}>
            {copy.lobby.leave}
          </Button>
          {isHost && (
            <Button
              variant="ghost"
              disabled={status !== 'open'}
              onClick={() => game.transport.setLocked(!locked)}
            >
              {locked ? copy.lobby.unlock : copy.lobby.lock}
            </Button>
          )}
          {isHost ? (
            <Button
              variant="primary"
              disabled={!filled || status !== 'open'}
              onClick={() => {
                netlog.log('lobby', 'note', 'start pressed', { ticket: roomState?.ticket ?? null });
                game.transport.start();
              }}
            >
              {filled ? copy.lobby.start : copy.lobby.waitingForPlayers}
            </Button>
          ) : (
            // While waiting at the door the banner above already says so; a
            // second copy of the same sentence in the action bar is noise.
            !waiting && <p className={styles.hint}>{copy.lobby.waitingForHost}</p>
          )}
        </div>
      </section>
    </div>
  );
}
