import { anyView } from '@boomtown/client-core';
import { useGameState } from '../client/GameClientProvider.js';
import { useActiveBeat } from './BeatContext.js';
import { renderBeat } from './renderBeat.js';
import styles from './beats.module.css';

/**
 * Renders whichever beat `BeatProvider` (mounted higher up in `GameScreen`)
 * says is active. The queue/hydration/dismiss logic lives in `BeatContext` —
 * `TurnHandoff` needs to read the same "is a beat active" state to defer
 * itself, so it can't be private to this component (see `BeatContext`'s doc).
 */
export function BeatOrchestrator() {
  const { active, dismiss } = useActiveBeat();
  const view = useGameState(anyView);
  const log = useGameState((state) => state.log);
  const pendingDecision = useGameState((state) => state.pendingDecision);

  // A beat is a non-interactive overlay behind an open decision prompt — the
  // dialog keeps focus (U10 approach step 5). Merger's own beat fires only
  // once the merger (and every prompt it raised) is fully resolved, so this
  // mainly guards an unrelated beat racing a founding/buy decision.
  if (!active || pendingDecision || !view) return null;

  return (
    <div className={styles.overlayRoot} aria-live="polite">
      {renderBeat(active, view, log, dismiss)}
    </div>
  );
}
