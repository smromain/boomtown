import { activeView } from '@boomtown/client-core';
import type { TurnStep } from '@boomtown/engine';
import { useGameState } from '../client/GameClientProvider.js';
import styles from './game.module.css';

const PHASE: Record<TurnStep, string> = {
  place: 'Place a tile',
  found: 'Found a corporation',
  merge: 'Resolve the merger',
  buy: 'Buy stock',
  'end-check': 'End the game?',
};

const EDITION: Record<string, string> = {
  classic: 'Classic ruleset',
  'edition-2015': '2015 Avalon Hill',
};

export function Header() {
  const view = useGameState(activeView);
  const turn = useGameState((state) => state.log.filter((event) => event.type === 'turn-advanced').length + 1);

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className="serif">Boomtown</span>
        <span className={styles.tagline}>seven start-ups, one skyline</span>
      </div>
      {view && (
        <div className={styles.status}>
          <span>{EDITION[view.ruleset.id] ?? view.ruleset.id}</span>
          <span>
            Turn <span className="tabnum">{turn}</span>
          </span>
          <span className={styles.phase}>{PHASE[view.step]}</span>
        </div>
      )}
    </header>
  );
}
