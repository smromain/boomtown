import { PRESETS, RULES, type RulesetId, type SetupOptions, type Visibility } from '@boomtown/engine';
import { loadSettings } from '../settings/settings.js';

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
      name: `Player ${i + 1}`,
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
  if (config.seats.length < RULES.minPlayers) return `Need at least ${RULES.minPlayers} seats`;
  if (config.seats.length > RULES.maxPlayers) return `At most ${RULES.maxPlayers} seats`;
  if (config.seats.some((seat) => seat.name.trim() === '')) return 'Every seat needs a name';
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

/** Clamp the seat list to 2–6, adding or trimming from the end. */
export function resizeSeats(seats: readonly SeatConfig[], count: number): SeatConfig[] {
  const target = Math.max(RULES.minPlayers, Math.min(RULES.maxPlayers, count));
  const next = seats.slice(0, target);
  while (next.length < target) {
    next.push({ name: `Player ${next.length + 1}`, kind: 'human', difficulty: 5 });
  }
  return next;
}
