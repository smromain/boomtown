import { useEffect, useState } from 'react';
import { GameScreen } from './game/GameScreen.js';
import { NewGame, type StartedGame } from './setup/NewGame.js';
import { CreateJoin } from './lobby/CreateJoin.js';
import { SeatList } from './lobby/SeatList.js';
import type { OnlineGame } from './online/onlineGame.js';
import styles from './lobby/lobby.module.css';

type Screen =
  | { kind: 'menu' }
  | { kind: 'local-setup' }
  | { kind: 'online-setup' }
  | { kind: 'online-lobby'; room: OnlineGame }
  | { kind: 'playing-local'; game: StartedGame }
  | { kind: 'playing-online'; room: OnlineGame };

/** The renderer root: a small menu, then local setup / online lobby, then the board. */
export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'menu' });

  useEffect(() => {
    if (screen.kind === 'playing-local') {
      const g = screen.game;
      return () => {
        g.detachBots?.();
        g.client.disconnect();
      };
    }
    if (screen.kind === 'online-lobby' || screen.kind === 'playing-online') {
      const room = screen.room;
      return () => room.disconnect();
    }
    return undefined;
  }, [screen]);

  switch (screen.kind) {
    case 'menu':
      return (
        <section className={styles.screen} aria-label="Main menu">
          <h1>Boomtown</h1>
          <div className={styles.choice}>
            <button type="button" onClick={() => setScreen({ kind: 'local-setup' })}>
              Local game
            </button>
            <button type="button" onClick={() => setScreen({ kind: 'online-setup' })}>
              Play online
            </button>
          </div>
        </section>
      );

    case 'local-setup':
      return <NewGame onStart={(game) => setScreen({ kind: 'playing-local', game })} />;

    case 'online-setup':
      return (
        <CreateJoin
          onRoom={(room) => setScreen({ kind: 'online-lobby', room })}
          onBack={() => setScreen({ kind: 'menu' })}
        />
      );

    case 'online-lobby':
      return (
        <SeatList
          game={screen.room}
          onEnterGame={() => setScreen({ kind: 'playing-online', room: screen.room })}
          onLeave={() => setScreen({ kind: 'menu' })}
        />
      );

    case 'playing-local':
      return <GameScreen game={screen.game} />;

    case 'playing-online':
      return <GameScreen game={{ client: screen.room.client, config: screen.room.config }} />;
  }
}
