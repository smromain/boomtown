import { useState } from 'react';
import { RULES } from '@boomtown/engine';
import { defaultConfig, type GameConfig } from '../setup/gameConfig.js';
import { SeatRow } from '../setup/SeatConfig.js';
import { createRoom, joinRoom, type OnlineGame } from '../online/onlineGame.js';
import { makeRoomCode } from '../online/hostUrl.js';
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
  const [name, setName] = useState('Player 1');
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
    setBusy(true);
    setError(null);
    try {
      if (mode === 'create') {
        const code = makeRoomCode();
        onRoom(await createRoom(config, code, name.trim() || 'Player'));
      } else {
        const code = joinCode.trim().toUpperCase();
        if (code.length < 4) {
          setError('Enter a room code.');
          setBusy(false);
          return;
        }
        onRoom(await joinRoom(config, code, name.trim() || 'Player'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect.');
      setBusy(false);
    }
  };

  return (
    <section className={styles.screen} aria-label="Online game">
      <h1>Play online</h1>

      <div className={styles.choice}>
        <button type="button" data-active={mode === 'create'} onClick={() => setMode('create')}>
          Create a room
        </button>
        <button type="button" data-active={mode === 'join'} onClick={() => setMode('join')}>
          Join with a code
        </button>
      </div>

      <label className={styles.field}>
        <span>Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
      </label>

      {mode === 'join' ? (
        <label className={styles.field}>
          <span>Room code</span>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            aria-label="Room code"
            placeholder="ABCD12"
          />
        </label>
      ) : (
        <>
          <label className={styles.field}>
            <span>Seats</span>
            <select value={seatCount} onChange={(e) => resize(Number(e.target.value))}>
              {Array.from(
                { length: RULES.maxPlayers - RULES.minPlayers + 1 },
                (_, i) => RULES.minPlayers + i,
              ).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.field}>
            <span>Seats — humans join by code, bots fill in</span>
            {config.seats.map((seat, index) => (
              <SeatRow
                key={index}
                index={index}
                seat={seat}
                onChange={(next) =>
                  patch({ seats: config.seats.map((s, i) => (i === index ? next : s)) })
                }
              />
            ))}
          </div>

          <label className={styles.field}>
            <span>Edition</span>
            <select
              value={config.edition}
              onChange={(e) => patch({ edition: e.target.value as GameConfig['edition'] })}
            >
              <option value="classic">Classic</option>
              <option value="edition-2015">2015 Avalon Hill</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>Cash and holdings</span>
            <select
              value={config.visibility}
              onChange={(e) => patch({ visibility: e.target.value as GameConfig['visibility'] })}
            >
              <option value="open">Open — everyone sees everything</option>
              <option value="hidden">Hidden — only your own</option>
            </select>
          </label>
        </>
      )}

      <p className={styles.error} role="alert">
        {error ?? ''}
      </p>

      <button type="button" className={styles.primary} disabled={busy} onClick={() => void go()}>
        {busy ? 'Connecting…' : mode === 'create' ? 'Create room' : 'Join room'}
      </button>

      <button type="button" className={styles.back} onClick={onBack}>
        Back
      </button>
    </section>
  );
}
