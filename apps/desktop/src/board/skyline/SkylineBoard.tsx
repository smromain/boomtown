import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowPathIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, MoonIcon, SunIcon } from '@heroicons/react/24/solid';
import type { TileId } from '@boomtown/engine';
import { useActiveBeat } from '../../beats/BeatContext.js';
import { coversTheScreen } from '../../beats/beatTriggers.js';
import { copy } from '../../copy/copy.js';
import { OverlayGrid } from '../BoardGrid.js';
import type { BoardModel } from '../boardModel.js';
import { reportSkylineTrouble, setSkylineLighting, useBoardPrefs } from '../boardPrefs.js';
import { createSkylineScene, type SkylineScene } from './scene.js';
import { planSkyline } from './skylineModel.js';
import styles from '../board.module.css';

/** Side of one overlay cell before the ground transform scales it. Any value
 *  works — the transform absorbs it — so it is simply a round number. */
const CELL_PX = 50;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Skyline (#70): the board as a city, drawn by `scene.ts`, with the ordinary
 * board grid laid transparent over it. This module and everything it imports
 * from three.js load only when Skyline is picked (`Board.tsx` lazy-imports it).
 *
 * Changes wait for the curtain. A beat that covers the screen would hide the
 * tower rising or the district repainting, so while one is up the scene keeps
 * showing the board as it was, and plays the whole change once the curtain
 * lifts — the same rule the hot-seat hand-off lives by.
 */
export default function SkylineBoard({ model }: { model: BoardModel }) {
  const prefs = useBoardPrefs();
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SkylineScene | null>(null);
  const shown = useRef(false);
  const [hover, setHover] = useState<TileId | null>(null);
  const [focus, setFocus] = useState<TileId | null>(null);
  const { active } = useActiveBeat();
  const held = active != null && coversTheScreen(active);

  const plan = useMemo(
    () => planSkyline(model.cols, model.rows, model.cells, model.view.corporations, model.view.ruleset.bandCuts),
    [model.cols, model.rows, model.cells, model.view.corporations, model.view.ruleset.bandCuts],
  );

  // The lighting a scene is created with; later changes go through `setLighting`.
  const lighting = useRef(prefs.lighting);
  lighting.current = prefs.lighting;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const host = hostRef.current;
    if (!stage || !host) return;
    const created = createSkylineScene({
      stage,
      host,
      lighting: lighting.current,
      reducedMotion: prefersReducedMotion(),
      forced: prefs.forced,
      cellPx: CELL_PX,
      onFrame: (transform) => {
        if (gridRef.current) gridRef.current.style.transform = transform;
      },
      onTrouble: reportSkylineTrouble,
    });
    if ('trouble' in created) {
      reportSkylineTrouble(created.trouble);
      return;
    }
    sceneRef.current = created;
    shown.current = false;
    return () => {
      created.dispose();
      sceneRef.current = null;
    };
  }, [prefs.forced]);

  useEffect(() => {
    sceneRef.current?.setLighting(prefs.lighting);
  }, [prefs.lighting]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || held) return;
    // The first draw is a cut: a board that rises from nothing every time the
    // game screen mounts would be a fanfare for having opened it.
    scene.show(plan, model.lastPlaced, shown.current);
    shown.current = true;
  }, [plan, held, model.lastPlaced]);

  useEffect(() => {
    sceneRef.current?.setHighlight(hover, focus);
  }, [hover, focus]);

  // `[` and `]` turn by a quarter, `0` resets the view — unless a text field
  // has focus, the same guard the header uses for `?` and F1.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '[') sceneRef.current?.turn(-1);
      else if (e.key === ']') sceneRef.current?.turn(1);
      else if (e.key === '0') sceneRef.current?.resetView();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const c = copy.board.skyline;
  const night = prefs.lighting === 'night';
  return (
    <div ref={stageRef} className={styles.skyline} data-board-style="skyline">
      <div ref={hostRef} className={styles.skylineCanvas} aria-hidden />
      <OverlayGrid model={model} gridRef={gridRef} cellPx={CELL_PX} events={{ onHover: setHover, onFocus: setFocus }} />
      <div className={styles.skylineControls} data-skyline-controls>
        <button
          type="button"
          className={styles.skylineButton}
          onClick={() => setSkylineLighting(night ? 'day' : 'night')}
          aria-label={night ? c.toDay : c.toNight}
          title={night ? c.toDay : c.toNight}
        >
          {night ? <SunIcon width={16} height={16} /> : <MoonIcon width={16} height={16} />}
        </button>
        <button
          type="button"
          className={styles.skylineButton}
          onClick={() => sceneRef.current?.turn(-1)}
          aria-label={c.turnLeft}
          title={c.turnLeft}
        >
          <ArrowUturnLeftIcon width={16} height={16} />
        </button>
        <button
          type="button"
          className={styles.skylineButton}
          onClick={() => sceneRef.current?.turn(1)}
          aria-label={c.turnRight}
          title={c.turnRight}
        >
          <ArrowUturnRightIcon width={16} height={16} />
        </button>
        <button
          type="button"
          className={styles.skylineButton}
          onClick={() => sceneRef.current?.resetView()}
          aria-label={c.resetView}
          title={c.resetView}
        >
          <ArrowPathIcon width={16} height={16} />
        </button>
      </div>
    </div>
  );
}
