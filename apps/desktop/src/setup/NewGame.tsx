import { useState } from 'react';
import { createGameClient, localTransport, type GameClient } from '@boomtown/client-core';
import { RULES } from '@boomtown/engine';
import { SeatRow } from './SeatConfig.js';
import {
  configError,
  defaultConfig,
  resizeSeats,
  toSetupOptions,
  type GameConfig,
} from './gameConfig.js';
import styles from './setup.module.css';

export interface StartedGame {
  readonly client: GameClient;
  readonly config: GameConfig;
}

/** Bots cannot actually take a turn until U14; block an all-bot game until then. */
const BOTS_PLAYABLE = false;

export function NewGame({ onStart }: { onStart: (game: StartedGame) => void }) {
  const [config, setConfig] = useState<GameConfig>(defaultConfig);
  const error = configError(config, BOTS_PLAYABLE);

  const patch = (over: Partial<GameConfig>) => setConfig((current) => ({ ...current, ...over }));

  const start = () => {
    if (error) return;
    const options = toSetupOptions(config);
    const client = createGameClient(
      localTransport({ setup: options, controls: options.seats.map((_, index) => index) }),
    );
    void client.connect().then(() => onStart({ client, config }));
  };

  return (
    <section className={styles.screen} aria-label="New game">
      <h1>New game</h1>

      <label className={styles.field}>
        <span>Seats</span>
        <select
          value={config.seats.length}
          onChange={(event) => patch({ seats: resizeSeats(config.seats, Number(event.target.value)) })}
        >
          {Array.from({ length: RULES.maxPlayers - RULES.minPlayers + 1 }, (_, i) => RULES.minPlayers + i).map(
            (count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ),
          )}
        </select>
      </label>

      <div className={styles.field}>
        <span>Players</span>
        {config.seats.map((seat, index) => (
          <SeatRow
            key={index}
            index={index}
            seat={seat}
            onChange={(next) => patch({ seats: config.seats.map((s, i) => (i === index ? next : s)) })}
          />
        ))}
      </div>

      <label className={styles.field}>
        <span>Edition</span>
        <select value={config.edition} onChange={(event) => patch({ edition: event.target.value as GameConfig['edition'] })}>
          <option value="classic">Classic</option>
          <option value="edition-2015">2015 Avalon Hill</option>
        </select>
      </label>

      <label className={styles.field}>
        <span>Cash and holdings</span>
        <select
          value={config.visibility}
          onChange={(event) => patch({ visibility: event.target.value as GameConfig['visibility'] })}
        >
          <option value="open">Open — everyone sees everything</option>
          <option value="hidden">Hidden — only your own</option>
        </select>
      </label>

      <p className={styles.error} role="alert">
        {error ?? ''}
      </p>

      <button type="button" className={styles.start} disabled={error != null} onClick={start}>
        Start game
      </button>
    </section>
  );
}
