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

async function mount(localSeats: number[], turnPointer: number) {
  const config: GameConfig = {
    ...defaultConfig(),
    seats: [
      { name: 'You', kind: 'human', difficulty: 5 },
      { name: 'Robo', kind: 'bot', difficulty: 5 },
      { name: 'Cy', kind: 'human', difficulty: 5 },
    ],
    seed: 1,
  };
  const setup = { seats: [{ name: 'You' }, { name: 'Robo' }, { name: 'Cy' }], seed: 1, turnOrder: [0, 1, 2] };
  const session = GameSession.fromSnapshot(
    Object.assign((await import('@boomtown/engine')).createGame(setup), { turnPointer }),
  );
  const client: GameClient = createGameClient(localTransport({ setup, controls: [0, 1, 2], engine: session }));
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

  it('hides the board and rack and names the bot on its turn', async () => {
    await mount([0, 2], 1); // seat 1 (bot) on the clock
    expect(screen.queryByRole('grid', { name: 'Board' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your tiles' })).not.toBeInTheDocument();
    const waiting = screen.getByRole('status', { name: 'Waiting for another player' });
    expect(waiting).toHaveTextContent('Robo');
    expect(waiting).toHaveTextContent(/Bot/);
    // the public panels are still there — you can follow the game
    expect(screen.getByRole('region', { name: 'Story' })).toBeInTheDocument();
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
