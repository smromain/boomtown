# Handoff — three more triaged bugs, not yet implemented

**Branch:** `feat/game-feel-presentation`
**HEAD at handoff:** `f814589` (pushed, working tree clean)
**Status:** all three diagnosed; **no code changes made for any of them**

The user asked to record these three items for a future session rather than implement them now. Everything below is diagnosis + a proposed fix, not a change.

## 1. Hot-seat: the next player's holdings are briefly visible when switching turns

**Very likely the same root cause already written up in `docs/handoffs/2026-09-09-hotseat-buystock-beat-leak.md`** — that doc diagnoses exactly this symptom, just from the mechanism's angle rather than the visible-holdings angle. Re-stated briefly here because the user raised it again independently, which is worth treating as confirmation it's real and worth prioritizing:

- `TurnHandoff` (`apps/desktop/src/game/TurnHandoff.tsx:43`) is a full-screen opaque overlay (`z-index: 50`) that's supposed to cover the entire app the instant the turn changes. As long as it renders, nothing underneath can leak, no matter what `Shareholders`/`Header`/`TileRack` are showing.
- It defers itself (renders nothing) whenever `activeBeat != null` — a rule written for the four *heavy*, full-screen beats. The buy-stock beat is not full-screen (a small `pointer-events: none` toast), so during its ~1.1s hold the turn has already advanced underneath — `TileRack`/`ActionBar` already reflect the *new* active seat's hand and legal moves (they key off `state.activeSeat` via `useIsLocalTurn`/`useLocalActiveView`, not off who's physically holding the machine) — and `TurnHandoff` is standing down, so it's all visible.
- Since buying stock happens at the end of nearly every turn, this is probably why it reads as "switching turns" generally rather than "the buy toast specifically."

**The fix already on record** (see the other handoff doc for full detail): stop deferring `TurnHandoff` for the `buy-stock` beat specifically (keep deferring for founding/merger/endgame/victory), and raise the buy-stock toast's z-index above `TurnHandoff`'s overlay so the toast still visibly floats on top of the now-immediate hand-off card.

**Worth double-checking when this is picked up:** confirm there isn't a *second*, distinct leak on a turn pass where nothing was bought at all (declining via "Buy nothing and end turn"). `triggerFor` only fires the buy-stock beat when `cost > 0` (`apps/desktop/src/beats/beatTriggers.ts`), so a $0 turn should never have an active beat blocking the hand-off — worth a quick regression test either way once the fix lands, alongside the buy-stock-beat case.

## 2. No indication of how much stock is being sold for during a merger

`DisposalPrompt` (`apps/desktop/src/decisions/DisposalPrompt.tsx`) shows raw share *counts* for hold/sell/trade, but never a dollar amount — a player choosing to sell shares back to the bank has no on-screen way to see what they'll get for them without doing the math themselves (tier + corp size → price/share, which they'd have to look up in the reference chart separately).

The data is already sitting right there: `CorpView.sharePrice: number | null` (`packages/engine/src/state.ts:191`, populated via `sharePriceOf`) is already read in `DisposalPrompt` for other things (`view?.corporations[decision.defunct]...`) and used the same way in `FoundingBeat.tsx:63` (`corp.sharePrice != null ? \`$${corp.sharePrice}\` : '—'`).

**Proposed fix:** in `DisposalPrompt.tsx`, compute `const price = view?.corporations[decision.defunct].sharePrice ?? 0;` and show the sale value next to (or instead of) the bare `Sell` count — e.g. "Sell 3 → $1,200" — updating live as the sell count changes, the same way the existing "→ N shares" line already does for trade-ins (`<span>→ {check.received} share{check.received === 1 ? '' : 's'}</span>`, `DisposalPrompt.tsx:83` as of this handoff). Worth deciding whether to also show it for `hold` (opportunity cost) or just `sell` (the literal ask) — the user's wording ("how much we're selling stock for") points at just `sell`.

## 3. The merger beat always says "primary"/"tertiary" for bonuses, regardless of ruleset

`MergerBeat.tsx:258` renders the raw engine tier label directly: `{bonus.seats.length} seat{...} · {bonus.tier}` — where `bonus.tier` is whatever the `bonus-paid` event carried (`'primary' | 'secondary' | 'tertiary'`, `BonusLine['tier']` in `apps/desktop/src/game/story.ts:67`).

This is already a solved problem *elsewhere*: `StoryCard.tsx` has a `tierWord(tier, bonusTiers)` helper (`apps/desktop/src/game/StoryCard.tsx:17-20`) that maps `primary → majority` / anything-below-primary → `minority` when `ruleset.bonusTiers === 2` (classic), and passes the raw 3-tier words through unchanged for the 2015 ruleset. `MergerBeat` just never calls it.

Why it reads as "always primary and tertiary": the *engine's own* `distributeBonuses` (`packages/engine/src/reducer/merge/bonuses.ts`) labels a classic (2-tier) split's two payouts as `'primary'` and `'tertiary'` internally (it skips `'secondary'` entirely under `bonusTiers === 2` — that's just how the tier enum is reused across both rulesets, not a display concern). So under classic rules specifically, the raw label the beat shows is *always* "primary"/"tertiary" — StoryCard converts that to "majority"/"minority", but the beat doesn't.

**Proposed fix:** export `tierWord` from `StoryCard.tsx` (or move it to `story.ts`, which already owns `BonusLine`/`tierWord`'s only consumer types, so it wouldn't need a new home) and call it from `MergerBeat.tsx:258`: `{tierWord(bonus.tier, view.ruleset.bonusTiers)}` (`view: PlayerView` is already a prop). Should also double check the 2015 (3-tier) ruleset actually does show "secondary" correctly today — the diagnosis above says it should (StoryCard already does), but it's worth a quick look/test alongside the fix since the user reported "no matter what ruleset," which may just mean they've only tried classic.

## Recommended next step

Pick these up in roughly this order of impact: #1 (privacy leak, has an existing fix write-up), #3 (small, contained, easy to verify), #2 (small feature addition). Each is independent and can be its own commit. Standard verification for this branch: `npm run typecheck`, `npm run lint`, `npx vitest run`, `npm run build` in `apps/desktop`, then push to `feat/game-feel-presentation` — no PR, per the user's standing instruction.
