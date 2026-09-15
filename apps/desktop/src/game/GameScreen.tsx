import { useEffect } from 'react';
import { Board } from '../board/Board.js';
import {
  GameClientProvider,
  useGameState,
  useIsLocalTurn,
} from '../client/GameClientProvider.js';
import { BeatOrchestrator } from '../beats/BeatOrchestrator.js';
import { BeatProvider, useActiveBeat } from '../beats/BeatContext.js';
import { coversTheScreen } from '../beats/beatTriggers.js';
import { DecisionModal } from '../decisions/DecisionModal.js';
import type { StartedGame } from '../setup/NewGame.js';
import { ActionBar } from './ActionBar.js';
import { TurnModal } from './TurnModal.js';
import { CorporationBand, TrayStrip } from './CorporationBand.js';
import { ErrorToast } from './ErrorToast.js';
import { GameOver } from './GameOver.js';
import { Header } from './Header.js';
import { MotionPanel } from './MotionPanel.js';
import { OutOfPlay } from './OutOfPlay.js';
import { Shareholders } from './Shareholders.js';
import { StoryCard } from './StoryCard.js';
import { TileRack } from './TileRack.js';
import { TurnHandoff } from './TurnHandoff.js';
import { WaitingForSeat } from './Waiting.js';
import { HotSeatProvider } from './HotSeatContext.js';
import { ReferenceProvider } from '../reference/ReferenceContext.js';
import type { GameConfig } from '../setup/gameConfig.js';
import type { GameState } from '@boomtown/engine';
import styles from './game.module.css';

/**
 * The playing surface: the board on the left, a right rail carrying the story,
 * the shareholders table and the register, and your hand on a strip across the
 * foot of the screen.
 *
 * The hand used to sit at the bottom of the rail, which could not hold it: at
 * six seats with a motion open the rail wanted 762px and had 340 at the
 * smallest window the app allows, so the rack and the action were simply below
 * the fold. They belong at the foot of the table anyway — that is where a hand
 * of tiles sits.
 *
 * Under the *board*, not across the whole screen: a full-width strip is its
 * own row, and it took back from the rail exactly the height it had freed —
 * measured at 1280x860, the rail's overflow did not move a pixel. Under the
 * board it costs board height instead, which the board can give.
 *
 * The board stays on screen on every turn. When the seat on the clock isn't
 * local it renders read-only (`spectating`) so you can follow what the board
 * is doing while you wait; only the actionable surfaces — the rack, the action
 * bar and the placement targets — are withheld, and the waiting card takes the
 * hand strip's place.
 */
export function GameScreen({ game, onExit }: { game: StartedGame; onExit?: () => void }) {
  return (
    <GameClientProvider client={game.client} localSeats={game.localSeats}>
      <HotSeatProvider>
        <ReferenceProvider>
          <BeatProvider>
            <PlayArea
              config={game.config}
              nudgeBots={game.nudgeBots}
              snapshot={game.snapshot}
              onExit={onExit}
            />
            <DecisionModal />
            <TurnModal />
            <TurnHandoff config={game.config} />
            <ErrorToast />
            <BeatOrchestrator />
            <BotHold pause={game.pauseBots} />
          </BeatProvider>
        </ReferenceProvider>
      </HotSeatProvider>
    </GameClientProvider>
  );
}

/**
 * Holds the bot seats still while a beat covers the screen. Without it the
 * table plays on behind the curtain: by the time a merger's climax has
 * finished, the mergemaker has bought, the next seat has moved and a motion may
 * have been raised and settled — all unwatched, and all collapsed out of the
 * beat queue, which keeps only the latest. Beats are bounded and dismissible,
 * and `BeatContext`'s watchdog ends any that isn't, so this can only ever be a
 * pause of seconds.
 *
 * A light beat (the buy-stock flourish) doesn't hold anything: it covers
 * nothing and the turn has already moved on underneath it.
 */
function BotHold({ pause }: { pause: ((paused: boolean) => void) | undefined }) {
  const { active } = useActiveBeat();
  const held = active != null && coversTheScreen(active);
  useEffect(() => {
    if (!pause) return;
    pause(held);
    return () => pause(false);
  }, [pause, held]);
  return null;
}

function PlayArea({
  config,
  nudgeBots,
  snapshot,
  onExit,
}: {
  config: GameConfig;
  nudgeBots: (() => void) | undefined;
  snapshot: (() => GameState) | undefined;
  onExit: (() => void) | undefined;
}) {
  const over = useGameState((state) => state.status === 'over');
  const localTurn = useIsLocalTurn();
  // The end screen names the winner, so it waits for the victory beat to have
  // announced them — `over` alone put the standings on screen a second before
  // the curtain dropped. Until then the board stays up, finished but unspoiled;
  // the hand goes either way, because the game really has ended.
  const { resultHeld } = useActiveBeat();

  const centre =
    over && !resultHeld ? <GameOver onLeave={onExit} /> : <Board spectating={!localTurn} />;

  return (
    <div className={styles.screen}>
      <Header />
      <div className={styles.body}>
        <CorporationBand />
        <div className={styles.middle}>
          <div className={styles.boardArea}>
            <div className={styles.boardSlot}>{centre}</div>
            <OutOfPlay />
            {over ? null : (
              <div className={styles.hand}>
                {localTurn ? (
                  <>
                    <TileRack />
                    <ActionBar />
                  </>
                ) : (
                  <WaitingForSeat config={config} nudge={nudgeBots} snapshot={snapshot} />
                )}
              </div>
            )}
          </div>
          <div className={styles.column} data-rail>
            <StoryCard />
            <Shareholders />
            <MotionPanel />
          </div>
        </div>
        <TrayStrip />
      </div>
    </div>
  );
}
