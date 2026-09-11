import { afterEach, describe, expect, it } from 'vitest';
import type { ClientMessage, RoomMessage } from '@boomtown/protocol';
import { PROTOCOL_VERSION } from '@boomtown/protocol';

const HOST = '127.0.0.1:1999';

/** A thin test client over the room object: connect, send typed messages, await typed ones. */
class TestClient {
  private ws: WebSocket;
  private queue: RoomMessage[] = [];
  private waiters: ((m: RoomMessage) => void)[] = [];
  private closed = false;
  readonly open: Promise<void>;

  constructor(room: string, params: Record<string, string> = {}) {
    const qs = new URLSearchParams({ v: PROTOCOL_VERSION, name: 'Tester', ...params });
    this.ws = new WebSocket(`ws://${HOST}/parties/main/${room}?${qs}`);
    this.open = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`ws did not open in 10s (is partykit dev on ${HOST}?)`)), 10_000);
      this.ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      this.ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error(`ws connection to ${HOST} failed — is partykit dev running?`));
      });
    });
    this.ws.addEventListener('close', () => {
      this.closed = true;
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String((ev as MessageEvent).data)) as RoomMessage;
      const waiter = this.waiters.shift();
      if (waiter) waiter(msg);
      else this.queue.push(msg);
    });
  }

  send(message: ClientMessage): void {
    this.ws.send(JSON.stringify(message));
  }

  /** Next message of a given type, discarding others (with a timeout). */
  next(type: RoomMessage['type'], ms = 5000): Promise<RoomMessage> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error(`connection is closed; cannot wait for ${type}`));
        return;
      }
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), ms);
      const check = (m: RoomMessage) => {
        if (m.type === type) {
          clearTimeout(timer);
          resolve(m);
        } else {
          this.waiters.unshift(check);
        }
      };
      const buffered = this.queue.findIndex((m) => m.type === type);
      if (buffered >= 0) {
        clearTimeout(timer);
        resolve(this.queue.splice(buffered, 1)[0]!);
      } else {
        this.waiters.push(check);
      }
    });
  }

  close(): void {
    this.ws.close();
  }
}

let clients: TestClient[] = [];
afterEach(() => {
  for (const c of clients) c.close();
  clients = [];
});

function client(room: string, params?: Record<string, string>): TestClient {
  const c = new TestClient(room, params);
  clients.push(c);
  return c;
}

const uniqueRoom = () => `it-${Math.random().toString(36).slice(2, 8)}`;

