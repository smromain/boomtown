import { useEffect, useState } from 'react';
import { SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/solid';
import type { TurnStep } from '@boomtown/engine';
import { useAnyView, useGameState, useLocalActiveView } from '../client/GameClientProvider.js';
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
  // Two views, deliberately. Everything in the status block except the phase
  // readout is public and belongs to the table, not the turn, so it reads
  // `useAnyView()` and stays on screen throughout — waiting is exactly when a
  // player reaches for the reference. (It used to hang off `activeView`, which
  // online is null on every remote player's turn, taking the whole block with
  // it.) The phase is the exception, and it wants `useLocalActiveView` rather
  // than `activeView`: hot-seat holds a view for every seat, bots included, so
  // `activeView` would keep an accent-coloured "Place a tile" on screen while
  // a bot plays — reading as an instruction to a player who has no move.
  const view = useAnyView();
  const active = useLocalActiveView();
  const turn = useGameState((state) => state.log.filter((event) => event.type === 'turn-advanced').length + 1);
  const { openChart, openRules } = useReference();
  // Lives in the always-rendered brand region rather than the status block
  // below (KTD5): the status block used to vanish on a bot's or a remote
  // player's turn, exactly when a spectator most wants the mute control. It no
  // longer does, but the mute control still belongs with the brand — it is a
  // property of the app, not of the table.
  const [muted, setMuted] = useState(() => soundManager.isMuted());
  const toggleMuted = () => {
    const next = !muted;
    soundManager.setMuted(next);
    setMuted(next);
  };

  // "?" opens the stock reference and F1 the rules, unless a text field has
  // focus. F1 rather than a letter: the play surface has no text input to
  // shadow, but a bare letter would still collide with any shortcut added
  // later, and F1 is unambiguous.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' && e.key !== 'F1') return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      if (e.key === '?') openChart();
      else openRules();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openChart, openRules]);

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
          <div className={styles.referenceGroup}>
            <Button variant="onChrome" className={styles.reference} onClick={openChart}>
              Reference
            </Button>
            <Button variant="onChrome" className={styles.reference} onClick={openRules}>
              Rules
            </Button>
          </div>
          {/* The one genuinely turn-bound readout: it describes what the seat
              on the clock must do, so it stands down when that isn't you. */}
          {active && <span className={styles.phase}>{PHASE[active.step]}</span>}
        </div>
      )}
    </header>
  );
}
