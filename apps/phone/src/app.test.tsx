import { act } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomState } from '@boomtown/protocol';
import { copy } from '@desktop/copy/copy.js';
import { App, type Connect, type PhoneRoom } from './App.js';
import { loadSession, saveSession, ticketFromHash } from './connection.js';

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
const ADDRESS = 'a'.repeat(32);
const TICKET = 'ABCD2345';

/** A room connection with no socket: the seat and room state are set by the test. */
function fakeRoom(name: string, over: { seat?: number | null; token?: string } = {}) {
  let seat = over.seat ?? null;
  let roomState: RoomState | null = null;
  const listeners = new Set<(state: RoomState) => void>();
  const transport = {
    seat: () => seat,
    token: () => over.token ?? 'tok-1',
    roomState: () => roomState,
    onRoomState: (fn: (state: RoomState) => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    connectionStatus: () => 'open' as const,
    onConnectionChange: () => () => {},
    onLobbyError: () => () => {},
  };
  const room = {
    client: { disconnect: vi.fn() },
    transport,
    address: ADDRESS,
    name,
  } as unknown as PhoneRoom;
  return {
    room,
    admit(at: number, state: RoomState) {
      seat = at;
      roomState = state;
      for (const fn of listeners) fn(state);
    },
  };
}

function lobby(): RoomState {
  return {
    phase: 'lobby',
    seats: [
      { index: 0, name: 'Ana', kind: 'human', connected: true },
      { index: 1, name: null, kind: 'open', connected: false },
    ],
    hostSeat: null,
    table: true,
  } as unknown as RoomState;
}

function resolvesTo(address: string | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => (address ? new Response(JSON.stringify({ address })) : new Response('', { status: 404 }))),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('the phone page (#62)', () => {
  it('reads the ticket from the fragment, and nothing else', () => {
    expect(ticketFromHash(`#t=${TICKET}`)).toBe(TICKET);
    expect(ticketFromHash('#t=abcd-2345')).toBe(TICKET);
    expect(ticketFromHash('#t=nope')).toBeNull();
    expect(ticketFromHash('')).toBeNull();
  });

  it('knocks from the QR without asking for the code, waits at the door, then sits', async () => {
    window.location.hash = `#t=${TICKET}`;
    resolvesTo(ADDRESS);
    const fake = fakeRoom('Ana');
    const connect = vi.fn<Connect>(async () => fake.room);
    render(<App connect={connect} />);

    expect(screen.queryByRole('textbox', { name: /code/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: /knock/i }));
    await flush();
    await flush();

    expect(connect).toHaveBeenCalledWith({ address: ADDRESS, name: 'Ana' });
    expect(screen.getByRole('heading', { name: copy.phone.doorTitle })).toBeInTheDocument();

    act(() => fake.admit(0, lobby()));
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
    // Seated, the seat's token is kept for a locked screen to come back with.
    expect(loadSession()).toEqual({ address: ADDRESS, token: 'tok-1', name: 'Ana' });
  });

  it('asks for the code when opened without one, and refuses a bad code', async () => {
    resolvesTo(null);
    const connect = vi.fn<Connect>();
    render(<App connect={connect} />);
    fireEvent.change(screen.getByRole('textbox', { name: /code/i }), { target: { value: TICKET } });
    fireEvent.click(screen.getByRole('button', { name: /knock/i }));
    await flush();
    expect(connect).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).not.toBe('');
  });

  it('resumes a stored seat by its token instead of knocking again', async () => {
    saveSession({ address: ADDRESS, token: 'tok-0', name: 'Ana' });
    const fake = fakeRoom('Ana', { seat: 1, token: 'tok-2' });
    fake.admit(1, lobby());
    const connect = vi.fn<Connect>(async () => fake.room);
    render(<App connect={connect} />);
    await flush();
    await flush();
    expect(connect).toHaveBeenCalledWith({ address: ADDRESS, name: 'Ana', token: 'tok-0' });
    // The rotated token replaces the old one.
    expect(loadSession()?.token).toBe('tok-2');
  });
});
