import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useGameState } from '../client/GameClientProvider.js';
import { triggerFor, type Beat } from './beatTriggers.js';
import { EMPTY_BEAT_QUEUE, advance, enqueue, type BeatQueue } from './beatQueue.js';

interface BeatApi {
  readonly active: Beat | null;
  /** Identity for the active beat — the orchestrator's React key. See `BeatQueue`. */
  readonly serial: number;
  readonly dismiss: () => void;
}

const NOOP: BeatApi = { active: null, serial: 0, dismiss: () => {} };
const BeatContext = createContext<BeatApi>(NOOP);

/**
 * No beat may hold the screen longer than this. Every beat auto-dismisses on
 * its own timer; this is the backstop for when one doesn't, so a bug inside a
 * beat can never strand the queue (and everything waiting behind it) forever.
 * Comfortably past the merger beat's full staged sequence, which is the
 * longest by some distance at roughly 18s.
 */
const WATCHDOG_MS = 30_000;

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
    if (hydrationMark.current == null) return;
    if (log.length <= processed.current) return;
    const newEvents = log.slice(processed.current);
    processed.current = log.length;
    setQueue((current) =>
      newEvents.reduce((acc, event) => {
        const beat = triggerFor(event);
        return beat ? enqueue(acc, beat) : acc;
      }, current),
    );
  }, [log]);

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

  // The backstop. Keyed on `serial`, not on `active`: two consecutive beats can
  // be `toEqual` one another, and a watchdog that didn't re-arm for the second
  // one would be exactly the bug it exists to catch.
  useEffect(() => {
    if (!queue.active) return;
    const timer = window.setTimeout(() => setQueue((current) => advance(current)), WATCHDOG_MS);
    return () => window.clearTimeout(timer);
  }, [queue.active, queue.serial]);

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

  return (
    <BeatContext.Provider value={{ active: queue.active, serial: queue.serial, dismiss }}>
      {children}
    </BeatContext.Provider>
  );
}

/** Whether a beat currently owns the screen, and how to dismiss it. Outside a
 *  `<BeatProvider>` (isolated panel tests) this is always inert. */
export function useActiveBeat(): BeatApi {
  return useContext(BeatContext);
}
