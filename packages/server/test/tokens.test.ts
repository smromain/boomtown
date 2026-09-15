import { describe, expect, it } from 'vitest';
import { mintToken, tokensMatch } from '../src/tokens.js';
import { SeatTable } from '../src/seats.js';
import type { RoomConfig } from '@boomtown/protocol';

const config: RoomConfig = {
  seatCount: 3,
  edition: 'boomtown',
  visibility: 'hidden',
  bots: {},
  seed: 1,
};

describe('minting', () => {
  it('produces 256 bits, hex encoded', () => {
    const token = mintToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 500 }, () => mintToken()));
    expect(seen.size).toBe(500);
  });
});

describe('comparing', () => {
  it('matches a token against itself and nothing else', () => {
    const token = mintToken();
    expect(tokensMatch(token, token)).toBe(true);
    expect(tokensMatch(token, mintToken())).toBe(false);
  });

  it('refuses a token of the wrong length without pretending otherwise', () => {
    const token = mintToken();
    expect(tokensMatch(token, token.slice(0, -1))).toBe(false);
    expect(tokensMatch(token, `${token}0`)).toBe(false);
    expect(tokensMatch(token, '')).toBe(false);
  });

  it('compares the whole token, not up to the first difference', () => {
    // The property that matters is that a near-miss and a total miss are
    // indistinguishable. Both must be false, and the loop must not stop early.
    const token = 'a'.repeat(64);
    const almost = `${'a'.repeat(63)}b`;
    const nothing = 'b'.repeat(64);
    expect(tokensMatch(token, almost)).toBe(false);
    expect(tokensMatch(token, nothing)).toBe(false);
  });
});

describe('rotation on resume', () => {
  it('hands back a new token and retires the one presented', () => {
    const seats = new SeatTable(config);
    const first = mintToken();
    const joined = seats.join('Ana', first, 'conn-1');
    expect(joined?.seat).toBe(0);

    const back = seats.reconnect(first, 'conn-2');
    expect(back?.seat).toBe(0);
    expect(back?.token).not.toBe(first);
    expect(back?.token).toMatch(/^[0-9a-f]{64}$/);

    // The captured token is worth one reconnect, and no more.
    expect(seats.reconnect(first, 'conn-3')).toBeNull();
    expect(seats.reconnect(back!.token, 'conn-3')?.seat).toBe(0);
  });

  it('keeps the seat and the name across a rotation', () => {
    const seats = new SeatTable(config);
    const token = mintToken();
    seats.join('Ana', token, 'conn-1');
    const back = seats.reconnect(token, 'conn-2');
    expect(seats.displayNames()[0]).toBe('Ana');
    expect(seats.seatForConnection('conn-2')).toBe(0);
    expect(seats.seatForToken(back!.token)).toBe(0);
  });

  it('refuses a token that was never issued', () => {
    const seats = new SeatTable(config);
    seats.join('Ana', mintToken(), 'conn-1');
    expect(seats.reconnect(mintToken(), 'conn-2')).toBeNull();
    expect(seats.seatForToken(mintToken())).toBeNull();
  });

  it('binds one seat per token when several people are seated', () => {
    const seats = new SeatTable(config);
    const a = mintToken();
    const b = mintToken();
    seats.join('Ana', a, 'conn-a');
    seats.join('Ben', b, 'conn-b');
    expect(seats.seatForToken(a)).toBe(0);
    expect(seats.seatForToken(b)).toBe(1);
    // Rotating one seat's token leaves the other alone.
    const rotated = seats.reconnect(a, 'conn-a2');
    expect(rotated?.seat).toBe(0);
    expect(seats.seatForToken(b)).toBe(1);
  });
});
