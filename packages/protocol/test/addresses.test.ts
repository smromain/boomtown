import { describe, expect, it } from 'vitest';
import {
  ADDRESS_LENGTH,
  TICKET_LENGTH,
  formatTicket,
  isRoomAddress,
  isTicket,
  mintRoomAddress,
  mintTicket,
  normaliseTicket,
} from '../src/index.js';

describe('room addresses', () => {
  it('carry 160 bits, which is what makes them unguessable', () => {
    const address = mintRoomAddress();
    expect(address).toHaveLength(ADDRESS_LENGTH);
    // 32 characters from a 32-symbol alphabet is 5 bits each.
    expect(ADDRESS_LENGTH * 5).toBe(160);
    expect(isRoomAddress(address)).toBe(true);
  });

  it('do not repeat', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => mintRoomAddress()));
    expect(seen.size).toBe(1000);
  });

  it('reject anything that is not one, including a ticket', () => {
    expect(isRoomAddress(mintTicket())).toBe(false);
    expect(isRoomAddress('ABC123')).toBe(false);
    expect(isRoomAddress('')).toBe(false);
    expect(isRoomAddress(mintRoomAddress().toUpperCase())).toBe(false);
    expect(isRoomAddress(`${mintRoomAddress()}x`)).toBe(false);
    // The excluded letters are excluded from addresses too.
    expect(isRoomAddress('i'.repeat(ADDRESS_LENGTH))).toBe(false);
  });
});

describe('tickets', () => {
  it('are eight characters, about a thousand times the old space', () => {
    expect(TICKET_LENGTH).toBe(8);
    const ticket = mintTicket();
    expect(ticket).toHaveLength(8);
    expect(isTicket(ticket)).toBe(true);
    expect(32 ** TICKET_LENGTH / 32 ** 6).toBe(1024);
  });

  it('use no letter that can be misheard for a digit', () => {
    // I, L, O and U are absent by construction, so "oh" and "eye" have one
    // right answer when a code is read out.
    const many = Array.from({ length: 300 }, () => mintTicket()).join('');
    expect(many).not.toMatch(/[ILOU]/);
  });
});

describe('what a person typed', () => {
  it('tidies case, the display dash, and the classic mistypes', () => {
    expect(normaliseTicket('abcd-1234')).toBe('ABCD1234');
    expect(normaliseTicket('  ab cd 12 34 ')).toBe('ABCD1234');
    expect(normaliseTicket('ABCDO1I4')).toBe('ABCD0114');
    expect(normaliseTicket('abcduxyz')).toBe('ABCDVXYZ');
  });

  it('round-trips a minted ticket through display and back', () => {
    for (let i = 0; i < 100; i += 1) {
      const ticket = mintTicket();
      expect(normaliseTicket(formatTicket(ticket))).toBe(ticket);
    }
  });

  it('shows as two groups of four, which is easier to read back', () => {
    expect(formatTicket('ABCD1234')).toBe('ABCD-1234');
  });
});
