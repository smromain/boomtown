import { PRESETS, RULES, type RulesetId, type SetupOptions, type Visibility } from '@boomtown/engine';
import { loadSettings } from '../settings/settings.js';
import { copy, fill } from '../copy/copy.js';

export type SeatKind = 'human' | 'bot';

export interface SeatConfig {
  readonly name: string;
  readonly kind: SeatKind;
  /** 1–10 (KTD7). Only meaningful for a bot seat. */
  readonly difficulty: number;
}

export interface GameConfig {
  readonly seats: readonly SeatConfig[];
  readonly edition: RulesetId;
  readonly visibility: Visibility;
  /** Fixed for a replayable/testable game; a fresh random seed otherwise. */
  readonly seed?: number;
}

/** A fresh config seeded from the player's saved preferences (U19). */
export function defaultConfig(): GameConfig {
  const s = loadSettings();
  const count = Math.max(RULES.minPlayers, Math.min(RULES.maxPlayers, s.seatCount));
  return {
    seats: Array.from({ length: count }, (_, i) => ({
      name: fill(copy.setup.seat.defaultName, { n: i + 1 }),
      kind: 'human' as const,
      difficulty: s.botDifficulty,
    })),
    edition: s.edition,
    visibility: s.visibility,
  };
}

/**
 * Why a config cannot start a game, or null. An all-bot table is allowed now
 * that the bot driver can play every seat (KTD7) — it just runs on its own.
 */
export function configError(config: GameConfig): string | null {
  if (config.seats.length < RULES.minPlayers)
    return fill(copy.setup.errors.tooFewSeats, { n: RULES.minPlayers });
  if (config.seats.length > RULES.maxPlayers)
    return fill(copy.setup.errors.tooManySeats, { n: RULES.maxPlayers });
  if (config.seats.some((seat) => seat.name.trim() === '')) return copy.setup.errors.namelessSeat;
  return null;
}

/** Build the engine's setup command. Seat order on the screen is play order. */
export function toSetupOptions(config: GameConfig): SetupOptions {
  return {
    seats: config.seats.map((seat) => ({ name: seat.name.trim() })),
    ruleset: PRESETS[config.edition],
    visibility: config.visibility,
    turnOrder: config.seats.map((_, index) => index),
    seed: config.seed ?? Math.floor(Math.random() * 0x7fffffff),
  };
}

/**
 * The visibility this config will actually play at. A ruleset may require one
 * (Boomtown forces closed books), in which case the table's own choice is
 * ignored — the engine enforces this in `createGame`, and the setup screens use
 * this to show what will happen rather than letting a player pick something
 * that will be quietly overridden.
 */
export function effectiveVisibility(config: GameConfig): Visibility {
  return PRESETS[config.edition].forcedVisibility ?? config.visibility;
}

/** Whether the ruleset fixes visibility, so the control should be disabled. */
export function visibilityIsFixed(config: GameConfig): boolean {
  return PRESETS[config.edition].forcedVisibility !== undefined;
}

/** Clamp the seat list to 2–6, adding or trimming from the end. */
export function resizeSeats(seats: readonly SeatConfig[], count: number): SeatConfig[] {
  const target = Math.max(RULES.minPlayers, Math.min(RULES.maxPlayers, count));
  const next = seats.slice(0, target);
  while (next.length < target) {
    next.push({
      name: fill(copy.setup.seat.defaultName, { n: next.length + 1 }),
      kind: 'human',
      difficulty: 5,
    });
  }
  return next;
}
