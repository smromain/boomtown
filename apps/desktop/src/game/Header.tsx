import { useEffect } from 'react';
import { activeView } from '@boomtown/client-core';
import type { TurnStep } from '@boomtown/engine';
import { useGameState } from '../client/GameClientProvider.js';
import { useReference } from '../reference/ReferenceContext.js';
import { editionLabel } from '../setup/editionLabel.js';
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
        <span className={styles.tagline}>seven start-ups, one skyline</span>
      </div>
      {view && (
        <div className={styles.status}>
          <span>{editionLabel(view.ruleset.id)}</span>
          <span>
            Turn <span className="tabnum">{turn}</span>
          </span>
          <button type="button" className={styles.reference} onClick={openChart}>
            Reference
          </button>
          <span className={styles.phase}>{PHASE[view.step]}</span>
        </div>
      )}
    </header>
  );
}
