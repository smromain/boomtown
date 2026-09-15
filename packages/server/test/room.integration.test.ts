import { afterEach, describe, expect, it } from 'vitest';
import type { ClientMessage, RoomMessage } from '@boomtown/protocol';
import { PROTOCOL_VERSION } from '@boomtown/protocol';
import { TICKET_LENGTH, isTicket, mintRoomAddress, mintTicket } from '@boomtown/protocol';

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

// Rooms are addressed by 160 bits, not by a name anyone can pick — the room
// refuses `create-room` at any other id, so a test has to mint a real one.
/**
 * The new join flow: knock, wait, and be let in by the host. A knock no longer
 * seats anybody, so every test that used to `join` has to go through a person.
 */
async function admit(host: TestClient, joiner: TestClient): Promise<void> {
  joiner.send({ type: 'knock' });
  await joiner.next('waiting');
  // The host's room-state carries the queue; other seats' copies never do.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const state = (await host.next('room-state')) as Extract<RoomMessage, { type: 'room-state' }>;
    const knock = state.state.knocks[0];
    if (knock) {
      host.send({ type: 'admit', knockId: knock.id });
      await joiner.next('welcome');
      return;
    }
  }
  throw new Error('the host never saw the knock');
}

const uniqueRoom = () => mintRoomAddress();

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
    await admit(host, p2);

    const p3 = client(room);
    await p3.open;
    await admit(host, p3);

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
    await admit(host, p2);

    // A third knocker the host tries to admit anyway: the seats are gone.
    const p3 = client(room);
    await p3.open;
    p3.send({ type: 'knock' });
    await p3.next('waiting');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const state = (await host.next('room-state')) as Extract<RoomMessage, { type: 'room-state' }>;
      const knock = state.state.knocks[0];
      if (knock) {
        host.send({ type: 'admit', knockId: knock.id });
        break;
      }
    }
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

  it('mints a ticket that resolves to the room address, and retires it when the room fills', async () => {
    const room = uniqueRoom();
    const host = client(room);
    await host.open;
    // One open human seat, so the room does not fill the instant it is created.
    host.send({
      type: 'create-room',
      config: { seatCount: 3, edition: 'classic', visibility: 'open', bots: { 2: 6 }, seed: 11 },
    });
    await host.next('welcome');
    const lobby = (await host.next('room-state')) as Extract<RoomMessage, { type: 'room-state' }>;

    const ticket = lobby.state.ticket;
    expect(ticket).not.toBeNull();
    expect(isTicket(ticket!)).toBe(true);
    // The ticket is not the address, and it is short enough to read out.
    expect(ticket).not.toBe(room);
    expect(ticket).toHaveLength(TICKET_LENGTH);

    const resolved = await fetch(`http://${HOST}/parties/directory/${ticket}`);
    expect(resolved.status).toBe(200);
    expect(await resolved.json()).toEqual({ address: room });

    // A joiner arriving by the resolved address takes the last human seat,
    // which fills the room and retires the ticket.
    const joiner = client(room);
    await joiner.open;
    await admit(host, joiner);
    await new Promise((r) => setTimeout(r, 200));

    const retired = await fetch(`http://${HOST}/parties/directory/${ticket}`);
    expect(retired.status).toBe(404);
    joiner.close();
  });

  it('answers an unissued ticket exactly as it answers an expired one', async () => {
    // Expired, retired and never-issued have to be indistinguishable, or the
    // shape of a miss tells someone sweeping the space which guesses were warm.
    const unissued = await fetch(`http://${HOST}/parties/directory/${mintTicket()}`);
    const malformed = await fetch(`http://${HOST}/parties/directory/nope`);
    expect(unissued.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(await unissued.text()).toBe('');
    expect(await malformed.text()).toBe('');
  });

  it('refuses to create a room at an id that is not an address', async () => {
    // The whole point of 160-bit addressing: a room cannot be created at a
    // guessable id and then waited at.
    const guessable = client('lobby');
    await guessable.open;
    guessable.send({
      type: 'create-room',
      config: { seatCount: 3, edition: 'classic', visibility: 'open', bots: { 1: 6, 2: 6 }, seed: 1 },
    });
    const refusal = (await guessable.next('error')) as Extract<RoomMessage, { type: 'error' }>;
    expect(refusal.error).toMatchObject({ kind: 'protocol' });
    guessable.close();
  });

  it('gives a knocker no seat until the host admits them (AE5)', async () => {
    const room = uniqueRoom();
    const host = client(room);
    await host.open;
    host.send({
      type: 'create-room',
      config: { seatCount: 3, edition: 'classic', visibility: 'hidden', bots: { 2: 6 }, seed: 5 },
    });
    await host.next('welcome');

    // A stranger with the address knocks and is told to wait — no welcome, no
    // token, no seat. This is the property the whole unit exists for.
    const stranger = client(room);
    await stranger.open;
    stranger.send({ type: 'knock' });
    expect((await stranger.next('waiting')).type).toBe('waiting');
    await expect(stranger.next('welcome', 600)).rejects.toThrow(/timeout/);

    // And the room agrees: the seat they wanted is still open.
    const state = (await host.next('room-state')) as Extract<RoomMessage, { type: 'room-state' }>;
    expect(state.state.seats.some((seat) => seat.kind === 'open')).toBe(true);
    stranger.close();
  });

  it('refuses admit, decline and lock from anyone but the host', async () => {
    const room = uniqueRoom();
    const host = client(room);
    await host.open;
    host.send({
      type: 'create-room',
      config: { seatCount: 3, edition: 'classic', visibility: 'open', bots: { 2: 6 }, seed: 6 },
    });
    await host.next('welcome');

    const guest = client(room);
    await guest.open;
    await admit(host, guest);

    // Seated, but not the host: the room says so rather than quietly ignoring
    // it, because a client that thinks it hosts is a bug worth seeing.
    guest.send({ type: 'set-locked', locked: true });
    const refusal = (await guest.next('error')) as Extract<RoomMessage, { type: 'error' }>;
    expect(refusal.error.kind === 'protocol' && refusal.error.code).toBe('not-host');
    guest.close();
  });

  it('turns knocks away outright once the host locks the door', async () => {
    const room = uniqueRoom();
    const host = client(room);
    await host.open;
    host.send({
      type: 'create-room',
      config: { seatCount: 3, edition: 'classic', visibility: 'open', bots: { 2: 6 }, seed: 8 },
    });
    await host.next('welcome');
    host.send({ type: 'set-locked', locked: true });
    await new Promise((r) => setTimeout(r, 150));

    const late = client(room);
    await late.open;
    late.send({ type: 'knock' });
    const refusal = (await late.next('error')) as Extract<RoomMessage, { type: 'error' }>;
    expect(refusal.error.kind === 'protocol' && refusal.error.code).toBe('room-locked');
    late.close();
  });

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
    await admit(host, p2);
    const p3 = client(room);
    await p3.open;
    await admit(host, p3);

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
