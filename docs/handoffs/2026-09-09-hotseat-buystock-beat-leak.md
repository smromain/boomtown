# Handoff — hot-seat buy-stock beat exposes the next player's hand

**Branch:** `feat/game-feel-presentation`
**HEAD at handoff:** `32631f2` (pushed, working tree clean)
**Status:** diagnosed and agreed with the user; **not yet implemented**

## What this session did (context, all done + pushed)

This session continued the game-feel/presentation overhaul (`docs/plans/2026-09-07-2020-feat-game-feel-presentation-plan.md`, units U1–U13) on `feat/game-feel-presentation`, working through a series of visual/functional bug reports the user found by running the app. In commit order (oldest first), all pushed and green (typecheck/lint/`npx vitest run`, 520 tests, and `npm run build` in `apps/desktop`):

- `9ca0598` — `TurnHandoff` no longer hides the merger beat in hot-seat (it now defers to any active beat via a shared `BeatContext`/`useActiveBeat`, so the merger climax and a hand-off card can't both try to own the screen at once).
- `1a7560d` — launch-screen button contrast fix (a `.choice button` selector was overriding the `Button` component) + removed a degenerate SVG line in `Skyline.tsx`.
- `5455c3c` — staged the merger beat into 6 timed stages instead of one flat reveal.
- `900a953` — removed the first-tile toast entirely (per the user), fixed the buy-stock/flourish centering (it was self-positioning with `position: fixed` instead of letting its flex parent center it), added a dev-only debug menu (`apps/desktop/src/beats/debug/`) to trigger any beat's real animation from Settings without simulating a game.
- `5f29818` — the beats' "click or press space…" hint line was an unpositioned flex-item sibling of the main content column; anchored it `position: absolute; bottom-right` instead.
- `4901954` — reworded the endgame beat's copy: announcing the end happens at the tail of the announcer's own turn (`end-check` step), and the game ends immediately after — no other player, not even the announcer, gets a further turn. The old copy ("This is the final round") read as if everyone got one more turn.
- `0690492`, `8342ee0`, `78ddb68` — the victory beat: replaced the flat "everyone's total at once" screen with a cascading reveal, last place to first, showing the work behind each total (cash on hand, then each corporation's shares × price = sale value + bonus). Required a new `RankingRow.holdings: CorpSettlement[]` field from `finalSettlement` in `packages/engine/src/scoring.ts`. Followed by two refinement rounds: names are withheld until each seat's total lands (so the standings can't be skimmed ahead of the math), the skyline art and tagline no longer fight the card for vertical space, and the calculation lines were widened and set to `whiteSpace: nowrap` so they stop wrapping mid-sentence.
- `32631f2` — **landed externally, not from this session** (same author, pushed directly to the branch while this session was running): a copy tweak to the merger beat's subtitle and a small `margin`/`alignSelf` tweak to `IndustryMark`. Verified after merging it in: typecheck, lint, and the full test suite (520 tests) still pass.

None of the above needs further action. The rest of this doc is the one open item.

## The open item: buy-stock beat shows the wrong player's board underneath it in hot-seat

**The user's question:** "I think we're showing the buy stock beat on the wrong players when playing hot seat. Should we show it on the player that bought the stock or the following player?"

**Answer we landed on:** the toast is already correctly attributed — `BuyStockBeat` (`apps/desktop/src/beats/beats/BuyStockBeat.tsx`) reads `seat` off the `shares-bought` event and always names the actual buyer. The bug isn't about who it names; it's a hot-seat privacy leak in the *timing* of when it's shown. Nothing has been changed for this yet — the fix below is proposed, not implemented.

### The bug, step by step

1. Player A finishes their buy step → the engine emits `shares-bought` → `BeatContext` (`apps/desktop/src/beats/BeatContext.tsx`) turns that into the active `buy-stock` beat.
2. The engine immediately advances the turn in the same tick → `state.activeSeat` becomes Player B.
3. `TileRack` and `ActionBar` (and `Board`'s legal-move highlighting) don't track who is physically holding the machine — they track `state.activeSeat` directly, via `useLocalActiveView`/`useIsLocalTurn` in `apps/desktop/src/client/GameClientProvider.tsx:61,67-69` (`isLocalTurn(state, local)` — in hot-seat, all seats are in `local`, so this is true the instant `activeSeat` flips). So the moment step 2 happens, **Player B's hand and legal moves are already rendered**, underneath everything else on screen.
4. `TurnHandoff` (`apps/desktop/src/game/TurnHandoff.tsx:43`) — the opaque, full-screen "hand the machine to Player B" card that exists specifically to hide exactly this transition — explicitly steps aside whenever *any* beat is active: `if (over || promptOpen || activeBeat != null || ...) return null;`. That rule was written (commit `9ca0598`, this session) for the four *heavy* beats (founding/merger/endgame/victory), which are full-screen opaque curtains — deferring to them is safe because nothing behind an opaque curtain can leak.
5. `buy-stock` is different: it's `BuyStockBeat`'s small `pointer-events: none` toast (`apps/desktop/src/beats/beats.module.css` `.flourish`, inside `.overlayRoot` at `z-index: 45`) — a non-blocking flourish that never covers the screen, by design ("the lightest beat," play never pauses for it). Because `TurnHandoff` treats it the same as the heavy beats, `TurnHandoff` stays suppressed for the beat's ~1.1s hold (`HOLD_MS` in `BuyStockBeat.tsx`), and Player B's hand sits exposed behind a toast that reads "Player A bought stock — $X".

### Proposed fix (agreed with the user, not yet built)

Stop deferring `TurnHandoff` for the `buy-stock` beat specifically — keep deferring for the four heavy beats — and raise `buy-stock`'s toast above `TurnHandoff`'s overlay z-index. Concretely:

1. In `TurnHandoff.tsx:43`, change the guard so it only defers to beats that are actually full-screen: something like `activeBeat != null && activeBeat.id !== 'buy-stock'` (the `Beat` union is `founding | buy-stock | merger | endgame | victory`, defined in `apps/desktop/src/beats/beatTriggers.ts`).
2. Give the buy-stock beat's overlay a z-index above `TurnHandoff`'s `.overlay` (`apps/desktop/src/game/turnHandoff.module.css:8`, currently `z-index: 50`) — either bump `.overlayRoot` for just this beat, or add a dedicated class. `.overlayRoot` is currently `z-index: 45` and shared by all beats' outer positioning wrapper (`apps/desktop/src/beats/beats.module.css:16-24`), so this needs to not regress the heavy beats' stacking (they don't need to be above `TurnHandoff` since `TurnHandoff` no longer renders at all while they're active).

Net effect once built:
- Player A buys stock → the turn advances → `TurnHandoff`'s opaque card for Player B appears **immediately** (no longer waiting on the beat), safely covering Player B's now-exposed board right away.
- The "Player A bought stock — $X" toast keeps floating on top of that opaque card for its normal ~1.1s hold (higher z-index), so Player A still gets their confirmation before handing off.
- Player B still can't see anything until they click "I'm ready."

### What's NOT done for this yet

- No code changes.
- No regression test added. Whoever implements this should add a hot-seat-specific test alongside the existing `beats.test.tsx` `BeatOrchestrator` tests (see `apps/desktop/src/beats/beats.test.tsx`, the `'does not cover the merger beat with the hot-seat hand-off card...'` test around line 281 for the harness pattern — multi-local-seat game, dispatch a buy that leaves stock to purchase, assert `TileRack`/`ActionBar` for the *incoming* seat are not present/queryable while the buy-stock toast is up, the way that test asserts for the merger beat).
- Have not checked whether the same class of issue exists for any other *light* beat — currently `buy-stock` is the only one, but if a future light (non-full-screen) beat is added, the same "does this beat need to defer `TurnHandoff` or not" question applies.

## Recommended next step

Implement the two-part fix above in `TurnHandoff.tsx` + `beats.module.css` (or a new class), add the hot-seat regression test, run `npm run typecheck`, `npm run lint`, `npx vitest run`, and `npm run build` in `apps/desktop`, then commit and push to `feat/game-feel-presentation` (no PR, per the user's standing instruction for this branch).
