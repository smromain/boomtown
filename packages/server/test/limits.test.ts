import { describe, expect, it } from 'vitest';
import { ConnectionGuard, LIMITS, RoomGuards, TokenBucket, type Clock } from '../src/limits.js';
import { MAX_NAME_LENGTH, cleanName } from '../src/seats.js';

/** A clock the test drives, so rate limits are tested without waiting. */
function fakeClock(): Clock & { advance(ms: number): void } {
  let t = 0;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('the command bucket', () => {
  it('allows a burst, then refuses', () => {
    const clock = fakeClock();
    const bucket = new TokenBucket(LIMITS.commandBurst, LIMITS.commandsPerSecond, clock);
    for (let i = 0; i < LIMITS.commandBurst; i += 1) {
      expect(bucket.take(), `command ${i + 1} of the burst`).toBe(true);
    }
    expect(bucket.take()).toBe(false);
  });

  it('refills continuously, so a pause earns allowance back', () => {
    const clock = fakeClock();
    const bucket = new TokenBucket(LIMITS.commandBurst, LIMITS.commandsPerSecond, clock);
    while (bucket.take());
    clock.advance(1000);
    for (let i = 0; i < LIMITS.commandsPerSecond; i += 1) {
      expect(bucket.take()).toBe(true);
    }
    expect(bucket.take()).toBe(false);
  });

  it('never refills past its capacity, however long the room sat idle', () => {
    const clock = fakeClock();
    const bucket = new TokenBucket(LIMITS.commandBurst, LIMITS.commandsPerSecond, clock);
    clock.advance(60 * 60 * 1000);
    let taken = 0;
    while (bucket.take()) taken += 1;
    expect(taken).toBe(LIMITS.commandBurst);
  });

  it('does not run backwards if the clock does', () => {
    const clock = fakeClock();
    const bucket = new TokenBucket(4, 1, clock);
    expect(bucket.take()).toBe(true);
    const before = bucket.available();
    clock.advance(-5000);
    bucket.take();
    expect(bucket.available()).toBeLessThanOrEqual(before);
  });
});

describe('a real game never trips the limit', () => {
  it('survives a merger: a disposal decision per seat, then a buy, back to back', () => {
    const clock = fakeClock();
    const bucket = new TokenBucket(LIMITS.commandBurst, LIMITS.commandsPerSecond, clock);
    // Place the tile that causes a multi-chain merger, resolve a disposal for
    // each other seat, buy three shares, end the turn. Clicks, ~120ms apart.
    const commands = 1 + 5 + 3 + 1;
    for (let i = 0; i < commands; i += 1) {
      expect(bucket.take(), `command ${i + 1} of a merger turn`).toBe(true);
      clock.advance(120);
    }
  });

  it('survives a whole game played as fast as the socket allows, with no delay at all', () => {
    // The case that actually matters, and the one that caught two too-tight
    // calibrations: `packages/server/test/room.integration.test.ts` plays a
    // three-seat game to a ranked result in ~70 commands sent back to back
    // with no pacing. A six-seat game with long mergers is several times that,
    // so the burst has to cover a game, not a turn.
    const clock = fakeClock();
    const bucket = new TokenBucket(LIMITS.commandBurst, LIMITS.commandsPerSecond, clock);
    const longGame = 250;
    for (let i = 0; i < longGame; i += 1) {
      expect(bucket.take(), `command ${i + 1} of an unpaced full game`).toBe(true);
    }
  });
});

describe('strikes for malformed frames', () => {
  it('tolerates a few, then says the connection is done', () => {
    const guard = new ConnectionGuard(fakeClock());
    for (let i = 1; i < LIMITS.maxValidationFailures; i += 1) {
      expect(guard.recordFailure(), `failure ${i}`).toBe(false);
    }
    expect(guard.recordFailure()).toBe(true);
    expect(guard.failureCount()).toBe(LIMITS.maxValidationFailures);
  });
});

describe('guards per connection', () => {
  it('keeps one guard per connection, and the same one across calls', () => {
    const guards = new RoomGuards(fakeClock());
    expect(guards.for('a')).toBe(guards.for('a'));
    expect(guards.for('a')).not.toBe(guards.for('b'));
    expect(guards.size()).toBe(2);
  });

  it('forgets a connection when it closes, so the map cannot grow forever', () => {
    const guards = new RoomGuards(fakeClock());
    guards.for('a');
    guards.release('a');
    expect(guards.size()).toBe(0);
  });

  it('gives one connection no claim on another connection’s allowance', () => {
    const guards = new RoomGuards(fakeClock());
    while (guards.for('flooder').commands.take());
    expect(guards.for('flooder').commands.take()).toBe(false);
    expect(guards.for('innocent').commands.take()).toBe(true);
  });
});


describe('display names are normalised at the room, not the client', () => {
  it('strips what lets a name misrepresent itself', () => {
    // A bidi override can make a name render as another player's.
    expect(cleanName('Ana\u202Ereversed')).toBe('Anareversed');
    // Zero-width characters make two visibly identical names that are not equal.
    expect(cleanName('A\u200Bna')).toBe('Ana');
    // Control characters corrupt any log line the name reaches.
    expect(cleanName('Ana\u0007\u0000')).toBe('Ana');
    // A name made entirely of removed characters is blank, not invisible.
    expect(cleanName('\u200B\u200B')).toBe('');
  });

  it('still does the ordinary things', () => {
    expect(cleanName('  Ana   Maria  ')).toBe('Ana Maria');
    expect(cleanName('x'.repeat(200))).toHaveLength(MAX_NAME_LENGTH);
  });
});
