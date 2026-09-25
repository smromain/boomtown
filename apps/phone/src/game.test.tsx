import { act } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  createGame,
  legalMoves,
  reduce,
  type Command,
  type GameState,
  type Seat,
} from '@boomtown/engine';
import { GameSession, createGameClient, localTransport, type GameClient } from '@boomtown/client-core';
import { Game } from './Game.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
const SEATS = [{ name: 'Ana' }, { name: 'Ben' }, { name: 'Cy' }];

/**
 * Play a seeded game forward with a greedy-but-legal policy — found whatever
 * can be founded, buy as many shares as the rules allow — until `until` holds.
 * Buying hard is what makes a merger with shareholders arrive quickly.
 */
function playUntil(seed: number, until: (state: GameState) => boolean, limit = 400): GameState | null {
  let state = createGame({ seats: SEATS, seed });
  for (let i = 0; i < limit && state.status !== 'over'; i++) {
    if (until(state)) return state;
    const moves = legalMoves(state);
    const buys = moves.filter((m): m is Extract<Command, { type: 'buy-shares' }> => m.type === 'buy-shares');
    let pick: Command = moves.find((m) => m.type === 'end-turn') ?? moves[0]!;
    let most = -1;
    for (const buy of buys) {
      if (count(buy.picks) > most) {
        most = count(buy.picks);
        pick = buy;
      }
    }
    const result = reduce(state, pick);
    if (!result.ok) throw new Error(`illegal: ${JSON.stringify(pick)}`);
    state = result.state;
  }
  return null;
}

const count = (picks: Partial<Record<string, number>>): number =>
  Object.values(picks).reduce<number>((sum, n) => sum + (n ?? 0), 0);

function find(until: (state: GameState) => boolean): GameState {
  for (let seed = 1; seed < 60; seed++) {
    const state = playUntil(seed, until);
    if (state) return state;
  }
  throw new Error('no seed reached the state');
}

async function mount(state: GameState, seat: Seat): Promise<{ client: GameClient; sent: Command[] }> {
  const session = GameSession.fromSnapshot(state);
  const transport = localTransport({ setup: { seats: SEATS, seed: 1 }, controls: [0, 1, 2], engine: session });
  const client = createGameClient(transport);
  const sent: Command[] = [];
  const dispatch = client.dispatch.bind(client);
  client.dispatch = (command: Command) => {
    sent.push(command);
    return dispatch(command);
  };
  await act(() => client.connect());
  render(<Game client={client} seat={seat} />);
  await flush();
  return { client, sent };
}

const seatOnClock = (state: GameState): Seat => state.turnOrder[state.turnPointer]!;

describe('the phone game (#62)', () => {
  it('places a tile in two taps: pick, then place', async () => {
    const state = createGame({ seats: SEATS, seed: 3 });
    const seat = seatOnClock(state);
    const { sent } = await mount(state, seat);

    const turn = screen.getByRole('region', { name: 'Your turn' });
    const tiles = within(turn).getAllByRole('button').filter((b) => b.classList.contains('tile') && !b.hasAttribute('disabled'));
    expect(tiles.length).toBeGreaterThan(0);
    // One tap only picks: nothing is sent.
    fireEvent.click(tiles[0]!);
    expect(sent).toEqual([]);
    const place = within(turn).getByRole('button', { name: /^Place / });
    fireEvent.click(place);
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'place-tile', seat });
  });

  it('shows another seat only what it is waiting on, with the rack inert', async () => {
    const state = createGame({ seats: SEATS, seed: 3 });
    const other = ((seatOnClock(state) + 1) % 3) as Seat;
    await mount(state, other);
    expect(screen.queryByRole('region', { name: 'Your turn' })).not.toBeInTheDocument();
    const rack = screen.getByRole('region', { name: /your tiles/i });
    for (const tile of within(rack).getAllByRole('button')) expect(tile).toBeDisabled();
  });

  it('buys shares with the steppers and sends the picks', async () => {
    const state = find((s) => s.step === 'buy' && s.status === 'playing' && legalMoves(s).length > 1);
    const seat = seatOnClock(state);
    const { sent } = await mount(state, seat);

    const plus = screen.getAllByRole('button', { name: /\+$/ }).find((b) => !b.hasAttribute('disabled'))!;
    fireEvent.click(plus);
    const buy = screen.getByRole('button', { name: /^Buy 1/ });
    fireEvent.click(buy);
    await flush();
    expect(sent).toHaveLength(1);
    const command = sent[0] as Extract<Command, { type: 'buy-shares' }>;
    expect(command.type).toBe('buy-shares');
    expect(count(command.picks)).toBe(1);
  });

  it('disposes of defunct stock, and the split always adds up', async () => {
    const state = find((s) => s.merger?.pending?.type === 'dispose-shares' && s.merger.pending.shares >= 2);
    const pending = state.merger!.pending as Extract<NonNullable<GameState['merger']>['pending'], { type: 'dispose-shares' }>;
    const { sent } = await mount(state, pending.seat);

    fireEvent.click(screen.getByRole('button', { name: /^Sell all/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Confirm/i }));
    await flush();
    expect(sent).toEqual([
      { type: 'dispose-shares', seat: pending.seat, hold: 0, sell: pending.shares, trade: 0 },
    ]);
  });
});
