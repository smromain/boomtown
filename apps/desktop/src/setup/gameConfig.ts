import { PRESETS, RULES, type RulesetId, type SetupOptions, type Visibility } from '@boomtown/engine';

export type SeatKind = 'human' | 'bot';

export interface SeatConfig {
  readonly name: string;
  readonly kind: SeatKind;
  /** 1–10 (KTD7). Only meaningful for a bot seat; carried through even though bots are inert until U14. */
  readonly difficulty: number;
}

export interface GameConfig {
  readonly seats: readonly SeatConfig[];
  readonly edition: RulesetId;
  readonly visibility: Visibility;
  /** Fixed for a replayable/testable game; a fresh random seed otherwise. */
  readonly seed?: number;
}

export function defaultConfig(): GameConfig {
  return {
    seats: [
      { name: 'Player 1', kind: 'human', difficulty: 5 },
      { name: 'Player 2', kind: 'human', difficulty: 5 },
    ],
    edition: 'classic',
    visibility: 'open',
  };
}

/**
 * Why a config cannot start a game, or null. `botsPlayable` is false until U14
 * lands the bot policy — an all-bot game would hang with no one to move.
 */
export function configError(config: GameConfig, botsPlayable = true): string | null {
  if (config.seats.length < RULES.minPlayers) return `Need at least ${RULES.minPlayers} seats`;
  if (config.seats.length > RULES.maxPlayers) return `At most ${RULES.maxPlayers} seats`;
  if (config.seats.some((seat) => seat.name.trim() === '')) return 'Every seat needs a name';
  if (!botsPlayable && config.seats.every((seat) => seat.kind === 'bot')) {
    return 'No one can play an all-bot game yet';
  }
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
