import { useEffect, useRef, useState } from 'react';
import { anyView } from '@boomtown/client-core';
import type { EngineEvent, PlayerView } from '@boomtown/engine';
import { useGameState } from '../client/GameClientProvider.js';
import { latestMerger } from '../game/story.js';
import { triggerFor, type Beat } from './beatTriggers.js';
import { EMPTY_BEAT_QUEUE, advance, enqueue, type BeatQueue } from './beatQueue.js';
import { FirstTileBeat } from './beats/FirstTileBeat.js';
import { FoundingBeat } from './beats/FoundingBeat.js';
import { BuyStockBeat } from './beats/BuyStockBeat.js';
import { MergerBeat } from './beats/MergerBeat.js';
import { EndgameBeat } from './beats/EndgameBeat.js';
import { VictoryBeat } from './beats/VictoryBeat.js';
import styles from './beats.module.css';

/**
 * Watches `state.log` for a live-appended event, resolves it to a beat via
 * `beatTriggers` (keyed off the view, not a log index — KTD3, R14), and plays
 * beats one at a time through a skip-to-latest queue (KTD7). Mounted once in
 * `GameScreen`; the launch beat is not here — it is App-level (see the plan's
 * trigger map).
 */
export function BeatOrchestrator() {
  const log = useGameState((state) => state.log);
  const view = useGameState(anyView);
  const pendingDecision = useGameState((state) => state.pendingDecision);
  const [queue, setQueue] = useState<BeatQueue>(EMPTY_BEAT_QUEUE);

  // Hydration mark (AE8): only events appended past this index are beat
  // candidates — everything already in the log when this mounts plays no beat.
  const hydrationMark = useRef<number | null>(null);
  const processed = useRef(0);
  const savedFocus = useRef<Element | null>(null);

  useEffect(() => {
    hydrationMark.current = log.length;
    processed.current = log.length;
    // Only ever runs once, at mount — the hydration mark must not move on a
    // later render even though `log` is a dependency-eslint would otherwise want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hydrationMark.current == null || !view) return;
    if (log.length <= processed.current) return;
    const newEvents = log.slice(processed.current);
    processed.current = log.length;
    setQueue((current) =>
      newEvents.reduce((acc, event) => {
        const beat = triggerFor(event, view);
        return beat ? enqueue(acc, beat) : acc;
      }, current),
    );
  }, [log, view]);

  useEffect(() => {
    if (queue.active && savedFocus.current == null) {
      savedFocus.current = document.activeElement;
    }
  }, [queue.active]);

  const dismiss = (): void => {
    setQueue((current) => advance(current));
    const el = savedFocus.current;
    savedFocus.current = null;
    if (el instanceof HTMLElement) el.focus();
  };

  useEffect(() => {
    if (!queue.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [queue.active]);

  // A beat is a non-interactive overlay behind an open decision prompt — the
  // dialog keeps focus (U10 approach step 5). Merger's own beat fires only
  // once the merger (and every prompt it raised) is fully resolved, so this
  // mainly guards an unrelated beat racing a founding/buy decision.
  if (!queue.active || pendingDecision || !view) return null;

  return (
    <div className={styles.overlayRoot} aria-live="polite">
      {renderBeat(queue.active, view, log, dismiss)}
    </div>
  );
}

function renderBeat(beat: Beat, view: PlayerView, log: readonly EngineEvent[], dismiss: () => void) {
  switch (beat.id) {
    case 'first-tile':
      return <FirstTileBeat dismiss={dismiss} />;
    case 'founding':
      return <FoundingBeat industry={beat.industry} view={view} dismiss={dismiss} />;
    case 'buy-stock':
      return <BuyStockBeat seat={beat.seat} cost={beat.cost} picks={beat.picks} view={view} dismiss={dismiss} />;
    case 'merger': {
      const merger = latestMerger(log);
      return merger ? <MergerBeat merger={merger} view={view} dismiss={dismiss} /> : null;
    }
    case 'endgame':
      return <EndgameBeat seat={beat.seat} view={view} dismiss={dismiss} />;
    case 'victory':
      return <VictoryBeat view={view} dismiss={dismiss} />;
  }
}
