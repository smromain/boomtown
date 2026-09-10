import { Fragment } from 'react';
import { anyView } from '@boomtown/client-core';
import { useGameState } from '../client/GameClientProvider.js';
import { useActiveBeat } from './BeatContext.js';
import { coversTheScreen } from './beatTriggers.js';
import { renderBeat } from './renderBeat.js';
import styles from './beats.module.css';

/**
 * Renders whichever beat `BeatProvider` (mounted higher up in `GameScreen`)
 * says is active. The queue/hydration/dismiss logic lives in `BeatContext` —
 * `TurnHandoff` needs to read the same "is a beat active" state to defer
 * itself, so it can't be private to this component (see `BeatContext`'s doc).
 */
export function BeatOrchestrator() {
  const { active, serial, dismiss } = useActiveBeat();
  const view = useGameState(anyView);
  const log = useGameState((state) => state.log);
  const pendingDecision = useGameState((state) => state.pendingDecision);

  // A beat is a non-interactive overlay behind an open decision prompt — the
  // dialog keeps focus (U10 approach step 5). Merger's own beat fires only
  // once the merger (and every prompt it raised) is fully resolved, so this
  // mainly guards an unrelated beat racing a founding/buy decision.
  if (!active || pendingDecision || !view) return null;

  // A light beat has to out-stack `TurnHandoff` (z-index 50), which no longer
  // stands down for it — otherwise the flourish plays behind an opaque card.
  // A heavy beat keeps the lower stacking: `TurnHandoff` isn't rendering.
  const stacking = coversTheScreen(active)
    ? styles.overlayRoot
    : `${styles.overlayRoot} ${styles.aboveHandoff}`;

  // `key={serial}` is load-bearing, not tidiness. Beats are plain data, so one
  // buy-stock beat succeeding another is the same element type in the same
  // position and React reconciles them into one instance — leaving the second
  // beat's mount effect (which arms its auto-dismiss) un-run, and the flourish
  // on screen for good. The serial forces the remount.
  return (
    <div className={stacking} aria-live="polite">
      <Fragment key={serial}>{renderBeat(active, view, log, dismiss)}</Fragment>
    </div>
  );
}
