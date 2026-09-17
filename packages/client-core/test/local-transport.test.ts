import { describe, expect, it, vi } from 'vitest';
import { PRESETS, createGame, type EngineEvent, type Ruleset, type Seat } from '@boomtown/engine';
import {
  clientView,
  localTransport,
  type GameTransport,
  type LocalEngine,
  type TransportMessage,
} from '@boomtown/client-core';

const setup = { seats: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], seed: 42, turnOrder: [0, 1, 2] } as const;
const controls = [0, 1, 2];

/** Flush the microtask queue (localTransport delivers on a microtask). */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function connected(): Promise<{ transport: GameTransport; messages: TransportMessage[]; latest: () => TransportMessage }> {
  const messages: TransportMessage[] = [];
  const transport = localTransport({ setup, controls });
  transport.onMessage((m) => messages.push(m));
  await transport.connect();
  return { transport, messages, latest: () => messages[messages.length - 1]! };
}

describe('localTransport', () => {
  it('connect resolves only after the initial views are delivered', async () => {
    const { messages } = await connected();
    expect(messages).toHaveLength(1);
    expect(Object.keys(messages[0]!.views)).toEqual(['0', '1', '2']);
    expect(messages[0]!.views[0]!.yourHand).toHaveLength(6);
  });

  it('does not deliver synchronously from send', async () => {
    const { transport, messages, latest } = await connected();
    const before = messages.length;
    transport.send({ type: 'place-tile', seat: 0, tile: latest().views[0]!.yourHand[0]! });
    expect(messages).toHaveLength(before); // still nothing
    await flush();
    expect(messages).toHaveLength(before + 1);
  });

  it('round-trips a full non-merge turn', async () => {
    const { transport, latest } = await connected();

    transport.send({ type: 'place-tile', seat: 0, tile: latest().views[0]!.yourHand[0]! });
    await flush();
    expect(latest().views[0]!.step).toBe('buy');

    transport.send({ type: 'buy-shares', seat: 0, picks: {} });
    await flush();
    expect(latest().views[1]!.activeSeat).toBe(1);
    expect(latest().views[1]!.step).toBe('place');
  });

  it('reports a rejected command and leaves the views untouched', async () => {
    const { transport, latest } = await connected();
    const before = latest().views[0];

    transport.send({ type: 'buy-shares', seat: 0, picks: {} }); // wrong step
    await flush();
    expect(latest().rejection?.error.code).toBe('wrong-step');
    expect(latest().views[0]).toEqual(before);
  });

  // --- closed books in the events, not only in the views (#60) ---------
  //
  // The transport's `engine` seam is exactly the right tool here: the question
  // is what `localTransport` does to an event on its way out, so the event is
  // handed to it rather than played for.

  const BOUGHT: EngineEvent = { type: 'shares-bought', seat: 1, picks: { books: 3 }, cost: 4200 };

  /** A `LocalEngine` whose every `apply` yields seat 1's purchase. */
  function fakeEngine(ruleset: Ruleset): LocalEngine {
    const state = createGame({ ...setup, ruleset, visibility: 'hidden' });
    return {
      apply: () => ({ ok: true, events: [BOUGHT] }),
      viewsFor: (seats) =>
        Object.fromEntries(seats.map((seat) => [seat, clientView(state, seat)])) as Record<
          Seat,
          ReturnType<typeof clientView>
        >,
      snapshot: () => state,
    };
  }

  async function deliveredEvent(ruleset: Ruleset, controlled: readonly Seat[]) {
    const messages: TransportMessage[] = [];
    const transport = localTransport({
      setup,
      controls: [...controlled],
      engine: fakeEngine(ruleset),
    });
    transport.onMessage((m) => messages.push(m));
    await transport.connect();
    transport.send({ type: 'end-turn', seat: 0 });
    await flush();
    return messages.flatMap((m) => m.events).find((e) => e.type === 'shares-bought')!;
  }

  it('hides the amounts when several seats share the screen', async () => {
    // Hot-seat: one store, one log, several people. There is no "you" to
    // redact for, so the log is the public one.
    const event = await deliveredEvent(PRESETS.boomtown, [0, 1, 2]);
    expect(event.type === 'shares-bought' && event.cost).toBeNull();
    expect(event.type === 'shares-bought' && Object.values(event.picks)).toEqual([null]);
  });

  it('keeps them for the seat they belong to when the client holds one seat', async () => {
    // Solo against bots: that seat is the only person at the screen, and sees
    // its own purchases in full, as it would online.
    const own = await deliveredEvent(PRESETS.boomtown, [1]); // the buyer's own client
    expect(own.type === 'shares-bought' && own.cost).toBe(4200);
    // …and still not somebody else's.
    const other = await deliveredEvent(PRESETS.boomtown, [0]);
    expect(other.type === 'shares-bought' && other.cost).toBeNull();
  });

  it('leaves a published edition alone', async () => {
    const event = await deliveredEvent(PRESETS.classic, [0, 1, 2]);
    expect(event.type === 'shares-bought' && event.cost).toBe(4200);
  });

  it('stops delivering after disconnect', async () => {
    const handler = vi.fn();
    const transport = localTransport({ setup, controls });
    transport.onMessage(handler);
    await transport.connect();
    transport.disconnect();
    transport.send({ type: 'buy-shares', seat: 0, picks: {} });
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
