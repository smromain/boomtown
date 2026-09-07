import { act } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomState } from '@boomtown/protocol';
import { CreateJoin } from './CreateJoin.js';
import { SeatList } from './SeatList.js';
import type { OnlineGame } from '../online/onlineGame.js';
import { toRoomConfig } from '../online/onlineGame.js';
import { defaultConfig } from '../setup/gameConfig.js';

vi.mock('../online/onlineGame.js', async (importActual) => {
  const actual = await importActual<typeof import('../online/onlineGame.js')>();
  return {
    ...actual,
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
  };
});

const { createRoom, joinRoom } = await import('../online/onlineGame.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('toRoomConfig', () => {
  it('maps bot seats to an index->difficulty record', () => {
    const config = {
      ...defaultConfig(),
      seats: [
        { name: 'A', kind: 'human' as const, difficulty: 5 },
        { name: 'B', kind: 'bot' as const, difficulty: 8 },
        { name: 'C', kind: 'bot' as const, difficulty: 3 },
      ],
    };
    const room = toRoomConfig(config);
    expect(room.seatCount).toBe(3);
    expect(room.bots).toEqual({ 1: 8, 2: 3 });
  });
});

describe('CreateJoin', () => {
  it('creates a room with the chosen seat count, edition and visibility', async () => {
    const onRoom = vi.fn();
    vi.mocked(createRoom).mockResolvedValue({ roomCode: 'ABC123' } as OnlineGame);
    render(<CreateJoin onRoom={onRoom} onBack={vi.fn()} />);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Seats' }), '4');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Edition' }), 'edition-2015');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Cash and holdings' }),
      'hidden',
    );
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Create room' }));
    });

    expect(createRoom).toHaveBeenCalledTimes(1);
    const [config, code, name] = vi.mocked(createRoom).mock.calls[0]!;
    expect(config.seats).toHaveLength(4);
    expect(config.edition).toBe('edition-2015');
    expect(config.visibility).toBe('hidden');
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(name).toBe('Player 1');
    expect(onRoom).toHaveBeenCalled();
  });

  it('joins by code, upper-casing what the player typed', async () => {
    const onRoom = vi.fn();
    vi.mocked(joinRoom).mockResolvedValue({} as OnlineGame);
    render(<CreateJoin onRoom={onRoom} onBack={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Join with a code' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Room code' }), 'abcd12');
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Join room' }));
    });

    expect(joinRoom).toHaveBeenCalledWith(expect.anything(), 'ABCD12', 'Player 1');
  });

  it('blocks joining with a too-short code', async () => {
    render(<CreateJoin onRoom={vi.fn()} onBack={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Join with a code' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Room code' }), 'ab');
    await userEvent.click(screen.getByRole('button', { name: 'Join room' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/room code/i);
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it('surfaces a connection failure', async () => {
    vi.mocked(createRoom).mockRejectedValue(new Error('could not connect to localhost:1999'));
    render(<CreateJoin onRoom={vi.fn()} onBack={vi.fn()} />);
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Create room' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/could not connect/);
  });
});

describe('SeatList', () => {
  function fakeGame(overrides: Partial<OnlineGame> = {}): {
    game: OnlineGame;
    emitRoomState: (state: RoomState) => void;
    emitConnection: (status: 'connecting' | 'open' | 'closed') => void;
    start: ReturnType<typeof vi.fn>;
  } {
    let roomStateCb: ((s: RoomState) => void) | null = null;
    let connCb: ((s: 'connecting' | 'open' | 'closed') => void) | null = null;
    const start = vi.fn();
    const game = {
      roomCode: 'ROOM01',
      isHost: true,
      transport: {
        onRoomState: (cb: (s: RoomState) => void) => (roomStateCb = cb),
        onConnectionChange: (cb: (s: 'connecting' | 'open' | 'closed') => void) => {
          connCb = cb;
          cb('open');
        },
        seat: () => 0,
        token: () => 'tok',
        start,
      },
      client: {} as OnlineGame['client'],
      config: defaultConfig(),
      disconnect: vi.fn(),
      ...overrides,
    } as OnlineGame;
    return {
      game,
      emitRoomState: (s) => act(() => roomStateCb?.(s)),
      emitConnection: (s) => act(() => connCb?.(s)),
      start,
    };
  }

  const lobbyState = (over: Partial<RoomState> = {}): RoomState => ({
    code: 'ROOM01',
    phase: 'lobby',
    config: toRoomConfig(defaultConfig()),
    seats: [
      { index: 0, kind: 'human', name: 'Ana', connected: true },
      { index: 1, kind: 'open', name: null, connected: false },
    ],
    ...over,
  });

  it('shows seats and disables Start until every seat is filled', () => {
    const { game, emitRoomState } = fakeGame();
    render(<SeatList game={game} onEnterGame={vi.fn()} onLeave={vi.fn()} />);
    emitRoomState(lobbyState());
    const region = screen.getByRole('region', { name: 'Room lobby' });
    expect(within(region).getByText('Ana (you)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Waiting for players/ })).toBeDisabled();
  });

  it('enables Start and fires it once the room is full', async () => {
    const { game, emitRoomState, start } = fakeGame();
    render(<SeatList game={game} onEnterGame={vi.fn()} onLeave={vi.fn()} />);
    emitRoomState(
      lobbyState({
        seats: [
          { index: 0, kind: 'human', name: 'Ana', connected: true },
          { index: 1, kind: 'human', name: 'Bo', connected: true },
        ],
      }),
    );
    const startBtn = screen.getByRole('button', { name: 'Start game' });
    expect(startBtn).toBeEnabled();
    await userEvent.click(startBtn);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('enters the game when the room reports it is playing', () => {
    const onEnterGame = vi.fn();
    const { game, emitRoomState } = fakeGame();
    render(<SeatList game={game} onEnterGame={onEnterGame} onLeave={vi.fn()} />);
    emitRoomState(lobbyState({ phase: 'playing' }));
    expect(onEnterGame).toHaveBeenCalled();
  });

  it('shows a reconnect banner when the connection drops', () => {
    const { game, emitRoomState, emitConnection } = fakeGame();
    render(<SeatList game={game} onEnterGame={vi.fn()} onLeave={vi.fn()} />);
    emitRoomState(lobbyState());
    emitConnection('closed');
    expect(screen.getByRole('status')).toHaveTextContent(/Connection lost/);
  });

  it('a non-host sees a waiting message, no Start button', () => {
    const { game, emitRoomState } = fakeGame({ isHost: false });
    render(<SeatList game={game} onEnterGame={vi.fn()} onLeave={vi.fn()} />);
    emitRoomState(lobbyState());
    expect(screen.queryByRole('button', { name: /Start/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting for the host/)).toBeInTheDocument();
  });
});
