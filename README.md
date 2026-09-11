# Boomtown


<img width="2304" height="1728" alt="Boomtown (Poster (US))" src="https://github.com/user-attachments/assets/00b1e6b6-1b9a-48e9-ae12-90a775b3ff2d" />


A desktop implementation of the board game **Acquire** — the mechanics only, renamed and
re‑themed. Two published editions ship as data alongside **Boomtown**, our own variant with closed
books and an ending put to a vote; the sequenced merger is modelled exactly, and the same headless
engine drives local hot‑seat, AI opponents, and online play against an authoritative server.

> The rules and mechanics of a board game are not protectable. **ACQUIRE** and the original
> corporation names are live Hasbro / Avalon Hill trademarks and are not used here — every name in
> this project is original or a parody of a defunct brand. Nothing has been trademark‑searched; see
> `docs/decisions.md`.

---

## Status

All five build phases have shipped. The app plays end to end — hot‑seat, against bots, and online —
and builds signed installers for macOS, Windows and Linux from a tagged release.

| Phase | Scope | State |
|---|---|---|
| **A — Engine** | Rules, ruleset config, price/bonus tables, board, seeded RNG, turn reducer, merger state machine, end‑game & scoring, merge‑naming, legal‑move enumeration + evaluator | **Done** — `packages/engine`, full `docs/rules.md` and `docs/naming.md` parity |
| **B — Desktop** | Hardened Electron shell, `client-core` (transport + store), 2D board, panels, merger‑decision UI, local game setup | **Done** — offline hot‑seat fully playable |
| **C — AI** | Non‑LLM bot policy with a 1–10 difficulty dial, auto‑play loop off the main thread | **Done** — `packages/ai` |
| **D — Online** | `protocol` package, authoritative PartyKit room, command‑log persistence + reconnection, socket transport + lobby | **Done** — `packages/server`, deployed at `boomtown.smromain.partykit.dev` |
| **E — Packaging** | electron‑builder targets, app icon and name, settings, signing, release workflow | **Done** — tagged releases build all three OSes and deploy the room |

Since then: a presentation pass (**beats** — founding, buy, merger, endgame and victory moments,
with sound), a stock **reference chart**, hot‑seat privacy fixes, and an online‑play diagnostic log.
Auto‑update is wired in code but has no feed yet — that needs a hosting decision.

**556 tests** pass (`npm test`), plus 11 integration tests against a real room (`npm run
test:server`); typecheck and lint are clean.

Plans: `docs/plans/` holds the architecture plan, the online‑multiplayer substrate plan, and the
game‑feel plan. `docs/handoffs/` records what each recent session diagnosed and landed.

---

## Repository layout

A pnpm‑style monorepo run with **npm workspaces** (`packages/*`, `apps/*`).

```
packages/
  engine/        headless rules — no I/O. createGame, reduce, viewFor, legalMoves, evaluate.
  protocol/      wire contract for online play — message union, DTOs, typed errors, version gate
  ai/            non‑LLM bot Policy — heuristic scoring, optional lookahead, one 1–10 dial
  client-core/   GameSession, GameTransport (local / worker / socket), Zustand store, reconcile,
                 bot driver, and netlog (the online‑play diagnostic timeline)
  server/        the authoritative PartyKit room — seats, command log, server‑side bots
apps/
  desktop/       Electron app — hardened shell, 2D board, panels, decision modals, beats,
                 sound, settings, reference chart, online lobby
docs/            rules model, naming system, decisions, deployment, plans, session handoffs
design/          build.py — generates the design canvas AND is the reference impl of the naming
                 rules; make_icon.py — generates the app icon from the logo
```

The dependency direction is strict: **`engine` depends on nothing.** `protocol` depends only on
engine types; `client-core` and `server` depend on engine + protocol; `desktop` depends on
`client-core`. There is exactly one `reduce` code path for all three play modes — the room runs the
same engine and the same bot policy the desktop app does.

---

## Getting started

### Prerequisites

- **Node 20+** (developed on 24), npm 10+ — the version CI pins.
- A desktop OS with a display to launch the Electron app (`npm run dev`, `npm run smoke`). Headless
  CI can still install, typecheck, lint, and run every test, including the integration suite against
  a local room.
- **Python 3** only if you regenerate the design canvas or the app icon (`design/*.py`, stdlib only).

### Install

```bash
npm install     # or npm ci
```

