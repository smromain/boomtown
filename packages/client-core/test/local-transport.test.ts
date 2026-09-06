import { describe, expect, it, vi } from 'vitest';
import { localTransport, type GameTransport, type TransportMessage } from '@boomtown/client-core';

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
