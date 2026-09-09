import { act } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createGameClient, localTransport } from '@boomtown/client-core';
import { GameClientProvider } from '../client/GameClientProvider.js';
import { OutOfPlay } from './OutOfPlay.js';

const setup = { seats: [{ name: 'You' }, { name: 'Bot' }, { name: 'Bot2' }], seed: 1, turnOrder: [0, 1, 2] };

/**
 * Online, the server hands each client only its own seat's `ClientView`. The
 * moment the clock moves to a bot or a remote player, `activeSeat` points at a
 * seat this client holds no view for, so `activeView(state)` is null. A
 * selector that fell back to a fresh `[]` there returned a new reference on
 * every `useSyncExternalStore` snapshot and spun `OutOfPlay` into an infinite
 * render loop — the white screen after your turn in an online game. Local play
 * never hit it: `localTransport` builds a view for every controlled seat.
 */
describe('OutOfPlay — active seat has no view (online, a bot on the clock)', () => {
  it('does not spin into an infinite render loop', async () => {
    const client = createGameClient(localTransport({ setup, controls: [0, 1, 2] }));
    await act(() => client.connect());

    act(() => {
      client.store.setState((s) => ({
        ...s,
        activeSeat: 1,
        views: { 0: s.views[0]! },
      }));
    });

    let renders = 0;
    function Counted() {
      renders++;
      return <OutOfPlay />;
    }

    render(
      <GameClientProvider client={client} localSeats={[0]}>
        <Counted />
      </GameClientProvider>,
    );
    await act(() => new Promise((r) => setTimeout(r, 50)));

    expect(renders).toBeLessThan(5);
  });
});
