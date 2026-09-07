import { act } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomState } from '@boomtown/protocol';
import { createGameClient, localTransport } from '@boomtown/client-core';
import { App } from './App.js';
import type { OnlineGame } from './online/onlineGame.js';
import { defaultConfig } from './setup/gameConfig.js';
import { toRoomConfig } from './online/onlineGame.js';

vi.mock('./online/onlineGame.js', async (importActual) => {
  const actual = await importActual<typeof import('./online/onlineGame.js')>();
  return { ...actual, createRoom: vi.fn() };
});
const { createRoom } = await import('./online/onlineGame.js');

// the board isn't what this test exercises
vi.mock('./board/Board.js', () => ({ Board: () => null }));

let roomStateCb: ((s: RoomState) => void) | null = null;
const disconnect = vi.fn();

async function fakeRoom(): Promise<OnlineGame> {
  const noop = () => {};
  const client = createGameClient(
    localTransport({ setup: { seats: [{ name: 'You' }, { name: 'B' }], seed: 1, turnOrder: [0, 1] }, controls: [0, 1] }),
  );
  await client.connect();
  return {
    roomCode: 'ROOM01',
    isHost: true,
    config: defaultConfig(),
    client,
    transport: {
      onRoomState: (cb: (s: RoomState) => void) => {
        roomStateCb = cb;
        return noop;
      },
      onConnectionChange: (cb: (s: 'connecting' | 'open' | 'closed') => void) => {
        cb('open');
        return noop;
      },
      onLobbyError: () => noop,
      seat: () => 0,
      token: () => 'tok',
      start: noop,
    } as unknown as OnlineGame['transport'],
    disconnect,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  roomStateCb = null;
});

describe('App — online lobby to game transition', () => {
  it('does not disconnect the room when the game starts', async () => {
    vi.mocked(createRoom).mockResolvedValue(await fakeRoom());
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: 'Play online' }));
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Create room' }));
    });
    // now in the lobby
    expect(screen.getByRole('region', { name: 'Room lobby' })).toBeInTheDocument();

    // room reports the game has started -> App swaps to playing-online
    const playing: RoomState = {
      code: 'ROOM01',
      phase: 'playing',
      config: toRoomConfig(defaultConfig()),
      seats: [{ index: 0, kind: 'human', name: 'You', connected: true }],
    };
    await act(async () => roomStateCb?.(playing));

    // the bug this guards: the lobby effect's cleanup fired on the transition
    expect(disconnect).not.toHaveBeenCalled();
  });
});
