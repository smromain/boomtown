import { useEffect } from 'react';
import { renderBeat } from '../renderBeat.js';
import { BEAT_PREVIEWS, type PreviewKind } from './fixtures.js';
import styles from '../beats.module.css';

/**
 * Hosts a fixture-driven beat overlay for the settings debug menu — the same
 * `renderBeat` real play uses, fed a fixture `PlayerView` instead of a live
 * game's, so a beat's real animation, timing and copy can be inspected
 * without simulating a game. Not a `<BeatProvider>` consumer: there is no
 * live game here to key a hydration mark or queue off, so this owns its own
 * tiny dismiss/keydown handling instead.
 */
export function DebugBeatPreview({ kind, onDismiss }: { kind: PreviewKind | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!kind) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kind, onDismiss]);

  if (!kind) return null;
  const { beat, view, log } = BEAT_PREVIEWS[kind]();

  return (
    <div className={styles.overlayRoot} aria-live="polite">
      {renderBeat(beat, view, log, onDismiss)}
    </div>
  );
}
