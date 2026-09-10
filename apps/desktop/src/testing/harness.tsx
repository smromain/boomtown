import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import {
  POOL,
  PRESETS,
  createGame,
  displayName,
  type Cell,
  type GameState,
  type Industry,
  type TileId,
  type Visibility,
} from '@boomtown/engine';
import { GameSession, createGameClient, localTransport, type GameClient } from '@boomtown/client-core';
import { GameClientProvider } from '../client/GameClientProvider.js';
import { HotSeatProvider } from '../game/HotSeatContext.js';

const SEATS = [{ name: 'Ana' }, { name: 'Ben' }, { name: 'Cy' }];

export interface HarnessOptions {
  readonly visibility?: Visibility;
  /** Mutate the freshly-created game state before play — seed corporations, hands, cells. */
  readonly craft?: (state: GameState) => void;
  /** Seats a local player controls. Defaults to all three (hot-seat). Pass a
   *  subset to simulate a bot / remote seat being on the clock. */
  readonly localSeats?: readonly number[];
  /**
   * Seats this client receives a `ClientView` for. Hot-seat gets all of them;
   * **online a client holds exactly one** (`transport/socket.ts`), which is
   * what makes `activeView` null on every remote player's turn. Pass a single
   * seat to reproduce that shape — a hot-seat harness cannot exercise it.
   * Defaults to all three.
   */
  readonly controls?: readonly number[];
  /** Edition preset. Defaults to the engine's own default (classic). The two
   *  editions disagree on bonus tiers, safe size and price bands, so anything
   *  that renders those needs to be tested against both. */
  readonly edition?: 'classic' | 'edition-2015' | 'boomtown';
}

/** Render a component wired to a live local game. Returns the client so tests can dispatch. */
export async function renderPanel(
  ui: ReactElement,
  options: HarnessOptions = {},
): Promise<RenderResult & { client: GameClient }> {
  const setup = {
    seats: SEATS,
    seed: 1,
    turnOrder: [0, 1, 2],
    companyDraw: { books: 0, electronics: 0, air: 0, energy: 0, tech: 0, video: 0, toys: 0 },
    ...(options.visibility ? { visibility: options.visibility } : {}),
    ...(options.edition ? { ruleset: PRESETS[options.edition] } : {}),
  } as const;

  const state = createGame(setup);
  options.craft?.(state);

  const client = createGameClient(
    localTransport({
      setup,
      controls: options.controls ?? [0, 1, 2],
      engine: GameSession.fromSnapshot(state),
    }),
  );
  await client.connect();

  const result = render(
    <GameClientProvider client={client} localSeats={options.localSeats ?? [0, 1, 2]}>
      <HotSeatProvider>{ui}</HotSeatProvider>
    </GameClientProvider>,
  );
  return Object.assign(result, { client });
}

/**
 * The base name of the first candidate for each industry — the line-up
 * `renderPanel` forces (`companyDraw: … 0`). Tests reference these instead of
 * hardcoding a company name, so re-theming the pool in `packages/engine` can't
 * break an unrelated UI test.
 */
export const NAMES: Record<Industry, string> = Object.fromEntries(
  (Object.keys(POOL) as Industry[]).map((industry) => [industry, POOL[industry][0].baseName]),
) as Record<Industry, string>;

/** The display name a survivor takes after eating the given industries (first candidates). */
export function mergedName(survivor: Industry, ...eaten: Industry[]): string {
  return displayName(
    NAMES[survivor],
    eaten.map((industry) => ({ displayName: NAMES[industry], flavours: [] })),
  );
}

/** Put tiles on the board as an existing corporation. */
export function seedCorp(state: GameState, industry: Industry, tiles: TileId[]): void {
  const corp = state.corporations[industry];
  corp.founded = true;
  corp.tiles = [...tiles];
  corp.hqTile = tiles[0] ?? null;
  for (const tile of tiles) state.cells[tile] = { kind: 'corporation', industry } satisfies Cell;
}

/** Drain the microtask + timer queue (LocalTransport delivers on a microtask). */
export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
