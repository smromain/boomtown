import { useState } from 'react';
import {
  GameSession,
  attachBotDriver,
  createGameClient,
  localTransport,
  type GameClient,
} from '@boomtown/client-core';
import { RULES, type GameState, type Seat } from '@boomtown/engine';
import { dumpBotStuck } from '../debug/dump.js';
import { RulesSummary } from './RulesSummary.js';
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
  /** Seats the person at this screen plays. Hot-seat: every human seat. Online:
   *  the one own seat. A turn on any other seat (a bot, a remote player) shows a
   *  waiting state, not an actionable board. */
  readonly localSeats: readonly Seat[];
  /** Tears down the bot driver; absent when the table has no bots. */
  detachBots?: () => void;
  /** Forces the bot on the clock to move now — a manual unstick for the UI.
   *  Absent when the table has no bots. */
  nudgeBots?: () => void;
  /** The authoritative state, for dev diagnostics. Local games only. */
  snapshot?: () => GameState;
}

export function NewGame({ onStart }: { onStart: (game: StartedGame) => void }) {
  const [config, setConfig] = useState<GameConfig>(defaultConfig);
  const error = configError(config);

  const patch = (over: Partial<GameConfig>) => setConfig((current) => ({ ...current, ...over }));

  const start = () => {
    if (error) return;
    const options = toSetupOptions(config);
    const seats = options.seats.map((_, index) => index);

    // One session, shared: the transport applies commands to it, the bot driver
    // reads its state to choose moves.
    const session = new GameSession(options);
    const client = createGameClient(
      localTransport({ setup: options, controls: seats, engine: session }),
    );

    const bots = config.seats
      .map((seat, index) => ({ seat: index, kind: seat.kind, level: seat.difficulty }))
      .filter((s) => s.kind === 'bot')
      .map(({ seat, level }) => ({ seat, level }));

    const localSeats = config.seats
      .map((seat, index) => ({ index, kind: seat.kind }))
      .filter((s) => s.kind === 'human')
      .map((s) => s.index);

    const started: StartedGame = { client, config, localSeats, snapshot: () => session.snapshot() };
    if (bots.length > 0) {
      const driver = attachBotDriver(client, {
        bots,
        snapshot: () => session.snapshot(),
        onStuck: (report) => dumpBotStuck(report, client.store.getState().log),
        ...(config.seed !== undefined ? { seed: config.seed } : {}),
      });
      started.detachBots = driver.detach;
      started.nudgeBots = driver.nudge;
    }

    void client.connect().then(() => onStart(started));
  };

  return (
    <section className={styles.screen} aria-label="New game">
      <h1>New game</h1>

      <RulesSummary />

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
          <option value="edition-2015">Modern</option>
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
