import type { EngineEvent, Industry, Seat } from '@boomtown/engine';

type SharesBought = Extract<EngineEvent, { type: 'shares-bought' }>;

/**
 * The R6 moments this orchestrator drives — minus launch (App-level, not
 * orchestrator-driven — see the trigger map in the plan's HTD) and minus
 * first-tile (dropped by explicit user request after review: it added a
 * "the board is open" toast that read as noise rather than a moment worth
 * marking, on top of being the beat most likely to visually collide with the
 * corp-band area at the top of the screen).
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
  | { readonly id: 'founding'; readonly industry: Industry }
  | { readonly id: 'buy-stock'; readonly seat: Seat; readonly cost: number; readonly picks: SharesBought['picks'] }
  | { readonly id: 'merger' }
  | { readonly id: 'endgame'; readonly seat: Seat }
  | { readonly id: 'victory' };

/**
 * `(event) => Beat | null`. Every remaining predicate reads only the event
 * itself (KTD3's "check the view, not a log index" principle applied to
 * first-tile — "exactly one tile on the board" — is what made a view
 * parameter necessary in the first place; with that beat removed, nothing
 * left needs it). `BeatContext`'s hydration guard still separates a live
 * append from an event present at mount by log length, independently of this
 * function, so an online reconnect still can't misfire a beat for stale
 * history (R14).
 */
export function triggerFor(event: EngineEvent): Beat | null {
  switch (event.type) {
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

/**
 * Whether a beat drops an opaque, full-screen curtain (`.curtain` in
 * `beats.module.css`) or is a floating flourish that leaves the board visible
 * underneath it.
 *
 * `TurnHandoff` stands down for a beat that covers the screen — nothing behind
 * a curtain can leak, and the hand-off card would otherwise hide the beat's
 * whole animation. It must NOT stand down for a light beat: the turn advances
 * in the same tick the beat starts, so for the flourish's hold the incoming
 * seat's hand and legal moves sit exposed behind a toast about someone else's
 * purchase. `buy-stock` is the only light beat today; a new one has to answer
 * this question too, which is why this lives with the union rather than as a
 * string check at the call site.
 */
export function coversTheScreen(beat: Beat): boolean {
  return beat.id !== 'buy-stock';
}
