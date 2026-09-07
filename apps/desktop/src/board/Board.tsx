import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import type { TileId } from '@boomtown/engine';
import { useGameClient, useGameState, useLocalActiveView } from '../client/GameClientProvider.js';
import { BoardScene } from './BoardScene.js';
import { BOARD_CAMERA } from './camera.js';
import { cellTargets, placementFor } from './pick.js';

/**
 * The board: a flat top‑down orthographic `<Canvas>` over `BoardScene` (KTD8 —
 * still R3F, styled to the design's 2D grid). A click on a legal cell dispatches
 * its placement; placement is the only board interaction.
 */
export function Board() {
  const client = useGameClient();
  const view = useLocalActiveView();
  const busy = useGameState((state) => state.inFlight != null);

  const targets = useMemo(() => cellTargets(view), [view]);

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
        targets={targets}
        onPick={pick}
      />
    </Canvas>
  );
}
