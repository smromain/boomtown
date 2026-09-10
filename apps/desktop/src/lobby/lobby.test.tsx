import { act } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomState } from '@boomtown/protocol';
import { CreateJoin } from './CreateJoin.js';
import { SeatList } from './SeatList.js';
import type { OnlineGame } from '../online/onlineGame.js';
import { configFromRoom, toRoomConfig } from '../online/onlineGame.js';
import { defaultConfig } from '../setup/gameConfig.js';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../settings/settings.js';

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
  localStorage.clear();
});

/** A generated default name is two capitalised words — never the old placeholder. */
const GENERATED = /^[A-Z][a-z]+ [A-Z][a-z]+$/;

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

describe('configFromRoom', () => {
  const placeholder = {
    ...defaultConfig(),
    seats: [
      { name: 'Player 1', kind: 'human' as const, difficulty: 5 },
      { name: 'Player 2', kind: 'human' as const, difficulty: 5 },
      { name: 'Player 3', kind: 'human' as const, difficulty: 5 },
    ],
  };

  const room: RoomState = {
    code: 'ABC123',
    phase: 'playing',
    config: { seatCount: 3, edition: 'edition-2015', visibility: 'hidden', bots: { 2: 7 } },
    seats: [
      { index: 0, kind: 'human', name: 'Ana', connected: true },
      { index: 1, kind: 'human', name: 'Ben', connected: true },
      { index: 2, kind: 'bot', name: 'Bot 3', connected: true },
    ],
  };

  it('replaces the lobby placeholders with the room\'s real names and kinds (#15)', () => {
    const config = configFromRoom(placeholder, room);
    expect(config.seats.map((s) => s.name)).toEqual(['Ana', 'Ben', 'Bot 3']);
    expect(config.seats.map((s) => s.kind)).toEqual(['human', 'human', 'bot']);
    // an online bot was previously reported as a human, so its seat never
    // showed the "Bot" kicker and the slow-bot nudge never armed
    expect(config.seats[2]!.difficulty).toBe(7);
    expect(config.edition).toBe('edition-2015');
    expect(config.visibility).toBe('hidden');
  });

  it('keeps the placeholder for a seat nobody has taken yet', () => {
    const filling: RoomState = {
      ...room,
      seats: [room.seats[0]!, { index: 1, kind: 'open', name: null, connected: false }, room.seats[2]!],
    };
    expect(configFromRoom(placeholder, filling).seats[1]!.name).toBe('Player 2');
  });

  it('is a no-op before any room-state has arrived', () => {
    expect(configFromRoom(placeholder, null)).toBe(placeholder);
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
    // The field no longer ships pre-filled with a placeholder everyone shared.
    expect(name).not.toBe('Player 1');
    expect(name).toMatch(GENERATED);
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

    expect(joinRoom).toHaveBeenCalledWith(expect.anything(), 'ABCD12', expect.stringMatching(GENERATED));
  });

  it('offers no seat-name inputs online — those names are discarded (#20)', async () => {
    render(<CreateJoin onRoom={vi.fn()} onBack={vi.fn()} />);
    // Only the player's own name is theirs to set. `toRoomConfig` never sends
    // seat names, and the server names a human seat from whoever joins it.
    expect(screen.getByRole('textbox', { name: 'Your name' })).toBeInTheDocument();
    for (const n of [1, 2, 3]) {
      expect(screen.queryByRole('textbox', { name: `Seat ${n} name` })).not.toBeInTheDocument();
      // the row still says what the seat will be, and still sets its kind
      expect(screen.getByRole('combobox', { name: `Seat ${n} type` })).toBeInTheDocument();
    }
    expect(screen.getByText(/Seat 1 — open/)).toBeInTheDocument();
  });

  it('still round-trips the bot toggles, which are the part that does travel (#20)', async () => {
    vi.mocked(createRoom).mockResolvedValue({ roomCode: 'ABC123' } as OnlineGame);
    render(<CreateJoin onRoom={vi.fn()} onBack={vi.fn()} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Seat 3 type' }), 'bot');
    expect(screen.getByText(/Seat 3 — bot/)).toBeInTheDocument();
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Create room' }));
    });
    const [config] = vi.mocked(createRoom).mock.calls[0]!;
    expect(toRoomConfig(config).bots).toEqual({ 2: 5 });
  });

  it('refuses a blank name instead of silently joining as "Player" (#16)', async () => {
    render(<CreateJoin onRoom={vi.fn()} onBack={vi.fn()} />);
    await userEvent.clear(screen.getByRole('textbox', { name: 'Your name' }));
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Create room' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/name/i);
    expect(createRoom).not.toHaveBeenCalled();
  });

  it('rolls a new name on demand', async () => {
    render(<CreateJoin onRoom={vi.fn()} onBack={vi.fn()} />);
    const field = screen.getByRole('textbox', { name: 'Your name' }) as HTMLInputElement;
    const before = field.value;
    // Two names can repeat by chance, so roll until it moves rather than
    // asserting one click always changes it.
    for (let i = 0; i < 12 && field.value === before; i += 1) {
      await userEvent.click(screen.getByRole('button', { name: 'Roll a new name' }));
    }
    expect(field.value).not.toBe(before);
    expect(field.value).toMatch(GENERATED);
  });

  it('remembers the name for next time', async () => {
    vi.mocked(createRoom).mockResolvedValue({ roomCode: 'ABC123' } as OnlineGame);
    const { unmount } = render(<CreateJoin onRoom={vi.fn()} onBack={vi.fn()} />);
    await userEvent.clear(screen.getByRole('textbox', { name: 'Your name' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ana');
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Create room' }));
    });
    expect(loadSettings().playerName).toBe('Ana');

    unmount();
    render(<CreateJoin onRoom={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Your name' })).toHaveValue('Ana');
  });

  it('seeds from a saved name rather than generating one', () => {
    saveSettings({ ...DEFAULT_SETTINGS, playerName: 'Bo' });
    render(<CreateJoin onRoom={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Your name' })).toHaveValue('Bo');
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
  function fakeGame(
    overrides: Partial<OnlineGame> = {},
    heldRoomState: RoomState | null = null,
  ): {
    game: OnlineGame;
    emitRoomState: (state: RoomState) => void;
    emitConnection: (status: 'connecting' | 'open' | 'closed') => void;
    emitLobbyError: (error: { code: string; message: string }) => void;
    start: ReturnType<typeof vi.fn>;
  } {
    let roomStateCb: ((s: RoomState) => void) | null = null;
    let connCb: ((s: 'connecting' | 'open' | 'closed') => void) | null = null;
    let lobbyErrCb: ((e: { code: string; message: string }) => void) | null = null;
    // Mirrors the real transport: the last room state is held and replayed to
    // whoever subscribes next (see socketTransport).
    let held: RoomState | null = heldRoomState;
    const start = vi.fn();
    const noop = () => {};
    const game = {
      roomCode: 'ROOM01',
      isHost: true,
      transport: {
        roomState: () => held,
        connectionStatus: () => 'open' as const,
        onRoomState: (cb: (s: RoomState) => void) => {
          roomStateCb = cb;
          if (held) cb(held);
          return noop;
        },
        onConnectionChange: (cb: (s: 'connecting' | 'open' | 'closed') => void) => {
          connCb = cb;
          cb('open');
          return noop;
        },
        onLobbyError: (cb: (e: { code: string; message: string }) => void) => {
          lobbyErrCb = cb;
          return noop;
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
      emitRoomState: (s) => {
        held = s;
        act(() => roomStateCb?.(s));
      },
      emitConnection: (s) => act(() => connCb?.(s)),
      emitLobbyError: (e) => act(() => lobbyErrCb?.(e)),
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

  it('renders the room the transport already holds, with no further broadcast', () => {
    // The regression: the room sends welcome + room-state back to back, so the
    // room-state lands before React mounts this component. With one human and
    // two bots nobody else ever joins, so no second broadcast follows — the
    // lobby has to show the state the transport is holding, or it sits on
    // "Waiting for the room…" with Start disabled forever.
    const seats = [
      { index: 0, kind: 'human' as const, name: 'Ana', connected: true },
      { index: 1, kind: 'bot' as const, name: 'Bot 2', connected: true },
      { index: 2, kind: 'bot' as const, name: 'Bot 3', connected: true },
    ];
    const { game } = fakeGame({}, lobbyState({ seats }));
    render(<SeatList game={game} onEnterGame={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.queryByText('Waiting for the room…')).not.toBeInTheDocument();
    expect(screen.getByText('Ana (you)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start game' })).toBeEnabled();
  });

  it('does not offer Start before any room state has arrived', () => {
    const { game } = fakeGame();
    render(<SeatList game={game} onEnterGame={vi.fn()} onLeave={vi.fn()} />);
    expect(screen.getByText('Waiting for the room…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Waiting for players/ })).toBeDisabled();
  });

  it('a non-host sees a waiting message, no Start button', () => {
    const { game, emitRoomState } = fakeGame({ isHost: false });
    render(<SeatList game={game} onEnterGame={vi.fn()} onLeave={vi.fn()} />);
    emitRoomState(lobbyState());
    expect(screen.queryByRole('button', { name: /Start/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting for the host/)).toBeInTheDocument();
  });
});
