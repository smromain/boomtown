import { Board } from '../board/Board.js';
import { GameClientProvider, useIsLocalTurn } from '../client/GameClientProvider.js';
import { DecisionModal } from '../decisions/DecisionModal.js';
import type { StartedGame } from '../setup/NewGame.js';
import { ActionBar } from './ActionBar.js';
import { BuyModal } from './BuyModal.js';
import { CorporationBand, TrayStrip } from './CorporationBand.js';
import { ErrorToast } from './ErrorToast.js';
import { Header } from './Header.js';
import { OutOfPlay } from './OutOfPlay.js';
import { Shareholders } from './Shareholders.js';
import { StoryCard } from './StoryCard.js';
import { TileRack } from './TileRack.js';
import { TurnHandoff } from './TurnHandoff.js';
import { WaitingForSeat } from './Waiting.js';
import type { GameConfig } from '../setup/gameConfig.js';
import styles from './game.module.css';

/**
 * The playing surface, laid out to the Main design artboard: the board alone on
 * the left at its natural size, and a right column that stacks the story, the
 * shareholders table, the tile rack and the contextual action.
 */
export function GameScreen({ game }: { game: StartedGame }) {
  return (
    <GameClientProvider client={game.client} localSeats={game.localSeats}>
      <PlayArea config={game.config} />
      <DecisionModal />
      <BuyModal />
      <TurnHandoff config={game.config} />
      <ErrorToast />
    </GameClientProvider>
  );
}

function PlayArea({ config }: { config: GameConfig }) {
  const localTurn = useIsLocalTurn();

  return (
    <div className={styles.screen}>
      <Header />
      <div className={styles.body}>
        <CorporationBand />
        <div className={styles.middle}>
          <div className={styles.boardArea}>
            <div className={styles.board}>{localTurn ? <Board /> : <WaitingForSeat config={config} />}</div>
            <OutOfPlay />
          </div>
          <div className={styles.column}>
            <StoryCard />
            <Shareholders />
            {localTurn ? (
              <>
                <TileRack />
                <ActionBar />
              </>
            ) : null}
          </div>
        </div>
        <TrayStrip />
      </div>
    </div>
  );
}
