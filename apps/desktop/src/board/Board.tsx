import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { activeView } from '@boomtown/client-core';
import type { TileId } from '@boomtown/engine';
import { useGameClient, useGameState } from '../client/GameClientProvider.js';
import { BoardScene } from './BoardScene.js';
import { BOARD_CAMERA } from './camera.js';
import { placementFor, playableTiles } from './pick.js';

/**
 * The board: a fixed orthographic isometric `<Canvas>` over `BoardScene`.
 * Reads the active seat's view; a click on a playable cell dispatches its
 * placement. Placement is the only board interaction (KTD8).
 */
export function Board() {
  const client = useGameClient();
  const view = useGameState(activeView);
  const busy = useGameState((state) => state.inFlight != null);

  const playable = useMemo(() => playableTiles(view), [view]);

  if (!view) return null;

  const pick = (tile: TileId): void => {
    const command = placementFor(view, busy, tile);
    if (command) client.dispatch(command);
  };

  return (
    <Canvas
      orthographic
      camera={BOARD_CAMERA}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      style={{ width: '100%', height: '100%' }}
    >
      <BoardScene
        ruleset={view.ruleset}
        cells={view.cells}
        corporations={view.corporations}
        playable={playable}
        onPick={pick}
      />
    </Canvas>
  );
}
