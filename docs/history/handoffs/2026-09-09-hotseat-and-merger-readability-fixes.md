# Issues #1–#4: the hot-seat privacy leak, disposal pricing, and bonus tier wording

All four were already diagnosed in the two 2026-09-09 handoff docs. This is what landed.

## #1 / #2 — the hot-seat leak (one bug, two reports)

`TurnHandoff` stood down for *any* active beat. That rule was written for the four
full-screen beats, where deferring is safe: nothing behind an opaque curtain can leak.
The buy-stock flourish is not one of those — it covers nothing, and the turn advances in
the same tick it fires, so for its ~1.1s hold the incoming seat's rack and legal moves were
on screen behind a toast about someone else's purchase. Since almost every turn ends in a
buy, that reads as "switching turns leaks holdings" (#2) rather than a toast-specific bug.

- `beatTriggers.ts` gains `coversTheScreen(beat)`. It lives with the `Beat` union rather
  than as a string check at the call site, so a future light beat has to answer the same
  question.
- `TurnHandoff` defers only to a beat that covers the screen.
- `BeatOrchestrator` stacks a light beat above `TurnHandoff` (`.aboveHandoff`, z-index 60),
  so the buyer still gets their confirmation — now floating over an opaque card.

The `$0` turn pass the triage doc flagged was checked and is not a second bug: `triggerFor`
returns null when nothing was bought, so no beat exists and the hand-off was already
immediate. There is a regression test for it either way.

## #3 — no sale value during disposal

`DisposalPrompt` showed share counts only, so deciding whether to sell meant working the
tier/size price out of the reference chart by hand. It now reads the same figure the engine
settles with (`CorpView.sharePrice`, which is the defunct corporation's live price — it is
still on the board while its holders dispose): the per-share price in the subtitle, and a
live `→ $N` beside the sell stepper, mirroring the trade row's `→ N shares`. Sell only, per
the report's wording.

## #4 — bonus tiers always read "primary"/"tertiary"

Under classic the engine labels its two payouts `primary` and `tertiary` internally — it
skips `secondary` entirely — so the raw tier was never the word to show. `StoryCard` already
converted these via a private `tierWord`; `MergerBeat` rendered `bonus.tier` directly.
`tierWord` moved to `story.ts` beside `BonusLine`, where both consumers can reach it, and
`MergerBeat` now calls it.

The 2015 (3-tier) ruleset was checked rather than assumed: `renderPanel` takes an `edition`
option now, and a test drives a three-holder merger under `edition-2015` to confirm
"secondary" really does surface.

## Verification

`npm run typecheck`, `npm run lint`, `npm test` (541 passing), and `npm run build` in
`apps/desktop`. New regression tests: two in `beats.test.tsx` for the hand-off (the flourish
case and the $0 pass), two more there for the tier wording under each ruleset, and one in
`decisions.test.tsx` for the live sale value.
