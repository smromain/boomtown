import { useCallback, useEffect, useState } from 'react';
import {
  createGameClient,
  socketTransport,
  type GameClient,
  type GameTransport,
  type SocketExtras,
} from '@boomtown/client-core';
import { TICKET_LENGTH, formatTicket, normaliseTicket, type RoomState } from '@boomtown/protocol';
import { copy, fill } from '@desktop/copy/copy.js';
import { randomName } from '@desktop/online/randomName.js';
import {
  clearSession,
  loadName,
  loadSession,
  resolveTicket,
  roomHost,
  saveName,
  saveSession,
  ticketFromHash,
} from './connection.js';
import { Game } from './Game.js';

const p = copy.phone;

/** One seat's connection to the room: the socket, and the store it feeds. */
export interface PhoneRoom {
  readonly client: GameClient;
  readonly transport: GameTransport & SocketExtras;
  readonly address: string;
  readonly name: string;
}

/**
 * How the page reaches the room. A seam so the flow can be tested without a
 * socket; the real one is `socketTransport`.
 */
export type Connect = (options: {
  address: string;
  name: string;
  token?: string;
}) => Promise<PhoneRoom>;

export const connectToRoom: Connect = async ({ address, name, token }) => {
  const transport = socketTransport({
    host: roomHost(),
    room: address,
    name,
    intent: token ? { kind: 'resume' } : { kind: 'join' },
    ...(token ? { token } : {}),
  });
  const client = createGameClient(transport);
  try {
    await client.connect();
  } catch (error) {
    client.disconnect();
    throw error;
  }
  return { client, transport, address, name };
};

/** How long a resume waits for the room to hand the seat back before knocking afresh. */
const RESUME_GRACE_MS = 3000;

type Screen =
  | { readonly kind: 'join'; readonly error: string | null }
  | { readonly kind: 'connecting' }
  | { readonly kind: 'room'; readonly room: PhoneRoom };

/**
 * The couch-mode phone (#62): join from the QR code, wait at the door, and then
 * play one seat's hand. Everything private to the seat is here and only here;
 * the board, the beats and the story stay on the big screen.
 */
export function App({ connect = connectToRoom }: { connect?: Connect }) {
  const [ticket] = useState(() => ticketFromHash());
  const [screen, setScreen] = useState<Screen>(() =>
    loadSession() ? { kind: 'connecting' } : { kind: 'join', error: null },
  );

  // A stored seat comes back by its token — unless the QR in hand points at a
  // different table, in which case that is where this person is sitting down.
  useEffect(() => {
    const session = loadSession();
    if (!session) return;
    let cancelled = false;
    void (async () => {
      if (ticket) {
        const address = await resolveTicket(ticket);
        if (address && address !== session.address) {
          clearSession();
          if (!cancelled) setScreen({ kind: 'join', error: null });
          return;
        }
      }
      try {
        const room = await connect({ address: session.address, name: session.name, token: session.token });
        const seated = await waitForSeat(room.transport, RESUME_GRACE_MS);
        if (cancelled) return room.client.disconnect();
        if (!seated) {
          // The room no longer knows this token (a new game, or the seat was
          // handed to a bot). Start over at the door.
          room.client.disconnect();
          clearSession();
          setScreen({ kind: 'join', error: null });
          return;
        }
        setScreen({ kind: 'room', room });
      } catch {
        if (!cancelled) setScreen({ kind: 'join', error: p.errors.failed });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connect, ticket]);

  const leave = useCallback((error: string | null) => {
    setScreen((current) => {
      if (current.kind === 'room') current.room.client.disconnect();
      return { kind: 'join', error };
    });
    clearSession();
  }, []);

  switch (screen.kind) {
    case 'connecting':
      return (
        <main className="phone">
          <p className="status">{copy.lobby.connecting}</p>
        </main>
      );
    case 'join':
      return (
        <Join
          ticket={ticket}
          error={screen.error}
          onJoin={async (address, name) => {
            setScreen({ kind: 'connecting' });
            try {
              setScreen({ kind: 'room', room: await connect({ address, name }) });
            } catch (error) {
              setScreen({ kind: 'join', error: joinError(error) });
            }
          }}
        />
      );
    case 'room':
      return <Room room={screen.room} onLeave={leave} />;
  }
}

function joinError(error: unknown): string {
  const text = error instanceof Error ? error.message : '';
  if (text.startsWith('room-full')) return p.errors.full;
  if (text.startsWith('knock-declined') || text.startsWith('room-locked')) return p.errors.declined;
  return p.errors.failed;
}

/** Resolve once the room has bound a seat, or false after `ms`. */
function waitForSeat(transport: SocketExtras, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (transport.seat() !== null) return resolve(true);
      if (Date.now() - started >= ms) return resolve(false);
      setTimeout(tick, 100);
    };
    tick();
  });
}

// --- 1 · Join -------------------------------------------------------------

