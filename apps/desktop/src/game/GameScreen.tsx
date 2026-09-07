import { Board } from '../board/Board.js';
import { GameClientProvider, useGameState } from '../client/GameClientProvider.js';
import { activeView } from '@boomtown/client-core';
import { DecisionModal } from '../decisions/DecisionModal.js';
import { BuyControls } from '../panels/BuyControls.js';
import type { StartedGame } from '../setup/NewGame.js';
import { CorporationBand } from './CorporationBand.js';
import { Header } from './Header.js';
import { Shareholders } from './Shareholders.js';
import { StoryCard } from './StoryCard.js';
import { TileRack } from './TileRack.js';
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
              <RightColumn />
            </div>
          </div>
          <TileRack />
        </div>
      </div>
      <DecisionModal />
    </GameClientProvider>
  );
}

function RightColumn() {
  const step = useGameState((state) => activeView(state)?.step);
  return (
    <>
      {step === 'buy' && <BuyControls />}
      <StoryCard />
      <Shareholders />
    </>
  );
}