describe('PartyKit room — end to end', () => {
  it('creates a room, joins two more seats, starts, and each client gets its own view', async () => {
    const room = uniqueRoom();
    const host = client(room);
    await host.open;
    host.send({
      type: 'create-room',
      config: { seatCount: 3, edition: 'classic', visibility: 'open', bots: {}, seed: 42 },
    });
    const welcome = await host.next('welcome');
    expect(welcome.type === 'welcome' && welcome.seat).toBe(0);

    const p2 = client(room);
    await p2.open;
    p2.send({ type: 'join' });
    expect((await p2.next('welcome')).type).toBe('welcome');

    const p3 = client(room);
    await p3.open;
    p3.send({ type: 'join' });
    await p3.next('welcome');

    host.send({ type: 'start' });
    const update = await host.next('update');
    if (update.type !== 'update') throw new Error('shape');
    expect(update.view.you).toBe(0);
    expect(update.view.yourHand).toHaveLength(6);
    expect(update.view.status).toBe('playing');
  });

  it('rejects a join once every seat is full', async () => {
    const room = uniqueRoom();
    const host = client(room);
    await host.open;
    host.send({
      type: 'create-room',
      config: { seatCount: 2, edition: 'classic', visibility: 'open', bots: {}, seed: 1 },
    });
    await host.next('welcome');
    const p2 = client(room);
    await p2.open;
    p2.send({ type: 'join' });
    await p2.next('welcome');

    const p3 = client(room);
    await p3.open;
    p3.send({ type: 'join' });
    const err = await p3.next('error');
    expect(err.type === 'error' && err.error.kind === 'protocol' && err.error.code).toBe('room-full');
  });

  it('rejects a fresh connection with a stale protocol version, before it can create or join', async () => {
    const room = uniqueRoom();
    const stale = client(room, { v: '0' });
    await stale.open;
    const err = await stale.next('error');
    expect(err.type === 'error' && err.error.kind === 'protocol' && err.error.code).toBe('wrong-version');
  });

  it('plays a full game with 1 human + 2 bots to a ranked result', async () => {
    const room = uniqueRoom();
    const host = client(room);
    await host.open;
    host.send({
      type: 'create-room',
      config: { seatCount: 3, edition: 'classic', visibility: 'open', bots: { 1: 6, 2: 6 }, seed: 7 },
    });
    await host.next('welcome');
    host.send({ type: 'start' });

    let view = (await host.next('update')) as Extract<RoomMessage, { type: 'update' }>;
    let safety = 0;
    while (view.view.status === 'playing' && safety++ < 400) {
      if (view.view.activeSeat !== 0 && !view.view.pendingDecision) {
        // waiting on the bots — pull the next update
        view = (await host.next('update', 8000)) as Extract<RoomMessage, { type: 'update' }>;
        continue;
      }
      const command = pickHumanMove(view.view);
      host.send({ type: 'command', command });
      view = (await host.next('update', 8000)) as Extract<RoomMessage, { type: 'update' }>;
    }
    expect(view.view.status).toBe('over');
    expect(view.view.result?.rankings).toHaveLength(3);
  }, 25_000);

  it('a dropped client reconnects with its token and resumes the same seat (AE2)', async () => {
    const room = uniqueRoom();
    const host = client(room);
    await host.open;
    host.send({
      type: 'create-room',
      config: { seatCount: 3, edition: 'classic', visibility: 'open', bots: { 1: 6, 2: 6 }, seed: 3 },
    });
    const welcome = (await host.next('welcome')) as Extract<RoomMessage, { type: 'welcome' }>;
    const token = welcome.token;
    expect(welcome.seat).toBe(0);
    host.send({ type: 'start' });
    await host.next('update');

    // drop
    host.close();
    await new Promise((r) => setTimeout(r, 300));

    // reconnect with the token
    const back = client(room, { token });
    await back.open;
    // onConnect re-binds on the token and pushes welcome + current view
    const rewelcome = (await back.next('welcome')) as Extract<RoomMessage, { type: 'welcome' }>;
    expect(rewelcome.seat).toBe(0);
    const view = (await back.next('update')) as Extract<RoomMessage, { type: 'update' }>;
    expect(view.view.you).toBe(0);
    expect(view.view.status).toBe('playing');
  });

  it('never leaks another seat\'s hand or the bag in a hidden-visibility game', async () => {
    const room = uniqueRoom();
    const host = client(room);
    await host.open;
    host.send({
      type: 'create-room',
      config: { seatCount: 3, edition: 'classic', visibility: 'hidden', bots: {}, seed: 42 },
    });
    await host.next('welcome');
    const p2 = client(room);
    await p2.open;
    p2.send({ type: 'join' });
    await p2.next('welcome');
    const p3 = client(room);
    await p3.open;
    p3.send({ type: 'join' });
    await p3.next('welcome');

    host.send({ type: 'start' });
    const seatBView = (await p2.next('update')) as Extract<RoomMessage, { type: 'update' }>;
    const json = JSON.stringify(seatBView.view);
    expect(seatBView.view.you).toBe(1);
    expect(json).not.toContain('"bag"');
    expect(seatBView.view.seats[0]!.cash).toBeNull(); // opponent, hidden
    expect(seatBView.view.seats[2]!.holdings).toBeNull();
    // only this seat's own hand is present
    expect(seatBView.view.yourHand).toHaveLength(6);
  });
});

function pickHumanMove(view: Extract<RoomMessage, { type: 'update' }>['view']) {
  if (view.pendingDecision) {
    const d = view.pendingDecision;
    if (d.type === 'choose-survivor') return { type: 'choose-survivor' as const, seat: view.you, survivor: d.options[0]! };
    if (d.type === 'choose-defunct-order') return { type: 'choose-defunct-order' as const, seat: view.you, next: d.options[0]! };
    // `PendingDecision` now also carries a motion vote (#26); this scripted
    // client only ever drives mergers, so anything else is not its business.
    if (d.type === 'cast-vote') return { type: 'cast-vote' as const, seat: view.you, inFavour: false };
    return { type: 'dispose-shares' as const, seat: view.you, hold: d.shares, sell: 0, trade: 0 };
  }
  if (view.step === 'place') {
    const playable = view.yourHand[0]!;
    return { type: 'place-tile' as const, seat: view.you, tile: playable };
  }
  if (view.step === 'found') {
    const group = view.pendingFound?.group ?? [];
    const unfounded = (Object.keys(view.corporations) as (keyof typeof view.corporations)[]).find(
      (i) => !view.corporations[i].founded,
    )!;
    return { type: 'found-corporation' as const, seat: view.you, industry: unfounded, hqTile: group[0]! };
  }
  if (view.step === 'buy') return { type: 'buy-shares' as const, seat: view.you, picks: {} };
  if (view.step === 'end-check') return { type: 'end-turn' as const, seat: view.you };
  return { type: 'end-turn' as const, seat: view.you };
}
