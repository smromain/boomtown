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
import { configError, defaultConfig, resizeSeats, toSetupOptions, type GameConfig } from './gameConfig.js';
import { EditionChoice } from './EditionChoice.js';
import { Choice } from './Choice.js';
import { VisibilityChoice } from './VisibilityChoice.js';
import { Button } from '../ui/Button.js';
import form from './form.module.css';

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
  /** Holds the bots while a beat owns the screen, so the moment being shown
   *  isn't buried under moves nobody has watched. Absent when the table has no
   *  bots. */
  pauseBots?: (paused: boolean) => void;
  /** The authoritative state, for dev diagnostics. Local games only. */
  snapshot?: () => GameState;
}

export function NewGame({
  onStart,
  onBack,
}: {
  onStart: (game: StartedGame) => void;
  onBack?: () => void;
}) {
  const [config, setConfig] = useState<GameConfig>(defaultConfig);
  const [rulesOpen, setRulesOpen] = useState(false);
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
      started.pauseBots = driver.setPaused;
    }

    void client.connect().then(() => onStart(started));
  };

  return (
    <div className={form.viewport}>
      <section className={form.screen} aria-label="New game">
        <header className={form.head}>
          <div>
            <span className={`kicker ${form.eyebrow}`}>hot seat · one machine</span>
            <h1 className={form.title}>New game</h1>
            <p className={form.lede}>
              Pick a rule set and fill the seats. None of it can be changed once the first tile
              goes down.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setRulesOpen(true)}>
            How to play
          </Button>
        </header>

        <div className={form.body}>
          <EditionChoice value={config.edition} onChange={(edition) => patch({ edition })} />

          <div className={form.columns}>
            <div className={form.field}>
              <span>Players</span>
              <div className={form.roster}>
                {config.seats.map((seat, index) => (
                  <SeatRow
                    key={index}
                    index={index}
                    seat={seat}
                    onChange={(next) => patch({ seats: config.seats.map((s, i) => (i === index ? next : s)) })}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className={form.field}>
                <span>Seats</span>
                <Choice
                  label="Seats"
                  numeric
                  value={config.seats.length}
                  options={Array.from(
                    { length: RULES.maxPlayers - RULES.minPlayers + 1 },
                    (_, i) => RULES.minPlayers + i,
                  ).map((count) => ({ value: count, label: String(count), description: `${count} seats` }))}
                  onChange={(count) => patch({ seats: resizeSeats(config.seats, count) })}
                />
              </div>

              <VisibilityChoice
                config={config}
                onChange={(visibility) => patch({ visibility })}
              />
            </div>
          </div>

          <p className={form.error} role="alert">
            {error ?? ''}
          </p>
        </div>

        <div className={form.actions}>
          {onBack && (
            <Button variant="ghost" onClick={onBack}>
              Back
            </Button>
          )}
          <Button variant="primary" disabled={error != null} onClick={start}>
            Start game
          </Button>
        </div>
      </section>

      <RulesSummary open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
