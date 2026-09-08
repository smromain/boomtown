---
artifact_contract: "ce-handoff/v1"
created_at: "2026-09-08T13:24:40Z"
title: "Boomtown game-feel presentation plan + desktop UI polish batch"
summary: "An implementation-ready plan for the game-feel overhaul is written but uncommitted; 14 desktop UI-polish commits from this session are on main."
keywords: ["boomtown", "game-feel", "ce-plan", "ce-doc-review", "desktop-ui", "beat-system", "design-canvas", "acquire"]
cwd: "/Users/steveromain/acquired"
resume_focus: "Decide what to do with docs/plans/2026-09-07-2020-feat-game-feel-presentation-plan.md — commit it, start ce-work on it, or leave it"
repository: "acquired"
repo_root_sha: "a696035a1e8442f4d3841139143e51ff5efb8c4c"
branch: "main"
head: "c1fef1025c912e08b41653343fe44726845c3311"
---

# Boomtown — game-feel plan + desktop UI polish

## Objective and current state

Two threads ran this session, both in `/Users/steveromain/acquired` (npm-workspaces monorepo, Electron desktop app reimplementing the board game Acquire, renamed "Boomtown").

**Thread 1 — desktop UI polish (done, committed).** A long run of small user-driven UI fixes and features on `apps/desktop`. 14 commits, `250c724`..`c1fef10`, all on `main`. Working tree is clean for these.

**Thread 2 — game-feel presentation plan (plan written, NOT committed, not started).** A full `ce-brainstorm` → `ce-plan` → `ce-doc-review` chain produced `docs/plans/2026-09-07-2020-feat-game-feel-presentation-plan.md` (untracked, ~63 KB). The user's last action was picking "Done for now" — the plan is implementation-ready and saved to disk but nothing is committed and no implementation has started.

`resume_focus`: decide the fate of that plan file. It is the only uncommitted work.

## Git state — read carefully

- `HEAD` = `c1fef10`, `branch` = `main`.
- `origin/main` also resolves to `c1fef10` and `git rev-list --count origin/main..HEAD` = 0 — so the 14 commits appear to be on `origin/main`. **This is my own call to flag, not the user's statement:** throughout the session I repeatedly said "N commits ahead of origin, unpushed" and I never ran `git push`. Either `origin` is a local remote that tracks automatically, or a push happened outside my visibility. Verify before assuming the commits are or are not published. The user gave a standing **"do not auto push"** instruction many times this session — honor it; do not push anything.
- One untracked file: `docs/plans/2026-09-07-2020-feat-game-feel-presentation-plan.md`. Nothing else uncommitted.
- `docs/plans/` also holds two prior plans (`2026-09-06-1315-feat-boomtown-architecture-plan.md`, `2026-09-07-0631-refactor-online-multiplayer-substrate-plan.md`) — untracked too, from earlier sessions, not this session's work.

## Thread 1: the 14 desktop UI commits (already done)

In `main` order, oldest first:

