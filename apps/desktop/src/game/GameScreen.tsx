import { Board } from '../board/Board.js';
import { GameClientProvider } from '../client/GameClientProvider.js';
import { DecisionModal } from '../decisions/DecisionModal.js';
import { BuyControls } from '../panels/BuyControls.js';
import { EventLog } from '../panels/EventLog.js';
import { HandRack } from '../panels/HandRack.js';
import { Holdings } from '../panels/Holdings.js';
import { Market } from '../panels/Market.js';
import type { StartedGame } from '../setup/NewGame.js';
import styles from './game.module.css';

/** The playing surface: the 3D board, the 2D panels, and the decision modal, all wired to one client. */
export function GameScreen({ game }: { game: StartedGame }) {
  return (
    <GameClientProvider client={game.client}>
      <div className={styles.layout}>
        <div className={styles.board}>
          <Board />
        </div>
        <aside className={styles.side}>
          <Market />
          <Holdings />
          <BuyControls />
          <EventLog />
        </aside>
        <footer className={styles.hand}>
          <HandRack />
        </footer>
      </div>
      <DecisionModal />
    </GameClientProvider>
  );
}
