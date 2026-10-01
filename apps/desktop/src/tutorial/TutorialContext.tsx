import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { TileId } from '@boomtown/engine';
import { useGameState } from '../client/GameClientProvider.js';
import type { Tutorial, TutorialState } from './startTutorial.js';
import { hintTile, stepOf, type Step } from './script.js';

const TutorialContext = createContext<Tutorial | null>(null);

export function TutorialProvider({ tutorial, children }: { tutorial: Tutorial | undefined; children: ReactNode }) {
  return <TutorialContext.Provider value={tutorial ?? null}>{children}</TutorialContext.Provider>;
}

/** The running tutorial, or null at an ordinary table. */
export function useTutorial(): Tutorial | null {
  return useContext(TutorialContext);
}

/** Stands in for the tutorial's store at an ordinary table, so the hooks below can run unconditionally. */
const NOBODY = createStore<TutorialState>(() => ({ welcomed: true, nudges: 0 }));

/** The step the tutorial is on, or null at an ordinary table. */
export function useTutorialStep(): Step | null {
  const tutorial = useTutorial();
  const welcomed = useStore(tutorial?.store ?? NOBODY, (s) => s.welcomed);
  const step = useGameState((state) => stepOf(state, welcomed));
  return tutorial ? step : null;
}

/** The hand tile the host is pointing at, if any. */
export function useTutorialHint(): TileId | null {
  const step = useTutorialStep();
  return step ? hintTile(step) : null;
}
