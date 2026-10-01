import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  GameSession,
  attachBotDriver,
  createGameClient,
  localTransport,
  type GameClient,
} from '@boomtown/client-core';
import { PRESETS } from '@boomtown/engine';
import type { StartedGame } from '../setup/NewGame.js';
import { copy } from '../copy/copy.js';
import { loadSettings } from '../settings/settings.js';
import { YOU, allows, rivalMove, stepOf, tutorialGame, tutorialSetup } from './script.js';

export interface TutorialState {
  /** The host's opening line has been read. Nothing on the table moves until it has. */
  readonly welcomed: boolean;
  /** Bumped each time a move is turned away, so the host can repeat the ask. */
  readonly nudges: number;
}

/** What the host and the hand read from a running tutorial. */
export interface Tutorial {
  readonly store: StoreApi<TutorialState>;
  welcome(): void;
}

/**
 * Deal the tutorial: you and two scripted rivals at a Boomtown table laid out
 * by `script.ts`. The client handed to the game screen is the ordinary one with
 * a gate on `dispatch`: a move the current step does not ask for never reaches
 * the engine, and the host says again what it wants instead.
 */
export async function startTutorial(): Promise<StartedGame> {
  const t = copy.tutorial;
  const names = { you: loadSettings().playerName.trim() || t.you, rivals: [t.rivals[0], t.rivals[1]] as [string, string] };
  const seats = [0, 1, 2];

  const session = new GameSession({ start: tutorialGame(names) });
  // Every seat, as a solo game against bots has: the bot driver reads each
  // rival's owed decision off its view.
  const inner = createGameClient(localTransport({ setup: tutorialSetup(names), controls: seats, engine: session }));

  const store = createStore<TutorialState>(() => ({ welcomed: false, nudges: 0 }));
  const tutorial: Tutorial = {
    store,
    welcome: () => store.setState({ welcomed: true }),
  };

  const client: GameClient = {
    ...inner,
    dispatch(command) {
      const state = inner.store.getState();
      if (!allows(stepOf(state, store.getState().welcomed), command, state)) {
        store.setState((s) => ({ nudges: s.nudges + 1 }));
        return;
      }
      inner.dispatch(command);
    },
  };

  const driver = attachBotDriver(inner, {
    bots: [1, 2].map((seat) => ({ seat, level: 3, script: rivalMove })),
    snapshot: () => session.snapshot(),
    thinkMs: 900,
  });

  await inner.connect();
  return {
    client,
    config: {
      seats: [names.you, ...names.rivals].map((name, seat) => ({
        name,
        kind: seat === YOU ? ('human' as const) : ('bot' as const),
        difficulty: 3,
      })),
      edition: PRESETS.boomtown.id,
      visibility: 'hidden',
    },
    localSeats: [YOU],
    detachBots: driver.detach,
    nudgeBots: driver.nudge,
    pauseBots: driver.setPaused,
    snapshot: () => session.snapshot(),
    tutorial,
  };
}
