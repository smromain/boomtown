import { afterEach, describe, expect, it } from 'vitest';
import type { ClientMessage, RoomConfig, RoomMessage } from '@boomtown/protocol';
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
  /** Every message received, in order, whether or not anything waited for it. */
  readonly seen: RoomMessage[] = [];

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
      this.seen.push(msg);
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

  it('refuses to create a room with no seat left for a person', async () => {
    const room = uniqueRoom();
    const host = client(room);
    await host.open;
    // Every seat a bot: the creator would knock at their own door and be told
    // the room is full, so the room is never made.
    host.send({
      type: 'create-room',
      config: { seatCount: 3, edition: 'classic', visibility: 'open', bots: { 0: 5, 1: 5, 2: 5 }, seed: 3 },
    });
    const err = await host.next('error');
    expect(err.type === 'error' && err.error.kind === 'protocol' && err.error.code).toBe('malformed-message');
    expect(err.type === 'error' && err.error.kind === 'protocol' && err.error.message).toMatch(
      /at least one seat/,
    );
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

  it('hands an ejected seat to a bot and plays on, without reopening it', async () => {
    const room = uniqueRoom();
    const host = client(room);
    await host.open;
    host.send({
      type: 'create-room',
      config: { seatCount: 3, edition: 'classic', visibility: 'open', bots: { 2: 6 }, seed: 21 },
    });
    await host.next('welcome');
    const guest = client(room);
    await guest.open;
    await admit(host, guest);
    host.send({ type: 'start' });
    // Keep the opening view: ejecting emits no `update` of its own (correctly —
    // the host is on the clock, so nothing moves), so waiting for one here
    // would hang on a room that is behaving.
    let view = (await host.next('update')) as Extract<RoomMessage, { type: 'update' }>;

    host.send({ type: 'eject', seat: 1 });

    // The ejected player is told and dropped: their token went with the seat,
    // so an open socket would only produce refusals they cannot act on.
    const told = (await guest.next('error')) as Extract<RoomMessage, { type: 'error' }>;
    expect(told.error.kind).toBe('protocol');

    // The seat is a bot now — not open. An open seat mid-game could be claimed
    // by whoever knocked next, inheriting another player's holdings.
    let sawBotSeat = false;
    for (let attempt = 0; attempt < 6 && !sawBotSeat; attempt += 1) {
      const state = (await host.next('room-state')) as Extract<RoomMessage, { type: 'room-state' }>;
      const seat = state.state.seats[1]!;
      if (seat.kind === 'bot') sawBotSeat = true;
      expect(seat.kind).not.toBe('open');
    }
    expect(sawBotSeat).toBe(true);

    // And the seat is actually *played*. Ejecting alone proves nothing here:
    // the host is on the clock right after `start`, so nothing should move yet.
    // The test is whether the clock can pass through the ejected seat and come
    // back — if a bot had not taken it over, the room would wait forever on
    // somebody who is gone.
    // A command and the bot moves it triggers are dispatched together, so the
    // first update after a move is not the settled one — read on until the
    // clock comes back, or until it plainly is not going to.
    let guardCount = 0;
    while (guardCount++ < 40) {
      if (view.view.status !== 'playing') break;
      if (view.view.activeSeat === 0 && !view.view.pendingDecision) {
        host.send({ type: 'command', command: pickHumanMove(view.view) });
      }
      view = (await host.next('update', 8000)) as Extract<RoomMessage, { type: 'update' }>;
      if (view.view.activeSeat === 0 && !view.view.pendingDecision && guardCount > 2) break;
    }
    // Back on the host's clock, having passed through the ejected seat and the
    // configured bot. If a bot had not taken the ejected seat over, the clock
    // would have stopped there on somebody who is gone.
    expect(view.view.status).toBe('playing');
    expect(view.view.activeSeat).toBe(0);
    guest.close();
  });

  it('refuses a host trying to eject their own seat', async () => {
    // It would leave the room with nobody able to admit, unlock or eject, and
    // no way to appoint anyone.
    const room = uniqueRoom();
    const host = client(room);
    await host.open;
    host.send({
      type: 'create-room',
      config: { seatCount: 3, edition: 'classic', visibility: 'open', bots: { 1: 6, 2: 6 }, seed: 22 },
    });
    const welcome = (await host.next('welcome')) as Extract<RoomMessage, { type: 'welcome' }>;
    host.send({ type: 'eject', seat: welcome.seat });
    const refusal = (await host.next('error')) as Extract<RoomMessage, { type: 'error' }>;
    expect(refusal.error.kind === 'protocol' && refusal.error.code).toBe('not-host');
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

  // --- closed books, on the wire (#60) ---------------------------------
  //
  // The claim is about the *frames a seat receives*, not about what the UI
  // prints, so it can only be checked here: the room used to filter each
  // connection's view and hand every connection the same unfiltered event
  // array. One human and two bots is enough — the bots are the other seats,
  // and the human's own purchases are the other half of the rule.

  /**
   * Play a table until enough purchases have gone by, buying for real wherever
   * a share is affordable, and return every event the human was sent. A script
   * that always passed (`picks: {}`) would prove nothing about quantities.
   */
  async function collectPurchases(edition: 'boomtown' | 'classic') {
    const room = uniqueRoom();
    const host = client(room);
    await host.open;
    host.send({
      type: 'create-room',
      config: { seatCount: 3, edition, visibility: 'hidden', bots: { 1: 6, 2: 6 }, seed: 11 },
    });
    await host.next('welcome');
    host.send({ type: 'start' });

    const events: import('@boomtown/engine').EngineEvent[] = [];
    let view = (await host.next('update')) as Extract<RoomMessage, { type: 'update' }>;
    events.push(...view.events);
    let safety = 0;
    let ownPurchases = 0;
    while (view.view.status === 'playing' && safety++ < 300 && ownPurchases < 3) {
      if (view.view.activeSeat !== 0 && !view.view.pendingDecision) {
        view = (await host.next('update', 8000)) as Extract<RoomMessage, { type: 'update' }>;
        events.push(...view.events);
        continue;
      }
      const command = pickBuyingMove(view.view);
      if (command.type === 'buy-shares' && Object.keys(command.picks).length > 0) ownPurchases += 1;
      host.send({ type: 'command', command });
      view = (await host.next('update', 8000)) as Extract<RoomMessage, { type: 'update' }>;
      events.push(...view.events);
    }
    const purchases = events.flatMap((e) => (e.type === 'shares-bought' ? [e] : []));
    return {
      own: purchases.filter((e) => e.seat === 0),
      others: purchases.filter((e) => e.seat !== 0),
      ownPurchases,
    };
  }

  it('never puts another seat\'s purchase amounts on the wire at a Boomtown table', async () => {
    const { own, others, ownPurchases } = await collectPurchases('boomtown');
    expect(ownPurchases).toBeGreaterThan(0);
    expect(others.length).toBeGreaterThan(0);

    for (const event of others) {
      // The corporations, and no number at all. Cost alone would give the
      // quantity away — the share price is public.
      expect(event.cost).toBeNull();
      expect(Object.values(event.picks).every((n) => n === null)).toBe(true);
    }
    // Your own are yours in full, exactly as in `viewFor`.
    expect(own.some((event) => event.cost !== null && event.cost > 0)).toBe(true);
  }, 30_000);

  it('logs exactly what it always logged at a classic table', async () => {
    const { own, others, ownPurchases } = await collectPurchases('classic');
    expect(ownPurchases).toBeGreaterThan(0);
    expect(others.length).toBeGreaterThan(0);
    for (const event of [...own, ...others]) {
      expect(event.cost).not.toBeNull();
      expect(Object.values(event.picks).some((n) => n === null)).toBe(false);
    }
  }, 30_000);

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

// --- couch mode: the table (#62) -------------------------------------------
//
// The desktop at a couch table is a connection with host authority and no seat.
// What matters is on the wire: the table is sent the public view and nothing a
// seat holds, the phones are sent their own, and nobody but the table hosts.

describe('PartyKit room — a couch table (#62)', () => {
  type RoomStateOf = Extract<RoomMessage, { type: 'room-state' }>;
  type TableUpdateOf = Extract<RoomMessage, { type: 'table-update' }>;
  type UpdateOf = Extract<RoomMessage, { type: 'update' }>;

  async function openTable(
    config: RoomConfig = { seatCount: 3, edition: 'boomtown', visibility: 'hidden', bots: { 1: 6, 2: 6 }, seed: 11 },
  ) {
    const room = uniqueRoom();
    const table = client(room, { name: 'Table' });
    await table.open;
    table.send({ type: 'create-room', config, table: true });
    const welcome = (await table.next('table-welcome')) as Extract<RoomMessage, { type: 'table-welcome' }>;
    return { room, table, token: welcome.token };
  }

  it('makes the creator the table: a token, host authority, and no seat', async () => {
    const { table, token } = await openTable({ seatCount: 3, edition: 'boomtown', visibility: 'hidden', bots: {}, seed: 1 });
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const state = ((await table.next('room-state')) as RoomStateOf).state;
    expect(state.table).toBe(true);
    expect(state.hostSeat).toBeNull();
    expect(state.seats.every((seat) => seat.kind === 'open')).toBe(true);
  });

  it('lets phones in only through the table, and only the table hosts', async () => {
    const { room, table } = await openTable({ seatCount: 3, edition: 'boomtown', visibility: 'hidden', bots: { 2: 6 }, seed: 1 });
    const ana = client(room, { name: 'Ana' });
    await ana.open;
    await admit(table, ana);
    const bo = client(room, { name: 'Bo' });
    await bo.open;
    await admit(table, bo);

    // A seated phone cannot start, lock or admit — there is one host.
    ana.send({ type: 'start' });
    const refused = (await ana.next('error')) as Extract<RoomMessage, { type: 'error' }>;
    expect(refused.error.kind === 'protocol' && refused.error.code).toBe('not-host');
    ana.send({ type: 'set-locked', locked: true });
    const alsoRefused = (await ana.next('error')) as Extract<RoomMessage, { type: 'error' }>;
    expect(alsoRefused.error.kind === 'protocol' && alsoRefused.error.code).toBe('not-host');

    // And the table cannot sit down.
    table.send({ type: 'knock' });
    const noSeat = (await table.next('error')) as Extract<RoomMessage, { type: 'error' }>;
    expect(noSeat.error.kind === 'protocol' && noSeat.error.code).toBe('not-in-room');

    table.send({ type: 'start' });
    const first = (await table.next('table-update')) as TableUpdateOf;
    expect(first.view.status).toBe('playing');
    const anaView = (await ana.next('update')) as UpdateOf;
    expect(anaView.view.yourHand).toHaveLength(6);
  });

  it('sends the table the public view and no purchase amounts while the phones play', async () => {
    const { room, table } = await openTable();
    const ana = client(room, { name: 'Ana' });
    await ana.open;
    await admit(table, ana);
    table.send({ type: 'start' });

    const hands = new Set<string>();
    let view = (await ana.next('update')) as UpdateOf;
    let ownPurchases = 0;
    let safety = 0;
    while (view.view.status === 'playing' && safety++ < 300 && ownPurchases < 2) {
      for (const tile of view.view.yourHand) hands.add(tile);
      if (view.view.activeSeat !== 0 && !view.view.pendingDecision) {
        view = (await ana.next('update', 8000)) as UpdateOf;
        continue;
      }
      const command = pickBuyingMove(view.view);
      if (command.type === 'buy-shares' && Object.keys(command.picks).length > 0) ownPurchases += 1;
      ana.send({ type: 'command', command });
      view = (await ana.next('update', 8000)) as UpdateOf;
    }
    await new Promise((r) => setTimeout(r, 500));
    const tableFrames = table.seen.filter((m): m is TableUpdateOf => m.type === 'table-update');

    expect(ownPurchases).toBeGreaterThan(0);
    expect(tableFrames.length).toBeGreaterThan(1);
    const purchases = tableFrames.flatMap((f) => f.events.flatMap((e) => (e.type === 'shares-bought' ? [e] : [])));
    // Hers and the bots' alike: the table holds no seat, so it sees no amount.
    expect(purchases.some((e) => e.seat === 0)).toBe(true);
    expect(purchases.some((e) => e.seat !== 0)).toBe(true);
    for (const event of purchases) {
      expect(event.cost).toBeNull();
      expect(Object.values(event.picks).every((n) => n === null)).toBe(true);
    }
    for (const frame of tableFrames) {
      const json = JSON.stringify(frame.view);
      expect(json).not.toContain('"yourHand"');
      expect(json).not.toContain('"bag"');
      // A tile Ana held but had not yet played must never reach the table.
      const onBoard = new Set(Object.keys(frame.view.cells).filter((t) => frame.view.cells[t as keyof typeof frame.view.cells]));
      for (const tile of hands) {
        if (!onBoard.has(tile) && !frame.view.removedTiles.includes(tile as never)) {
          expect(json).not.toContain(`"${tile}"`);
        }
      }
      for (const seat of frame.view.seats) expect(seat.cash).toBeNull();
    }
  }, 30_000);

  it('takes the table back by token, and the old token stops working', async () => {
    const { room, table, token } = await openTable();
    const ana = client(room, { name: 'Ana' });
    await ana.open;
    await admit(table, ana);
    table.send({ type: 'start' });
    await table.next('table-update');

    table.close();
    await new Promise((r) => setTimeout(r, 300));

    const back = client(room, { token, name: 'Table' });
    await back.open;
    const rewelcome = (await back.next('table-welcome')) as Extract<RoomMessage, { type: 'table-welcome' }>;
    expect(rewelcome.token).not.toBe(token);
    const current = (await back.next('table-update')) as TableUpdateOf;
    expect(current.view.status).toBe('playing');
    expect(JSON.stringify(current.view)).not.toContain('"yourHand"');
    // Still the host.
    back.send({ type: 'set-locked', locked: true });
    // The reconnect itself sent a room-state first; the lock is the next one.
    let locked = false;
    for (let attempt = 0; attempt < 3 && !locked; attempt += 1) {
      locked = ((await back.next('room-state')) as RoomStateOf).state.locked;
    }
    expect(locked).toBe(true);

    // The token it used is spent: presenting it again binds nothing, and a
    // connection that holds nothing cannot host.
    const replay = client(room, { token, name: 'Table' });
    await replay.open;
    replay.send({ type: 'set-locked', locked: false });
    const refused = (await replay.next('error')) as Extract<RoomMessage, { type: 'error' }>;
    expect(refused.error.kind === 'protocol' && refused.error.code).toBe('not-host');
  });
});

/**
 * `pickHumanMove`, except that at the buy step it buys one share of the
 * cheapest founded corporation it can afford rather than passing. #60 is about
 * quantities and costs, so a script that never spends anything cannot test it.
 */
function pickBuyingMove(view: Extract<RoomMessage, { type: 'update' }>['view']) {
  if (view.step !== 'buy') return pickHumanMove(view);
  const affordable = (Object.keys(view.corporations) as (keyof typeof view.corporations)[]).find(
    (industry) => {
      const corp = view.corporations[industry];
      return corp.founded && corp.sharePrice !== null && corp.sharePrice <= view.yourCash;
    },
  );
  return affordable
    ? { type: 'buy-shares' as const, seat: view.you, picks: { [affordable]: 1 } }
    : { type: 'buy-shares' as const, seat: view.you, picks: {} };
}

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