Install scripts are allow‑listed in the root `package.json` (`allowScripts`): `esbuild` for
Vite/Vitest, `workerd` for the PartyKit dev server, `fsevents` on macOS.

**Electron binary:** a ~150 MB platform binary is fetched for the GUI. Where that download is
unavailable — a sandbox, an offline CI — set `ELECTRON_SKIP_BINARY_DOWNLOAD=1`; everything except
launching the app still works, tests included.

### Run the desktop app

```bash
npm run dev
```

This runs `electron-vite dev` for `@boomtown/desktop`: main, preload, and the React renderer with
HMR. The window opens filling the screen.

**Local game.** Pick 2–6 seats, mark each one human or bot (with a 1–10 difficulty), choose the
edition (classic default) and the cash/holdings visibility, then play. Click a highlighted tile in
the rack or on the board to place it; merger decisions surface as a modal. With more than one human
seat, an opaque hand‑off card covers the screen between turns so nobody sees the next player's
tiles.

**Online.** "Play online" creates a room (a six‑character code to share) or joins one by code. Seats
fill as people arrive; bot seats are filled by the room itself. The room is authoritative — it deals,
validates every command, plays the bots, and sends each client only its own filtered view.

By default a dev build talks to `localhost:1999`, so run the room alongside it:

```bash
npm run server:dev      # partykit dev, port 1999
```

A release build talks to the deployed room instead (`apps/desktop/.env.production`), and Settings →
**Online host** overrides both for a self‑hosted deploy.

**Dev app against the deployed room.** Two things stop a plain `npm run dev` from reaching
`boomtown.smromain.partykit.dev`: the dev build defaults to `localhost:1999`, and the dev CSP only
allows `connect-src` to localhost. Override both:

```bash
env -u ELECTRON_RUN_AS_NODE \
  VITE_PARTYKIT_HOST=boomtown.smromain.partykit.dev \
  BOOMTOWN_DEV_CONNECT_SRC="wss://boomtown.smromain.partykit.dev,https://boomtown.smromain.partykit.dev" \
  npm run -w @boomtown/desktop dev
```

- `VITE_PARTYKIT_HOST` — the host the online client dials (see `src/online/hostUrl.ts`).
- `BOOMTOWN_DEV_CONNECT_SRC` — comma‑separated origins added to the dev CSP's `connect-src`
  (`electron/main.ts`). Dev‑only; ignored by packaged builds, which already allow `wss:`/`https:`.
- `env -u ELECTRON_RUN_AS_NODE` — only needed when the shell exports it (e.g. a terminal spawned by
  Claude Code); it makes the Electron binary run as plain Node and the app fails to boot.

**Two dev instances (two‑player test).** Run the block above in one terminal, then a second instance
in another with its own renderer port and profile directory — the seat token lives in the renderer's
`localStorage`, so a shared profile would make the second window resume as the same player instead of
joining as a new one:

```bash
env -u ELECTRON_RUN_AS_NODE \
  BOOMTOWN_DEV_PORT=5273 \
  BOOMTOWN_DEV_USER_DATA="$(mktemp -d)" \
  VITE_PARTYKIT_HOST=boomtown.smromain.partykit.dev \
  BOOMTOWN_DEV_CONNECT_SRC="wss://boomtown.smromain.partykit.dev,https://boomtown.smromain.partykit.dev" \
  npm run -w @boomtown/desktop dev
```

- `BOOMTOWN_DEV_PORT` — renderer port for this instance (`electron.vite.config.ts`); default 5173.
- `BOOMTOWN_DEV_USER_DATA` — a private Electron profile dir for this instance (`electron/main.ts`);
  dev‑only. Create the room in one window, join by its six‑character code in the other.

Both `BOOMTOWN_DEV_PORT` and `BOOMTOWN_DEV_USER_DATA` are unset in normal use and CI.

### Diagnosing online play

`Ctrl`/`Cmd`+`Shift`+`L` opens the online‑play log on any screen: every frame in and out, socket
lifecycle, host resolution and lobby decisions, with a Copy button for bug reports. It captures by
default in a dev build; in a packaged build, Settings → **Log online play** turns it on. Room‑side,
every lobby decision prints one line — visible in `partykit dev`, or `npx partykit tail` against the
deployed room.

---

## Testing

Tests run under a **Vitest workspace** with two projects:

