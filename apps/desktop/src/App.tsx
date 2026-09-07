import { useState } from 'react';
import { GameScreen } from './game/GameScreen.js';
import { NewGame, type StartedGame } from './setup/NewGame.js';

/** The renderer root: the setup screen until a game starts, then the playing surface. */
export function App() {
  const [game, setGame] = useState<StartedGame | null>(null);
  return game ? <GameScreen game={game} /> : <NewGame onStart={setGame} />;
}
