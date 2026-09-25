import { useState } from 'react';
import { RULES } from '@boomtown/engine';
import { defaultConfig, type GameConfig } from '../setup/gameConfig.js';
import { Choice } from '../setup/Choice.js';
import { VisibilityChoice } from '../setup/VisibilityChoice.js';
import { SeatRow } from '../setup/SeatConfig.js';
import { formatTicket, mintRoomAddress, normaliseTicket, TICKET_LENGTH } from '@boomtown/protocol';
import { createRoom, createTable, joinRoom, type OnlineGame } from '../online/onlineGame.js';
import { resolveTicket } from '../online/hostUrl.js';
import { randomName } from '../online/randomName.js';
import { loadSettings, saveSettings } from '../settings/settings.js';
import { EditionChoice } from '../setup/EditionChoice.js';
import { Button } from '../ui/Button.js';
import { copy, fill } from '../copy/copy.js';
import form from '../setup/form.module.css';
import styles from './lobby.module.css';
import { useHoldToReveal } from './useHoldToReveal.js';

/**
 * Create a room (with the same seat/edition/visibility options as a local
 * game) or join one by code. On success it hands an `OnlineGame` to the lobby.
 *
 * `couch` opens a couch table instead (#62): the same table settings, but this
 * screen takes no seat and has no name to give, and there is nothing to join —
 * the phones do that.
 */