- `250c724` fix — `CorpReference` stock-reference modal read `useAnyView()` (seat 0's projection); showed seat 0's holdings on anyone else's turn. Switched to `activeView`.
- `cf32b70` feat — buy modal shows "N in bank · M held" per corporation.
- `1888e01` feat — founding prompt got a reference toggle + a "Peek at the board" minimize-to-pill (`DecisionModal` renders no Dialog/overlay while minimized). New `foundingOptions()` in `apps/desktop/src/reference/priceReference.ts`.
- `b3f42d0` fix — merger notes in `StoryCard` used the engine's internal `primary/secondary/tertiary`; under classic (2-tier) that read "primary … tertiary". New `tierWord(tier, bonusTiers)` → majority/minority for classic.
- `ea19ff9` feat — founding option tier/opening-value shown by default (dropped the toggle from `1888e01`).
- `0f02c6c` chore — "2015 Avalon Hill" → "Modern" everywhere via a shared `apps/desktop/src/setup/editionLabel.ts` (Avalon Hill is a Hasbro imprint — trademark hygiene, per `docs/decisions.md`).
- `102b1b0` feat — a "How to play" rules summary on the New Game screen: `apps/desktop/src/setup/RulesSummary.tsx`, differ-table numbers read from `classic`/`edition2015` presets. Original prose, names no outside game.
- `1485c41` feat — Boomtown wordmark logo. Source PNG `~/Downloads/Boomtown (Poster (US)).png` had a white background; a scratch Python/Pillow script (`/private/tmp/claude-501/.../scratchpad/logo.py`, machine-local) made near-white transparent globally + cropped. Output at `apps/desktop/src/assets/boomtown-logo.png`. Used on the menu and in the game header.
- `3614c05` feat — Back button on the New Game screen (`NewGame` gained optional `onBack`).
- `cb3c5cb` feat — the rules summary `<details>` starts collapsed.
- `49ae2c5` fix — merger rename card copy: "The stem keeps everything it has ever eaten…" (internal "stem" / "the card widens" jargon) → "Its name grows with a piece of every company it takes over. Your shares in it stay yours."
- `7d63059` feat — new `apps/desktop/src/game/Marquee.tsx` (+ `marquee.module.css`, `marquee.test.tsx`). Scrolls long corp names / blended flavour in the band card ONLY when they overflow (measured via `ResizeObserver`). `axis="x"` horizontal, `axis="y"` vertical (fixed line count via `1lh`). Respects `prefers-reduced-motion`. jsdom guard: no `ResizeObserver`, so `overflow` stays 0 and it renders static.
- `941bdf0` feat — buy modal widens (`width: max-content`, `min-width: min(28rem,90vw)`, `max-width: 90vw`) as corp names get longer; grid name column `minmax(0, auto)`.
- `c1fef10` feat — the renamed survivor name in the merger card is a `<Marquee>` too; `Marquee` gained a `style` prop; the halo `text-shadow` moved to the inner span with negative-margin bleed room.

Earlier in the session (before the compaction summary): a HotSeat unified "who's at the machine" tracker fix, the Heroicons swap for industry marks (`apps/desktop/src/game/marks.tsx` — books=BookOpen, electronics=CpuChip, air=PaperAirplane, energy=Bolt, tech=DevicePhoneMobile, video=Film, toys=Cake), the flavour-text blending feature (`blendedFlavour()` in `packages/engine/src/naming/index.ts` — splices head-of-survivor + tails-of-eaten into one nonsense line), and a company-name/flavour re-theme in `packages/engine/src/pool.ts` (`8b59856`, the user's own edits, folded in with name-agnostic test hardening).

Verification for Thread 1: `npm run typecheck`, `npm run lint`, and the desktop test suite (`npx vitest run`, 472 tests) all passed after each commit. `npm run smoke` builds the renderer but its runtime-launch step fails on a **pre-existing** `electron` ESM-interop error under Node 24 — verified by stashing and reproducing on clean `main`. Not a regression; do not chase it.

## Thread 2: the game-feel plan (the actual resume target)

### What it is

`docs/plans/2026-09-07-2020-feat-game-feel-presentation-plan.md` — `artifact_contract: ce-unified-plan/v1`, `artifact_readiness: implementation-ready`, `product_contract_source: ce-brainstorm`, 13 implementation units (U1–U13; U13 is out of numeric order in the body, that's intentional per the U-ID stability rule), 570 lines.

**Goal:** make Boomtown read as a premium digital board game (Ticket to Ride / Wingspan digital tier) rather than a webapp — a crafted visual language on the redesigned canvas artboards carried through every renderer screen, plus seven choreographed game-moments (launch, first tile, founding, buying stock, merger, endgame, victory) each with visual + motion + sound + copy.

**Two delivery tracks:** Track A = the design canvas (`design/build.py` → `.dc.html` → design-skill republish); Track B = the `apps/desktop` renderer.

### Decisions in the plan — provenance matters

**Session-settled by the user (in the brainstorm — 6 Key Decisions, labelled `session-settled: user-directed`/`user-approved`):**
- Both a visual system AND per-moment choreography (not either alone).
- Palette (`#faf6f0`/`#b3462f`) + DM Sans/DM Serif Display anchored; everything else pushed hard ("somewhere between" keeping the clean look and a full rethink).
- Target tier = modern premium board-game app.
- Not skeuomorphic (depth from lighting/shadow/illustration/motion, never material mimicry).
- The 2D-CSS-grid board decision in `docs/decisions.md` is reopened for this work.
- Bundle "ships no node_modules" discipline flexes within +120 KB gzipped.
- Success judged moment-by-moment.

**Settled by the user during ce-plan (my questions, their answers):**
- Seven moments (they added "buying stock" to my six).
- Board: CSS grid + CSS 3D transforms (perspective tilt, tile thickness) — no canvas/WebGL. This became KTD6.
- Sound: on by default, always-visible mute in the game header brand region, persisted. KTD5.
- Illustration: light — launch screen + victory + 3 named empty states, AI-generated to a style brief; corp icon marks stay. R13.
- Libraries: one animation lib (Motion-class) + one audio lib (Howler-class), both devDependencies. KTD4.
- **The P0 fix (their call during doc review):** the beat orchestrator's triggers are predicates `(event, view) => Beat | null` that check the projected VIEW (turn count, tiles on board, corp state), NOT `state.log` indices. `state.log` is used only to separate live appends from events present at mount. This makes it correct for an online client that reconnects mid-game with a partial log. KTD3, R14, AE8, U10, the HTD trigger map, and the guard prose all reflect this.

**My own calls (agent inference, flagged as such in the plan):** KTD2 (token layer + Panel/Button primitives rather than ad-hoc restyling), KTD7 (beat queue with skip-to-latest, must never bisect a merger span), KTD1 (canvas-first sequencing — but the user confirmed this in the "A+B together" brainstorm choice).

### ce-doc-review outcome (2 rounds, this session)

Six reviewers (coherence, feasibility, design-lens, scope-guardian, product-lens, adversarial) — no cross-model pass (no different-provider CLI installed). Adversarial found the **P0** (beat observer assumed a complete `state.log`; online reconnect would misfire the first-tile beat mid-game). 12 fixes applied to the plan:

- P0 resolution (view-derived triggers) across KTD3/R14/AE8/U10/HTD.
- Both mermaid diagrams reconciled (removed a contradictory edge, renumbered beat nodes to `BT1`–`BT6` so no id collides with unit nodes `B4`–`B13`).
- `window.matchMedia` stub step added to U10 + Assumptions (jsdom lacks it; `vitest.setup.ts` had no polyfill).
- U10/U11 test scenarios reworded to the `client.dispatch(...)` pattern (the harness delivers `events: []`).
- `CLAUDE.md` re-read-and-diff step added to U2/U3.
- U6/U8/U9 gate changed from "U3 republishes" to "U3 artboards generated + reviewed locally" (republish is now a DoD item — the design skill may be unavailable).
- Header mute → always-rendered brand region of `Header.tsx` (the `{view && ...}` block is null on a bot's turn).
- Beat-overlay accessibility clause in U10 (aria-live, focus save/restore, Space/Enter/Escape).
- Hard illustration ceiling in R13; U9 split into U9 (launch beat) + U13 (illustration wiring).
- Bundle baseline + measurement command in U4 + Verification Contract; smoke-note softened to "reproduce on main with changes stashed."
- KTD7 queue-collapse constrained to never bisect the merger span; U10 test added.

**5 non-blocking questions appended** to the plan's Outstanding Questions under "Resolve during U10 / U11": merger-beat-vs-DecisionModal interaction, buy-stock-beat rendering + non-local seats, which beats fire for bot/remote actors, launch-beat cross-cutting-concern ownership, presentation-investment sequencing (vs finishing unbuilt Phases C/D/E and trademark clearance). These are implementation decisions with plan guidance, not blockers — the plan stays `implementation-ready`.

Verdict from the review: **Ready.**

## Authoritative references

- **`docs/plans/2026-09-07-2020-feat-game-feel-presentation-plan.md`** (machine-local, untracked) — the plan. Read Goal Capsule (line 14), Key Decisions (68), the HTD beat-trigger-map + guard prose (182–238), Outstanding Questions incl. the 5 non-blocking items (136–154), and the 13 units (256+). This is the spec if implementation proceeds.
- `docs/decisions.md` — "Visual direction" (Saxon City chosen) and "Board rendering" (2D CSS grid, reversed R3F/KTD8, ~2.2 MB bundle) rows. The plan reopens the board row.
- `CLAUDE.md` — the design-canvas workflow: edit `design/build.py`, `cd design && python3 build.py`, re-seed and republish via the `design` skill keeping `design/boomtown.html` as the path; never hand-edit `.dc.html`. **Note: the `design` skill is NOT installed in this environment** — the plan's canvas units account for this (local regen is enough; republish is deferred).
- `design/build.py` — the artboard generator. `build_b()` / `Main.dc.html` / `Reference.dc.html` is Direction B (DM Serif/DM Sans), what the app implements. `build_a()` / `BoardRoom.dc.html` is the rejected direction, left untouched by the plan.
- `packages/engine/src/events.ts` — the `EngineEvent` union every beat trigger keys off.
- `packages/client-core/src/reconcile.ts` + `packages/server/src/room.ts` — `reconcile` only appends to `state.log`, never replaces it; `room.ts` sends `events: []` on resume. This is the evidence behind the P0 fix (cited in the plan's Sources).
- `apps/desktop/src/game/StoryCard.tsx` + `story.ts` — the existing merger-narration-from-`state.log` pattern the beat system extends; also where the "supersede" question in U11 bites.
- `apps/desktop/src/game/GameScreen.tsx` — play-surface composition (where `BeatOrchestrator` mounts). `apps/desktop/src/App.tsx` — screen router (where the launch beat lives, App-level).

## Plausible next steps (one path, forks noted)

The user chose "Done for now." When they return, the decision about the plan file is theirs. The realistic options, not mutually exclusive except where noted:

1. **Commit the plan doc** (locally, no push) so it's in version control before anything else. Low-cost, reversible. The two older untracked plans in `docs/plans/` could go in the same commit or be left — ask.
2. **Start `ce-work`** on the plan — 13 units, canvas + renderer, dependency-ordered. Large. The 5 non-blocking questions get resolved during U10/U11 by whoever implements. "Do not auto push" stays in effect, so `ce-work` should stop before any push/PR.
3. **Hand to `lfg`** for the autonomous route — but `lfg` pushes a branch and opens a PR, which directly conflicts with the standing "do not auto push." The user was offered this earlier in the session and explicitly chose to plan interactively instead. Do not pick this without the user lifting that instruction.
4. **Leave it** — the user reviews the plan on their own and decides later.

Options 2 and 3 are the mutually-exclusive fork (build now vs. autonomous-ship). 1 and 4 are orthogonal.

## Constraints carried from the session

- **"Do not auto push"** — the user stated this many times. No `git push`, no PR, no `lfg` without an explicit lift.
- The `design` skill is referenced by `CLAUDE.md` but not installed here — canvas republish can't happen in this environment.
- Trademark clearance for the 28-company name pool is open (`docs/decisions.md` "Open" section); "Toys Я Were" is flagged as the riskiest element. The plan's beat copy touches company names — noted as a non-blocking sequencing risk.
- Output style for this session is "Explanatory" (educational insights in `★ Insight` blocks) — a fresh session won't have that unless re-set.

## Relevant installed skills

- `compound-engineering:ce-work` — to execute the plan.
- `compound-engineering:ce-plan` — to re-enrich or deepen the plan if scope shifts.
- `compound-engineering:ce-doc-review` — to re-review the plan after the 12 edits (the user declined this — "Done for now" — but it's the clean next check if they want it).
- `compound-engineering:ce-debug` — used earlier this session for the HotSeat merger bugs; the pattern is `/compound-engineering:ce-debug <description>`.
