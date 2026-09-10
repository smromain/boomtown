import { Board } from '../board/Board.js';
import {
  GameClientProvider,
  useGameState,
  useIsLocalTurn,
} from '../client/GameClientProvider.js';
import { BeatOrchestrator } from '../beats/BeatOrchestrator.js';
import { BeatProvider } from '../beats/BeatContext.js';
import { DecisionModal } from '../decisions/DecisionModal.js';
import type { StartedGame } from '../setup/NewGame.js';
import { ActionBar } from './ActionBar.js';
import { BuyModal } from './BuyModal.js';
import { CorporationBand, TrayStrip } from './CorporationBand.js';
import { ErrorToast } from './ErrorToast.js';
import { GameOver } from './GameOver.js';
import { Header } from './Header.js';
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
 * The playing surface, laid out to the Main design artboard: the board alone on
 * the left at its natural size, and a right column that stacks the story, the
 * shareholders table, the tile rack and the contextual action.
 *
 * The board stays on screen on every turn. When the seat on the clock isn't
 * local it renders read-only (`spectating`) so you can follow what the board
 * is doing while you wait; only the actionable surfaces — the rack, the action
 * bar and the placement targets — are withheld, and the waiting card takes the
 * rack's place in the right column.
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
            <BuyModal />
            <TurnHandoff config={game.config} />
            <ErrorToast />
            <BeatOrchestrator />
          </BeatProvider>
        </ReferenceProvider>
      </HotSeatProvider>
    </GameClientProvider>
  );
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

  const centre = over ? <GameOver onLeave={onExit} /> : <Board spectating={!localTurn} />;

  return (
    <div className={styles.screen}>
      <Header />
      <div className={styles.body}>
        <CorporationBand />
        <div className={styles.middle}>
          <div className={styles.boardArea}>
            <div className={styles.boardSlot}>{centre}</div>
            <OutOfPlay />
          </div>
          <div className={styles.column}>
            <StoryCard />
            <Shareholders />
            {over ? null : localTurn ? (
              <>
                <TileRack />
                <ActionBar />
              </>
            ) : (
              <WaitingForSeat config={config} nudge={nudgeBots} snapshot={snapshot} />
            )}
          </div>
        </div>
        <TrayStrip />
      </div>
    </div>
  );
}
