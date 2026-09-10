import type { EngineEvent, PlayerView } from '@boomtown/engine';
import { latestMerger } from '../game/story.js';
import type { Beat } from './beatTriggers.js';
import { FoundingBeat } from './beats/FoundingBeat.js';
import { BuyStockBeat } from './beats/BuyStockBeat.js';
import { MergerBeat } from './beats/MergerBeat.js';
import { MotionBeat } from './beats/MotionBeat.js';
import { EndgameBeat } from './beats/EndgameBeat.js';
import { VictoryBeat } from './beats/VictoryBeat.js';

/**
 * The one place mapping a `Beat` to the component that renders it — shared by
 * `BeatOrchestrator` (real play, reading `log` for the merger beat's content)
 * and the settings debug menu (fixture data, no live game required).
 */
export function renderBeat(beat: Beat, view: PlayerView, log: readonly EngineEvent[], dismiss: () => void) {
  switch (beat.id) {
    case 'founding':
      return <FoundingBeat industry={beat.industry} view={view} dismiss={dismiss} />;
    case 'buy-stock':
      return <BuyStockBeat seat={beat.seat} cost={beat.cost} picks={beat.picks} view={view} dismiss={dismiss} />;
    case 'merger': {
      const merger = latestMerger(log);
      return merger ? <MergerBeat merger={merger} view={view} dismiss={dismiss} /> : null;
    }
    case 'motion':
      return (
        <MotionBeat
          carried={beat.carried}
          backers={beat.backers}
          yes={beat.yes}
          total={beat.total}
          view={view}
          dismiss={dismiss}
        />
      );
    case 'endgame':
      return <EndgameBeat seat={beat.seat} view={view} dismiss={dismiss} />;
    case 'victory':
      return <VictoryBeat view={view} dismiss={dismiss} />;
  }
}