| Project | Environment | Covers |
|---|---|---|
| `engine` | node | `packages/*/test/**` — engine, protocol, ai, client‑core, and the room's own logic (334 tests) |
| `desktop` | jsdom | `apps/desktop/**/*.test.{ts,tsx}` — components via `@testing-library/react`, plus the Electron main‑process modules (221 tests) |

Integration tests live outside both, because they boot a real `partykit dev` room (workerd) and are
too slow for the default suite.

```bash
npm test                # both projects, once (555 tests)
npm run test:watch      # watch mode
npm run test:engine     # just the node project
npm run test:desktop    # just the jsdom project
npm run test:server     # integration: a real PartyKit room, end to end (11 tests)
npm run typecheck       # tsc --noEmit for both tsconfigs
npm run lint            # eslint (flat config)
npm run smoke           # build + boot the real Electron app, verify it renders
```

`npm run smoke` builds the app, launches Electron on the packaged output with
`BOOMTOWN_SMOKE=1`, waits for React to mount the setup screen, asserts **no Node
globals leaked into the renderer** (`require` / `process` / `module` / `global` /
`Buffer`), then exits. The same check runs in `npm run dev` when `BOOMTOWN_SMOKE=1` is set.

It needs a real display. Under bare `Xvfb` with no window manager it has been seen to time out
waiting for the renderer, so treat it as a desktop check, not a CI gate — `.github/workflows/ci.yml`
runs lint, typecheck and `npm test` only.

**What the engine tests guarantee** (`npm run test:engine`):

- Every row of the `docs/rules.md` price/bonus table, for both published editions.
- The motion to liquidate: the window, the register, the quota, and that a failed motion opens its
  backers' books.
