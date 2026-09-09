import type { EngineEvent, Industry, PlayerView, Seat } from '@boomtown/engine';

type SharesBought = Extract<EngineEvent, { type: 'shares-bought' }>;

/**
 * The seven R6 moments, minus launch (App-level, not orchestrator-driven —
 * see the trigger map in the plan's HTD).
 *
 * **Merger beat placement (a documented implementation call, per the plan's
 * Outstanding Questions "resolve during U10/U11"):** the beat fires on
 * `merger-completed`, not `merger-started`. At `merger-started` the survivor
 * is not yet known in a tie (that's the `choose-survivor` decision), so there
 * is no accreted name or bonus figure to show yet. Firing on completion means
 * every fact — survivor, bonuses, the corporations eaten — is already
 * resolved (read via `latestMerger(state.log)`, the same helper `StoryCard`
 * uses), and the beat plays right before control returns to the mergemaker's
 * buy step, per F1's own step order. This also sidesteps KTD7's "never bisect
 * a merger span" concern structurally: there is no multi-event span to
 * bisect, because the beat is a single trigger like the other six. The
 * existing `StoryCard`/`DecisionModal` merger UI (survivor pick, disposal) is
 * unchanged — this beat is only the climax overlay, not a replacement for it.
 */
export type Beat =
  | { readonly id: 'first-tile' }
  | { readonly id: 'founding'; readonly industry: Industry }
  | { readonly id: 'buy-stock'; readonly seat: Seat; readonly cost: number; readonly picks: SharesBought['picks'] }
  | { readonly id: 'merger' }
  | { readonly id: 'endgame'; readonly seat: Seat }
  | { readonly id: 'victory' };

/**
 * `(event, view) => Beat | null` — reads the projected view, never a log
 * position (KTD3, R14). This is what makes the trigger correct whether the
 * log is complete (local play) or partial (an online client reconnected
 * mid-game): "exactly one tile on the board" is a fact about the view, true
 * regardless of how much history this client's log happens to hold.
 */
export function triggerFor(event: EngineEvent, view: PlayerView): Beat | null {
  switch (event.type) {
    case 'tile-placed':
      return Object.keys(view.cells).length === 1 ? { id: 'first-tile' } : null;
    case 'corporation-founded':
      return { id: 'founding', industry: event.industry };
    case 'shares-bought':
      return event.cost > 0 ? { id: 'buy-stock', seat: event.seat, cost: event.cost, picks: event.picks } : null;
    case 'merger-completed':
      return { id: 'merger' };
    case 'end-announced':
      return { id: 'endgame', seat: event.seat };
    case 'game-over':
      return { id: 'victory' };
    default:
      return null;
  }
}
