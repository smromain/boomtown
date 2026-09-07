import { act } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  GameSession,
  createGameClient,
  localTransport,
  type GameClient,
} from '@boomtown/client-core';
import { GameScreen } from './GameScreen.js';
import { defaultConfig, type GameConfig } from '../setup/gameConfig.js';

// R3F Canvas doesn't render under jsdom; the board's content isn't what we test here.
vi.mock('../board/Board.js', () => ({ Board: () => <div data-testid="board" /> }));

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
    expect(screen.getByTestId('board')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Your tiles' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Waiting for another player' })).not.toBeInTheDocument();
  });

  it('hides the board and rack and names the bot on its turn', async () => {
    await mount([0, 2], 1); // seat 1 (bot) on the clock
    expect(screen.queryByTestId('board')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your tiles' })).not.toBeInTheDocument();
    const waiting = screen.getByRole('status', { name: 'Waiting for another player' });
    expect(waiting).toHaveTextContent('Robo');
    expect(waiting).toHaveTextContent(/Bot/);
    // the public panels are still there — you can follow the game
    expect(screen.getByRole('region', { name: 'Story' })).toBeInTheDocument();
  });
});
