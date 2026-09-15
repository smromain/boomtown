import { describe, expect, it } from 'vitest';
import { Door, KNOCK_TTL_MS } from '../src/admission.js';

describe('the door', () => {
  it('registers a knock without seating anyone', () => {
    const door = new Door();
    const knock = door.knock('conn-1', 'Ana', 0);
    expect(knock).not.toBeNull();
    expect(door.list(0)).toEqual([{ id: knock!.id, name: 'Ana' }]);
  });

  it('normalises the name a knocker chose', () => {
    // Same rule as a seated player's name — a knock is the first thing a host
    // reads, and it should not be able to impersonate anyone.
    const door = new Door();
    const knock = door.knock('conn-1', '  Ana​Maria  ', 0);
    expect(knock!.name).toBe('AnaMaria');
  });

  it('is idempotent for one connection, so a double-click is one row', () => {
    const door = new Door();
    const first = door.knock('conn-1', 'Ana', 0);
    const again = door.knock('conn-1', 'Ana', 10);
    expect(again!.id).toBe(first!.id);
    expect(door.list(10)).toHaveLength(1);
  });

  it('lists oldest first, the order a host works through them', () => {
    const door = new Door();
    door.knock('conn-1', 'First', 0);
    door.knock('conn-2', 'Second', 50);
    door.knock('conn-3', 'Third', 100);
    expect(door.list(100).map((k) => k.name)).toEqual(['First', 'Second', 'Third']);
  });
});

describe('admitting and declining', () => {
  it('takes a knock off the queue exactly once', () => {
    const door = new Door();
    const knock = door.knock('conn-1', 'Ana', 0)!;
    expect(door.take(knock.id, 0)?.connectionId).toBe('conn-1');
    expect(door.take(knock.id, 0)).toBeNull();
    expect(door.list(0)).toHaveLength(0);
  });

  it('makes a decline stick, so it cannot simply be re-knocked', () => {
    // Without this, "turn away" means "wait a second and try again", and the
    // host is in a loop rather than in control.
    const door = new Door();
    const knock = door.knock('conn-1', 'Ana', 0)!;
    expect(door.decline(knock.id, 0)?.connectionId).toBe('conn-1');
    expect(door.knock('conn-1', 'Ana', 10)).toBeNull();
    expect(door.list(10)).toHaveLength(0);
  });

  it('refuses an unknown or already-answered knock id', () => {
    const door = new Door();
    expect(door.take('nope', 0)).toBeNull();
    expect(door.decline('nope', 0)).toBeNull();
  });
});

describe('locking', () => {
  it('turns knocks away outright while locked, and resumes when unlocked', () => {
    const door = new Door();
    door.locked = true;
    expect(door.knock('conn-1', 'Ana', 0)).toBeNull();
    door.locked = false;
    expect(door.knock('conn-1', 'Ana', 0)).not.toBeNull();
  });
});

describe('knocks nobody answers', () => {
  it('are forgotten, so the queue does not only grow', () => {
    const door = new Door();
    door.knock('conn-1', 'Ana', 0);
    expect(door.list(KNOCK_TTL_MS - 1)).toHaveLength(1);
    expect(door.list(KNOCK_TTL_MS)).toHaveLength(0);
  });

  it('cannot be admitted once forgotten', () => {
    const door = new Door();
    const knock = door.knock('conn-1', 'Ana', 0)!;
    expect(door.take(knock.id, KNOCK_TTL_MS)).toBeNull();
  });
});

describe('a knocker that goes away', () => {
  it('leaves the queue when its connection closes', () => {
    const door = new Door();
    door.knock('conn-1', 'Ana', 0);
    door.knock('conn-2', 'Ben', 0);
    door.dropConnection('conn-1');
    expect(door.list(0).map((k) => k.name)).toEqual(['Ben']);
  });
});

describe('handing a seat to a bot', () => {
  const config = {
    seatCount: 3,
    edition: 'boomtown' as const,
    visibility: 'hidden' as const,
    bots: {},
    seed: 1,
  };

  it('takes the seat from the human and never reopens it', async () => {
    // The property that matters. A seat that went back to `open` mid-game could
    // be claimed by whoever knocked next, handing a stranger another player's
    // cash and holdings — so the only exit from `seated` is a bot.
    const { SeatTable } = await import('../src/seats.js');
    const seats = new SeatTable(config);
    seats.join('Ana', 'tok-a', 'conn-a');
    seats.join('Ben', 'tok-b', 'conn-b');
    seats.join('Cal', 'tok-c', 'conn-c');

    expect(seats.eject(1)).toBe(true);

    const slots = seats.snapshot(null, 'playing', { hostSeat: 0, knocks: [], locked: false }).seats;
    expect(slots[1]!.kind).toBe('bot');
    expect(slots.some((s) => s.kind === 'open')).toBe(false);
    expect(seats.isBot(1)).toBe(true);
    // And the token that held it is dead, so the ejected player cannot resume.
    expect(seats.seatForToken('tok-b')).toBeNull();
    expect(seats.reconnect('tok-b', 'conn-b2')).toBeNull();
  });

  it('leaves the other seats alone', async () => {
    const { SeatTable } = await import('../src/seats.js');
    const seats = new SeatTable(config);
    seats.join('Ana', 'tok-a', 'conn-a');
    seats.join('Ben', 'tok-b', 'conn-b');
    seats.eject(1);
    expect(seats.seatForToken('tok-a')).toBe(0);
    expect(seats.isBot(0)).toBe(false);
  });

  it('says so when nobody is sitting there', async () => {
    const { SeatTable } = await import('../src/seats.js');
    const seats = new SeatTable(config);
    expect(seats.eject(2)).toBe(false);
  });

  it('survives a hibernation wake, or the seat would be handed back', async () => {
    const { SeatTable } = await import('../src/seats.js');
    const before = new SeatTable(config);
    before.join('Ana', 'tok-a', 'conn-a');
    before.join('Ben', 'tok-b', 'conn-b');
    before.eject(1);

    const after = new SeatTable(config);
    after.restoreEjected(before.ejectedSeats());
    expect(after.isBot(1)).toBe(true);
    expect(after.ejectedSeats()).toEqual([1]);
  });

  it('keeps the room full, so the game does not wait for a replacement', async () => {
    const { SeatTable } = await import('../src/seats.js');
    const seats = new SeatTable(config);
    seats.join('Ana', 'tok-a', 'conn-a');
    seats.join('Ben', 'tok-b', 'conn-b');
    seats.join('Cal', 'tok-c', 'conn-c');
    expect(seats.allSeatsFilled()).toBe(true);
    seats.eject(2);
    expect(seats.allSeatsFilled()).toBe(true);
  });
});
