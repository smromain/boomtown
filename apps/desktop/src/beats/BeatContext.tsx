import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { anyView } from '@boomtown/client-core';
import { useGameState } from '../client/GameClientProvider.js';
import { triggerFor, type Beat } from './beatTriggers.js';
import { EMPTY_BEAT_QUEUE, advance, enqueue, type BeatQueue } from './beatQueue.js';

interface BeatApi {
  readonly active: Beat | null;
  readonly dismiss: () => void;
}

const NOOP: BeatApi = { active: null, dismiss: () => {} };
const BeatContext = createContext<BeatApi>(NOOP);

/**
 * The beat queue's state, lifted out of `BeatOrchestrator` (which only *renders*
 * the active beat) so other screen-level overlays can see it too. `TurnHandoff`
 * is the reason this exists: it used to render concurrently with a beat and,
 * being both higher z-index and opaque, silently hide the beat's entire
 * animation behind its "hand the machine to …" card. The fix is the same
 * pattern `TurnHandoff` already uses for `DecisionModal` (self-suppress while
 * the other owns the screen) rather than a z-index war.
 */
export function BeatProvider({ children }: { children: ReactNode }) {
  const log = useGameState((state) => state.log);
  const view = useGameState(anyView);
  const [queue, setQueue] = useState<BeatQueue>(EMPTY_BEAT_QUEUE);

  // Hydration mark (AE8): only events appended past this index are beat
  // candidates — everything already in the log when this mounts plays no beat.
  const hydrationMark = useRef<number | null>(null);
  const processed = useRef(0);
  const savedFocus = useRef<Element | null>(null);

  useEffect(() => {
    hydrationMark.current = log.length;
    processed.current = log.length;
    // Only ever runs once, at mount — the hydration mark must not move later.
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

  return <BeatContext.Provider value={{ active: queue.active, dismiss }}>{children}</BeatContext.Provider>;
}

/** Whether a beat currently owns the screen, and how to dismiss it. Outside a
 *  `<BeatProvider>` (isolated panel tests) this is always inert. */
export function useActiveBeat(): BeatApi {
  return useContext(BeatContext);
}
