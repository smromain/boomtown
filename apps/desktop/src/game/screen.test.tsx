import { act } from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  GameSession,
  createGameClient,
  localTransport,
  type GameClient,
} from '@boomtown/client-core';
import { GameScreen } from './GameScreen.js';
import { defaultConfig, type GameConfig } from '../setup/gameConfig.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

async function mount(localSeats: number[], turnPointer: number, over: Partial<GameConfig> = {}) {
  const config: GameConfig = {
    ...defaultConfig(),
    seats: [
      { name: 'You', kind: 'human', difficulty: 5 },
      { name: 'Robo', kind: 'bot', difficulty: 5 },
      { name: 'Cy', kind: 'human', difficulty: 5 },
    ],
    seed: 1,
    ...over,
  };
  const setup = { seats: [{ name: 'You' }, { name: 'Robo' }, { name: 'Cy' }], seed: 1, turnOrder: [0, 1, 2] };
  const session = GameSession.fromSnapshot(
    Object.assign((await import('@boomtown/engine')).createGame(setup), { turnPointer }),
  );
  const controls = over.seats ? localSeats : [0, 1, 2];
  const client: GameClient = createGameClient(localTransport({ setup, controls, engine: session }));
  await act(() => client.connect());
  render(<GameScreen game={{ client, config, localSeats }} />);
  await flush();
  return { client };
}

describe('GameScreen turn gating', () => {
  it('shows the board and rack on a local seat turn', async () => {
    await mount([0, 2], 0);
    expect(screen.getByRole('grid', { name: 'Board' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Your tiles' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Waiting for another player' })).not.toBeInTheDocument();
  });

  it('keeps the board (read-only) but hides the rack, and names the bot on its turn', async () => {
    await mount([0, 2], 1); // seat 1 (bot) on the clock
    // The board stays up so you can watch the game while you wait (#13) —
    // read-only, and with no interactive cell at all.
    const board = screen.getByRole('grid', { name: 'Board' });
    expect(board).toHaveAttribute('aria-readonly', 'true');
    // Query the tag, not the role: a playable cell is a <button> carrying an
    // explicit role="gridcell", so it never answers to role 'button'.
    expect(board.querySelectorAll('button')).toHaveLength(0);
    expect(within(board).queryByRole('gridcell', { name: /^Place at /i })).not.toBeInTheDocument();

    expect(screen.queryByRole('region', { name: 'Your tiles' })).not.toBeInTheDocument();
    const waiting = screen.getByRole('status', { name: 'Waiting for another player' });
    expect(waiting).toHaveTextContent('Robo');
    expect(waiting).toHaveTextContent(/Bot/);
    // the public panels are still there — you can follow the game
    expect(screen.getByRole('region', { name: 'Story' })).toBeInTheDocument();
  });

  it('the spectator board marks no hand tile — not even the first seat\'s (hot-seat leak guard)', async () => {
    const { client } = await mount([0, 2], 1); // bot on the clock; seat 0 is a local human
    const board = screen.getByRole('grid', { name: 'Board' });

    // `anyView` hands back seat 0's projection, hand included. Every one of its
    // tiles must be an ordinary empty cell on this board: marking them would
    // paint seat 0's hand onto the screen for whoever is watching.
    const hand = client.store.getState().views[0]!.handTiles;
    expect(hand.length).toBeGreaterThan(0);
    for (const { tile } of hand) {
      const cell = within(board).getByRole('gridcell', { name: tile });
      expect(cell).toHaveAttribute('data-kind', 'empty');
    }
  });

  it('the board is interactive again on a local seat turn', async () => {
    await mount([0, 2], 0);
    const board = screen.getByRole('grid', { name: 'Board' });
    expect(board).not.toHaveAttribute('aria-readonly');
    expect(board.querySelectorAll('button').length).toBeGreaterThan(0);
    expect(within(board).getAllByRole('gridcell', { name: /^Place at /i }).length).toBeGreaterThan(0);
  });

  it('shows the end screen when the game is over, even on a bot seat turn', async () => {
    const { client } = await mount([0, 2], 1); // bot seat 1 was on the clock
    // the engine reports the game over on the bot's turn
    await act(async () => {
      const views = client.store.getState().views;
      const over = Object.fromEntries(
        Object.entries(views).map(([k, v]) => [
          k,
          { ...v, status: 'over' as const, result: { rankings: [{ seat: 2, cash: 5000, equity: 3000, total: 8000, holdings: [] }, { seat: 0, cash: 4000, equity: 1000, total: 5000, holdings: [] }, { seat: 1, cash: 3000, equity: 500, total: 3500, holdings: [] }], winners: [2] }, endAnnouncedBy: 1 },
        ]),
      );
      client.store.setState((s) => ({ ...s, status: 'over', views: over }));
    });

    // no more "waiting for the bot" — the end screen instead
    expect(screen.queryByRole('status', { name: 'Waiting for another player' })).not.toBeInTheDocument();
    const end = screen.getByRole('dialog', { name: 'Game over' });
    expect(end).toHaveTextContent('Cy wins');
    expect(end).toHaveTextContent('Robo called the end.');
    expect(within(end).getByRole('table')).toHaveTextContent('$8,000');
  });
});

describe('the waiting card names the seat on the clock (#15)', () => {
  it('prefers the room\'s real name over a placeholder config, in the online shape', async () => {
    // Online this client holds a view for its own seat only, and the config it
    // is handed can still be the lobby placeholder. Both halves of the symptom
    // came from asking the wrong source: the name fell back to the placeholder
    // ("Player 2") and the step fell back to the generic label, giving
    // "Player 2 is taking their turn" while every toast had the name right.
    await mount([0], 1, {
      seats: [
        { name: 'Player 1', kind: 'human', difficulty: 5 },
        { name: 'Player 2', kind: 'human', difficulty: 5 },
        { name: 'Player 3', kind: 'human', difficulty: 5 },
      ],
    });

    const waiting = screen.getByRole('status', { name: 'Waiting for another player' });
    expect(waiting).toHaveTextContent('Robo');
    expect(waiting).not.toHaveTextContent('Player 2');
    // the step is public and identical in every view, so it resolves too
    expect(waiting).toHaveTextContent(/placing a tile/i);
    expect(waiting).not.toHaveTextContent(/taking their turn/i);
  });
});
