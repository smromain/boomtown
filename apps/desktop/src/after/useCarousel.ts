import { useCallback, useEffect, useRef, useState } from 'react';

export interface CarouselStep {
  /** Which frame this step belongs to. */
  readonly frame: number;
  /** Which step *within* that frame — a company, a page of awards, or 0. */
  readonly step: number;
  /** How long it holds, in milliseconds. */
  readonly dwell: number;
}

export interface Carousel {
  readonly index: number;
  readonly frame: number;
  readonly step: number;
  readonly playing: boolean;
  /** How far through the current *frame* the cycle is, 0–1, for the tab sliver. */
  readonly progress: number;
  next(): void;
  previous(): void;
  toggle(): void;
  /** Jump to the first step of a frame — what clicking a tab does. */
  goToFrame(frame: number): void;
}

const TICK = 100;

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * The after-game carousel's clock (#68).
 *
 * Every frame and every step *inside* a frame is one entry in a single flat
 * list, so there is one cursor rather than two nested ones. That is what makes
 * the controls honest: forward from the last company rolls into the awards,
 * back from the first page of awards lands on the last company, and the thing
 * that moves is always the innermost thing — because as far as the cursor is
 * concerned there is nothing else.
 *
 * **Pausing stops everything.** Both cycles are this cursor, so there is no
 * inner timer left running behind a paused frame.
 *
 * **A frame with an inner cycle holds for all of it**, which falls out of the
 * same list: the frame is however many entries it has, and the tab sliver
 * measures the whole frame rather than one step, so the row does not appear to
 * restart five times while the awards page through.
 *
 * With `prefers-reduced-motion` it starts paused. Nothing then moves unless
 * somebody asks it to, which is the whole reason the transport controls exist
 * rather than being a convenience on top of the automatic cycle.
 */
export function useCarousel(steps: readonly CarouselStep[]): Carousel {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());

  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const indexRef = useRef(0);
  indexRef.current = Math.min(index, Math.max(steps.length - 1, 0));
  const elapsed = useRef(0);

  // How far through the whole frame we are, not through one step of it.
  const frameProgress = useCallback((cursor: number, within: number): number => {
    const list = stepsRef.current;
    const frame = list[cursor]?.frame;
    if (frame === undefined) return 0;
    const inFrame = list.filter((entry) => entry.frame === frame);
    const total = inFrame.reduce((sum, entry) => sum + entry.dwell, 0);
    if (total <= 0) return 0;
    const before = list
      .slice(0, cursor)
      .filter((entry) => entry.frame === frame)
      .reduce((sum, entry) => sum + entry.dwell, 0);
    return Math.min(1, (before + within) / total);
  }, []);

  const move = useCallback(
    (delta: number) => {
      const length = stepsRef.current.length;
      if (length === 0) return;
      elapsed.current = 0;
      setProgress(0);
      setIndex((current) => (current + delta + length) % length);
    },
    [],
  );

  useEffect(() => {
    if (!playing || steps.length <= 1) return undefined;
    const id = window.setInterval(() => {
      const list = stepsRef.current;
      const dwell = list[indexRef.current]?.dwell ?? 0;
      elapsed.current += TICK;
      if (dwell > 0 && elapsed.current >= dwell) {
        elapsed.current = 0;
        setIndex((current) => (current + 1) % list.length);
        setProgress(0);
        return;
      }
      setProgress(frameProgress(indexRef.current, elapsed.current));
    }, TICK);
    return () => window.clearInterval(id);
  }, [playing, steps.length, frameProgress]);

  const current = steps[indexRef.current] ?? { frame: 0, step: 0, dwell: 0 };

  return {
    index: indexRef.current,
    frame: current.frame,
    step: current.step,
    playing,
    progress,
    next: () => move(1),
    previous: () => move(-1),
    toggle: () => setPlaying((on) => !on),
    goToFrame: (frame: number) => {
      const target = stepsRef.current.findIndex((entry) => entry.frame === frame);
      if (target < 0) return;
      elapsed.current = 0;
      setProgress(0);
      setIndex(target);
    },
  };
}
