import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { BoardGrid } from './BoardGrid.js';
import { useBoardModel } from './boardModel.js';
import { reportSkylineTrouble, useBoardPrefs, type SkylineTrouble } from './boardPrefs.js';
import styles from './board.module.css';
import { copy } from '../copy/copy.js';

/**
 * Skyline and three.js, fetched and parsed only when Skyline is picked. The
 * web build never downloads them otherwise; the installers still carry them,
 * because electron-vite bundles everything from source.
 */
const SkylineBoard = lazy(() => import('./skyline/SkylineBoard.js'));

/**
 * The board. Two painters draw one model (#70):
 *
 * - **Board View** — the design's tilted paper grid (12 columns + a row-header,
 *   9 rows + a column-header), square-celled via `aspect-ratio` so it scales
 *   with the space the layout gives it. The default.
 * - **Skyline** — the WebGL city, with the same grid laid transparent on top.
 *
 * Either way the DOM is the same `role="grid"` of labelled cells with a button
 * on every playable one, and a click dispatches the same placement. Skyline
 * falls back to Board View rather than to a black rectangle: while its chunk
 * loads, when its chunk fails, and when this machine cannot draw it.
 *
 * `spectating` renders the same board read-only, for a turn that isn't yours —
 * see `useBoardModel`.
 */
export function Board({ spectating = false }: { spectating?: boolean }) {
  const model = useBoardModel(spectating);
  const prefs = useBoardPrefs();
  if (!model) return null;

  if (prefs.style === 'skyline') {
    const flat = <BoardGrid model={model} />;
    return (
      <SkylineBoundary fallback={flat}>
        <Suspense fallback={flat}>
          <SkylineBoard model={model} />
        </Suspense>
      </SkylineBoundary>
    );
  }

  return (
    <>
      <BoardGrid model={model} />
      {prefs.chosen === 'skyline' && prefs.trouble && <SkylineNotice trouble={prefs.trouble} />}
    </>
  );
}

/** A failed chunk or a throw inside the scene: say so once, and draw Board View. */
class SkylineBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(): void {
    reportSkylineTrouble('failed');
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Dismissed once, gone for the session: the fallback is news the first time only. */
let noticeDismissed = false;

function SkylineNotice({ trouble }: { trouble: SkylineTrouble }) {
  const [open, setOpen] = useState(!noticeDismissed);
  if (!open) return null;
  return (
    <div className={styles.notice} aria-live="polite">
      <span>{copy.board.skyline.trouble[trouble]}</span>
      <button
        type="button"
        className={styles.noticeClose}
        aria-label={copy.board.skyline.dismiss}
        onClick={() => {
          noticeDismissed = true;
          setOpen(false);
        }}
      >
        ✕
      </button>
    </div>
  );
}

