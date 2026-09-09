import { useEffect, useState } from 'react';
import { SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/solid';
import { activeView } from '@boomtown/client-core';
import type { TurnStep } from '@boomtown/engine';
import { useGameState } from '../client/GameClientProvider.js';
import { useReference } from '../reference/ReferenceContext.js';
import { editionLabel } from '../setup/editionLabel.js';
import { soundManager } from '../audio/soundManager.js';
import { Button } from '../ui/Button.js';
import logoUrl from '../assets/boomtown-logo.png';
import styles from './game.module.css';

const PHASE: Record<TurnStep, string> = {
  place: 'Place a tile',
  found: 'Found a corporation',
  merge: 'Resolve the merger',
  buy: 'Buy stock',
  'end-check': 'End the game?',
};

export function Header() {
  const view = useGameState(activeView);
  const turn = useGameState((state) => state.log.filter((event) => event.type === 'turn-advanced').length + 1);
  const { openChart } = useReference();
  // Always-rendered brand region, not the `{view && ...}` status block below —
  // that block is null on a bot's or a remote player's turn, exactly when a
  // spectator most wants the mute control (KTD5).
  const [muted, setMuted] = useState(() => soundManager.isMuted());
  const toggleMuted = () => {
    const next = !muted;
    soundManager.setMuted(next);
    setMuted(next);
  };

  // "?" opens the stock reference, unless a text field has focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?') return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      openChart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openChart]);

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <img src={logoUrl} alt="Boomtown" className={styles.brandLogo} />
        <span className={styles.brandDivider} aria-hidden />
        <span className={styles.tagline}>seven start-ups, one skyline</span>
        <button
          type="button"
          className={styles.muteButton}
          onClick={toggleMuted}
          aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          aria-pressed={muted}
        >
          {muted ? <SpeakerXMarkIcon width={16} height={16} /> : <SpeakerWaveIcon width={16} height={16} />}
        </button>
      </div>
      {view && (
        <div className={styles.status}>
          <span className={styles.statusLabel}>{editionLabel(view.ruleset.id)}</span>
          <span className={styles.turnReadout}>
            <span className={styles.statusLabel}>Turn</span> <span className="serif tabnum">{turn}</span>
          </span>
          <Button variant="onChrome" className={styles.reference} onClick={openChart}>
            Reference
          </Button>
          <span className={styles.phase}>{PHASE[view.step]}</span>
        </div>
      )}
    </header>
  );
}
