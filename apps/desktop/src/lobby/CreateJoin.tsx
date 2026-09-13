import { useState } from 'react';
import { RULES } from '@boomtown/engine';
import { defaultConfig, type GameConfig } from '../setup/gameConfig.js';
import { Choice } from '../setup/Choice.js';
import { VisibilityChoice } from '../setup/VisibilityChoice.js';
import { SeatRow } from '../setup/SeatConfig.js';
import { createRoom, joinRoom, type OnlineGame } from '../online/onlineGame.js';
import { makeRoomCode } from '../online/hostUrl.js';
import { randomName } from '../online/randomName.js';
import { loadSettings, saveSettings } from '../settings/settings.js';
import { EditionChoice } from '../setup/EditionChoice.js';
import { Button } from '../ui/Button.js';
import form from '../setup/form.module.css';
import styles from './lobby.module.css';

/**
 * Create a room (with the same seat/edition/visibility options as a local
 * game) or join one by code. On success it hands an `OnlineGame` to the lobby.
 */
export function CreateJoin({
  onRoom,
  onBack,
}: {
  onRoom: (game: OnlineGame) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  // Seeded from the saved name, else a generated one. Never the literal
  // "Player 1" it used to ship with: that was a real value rather than a
  // placeholder, so every joiner who didn't think to change it arrived under
  // the same name (#16).
  const [name, setName] = useState(() => loadSettings().playerName.trim() || randomName());
  const [joinCode, setJoinCode] = useState('');
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

  const go = async () => {
    const chosen = name.trim();
    if (chosen === '') {
      setError('Enter a name, or roll one.');
      return;
    }

    setBusy(true);
    setError(null);
    // Remembered for next time, the way the online host override is.
    saveSettings({ ...loadSettings(), playerName: chosen });
    try {
      if (mode === 'create') {
        const code = makeRoomCode();
        onRoom(await createRoom(config, code, chosen));
      } else {
        const code = joinCode.trim().toUpperCase();
        if (code.length < 4) {
          setError('Enter a room code.');
          setBusy(false);
          return;
        }
        onRoom(await joinRoom(config, code, chosen));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect.');
      setBusy(false);
    }
  };

  const nameField = (
    <label className={form.field}>
      <span>Your name</span>
      <div className={styles.nameRow}>
        <input
          className={form.input}
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          aria-label="Your name"
        />
        <button type="button" onClick={() => setName(randomName())} aria-label="Roll a new name">
          Roll
        </button>
      </div>
    </label>
  );

  return (
    <div className={form.viewport}>
      <section className={form.screen} aria-label="Online game">
        <header className={form.head}>
          <div>
            <span className={`kicker ${form.eyebrow}`}>online · one seat each</span>
            <h1 className={form.title}>Play online</h1>
            <p className={form.lede}>
              Open a room and hand out the code, or take a seat in someone else&apos;s. Your hand
              and the draw pile stay yours alone.
            </p>
          </div>
          <div className={form.segment}>
            <button type="button" data-active={mode === 'create'} onClick={() => setMode('create')}>
              Create a room
            </button>
            <button type="button" data-active={mode === 'join'} onClick={() => setMode('join')}>
              Join with a code
            </button>
          </div>
        </header>

        <div className={form.body}>
          {mode === 'join' ? (
            <div className={form.columns}>
              <label className={form.field}>
                <span>Room code</span>
                <input
                  className={`${form.input} ${styles.codeInput}`}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  aria-label="Room code"
                  placeholder="ABCD12"
                />
                <span className={form.note}>
                  Six characters, from whoever opened the room. The rule set is theirs to choose.
                </span>
              </label>
              {nameField}
            </div>
          ) : (
            <>
              <EditionChoice value={config.edition} onChange={(edition) => patch({ edition })} />

              <div className={form.columns}>
                <div className={form.field}>
                  <span>The table</span>
                  <span className={form.note}>
                    Humans join by code and bring their own names. Set a seat to a bot to fill it now.
                  </span>
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
                  {nameField}

                  <div className={form.field}>
                    <span>Seats</span>
                    <Choice
                      label="Seats"
                      numeric
                      value={seatCount}
                      options={Array.from(
                        { length: RULES.maxPlayers - RULES.minPlayers + 1 },
                        (_, i) => RULES.minPlayers + i,
                      ).map((n) => ({ value: n, label: String(n), description: `${n} seats` }))}
                      onChange={(n) => resize(n)}
                    />
                  </div>

                  <VisibilityChoice config={config} onChange={(visibility) => patch({ visibility })} />
                </div>
              </div>
            </>
          )}

          <p className={form.error} role="alert">
            {error ?? ''}
          </p>
        </div>

        <div className={form.actions}>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void go()}>
            {busy ? 'Connecting…' : mode === 'create' ? 'Create room' : 'Join room'}
          </Button>
        </div>
      </section>
    </div>
  );
}
