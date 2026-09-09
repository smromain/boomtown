import {
  createGame,
  viewFor,
  type Cell,
  type EngineEvent,
  type GameState,
  type Industry,
  type PlayerView,
  type TileId,
} from '@boomtown/engine';
import type { Beat } from '../beatTriggers.js';

/**
 * Fixture game states for the settings debug menu (dev-only): each function
 * builds a real, engine-valid `PlayerView` via `createGame`/`viewFor` — the
 * same machinery the test harness uses — rather than hand-faking one, so a
 * beat component sees exactly the shape it would in a live game. This is what
 * lets the menu trigger a beat's real animation without simulating a game.
 */

const SEATS = [{ name: 'Player 1' }, { name: 'Player 2' }, { name: 'Player 3' }];

function baseState(): GameState {
  return createGame({ seats: SEATS, seed: 7, turnOrder: [0, 1, 2] });
}

function found(state: GameState, industry: Industry, tiles: readonly TileId[]): void {
  const corp = state.corporations[industry];
  corp.founded = true;
  corp.tiles = [...tiles];
  corp.hqTile = tiles[0] ?? null;
  for (const tile of tiles) state.cells[tile] = { kind: 'corporation', industry } satisfies Cell;
}

/** Absorb `defunct` into `survivor`, as a real merger completion would leave the state. */
function merge(state: GameState, survivor: Industry, defunct: Industry): void {
  const winner = state.corporations[survivor];
  const loser = state.corporations[defunct];
  for (const tile of loser.tiles) state.cells[tile] = { kind: 'corporation', industry: survivor };
  winner.tiles = [...winner.tiles, ...loser.tiles];
  winner.eaten = [
    ...winner.eaten,
    { industry: defunct, displayName: state.companies[defunct].baseName, flavours: [state.companies[defunct].flavour] },
  ];
  loser.founded = false;
  loser.tiles = [];
  loser.hqTile = null;
}

export interface BeatPreview {
  readonly beat: Beat;
  readonly view: PlayerView;
  /** Only the merger beat reads this (via `latestMerger`, same as real play). */
  readonly log: readonly EngineEvent[];
}

export function foundingPreview(): BeatPreview {
  const state = baseState();
  found(state, 'video', ['6E']);
  return { beat: { id: 'founding', industry: 'video' }, view: viewFor(state, 0), log: [] };
}

export function buyStockPreview(): BeatPreview {
  const state = baseState();
  found(state, 'video', ['2E', '3E', '4E']);
  return {
    beat: { id: 'buy-stock', seat: 2, cost: 1400, picks: { video: 2 } },
    view: viewFor(state, 0),
    log: [],
  };
}

export function mergerPreview(): BeatPreview {
  const state = baseState();
  found(state, 'books', ['2C', '3C', '4C', '5C', '2D']);
  found(state, 'energy', ['11E', '10F']);
  merge(state, 'books', 'energy');
  const view = viewFor(state, 0);
  // The same event shape a real merger appends — the beat reads this via
  // `latestMerger`, exactly as it does for a live game.
  const log: EngineEvent[] = [
    { type: 'merger-started', placedTile: '4E', corporations: ['books', 'energy'] },
    { type: 'survivor-chosen', survivor: 'books' },
    { type: 'corporation-defunct', industry: 'energy', absorbedInto: 'books' },
    {
      type: 'bonus-paid',
      defunct: 'energy',
      payouts: [
        { seat: 2, tier: 'primary', amount: 3000 },
        { seat: 0, tier: 'secondary', amount: 1500 },
      ],
    },
    { type: 'merger-completed', survivor: 'books' },
  ];
  return { beat: { id: 'merger' }, view, log };
}

export function endgamePreview(): BeatPreview {
  const state = baseState();
  found(
    state,
    'video',
    Array.from({ length: 11 }, (_, i) => `${i + 1}A` as TileId),
  );
  return { beat: { id: 'endgame', seat: 1 }, view: viewFor(state, 0), log: [] };
}

export function victoryPreview(): BeatPreview {
  const state = baseState();
  state.status = 'over';
  state.endAnnouncedBy = 0;
  state.result = {
    rankings: [
      { seat: 1, cash: 7200, equity: 5100, total: 12300 },
      { seat: 0, cash: 6100, equity: 2000, total: 8100 },
      { seat: 2, cash: 4300, equity: 900, total: 5200 },
    ],
    winners: [1],
  };
  return { beat: { id: 'victory' }, view: viewFor(state, 0), log: [] };
}

export type PreviewKind = 'founding' | 'buy-stock' | 'merger' | 'endgame' | 'victory';

export const BEAT_PREVIEWS: Readonly<Record<PreviewKind, () => BeatPreview>> = {
  founding: foundingPreview,
  'buy-stock': buyStockPreview,
  merger: mergerPreview,
  endgame: endgamePreview,
  victory: victoryPreview,
};
