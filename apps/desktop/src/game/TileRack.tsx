import type { HandTileEffect } from '@boomtown/client-core';
import { useGameClient, useGameState, useLocalActiveView } from '../client/GameClientProvider.js';
import styles from './game.module.css';

const EFFECT_LABEL: Record<HandTileEffect, string> = {
  nothing: 'idle',
  found: 'found',
  grow: 'grow',
  merge: 'merge',
  dead: 'dead',
  blocked: 'blocked',
};

/** The tile rack from the Main artboard: rounded squares with the coordinate and its effect. */
export function TileRack() {
  const view = useLocalActiveView();
  const busy = useGameState((state) => state.inFlight != null);
  const client = useGameClient();
  if (!view) return null;

  return (
    <section className={styles.rack} aria-label="Your tiles">
      <div className={`serif ${styles.rackHeading}`}>Your tiles — seat {view.you}</div>
      <div className={styles.rackTiles}>
        {view.handTiles.map(({ tile, effect, playable }) => (
          <button
            key={tile}
            type="button"
            className={styles.rackTile}
            data-effect={effect}
            disabled={busy || !playable || view.step !== 'place'}
            onClick={() => client.dispatch({ type: 'place-tile', seat: view.you, tile })}
          >
            <span className={`tabnum ${styles.rackTileId}`}>{tile}</span>
            <span className={styles.rackTileEffect}>{EFFECT_LABEL[effect]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