- The `docs/naming.md` merge‑naming lineage, byte‑for‑byte against `design/build.py` (including
  Python's round‑half‑to‑even, so `Noquia → Noqu`).
- Determinism: a command log replays to an identical state; a 300‑game seeded fuzz of random legal
  moves runs to completion with no illegal‑move throw.
- Merger sequencing: the placed tile never counts toward size/price/bonus; largest survives;
  defunct chains resolve largest‑first, each fully before the next.
- Bots: every move a policy emits is one the reducer accepts, across a fuzzed full game and every
  pending‑decision type; the same seed replays identically; and a strong bot beats a weak one
  materially more often than chance.
- The room's persistence: every command — human and bot — is in storage *before* its update goes
  out, and a woken room rebuilt from its stored config and log is deep‑equal to the live state,
  including the normal case where no seed was supplied. A log that cannot replay parks the room
  read‑only rather than throwing, because a throw on wake would brick the room code forever.

**And what the integration suite adds** (`npm run test:server`, against a real `partykit dev` room):
a full 1‑human/2‑bot game to a ranked result, three clients each receiving only their own view, a
dropped client resuming its seat on its token, and the lobby getting its room state even when it
subscribes after connecting — the regression behind the "Waiting for the room…" hang.

---

## Building & packaging

### Typecheck / bundle build

```bash
npm run build          # == npm run typecheck (both TS projects)
npm run app:build      # electron-vite build -> apps/desktop/out/{main,preload,renderer}
npm run app:preview    # run the built output
```

`electron-vite` produces three targets: **ESM** main, **CommonJS** sandboxed preload (a sandboxed
preload cannot be an ES module), and a normal Vite + React renderer. Workspace packages resolve to
source, so there is no second rules code path in the bundle.

### Distributable installers

```bash
cd apps/desktop && npm run package    # electron-vite build + electron-builder
```

`apps/desktop/electron-builder.yml` produces a macOS universal `dmg`, Windows `nsis` and Linux
`AppImage`, all named **Boomtown** and carrying the app icon (`apps/desktop/build/icon.png`,
generated from the logo by `python3 design/make_icon.py`). An `afterPack` hook flips the Electron
**fuses** on the packed binary — no `run-as-node`, ASAR integrity on, load only from ASAR.

Releases are cut by pushing a `vX.Y.Z` tag (or running the **Release** workflow with a version).
That builds installers on all three OSes, publishes a GitHub Release, and deploys the PartyKit room
from the same commit. Signing credentials come from repository secrets; without them the workflow
still produces unsigned artifacts. Full detail — including the deployed room and the baked online
host — is in `docs/deploying.md`.

### Toolchain note

`electron-vite` is pinned to **v4**: v5's config types require Vite 6, and Vitest 2 pins Vite 5.
This resolves when the toolchain moves to Vitest 3 / Vite 6 together. Electron is pinned exactly
(44.x) so a packaged build never drifts under the fuses hook.

---

## Design decisions

The full rationale lives in the plan's **Key Technical Decisions** (KTD1–KTD12) and in
`docs/decisions.md`. The load‑bearing ones:

### The ruleset is data, not code

Two published editions disagree on safe size, end trigger, bonus tiers, price bands,
sole‑shareholder policy, dead‑tile handling, the two‑player rule, and split rounding. That is
**configuration, not a fork**: one engine reads a `Ruleset` object and `classic` and `edition2015`
ship as presets.

The payoff came later. `boomtown` — closed books, and a vote that can end the game before any chain
reaches the end size — is a third preset rather than a branch in the engine: it adds two keys
(`forcedVisibility`, `endVote`) and inherits every classic number. **It is the default preset** —
the reconstructions are here so a table that wants the published rules can have them, not as the
thing on offer. Unlike the other two it is *not*
a reconstruction of anyone's rulebook; it is this project's own design, and the docs and the UI say
so rather than presenting three peers. The 2015 secondary‑bonus column fits no multiplier, so
it ships as a literal lookup table verified against the rulebook's worked example.

### A custom headless engine, not a framework

`boardgame.io` was the closest fit — turn‑based, hidden state via `playerView`, generated bots —
but its phase/stage model does not cleanly express Boomtown's **nested, interruptible merger
resolution**, and it couples game state to its own server and storage. The engine here is a pure
TypeScript package with **no I/O**; it is the single source of truth for rules, for all three play
modes, and for the AI. `boardgame.io` and Colyseus patterns still informed the room that came later.

### Command / event reducer with a seeded PRNG

Every action is a typed `Command`. `reduce(state, command)` validates it and returns events plus a
new state, or a **typed rejection** — it never throws for a rule violation. The ordered command
log is both the persistence substrate and the replay/resync mechanism. A single seeded
mulberry32 PRNG carried in state is the *only* randomness anywhere under `packages/engine` —
`Math.random` and `Date.now` are banned by lint, because one unseeded call breaks replay,
reconnection, and bot reproducibility at once.

### Merger resolution is an explicit state machine

The only genuinely sequenced part of the game. The machine yields typed **pending‑decision**
states — `choose-survivor`, `choose-defunct-order`, `dispose-shares` — each naming the seat that
owns it. The turn loop suspends on a pending decision and resumes on the matching command.
Hot‑seat UI, bots, and the server all satisfy decisions through the same command interface.
Progress state (absorbed tiles, resolved order) lives in the serializable snapshot, so the machine
survives the reducer's `structuredClone` between commands.

### A corporation has two names

`baseName` is identity and never changes — held defunct stock, refounding, and the board badge all
key off it. `displayName` is **derived, never stored**: the stem (75% of the base name, taken once
at founding) plus one fragment for every corporation absorbed, in acquisition order. The
merge‑naming code is **ported from `design/build.py`**, not reimplemented from prose — a prose
reimplementation already failed once by returning whole‑word fragments. The assembled name is
checked against a blocklist with a next‑syllable fallback.

### Public / secret state split with `viewFor(seat)`

State is public state + per‑seat secret hand tiles + the bag. `viewFor(seat)` returns public state
plus that seat's own secrets plus counts (bag size, others' hand sizes), and applies the table's
cash/holdings visibility setting. The room serializes only that seat's view to each client — an
online client never receives another player's hand or the bag.
`client-core` adds a `ClientView` on top — the seat's `legalMoves` and per‑hand‑tile effects,
which the renderer cannot compute itself because it never holds full `GameState`.

### `GameTransport` abstracts local and networked play

`localTransport` runs the engine in‑process (delivering updates on a microtask, so the store's
optimistic echo is real and observable); `workerTransport` runs the same `GameSession` in a Web
Worker to keep bot lookahead off the main thread; `socketTransport` speaks to the room over a
WebSocket. Everything above the interface — the Zustand store, dispatch, view reconciliation — is
identical for all three, which is why the panels have no idea whether a game is local or online.

### Desktop first, 2D board

The Electron app is the primary product, not a web app packaged later — though the transport split
keeps a browser build reachable. The board is a **flat CSS grid** (`apps/desktop/src/board/`): the
108 cells sized by `aspect-ratio` so the board scales to fill its space, per‑industry colours,
click‑to‑place, the industry mark on each headquarters. This reverses an earlier "deliberately
basic 3D / React Three Fiber" call — see `docs/decisions.md`. Panels use Radix primitives for
accessible modals and CSS Modules for styling.

