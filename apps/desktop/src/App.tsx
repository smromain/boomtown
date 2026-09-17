import { useEffect, useMemo, useRef, useState } from 'react';
import type { Seat } from '@boomtown/engine';
import { GameScreen } from './game/GameScreen.js';
import { NewGame, type StartedGame } from './setup/NewGame.js';
import { CreateJoin } from './lobby/CreateJoin.js';
import { SeatList } from './lobby/SeatList.js';
import { useRoomState } from './lobby/useConnectionStatus.js';
import { SettingsDialog } from './settings/SettingsDialog.js';
import { DebugBeatPreview } from './beats/debug/DebugBeatPreview.js';
import { NetLogOverlay } from './debug/NetLogOverlay.js';
import type { PreviewKind } from './beats/debug/fixtures.js';
import { configFromRoom, type OnlineGame } from './online/onlineGame.js';
import { Cog6ToothIcon, GlobeAltIcon, UsersIcon } from '@heroicons/react/24/solid';
import { copy } from './copy/copy.js';
import { NightSkyline } from './art/NightSkyline.js';
import logoUrl from './assets/boomtown-logo.png';
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [debugBeat, setDebugBeat] = useState<PreviewKind | null>(null);

  // A local game's client/bot-driver and an online room's socket live outside
  // React. They must be torn down when that game is actually left (back to the
  // menu, or the window closes) — never on the incidental re-render a screen
  // transition within the same game causes (lobby -> playing, a turn advancing).
  const running = useRef<{ local?: StartedGame; room?: OnlineGame }>({});
  if (screen.kind === 'playing-local') running.current = { local: screen.game };
  if (screen.kind === 'online-lobby' || screen.kind === 'playing-online') {
    running.current = { room: screen.room };
  }

  const inAGame =
    screen.kind === 'playing-local' ||
    screen.kind === 'online-lobby' ||
    screen.kind === 'playing-online';

  // Left the game family (back to the menu) — tear down what was running.
  useEffect(() => {
    if (inAGame) return;
    const { local, room } = running.current;
    local?.detachBots?.();
    local?.client.disconnect();
    room?.disconnect();
    running.current = {};
  }, [inAGame]);

  // Window closing / component unmount — tear down whatever is still running.
  useEffect(() => {
    return () => {
      const { local, room } = running.current;
      local?.detachBots?.();
      local?.client.disconnect();
      room?.disconnect();
    };
  }, []);

  // The online-play log rides along on every screen (Ctrl/Cmd+Shift+L), so a
  // lobby that will not fill can be diagnosed without leaving it — in a dev
  // build. A packaged build ships neither the reader nor the Settings switch
  // that arms it, so the shortcut does nothing there: a diagnostic panel a
  // player can open by accident mid-game is worse than no panel at all.
  return (
    <>
      {body(screen)}
      {import.meta.env.DEV && <NetLogOverlay />}
    </>
  );

  function body(current: Screen) {
    switch (current.kind) {
      case 'menu':
        return (
          <section className={styles.launch} aria-label={copy.menu.label}>
            <NightSkyline className={styles.launchArt} />
            <div className={styles.launchContent}>
              <img src={logoUrl} alt={copy.app.name} className={styles.logo} />
              <p className={styles.launchTagline}>{copy.app.tagline}</p>
              {/* Plates, not buttons. This screen is the table before anything
                  is on it, and the two ways in are the game's own material —
                  the hand tile's thickness and press, borrowed whole — rather
                  than the pill-shaped calls to action of a web page. The
                  accessible names stay the plain ones; the sublines are for
                  the eye. */}
              <div className={styles.launchChoice}>
                <button
                  type="button"
                  className={styles.launchPlate}
                  aria-label={copy.menu.local.name}
                  onClick={() => setScreen({ kind: 'local-setup' })}
                >
                  <UsersIcon width={22} height={22} className={styles.launchPlateMark} aria-hidden />
                  <span className={`serif ${styles.launchPlateName}`}>{copy.menu.local.name}</span>
                  <span className={styles.launchPlateNote} aria-hidden>
                    {copy.menu.local.note}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.launchPlate}
                  aria-label={copy.menu.online.name}
                  onClick={() => setScreen({ kind: 'online-setup' })}
                >
                  <GlobeAltIcon width={22} height={22} className={styles.launchPlateMark} aria-hidden />
                  <span className={`serif ${styles.launchPlateName}`}>{copy.menu.online.name}</span>
                  <span className={styles.launchPlateNote} aria-hidden>
                    {copy.menu.online.note}
                  </span>
                </button>
              </div>
              <button type="button" className={styles.launchChip} onClick={() => setSettingsOpen(true)}>
                <Cog6ToothIcon width={13} height={13} aria-hidden />
                {copy.menu.settings}
              </button>
            </div>
            <SettingsDialog
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              onDebugTrigger={setDebugBeat}
            />
            <DebugBeatPreview kind={debugBeat} onDismiss={() => setDebugBeat(null)} />
          </section>
        );

      case 'local-setup':
        return (
          <NewGame
            onStart={(game) => setScreen({ kind: 'playing-local', game })}
            onBack={() => setScreen({ kind: 'menu' })}
          />
        );

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
            game={current.room}
            onEnterGame={() => setScreen({ kind: 'playing-online', room: current.room })}
            onLeave={() => setScreen({ kind: 'menu' })}
          />
        );

      case 'playing-local':
        return <GameScreen game={current.game} onExit={() => setScreen({ kind: 'menu' })} />;

      case 'playing-online':
        return <OnlineGameScreen room={current.room} onExit={() => setScreen({ kind: 'menu' })} />;
    }
  }
}

/**
 * The online play surface. A component of its own so it can subscribe to
 * `room-state`, which is where the real seat names and bot/human kinds live —
 * `room.config` is the lobby's placeholder (`Player 1 / Player 2 / …`) and
 * handing that to `GameScreen` is what made every remote player "Player N" and
 * every online bot look like a human (#15).
 */
function OnlineGameScreen({ room, onExit }: { room: OnlineGame; onExit: () => void }) {
  const roomState = useRoomState(room.transport);
  const seat = room.transport.seat();
  const localSeats: Seat[] = seat == null ? [] : [seat];
  const config = useMemo(() => configFromRoom(room.config, roomState), [room.config, roomState]);

  return <GameScreen game={{ client: room.client, config, localSeats }} onExit={onExit} />;
}
