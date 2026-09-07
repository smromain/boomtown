import { Board } from '../board/Board.js';
import { GameClientProvider } from '../client/GameClientProvider.js';
import { DecisionModal } from '../decisions/DecisionModal.js';
import type { StartedGame } from '../setup/NewGame.js';
import { ActionBar } from './ActionBar.js';
import { BuyModal } from './BuyModal.js';
import { CorporationBand } from './CorporationBand.js';
import { Header } from './Header.js';
import { Shareholders } from './Shareholders.js';
import { StoryCard } from './StoryCard.js';
import { TileRack } from './TileRack.js';
import { TurnHandoff } from './TurnHandoff.js';
import styles from './game.module.css';

/**
 * The playing surface, laid out to the Main design artboard: the board alone on
 * the left at its natural size, and a right column that stacks the story, the
 * shareholders table, the tile rack and the contextual action.
 */
export function GameScreen({ game }: { game: StartedGame }) {
  return (
    <GameClientProvider client={game.client}>
      <div className={styles.screen}>
        <Header />
        <div className={styles.body}>
          <CorporationBand />
          <div className={styles.middle}>
            <div className={styles.board}>
              <Board />
            </div>
            <div className={styles.column}>
              <StoryCard />
              <Shareholders />
              <TileRack />
              <ActionBar />
            </div>
          </div>
        </div>
      </div>
      <DecisionModal />
      <BuyModal />
      <TurnHandoff config={game.config} />
    </GameClientProvider>
  );
}