### Moments are staged, and hot‑seat is private by construction

Five **beats** mark what matters — a corporation founded, stock bought, a merger, the end announced,
the final standings — as timed, skippable overlays with sound, driven off engine events rather than
sprinkled through the components (`apps/desktop/src/beats/`). Four drop an opaque curtain; the buy
flourish is deliberately light and never pauses play.

That distinction is load‑bearing. In hot‑seat the turn advances the instant a buy resolves, so the
next player's rack is already rendered — the opaque hand‑off card has to cover the screen *then*,
not after the flourish finishes. Anything that covers the screen defers the hand‑off; anything that
doesn't, doesn't. A light beat that got this wrong leaked the next player's hand for a second every
turn, which is `docs/handoffs/2026-09-09-hotseat-and-merger-readability-fixes.md`.

### Electron hardening

`contextIsolation` on, `nodeIntegration` off, `sandbox` on, a narrow preload bridge exposing one
frozen `window.boomtown` namespace, a strict renderer CSP with **no `unsafe-eval`** (applied as a
response header so it covers both the packaged `file://` load and the dev server), and Electron
**fuses** flipped on the packed binary by an `afterPack` hook. The offline engine runs in a renderer
Web Worker; the main process owns window lifecycle only.

### Bots: a `Policy` over the engine, no LLM

A weighted heuristic evaluation (stock‑value delta, merger expected value with majority/minority
awareness, early founding, endgame rush). One 1–10 dial drives two knobs: **lookahead** plies (1–6
greedy, 7–8 one ply, 9–10 two) and a **blunder rate** — a weak bot is a strong bot that fumbles
often, which keeps low difficulty from feeling broken rather than stupid. Hidden‑tile determinization
is left at zero for now. Locally the policy runs in a Web Worker, off the main thread; online the
room plays bot seats inline, since the edge has no worker threads and the policy is synchronous.

### The online room is one authoritative object per game

`packages/server` is a **PartyKit** room: one room object per game code, holding the `GameState` and
applying every command through the same `reduce` the desktop app uses. Clients send commands and
receive their own filtered view — never the bag, never another hand — so a modified client can cheat
no more than it can guess.

Each accepted command is appended to a persisted log **before** its events are observable, which is
what makes the room disposable: it hibernates between messages and rebuilds itself by replaying that
log on wake. Bot seats are played by the room itself, inline, so a game with one human and two bots
needs nobody else connected. A protocol version travels on every connection and a mismatch is
refused at the door, so a stale client can't half‑parse a newer room.

### Online identity is a per‑seat token, not an account

Creating or joining a room mints a session token; reconnection presents it in the query string and
the room re‑binds that seat. No password, no email, no persistence beyond the active game. A seat
stays reserved by its token while its player is away, so a dropped connection is a pause, not a
forfeit.

### Build order: engine first, offline before any server

Phase A proved the engine — especially the merger, where getting it wrong makes everything else
moot — in isolation. Phase B was a fully offline hot‑seat app; C added bots, D the server, E
packaging. Each phase ended at a demoable state, and that order is why the online room could be a
thin authority over an engine that was already trusted.

---

## Where to read more

| File | What it holds |
|---|---|
| `docs/rules.md` | The complete rules model — the two published editions reconciled, the Boomtown variant specified, turn structure, merger sequencing, bonus ties, the full price/bonus table, edition config keys, invariants |
| `docs/naming.md` | The 28‑company pool, the merged‑name rule, flavour accretion, card consolidation |
| `docs/decisions.md` | What was decided and why, what is still open, and the traps already hit |
| `docs/deploying.md` | Deploying the PartyKit room and building/signing the desktop installers; the app's icon and name |
| `docs/plans/` | The architecture plan (20 units, KTD1–12, verification contract), the online‑multiplayer substrate plan, and the game‑feel plan |
| `docs/handoffs/` | What each recent session diagnosed and landed — the running record of bugs and fixes |
| `design/build.py` | Generates the design canvas **and** is the reference implementation of the naming rules — port it, don't reimplement it |
| `design/make_icon.py` | Generates the app icon from the logo — stdlib only; re‑run it after changing the logo |

Published design canvas:
<https://claude.ai/code/artifact/f1b58905-2da0-4cd0-9c2e-8d65624260a3>
