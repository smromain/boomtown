import { anyView } from '@boomtown/client-core';
import type { EngineEvent, PlayerView } from '@boomtown/engine';
import { useGameState } from '../client/GameClientProvider.js';
import { latestMerger } from '../game/story.js';
import { useActiveBeat } from './BeatContext.js';
import type { Beat } from './beatTriggers.js';
import { FirstTileBeat } from './beats/FirstTileBeat.js';
import { FoundingBeat } from './beats/FoundingBeat.js';
import { BuyStockBeat } from './beats/BuyStockBeat.js';
import { MergerBeat } from './beats/MergerBeat.js';
import { EndgameBeat } from './beats/EndgameBeat.js';
import { VictoryBeat } from './beats/VictoryBeat.js';
import styles from './beats.module.css';

/**
 * Renders whichever beat `BeatProvider` (mounted higher up in `GameScreen`)
 * says is active. The queue/hydration/dismiss logic lives in `BeatContext` —
 * `TurnHandoff` needs to read the same "is a beat active" state to defer
 * itself, so it can't be private to this component (see `BeatContext`'s doc).
 */
export function BeatOrchestrator() {
  const { active, dismiss } = useActiveBeat();
  const view = useGameState(anyView);
  const log = useGameState((state) => state.log);
  const pendingDecision = useGameState((state) => state.pendingDecision);

  // A beat is a non-interactive overlay behind an open decision prompt — the
  // dialog keeps focus (U10 approach step 5). Merger's own beat fires only
  // once the merger (and every prompt it raised) is fully resolved, so this
  // mainly guards an unrelated beat racing a founding/buy decision.
  if (!active || pendingDecision || !view) return null;

  return (
    <div className={styles.overlayRoot} aria-live="polite">
      {renderBeat(active, view, log, dismiss)}
    </div>
  );
}

function renderBeat(beat: Beat, view: PlayerView, log: readonly EngineEvent[], dismiss: () => void) {
  switch (beat.id) {
    case 'first-tile':
      return <FirstTileBeat dismiss={dismiss} />;
    case 'founding':
      return <FoundingBeat industry={beat.industry} view={view} dismiss={dismiss} />;
    case 'buy-stock':
      return <BuyStockBeat seat={beat.seat} cost={beat.cost} picks={beat.picks} view={view} dismiss={dismiss} />;
    case 'merger': {
      const merger = latestMerger(log);
      return merger ? <MergerBeat merger={merger} view={view} dismiss={dismiss} /> : null;
    }
    case 'endgame':
      return <EndgameBeat seat={beat.seat} view={view} dismiss={dismiss} />;
    case 'victory':
      return <VictoryBeat view={view} dismiss={dismiss} />;
  }
}
