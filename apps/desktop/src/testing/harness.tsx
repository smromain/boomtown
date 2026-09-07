import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createGame, type Cell, type GameState, type Industry, type TileId, type Visibility } from '@boomtown/engine';
import { GameSession, createGameClient, localTransport, type GameClient } from '@boomtown/client-core';
import { GameClientProvider } from '../client/GameClientProvider.js';

const SEATS = [{ name: 'Ana' }, { name: 'Ben' }, { name: 'Cy' }];

export interface HarnessOptions {
  readonly visibility?: Visibility;
  /** Mutate the freshly-created game state before play — seed corporations, hands, cells. */
  readonly craft?: (state: GameState) => void;
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
  } as const;

  const state = createGame(setup);
  options.craft?.(state);

  const client = createGameClient(
    localTransport({ setup, controls: [0, 1, 2], engine: GameSession.fromSnapshot(state) }),
  );
  await client.connect();

  const result = render(<GameClientProvider client={client}>{ui}</GameClientProvider>);
  return Object.assign(result, { client });
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