function Join({
  ticket,
  error,
  onJoin,
}: {
  ticket: string | null;
  error: string | null;
  onJoin: (address: string, name: string) => Promise<void>;
}) {
  const [name, setName] = useState(() => loadName() ?? randomName());
  const [code, setCode] = useState(() => (ticket ? formatTicket(ticket) : ''));
  const [problem, setProblem] = useState<string | null>(error);
  const [busy, setBusy] = useState(false);

  const knock = async () => {
    const chosen = name.trim();
    if (!chosen) return setProblem(p.errors.noName);
    const typed = normaliseTicket(code);
    if (typed.length !== TICKET_LENGTH) return setProblem(p.errors.noCode);
    setBusy(true);
    setProblem(null);
    saveName(chosen);
    const address = await resolveTicket(typed);
    if (!address) {
      setBusy(false);
      return setProblem(p.errors.badCode);
    }
    await onJoin(address, chosen);
  };

  return (
    <main className="phone">
      <header className="masthead">
        <span className="kicker">{p.kicker}</span>
        <h1 className="serif">{p.title}</h1>
        <p className="lede">{p.joinLede}</p>
      </header>

      <label className="field">
        <span className="kicker">{p.yourName}</span>
        <span className="row">
          <input
            value={name}
            maxLength={24}
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
            aria-label={p.yourName}
          />
          <button type="button" className="ghost" aria-label={p.rollLabel} onClick={() => setName(randomName())}>
            {p.roll}
          </button>
        </span>
      </label>

      {/* Opened from the QR, the code arrived in the link and is never typed.
          Opened from the address on the card, it is. */}
      {!ticket && (
        <label className="field">
          <span className="kicker">{p.code}</span>
          <input
            className="code"
            value={code}
            placeholder={p.codePlaceholder}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(e) => setCode(formatTicket(normaliseTicket(e.target.value).slice(0, TICKET_LENGTH)))}
            aria-label={p.code}
          />
        </label>
      )}

      <p className="error" role="alert">
        {problem ?? ''}
      </p>

      <button type="button" className="primary" disabled={busy} onClick={() => void knock()}>
        {busy ? p.knocking : p.knock}
      </button>
      <p className="note">{p.joinNote}</p>
    </main>
  );
}

// --- 2 · At the door, 3 · Seated, then the game ------------------------------

function useRoomState(transport: SocketExtras): RoomState | null {
  const [state, setState] = useState<RoomState | null>(() => transport.roomState());
  useEffect(() => transport.onRoomState(setState), [transport]);
  return state;
}

function useConnection(transport: SocketExtras) {
  const [status, setStatus] = useState(() => transport.connectionStatus());
  useEffect(() => transport.onConnectionChange(setStatus), [transport]);
  return status;
}

function Room({ room, onLeave }: { room: PhoneRoom; onLeave: (error: string | null) => void }) {
  const { transport } = room;
  const roomState = useRoomState(transport);
  const status = useConnection(transport);
  const seat = transport.seat();
  const token = transport.token();

  // Keep the latest token: it rotates on every resume, and a locked phone's
  // next visit has to present the one the room holds now.
  useEffect(() => {
    if (seat !== null && token) saveSession({ address: room.address, token, name: room.name });
  }, [seat, token, room.address, room.name, roomState, status]);

  useEffect(
    () =>
      transport.onLobbyError((error) => {
        if (error.code === 'knock-declined' || error.code === 'room-locked') onLeave(p.errors.declined);
        else if (error.code === 'room-full') onLeave(p.errors.full);
      }),
    [transport, onLeave],
  );

  const reconnecting = status !== 'open' && (
    <div className="banner" role="status">
      <strong>{p.reconnecting}</strong>
      <span>{p.reconnectingNote}</span>
    </div>
  );

  if (seat === null) {
    return (
      <main className="phone">
        {reconnecting}
        <div className="door">
          <span className="initials serif" aria-hidden>
            {initials(room.name)}
          </span>
          <h1 className="serif">{p.doorTitle}</h1>
          <p className="note">{p.doorNote}</p>
        </div>
      </main>
    );
  }

  if (!roomState || roomState.phase === 'lobby') {
    return (
      <main className="phone">
        {reconnecting}
        <header className="masthead">
          <span className="kicker">{p.kicker}</span>
          <h1 className="serif">{p.seatedTitle}</h1>
          <p className="lede">
            {fill(p.seatedLede, { n: seat + 1, total: roomState?.seats.length ?? '…' })}
          </p>
        </header>
        <ol className="seats">
          {(roomState?.seats ?? []).map((slot) => (
            <li key={slot.index}>
              <span className="dot" data-connected={slot.connected} />
              <span>
                {slot.name ?? p.openSeat}
                {slot.index === seat ? p.you : ''}
              </span>
              <span className="kicker">
                {slot.kind === 'bot' ? p.kindBot : slot.kind === 'open' ? p.kindOpen : p.kindPhone}
              </span>
            </li>
          ))}
        </ol>
        <p className="note">{p.seatedNote}</p>
      </main>
    );
  }

  return (
    <Game client={room.client} seat={seat}>
      {reconnecting}
    </Game>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}