export function CreateJoin({
  onRoom,
  onBack,
  couch = false,
}: {
  onRoom: (game: OnlineGame) => void;
  onBack: () => void;
  couch?: boolean;
}) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  // Seeded from the saved name, else a generated one. Never the literal
  // "Player 1" it used to ship with: that was a real value rather than a
  // placeholder, so every joiner who didn't think to change it arrived under
  // the same name (#16).
  const [name, setName] = useState(() => loadSettings().playerName.trim() || randomName());
  const [joinCode, setJoinCode] = useState('');
  // Streaming mode (#62): someone joining on stream would otherwise reveal the
  // code by typing it. The field reads as a password until held to show.
  const streaming = loadSettings().streamingMode;
  const reveal = useHoldToReveal();
  const [config, setConfig] = useState<GameConfig>(() => ({
    ...defaultConfig(),
    seats: [
      { name: 'Player 1', kind: 'human', difficulty: 5 },
      { name: 'Player 2', kind: 'human', difficulty: 5 },
      { name: 'Player 3', kind: 'human', difficulty: 5 },
    ],
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (over: Partial<GameConfig>) => setConfig((c) => ({ ...c, ...over }));

  const seatCount = config.seats.length;
  const resize = (n: number) => {
    const target = Math.max(RULES.minPlayers, Math.min(RULES.maxPlayers, n));
    const seats = config.seats.slice(0, target);
    while (seats.length < target) {
      seats.push({ name: `Player ${seats.length + 1}`, kind: 'human', difficulty: 5 });
    }
    patch({ seats });
  };

  // A room with no human seat cannot be joined by the person creating it: the
  // host takes the first *open* seat, and with every seat handed to a bot there
  // is none. The server refuses it too — this is so the button says why before
  // anyone presses it.
  const humanSeats = config.seats.filter((s) => s.kind === 'human').length;
  const allBots = mode === 'create' && humanSeats === 0;

  const go = async () => {
    const chosen = couch ? copy.couch.tableName : name.trim();
    if (chosen === '') {
      setError(copy.online.errors.noName);
      return;
    }

    if (allBots) {
      setError(couch ? copy.couch.allBots : copy.online.errors.allBots);
      return;
    }

    setBusy(true);
    setError(null);
    // Remembered for next time, the way the online host override is.
    if (!couch) saveSettings({ ...loadSettings(), playerName: chosen });
    try {
      if (couch) {
        onRoom(await createTable(config, mintRoomAddress(), chosen));
      } else if (mode === 'create') {
        // The client mints the address it will connect to — 160 bits, never
        // shown. The room mints the short ticket people actually share, once
        // the directory has accepted it.
        onRoom(await createRoom(config, mintRoomAddress(), chosen));
      } else {
        const ticket = normaliseTicket(joinCode);
        if (ticket.length !== TICKET_LENGTH) {
          setError(copy.online.errors.noCode);
          setBusy(false);
          return;
        }
        const address = await resolveTicket(ticket);
        if (address === null) {
          setError(copy.online.errors.badCode);
          setBusy(false);
          return;
        }
        onRoom(await joinRoom(config, address, chosen));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.online.errors.failed);
      setBusy(false);
    }
  };

  const nameField = (
    <label className={form.field}>
      <span>{copy.online.yourName}</span>
      <div className={styles.nameRow}>
        <input
          className={form.input}
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          aria-label={copy.online.yourName}
        />
        <button
          type="button"
          onClick={() => setName(randomName())}
          aria-label={copy.online.rollName}
        >
          {copy.online.roll}
        </button>
      </div>
    </label>
  );

  return (
    <div className={form.viewport}>
      <section className={form.screen} aria-label={couch ? copy.couch.screenLabel : copy.online.screenLabel}>
        <header className={form.head}>
          <div>
            <span className={`kicker ${form.eyebrow}`}>{couch ? copy.couch.eyebrow : copy.online.eyebrow}</span>
            <h1 className={form.title}>{couch ? copy.couch.title : copy.online.title}</h1>
            <p className={form.lede}>{couch ? copy.couch.lede : copy.online.lede}</p>
          </div>
          {!couch && (
            <div className={form.segment}>
              <button type="button" data-active={mode === 'create'} onClick={() => setMode('create')}>
                {copy.online.modeCreate}
              </button>
              <button type="button" data-active={mode === 'join'} onClick={() => setMode('join')}>
                {copy.online.modeJoin}
              </button>
            </div>
          )}
        </header>

        <div className={form.body}>
          {mode === 'join' ? (
            <div className={form.columns}>
              <label className={form.field}>
                <span>{copy.online.roomCode}</span>
                {/* Normalised as it is typed *or pasted*, which is the point:
                    a code arrives from a chat window with a stray space, a
                    trailing newline, lowercase, or the dash we put there
                    ourselves, and all of that has to land as eight characters.
                    `normaliseTicket` is the same function the submit path used
                    to run alone, so what you see is now what is sent. */}
                <div className={styles.nameRow}>
                  <input
                    className={`${form.input} ${styles.codeInput}`}
                    type={streaming && !reveal.held ? 'password' : 'text'}
                    value={joinCode}
                    onChange={(e) =>
                      setJoinCode(formatTicket(normaliseTicket(e.target.value).slice(0, TICKET_LENGTH)))
                    }
                    aria-label={copy.online.roomCode}
                    placeholder={copy.online.roomCodePlaceholder}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {streaming && (
                    <button type="button" aria-label={copy.online.holdToShowLabel} {...reveal.props}>
                      {copy.online.holdToShow}
                    </button>
                  )}
                </div>
                <span className={form.note}>{copy.online.roomCodeNote}</span>
              </label>
              {nameField}
            </div>
          ) : (
            <>
              <EditionChoice value={config.edition} onChange={(edition) => patch({ edition })} />

              <div className={form.columns}>
                <div className={form.field}>
                  <span>{copy.online.table}</span>
                  <span className={form.note}>{couch ? copy.couch.tableNote : copy.online.tableNote}</span>
                  <div className={form.roster}>
                    {config.seats.map((seat, index) => (
                      <SeatRow
                        key={index}
                        index={index}
                        seat={seat}
                        nameless
                        onChange={(next) =>
                          patch({ seats: config.seats.map((s, i) => (i === index ? next : s)) })
                        }
                      />
                    ))}
                  </div>
                </div>

                <div>
                  {!couch && nameField}

                  <div className={form.field}>
                    <span>{copy.online.seats}</span>
                    <Choice
                      label={copy.online.seats}
                      numeric
                      value={seatCount}
                      options={Array.from(
                        { length: RULES.maxPlayers - RULES.minPlayers + 1 },
                        (_, i) => RULES.minPlayers + i,
                      ).map((n) => ({
                        value: n,
                        label: String(n),
                        description: fill(copy.online.seatsDescription, { n }),
                      }))}
                      onChange={(n) => resize(n)}
                    />
                  </div>

                  <VisibilityChoice config={config} onChange={(visibility) => patch({ visibility })} />
                </div>
              </div>
            </>
          )}

          {/* The all-bot reason stands in the same place as a failure, because
              the button is disabled before it can be pressed — a control that
              refuses without saying why is the worse half of this fix. */}
          <p className={form.error} role="alert">
            {error ?? (allBots ? (couch ? copy.couch.allBots : copy.online.errors.allBots) : '')}
          </p>
        </div>

        <div className={form.actions}>
          <Button variant="ghost" onClick={onBack}>
            {copy.online.back}
          </Button>
          <Button variant="primary" disabled={busy || allBots} onClick={() => void go()}>
            {busy
              ? copy.online.connecting
              : couch
                ? copy.couch.open
                : mode === 'create'
                  ? copy.online.create
                  : copy.online.join}
          </Button>
        </div>
      </section>
    </div>
  );
}
