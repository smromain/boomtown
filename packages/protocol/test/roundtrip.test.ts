import { describe, expect, it } from 'vitest';
import { createGame, reduce, viewFor, type Command } from '@boomtown/engine';
import {
  PROTOCOL_VERSION,
  protocolError,
  wireEngineError,
  type ClientMessage,
  type RoomMessage,
  type WireMessage,
} from '@boomtown/protocol';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function game() {
  return createGame({
    seats: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    seed: 42,
    turnOrder: [0, 1, 2],
    companyDraw: { books: 0, electronics: 0, air: 0, energy: 0, tech: 0, video: 0, toys: 0 },
  });
}

describe('message round-trips', () => {
  const messages: WireMessage[] = [
    { type: 'hello', protocolVersion: PROTOCOL_VERSION, displayName: 'Ana' },
    { type: 'hello', protocolVersion: PROTOCOL_VERSION, displayName: 'Ana', token: 'abc123' },
    {
      type: 'create-room',
      config: {
        seatCount: 4,
        edition: 'classic',
        visibility: 'open',
        bots: { 2: 5, 3: 8 },
        seed: 1,
      },
    },
    { type: 'join' },
    { type: 'start' },
    { type: 'command', command: { type: 'place-tile', seat: 0, tile: '1A' } },
    { type: 'welcome', seat: 1, token: 'tok' },
    {
      type: 'room-state',
      state: {
        code: 'ABCD12',
        phase: 'lobby',
        config: { seatCount: 3, edition: 'edition-2015', visibility: 'hidden', bots: {} },
        seats: [
          { index: 0, kind: 'human', name: 'Ana', connected: true },
          { index: 1, kind: 'open', name: null, connected: false },
          { index: 2, kind: 'bot', name: 'Bot 3', connected: true },
        ],
      },
    },
    { type: 'error', error: protocolError('room-full', 'all seats are taken') },
  ];

  it.each(messages.map((m) => [m.type, m] as const))(
    'a %s message survives JSON.stringify/parse unchanged',
    (_type, message) => {
      expect(clone(message)).toEqual(message);
    },
  );

  it('a full game update round-trips: view + events, no secret keys for a non-active seat', () => {
    const g = game();
    const placed = reduce(g, { type: 'place-tile', seat: 0, tile: g.hands[0]![0]! });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    // seat 1 is not active and the table is open by default here — flip to hidden
    const hidden = createGame({
      seats: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      seed: 42,
      turnOrder: [0, 1, 2],
      visibility: 'hidden',
    });
    const update: RoomMessage = {
      type: 'update',
      view: viewFor(hidden, 1),
      events: placed.events,
    };
    const round = clone(update);
    expect(round).toEqual(update);
    if (round.type !== 'update') throw new Error('shape');

    // no other seat's hand, no bag, no opponent money
    const json = JSON.stringify(round.view);
    expect(round.view.yourHand).toBeDefined();
    expect(json).not.toContain('"bag"');
    expect(round.view.seats[0]!.cash).toBeNull(); // opponent, hidden table
    expect(round.view.seats[0]!.holdings).toBeNull();
    expect(round.view.drawPileCount).toBe(hidden.bag.length); // count only, not contents
  });

  it('an EngineError from reduce forwards through the error envelope losslessly', () => {
    const g = game();
    const rejected = reduce(g, { type: 'buy-shares', seat: 0, picks: {} }); // wrong step
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;

    const envelope: RoomMessage = { type: 'error', error: wireEngineError(rejected.error) };
    const round = clone(envelope);
    expect(round).toEqual(envelope);
    if (round.type === 'error' && round.error.kind === 'engine') {
      expect(round.error.error.code).toBe('wrong-step');
      expect(round.error.error.message).toBe(rejected.error.message);
    } else {
      throw new Error('expected an engine error envelope');
    }
  });

  it('a rejection rides inside an update with the offending command', () => {
    const command: Command = { type: 'buy-shares', seat: 1, picks: {} };
    const update: RoomMessage = {
      type: 'update',
      view: viewFor(game(), 0),
      events: [],
      rejection: { command, error: protocolError('not-in-room', 'seat 1 has no connection') },
    };
    expect(clone(update)).toEqual(update);
  });
});

describe('protocol version', () => {
  it('is a non-empty string', () => {
    expect(PROTOCOL_VERSION).toBeTypeOf('string');
    expect(PROTOCOL_VERSION.length).toBeGreaterThan(0);
  });

  it('a hello carrying a different version is detectably mismatched', () => {
    const hello: ClientMessage = {
      type: 'hello',
      protocolVersion: '0',
      displayName: 'x',
    };
    expect(hello.protocolVersion).not.toBe(PROTOCOL_VERSION);
  });
});
