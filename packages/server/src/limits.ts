/**
 * Per-connection abuse ceilings.
 *
 * Every number here is a judgement about the gap between the fastest a person
 * plays and the slowest a script bothers to run, so each one carries its
 * reasoning. They live together in one file because tuning them is a decision,
 * not an edit scattered across three call sites.
 *
 * These are held in memory, keyed by connection id, and are lost on a
 * hibernation wake. That is acceptable and deliberate: a room hibernates when
 * it has been idle, and a connection flooding it is by definition not idle, so
 * the buckets that matter are the ones that survive.
 */

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export const LIMITS = {
  /**
   * Sustained commands per second per connection.
   *
   * Calibrated against a *legitimate* client at full speed, not against a
   * person. Our own integration test plays an entire game over a socket with no
   * pacing, and it is as real a client as any; a first pass at 8/s, then 30/s,
   * stalled it — the exact "limits that punish real play" failure the plan
   * warns about, caught by the only test that plays a whole game.
   *
   * Generosity is nearly free here. A flood is thousands of frames a second, so
   * this still removes well over 99% of one, and it is not the control that
   * bounds sustained abuse anyway — the room's total command ceiling is.
   */
  commandsPerSecond: 50,
  /**
   * Burst allowance, sized to a whole game rather than a turn.
   *
   * This is the correction the integration test forced: the longest legitimate
   * uninterrupted run of commands is not a merger turn, it is a client playing
   * a complete game as fast as the socket allows — about 70 commands for three
   * seats, more for six with long mergers. A burst that covers a full game with
   * room to spare means no legitimate session is ever throttled, and the limit
   * reads as what it is: you may play a game at any speed you like, but you may
   * not play a hundred of them at once.
   */
  commandBurst: 400,
  maxValidationFailures: 5,
  /**
   * Connections the room will hold at once. Seats cap at the ruleset's player
   * count; the rest of this is reconnect overlap and slack, not an audience.
   */
  maxConnections: 24,
} as const;

/**
 * A leaky-bucket rate limiter. Refills continuously rather than on a timer, so
 * it needs no scheduling and behaves correctly across a hibernation gap.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
    private readonly clock: Clock = systemClock,
  ) {
    this.tokens = capacity;
    this.lastRefill = clock.now();
  }

  /** Take one token if there is one. False means the caller is over its limit. */
  take(): boolean {
    const now = this.clock.now();
    const elapsedSeconds = Math.max(0, now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.perSecond);
    this.lastRefill = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  /** Remaining allowance, for logging. */
  available(): number {
    return Math.floor(this.tokens);
  }
}

/** What one connection is allowed to do, and how much rope it has left. */
export class ConnectionGuard {
  readonly commands: TokenBucket;
  private failures = 0;

  constructor(clock: Clock = systemClock) {
    this.commands = new TokenBucket(LIMITS.commandBurst, LIMITS.commandsPerSecond, clock);
  }

  /** Record a rejected frame. True means this connection has used up its rope. */
  recordFailure(): boolean {
    this.failures += 1;
    return this.failures >= LIMITS.maxValidationFailures;
  }

  failureCount(): number {
    return this.failures;
  }
}

/** Guards for every live connection in one room. */
export class RoomGuards {
  private readonly guards = new Map<string, ConnectionGuard>();

  constructor(private readonly clock: Clock = systemClock) {}

  for(connectionId: string): ConnectionGuard {
    const existing = this.guards.get(connectionId);
    if (existing) return existing;
    const guard = new ConnectionGuard(this.clock);
    this.guards.set(connectionId, guard);
    return guard;
  }

  release(connectionId: string): void {
    this.guards.delete(connectionId);
  }

  size(): number {
    return this.guards.size;
  }
}
