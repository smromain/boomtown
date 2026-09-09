import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomConfig, RoomMessage, RoomState } from '@boomtown/protocol';

/**
 * A stand-in for `partysocket`: it records what was sent and lets a test push
 * frames back, so the transport's own bookkeeping (who hears which frame, and
 * when) can be tested without a room.
 */
class FakeSocket {
  static last: FakeSocket | null = null;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();
  closed = false;

  constructor(readonly opts: unknown) {
    FakeSocket.last = this;
  }

  addEventListener(type: string, handler: (event: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, event: unknown = {}): void {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }

  /** Deliver one room frame. */
  deliver(message: RoomMessage): void {
    this.emit('message', { data: JSON.stringify(message) });
  }
}

vi.mock('partysocket', () => ({ default: FakeSocket }));

const { socketTransport } = await import('@boomtown/client-core');

const config: RoomConfig = {
  seatCount: 3,
  edition: 'classic',
  visibility: 'open',
  bots: { 1: 5, 2: 5 },
  seed: 7,
};

const roomState = (over: Partial<RoomState> = {}): RoomState => ({
  code: 'ROOM01',
  phase: 'lobby',
  config,
  seats: [
    { index: 0, kind: 'human', name: 'Ana', connected: true },
    { index: 1, kind: 'bot', name: 'Bot 2', connected: true },
    { index: 2, kind: 'bot', name: 'Bot 3', connected: true },
  ],
  ...over,
});

/** Connect a create-intent transport and answer with welcome + room-state. */
async function connected() {
  const transport = socketTransport({
    host: 'localhost:1999',
    room: 'ROOM01',
    name: 'Ana',
    intent: { kind: 'create', config },
  });
  const connect = transport.connect();
  const socket = FakeSocket.last!;
  socket.emit('open');
  socket.deliver({ type: 'welcome', seat: 0, token: 'tok' });
  socket.deliver({ type: 'room-state', state: roomState() });
  await connect;
  return { transport, socket };
}

beforeEach(() => {
  FakeSocket.last = null;
});

describe('socketTransport', () => {
  it('sends create-room once the socket opens, and resolves on welcome', async () => {
    const { socket, transport } = await connected();
    expect(JSON.parse(socket.sent[0]!)).toEqual({ type: 'create-room', config });
    expect(transport.seat()).toBe(0);
    expect(transport.token()).toBe('tok');
  });

  it('replays the room state to a subscriber that arrives after the frame', async () => {
    // The bug: the lobby cannot subscribe until React mounts it, which is
    // always after connect() resolved — and with one human and two bots no
    // second broadcast ever follows to rescue it.
    const { transport } = await connected();
    const seen: RoomState[] = [];
    transport.onRoomState((state) => seen.push(state));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.seats.map((s) => s.kind)).toEqual(['human', 'bot', 'bot']);
    expect(transport.roomState()?.code).toBe('ROOM01');
  });

  it('replays the current connection status to a late subscriber', async () => {
    const { transport } = await connected();
    const seen: string[] = [];
    transport.onConnectionChange((status) => seen.push(status));
    expect(seen).toEqual(['open']);
    expect(transport.connectionStatus()).toBe('open');
  });

  it('replays the last lobby error to a late subscriber', async () => {
    const { transport, socket } = await connected();
    socket.deliver({
      type: 'error',
      error: { kind: 'protocol', code: 'room-full', message: 'all seats are taken' },
    });
    const seen: { code: string }[] = [];
    transport.onLobbyError((error) => seen.push(error));
    expect(seen).toEqual([{ code: 'room-full', message: 'all seats are taken' }]);
  });

  it('keeps feeding live subscribers after a replay', async () => {
    const { transport, socket } = await connected();
    const seen: RoomState[] = [];
    transport.onRoomState((state) => seen.push(state));
    socket.deliver({ type: 'room-state', state: roomState({ phase: 'playing' }) });
    expect(seen.map((s) => s.phase)).toEqual(['lobby', 'playing']);
  });

  it('does not re-send create-room when partysocket transparently reconnects', async () => {
    const { socket } = await connected();
    socket.emit('open');
    expect(socket.sent.filter((s) => s.includes('create-room'))).toHaveLength(1);
  });

  it('rejects connect when the room answers with an error instead of a welcome', async () => {
    const transport = socketTransport({
      host: 'localhost:1999',
      room: 'NOPE01',
      name: 'Bo',
      intent: { kind: 'join' },
    });
    const connect = transport.connect();
    const socket = FakeSocket.last!;
    socket.emit('open');
    socket.deliver({
      type: 'error',
      error: { kind: 'protocol', code: 'not-in-room', message: 'no such room' },
    });
    await expect(connect).rejects.toThrow(/not-in-room/);
  });

  it('rejects connect when the room accepts the socket but never answers', async () => {
    vi.useFakeTimers();
    try {
      const transport = socketTransport({
        host: 'localhost:1999',
        room: 'QUIET1',
        name: 'Bo',
        intent: { kind: 'join' },
        connectTimeoutMs: 50,
      });
      const connect = transport.connect();
      const failure = expect(connect).rejects.toThrow(/never answered/);
      FakeSocket.last!.emit('open');
      await vi.advanceTimersByTimeAsync(60);
      await failure;
    } finally {
      vi.useRealTimers();
    }
  });
});
