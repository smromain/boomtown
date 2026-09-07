import { Board } from '../board/Board.js';
import { GameClientProvider } from '../client/GameClientProvider.js';
import { DecisionModal } from '../decisions/DecisionModal.js';
import type { StartedGame } from '../setup/NewGame.js';
import { ActionBar } from './ActionBar.js';
import { CorporationBand } from './CorporationBand.js';
import { Header } from './Header.js';
import { Shareholders } from './Shareholders.js';
import { StoryCard } from './StoryCard.js';
import { TileRack } from './TileRack.js';
import { TurnHandoff } from './TurnHandoff.js';
import styles from './game.module.css';

/** The playing surface, laid out to the Main design artboard. */
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
            </div>
          </div>
          <footer className={styles.bottom}>
            <TileRack />
            <ActionBar />
          </footer>
        </div>
      </div>
      <DecisionModal />
      <TurnHandoff config={game.config} />
    </GameClientProvider>
  );
}
