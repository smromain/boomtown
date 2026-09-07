# Boomtown

A desktop implementation of the board game **Acquire** — the mechanics only, renamed and
re‑themed. Two published editions ship as data, the sequenced merger is modelled exactly, and the
same headless engine drives local hot‑seat, AI opponents, and (later) online play.

> The rules and mechanics of a board game are not protectable. **ACQUIRE** and the original
> corporation names are live Hasbro / Avalon Hill trademarks and are not used here — every name in
> this project is original or a parody of a defunct brand. Nothing has been trademark‑searched; see
> `docs/decisions.md`.

---

## Status

| Phase | Scope | State |
|---|---|---|
| **A — Engine** | Rules, ruleset config, price/bonus tables, board, seeded RNG, turn reducer, merger state machine, end‑game & scoring, merge‑naming, legal‑move enumeration + evaluator | **Done** — `packages/engine`, 224 tests, full `docs/rules.md` and `docs/naming.md` parity |
| **B — Desktop** | Hardened Electron shell, `client-core` (transport + store), 2D board, 2D panels, merger‑decision UI, local game setup | **Done** — `apps/desktop` + `packages/client-core`, offline hot‑seat fully playable |
| **C — AI** | Non‑LLM bot policy with a difficulty dial, auto‑play loop | Not started |
| **D — Online** | `protocol` package, authoritative server, event‑log persistence + reconnection, socket transport + lobby | Not started |
| **E — Packaging** | electron‑builder targets, auto‑update, settings, release workflow | Not started |

**303 tests** pass (`npm test`); typecheck and lint are clean. The full plan is
`docs/plans/2026-09-06-1315-feat-boomtown-architecture-plan.md`.

---

## Repository layout

A pnpm‑style monorepo run with **npm workspaces** (`packages/*`, `apps/*`).

```
packages/
  engine/        headless rules — no I/O. createGame, reduce, viewFor, legalMoves, evaluate.
  protocol/      wire contract for online play (scaffold; built in Phase D)
  ai/            non‑LLM bot Policy (scaffold; built in Phase C)
  client-core/   GameSession, GameTransport, LocalTransport, Zustand store, reconcile
  server/        authoritative multiplayer server (scaffold; built in Phase D)
apps/
  desktop/       Electron app — hardened shell, 2D board, 2D panels, decision modal
docs/            rules model, naming system, decisions, and the architecture plan
design/          build.py — generates the design canvas AND is the reference impl of the naming rules
```

The dependency direction is strict: **`engine` depends on nothing.** `protocol` depends only on
engine types; `client-core` and `server` depend on engine + protocol; `desktop` depends on
`client-core`. There is exactly one `reduce` code path for all three play modes.

---

## Getting started

### Prerequisites

- **Node 20+** (developed on 24). npm 10+.
- A desktop OS with a display to run the Electron app (`npm run dev` / `npm run smoke`). Headless
  CI can still install, typecheck, lint, and run every unit test; the smoke boot needs `xvfb` on
  headless Linux.

### Install

```bash
npm install
```

The first install prints an `allow-scripts` notice for `esbuild` (used by Vite/Vitest). Approve it:

```bash
npm approve-scripts esbuild
```

**Electron binary:** `npm install` downloads a ~150 MB Electron binary. In a sandbox or CI that
cannot reach the download, set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` — everything except launching the
GUI still works.

### Run the desktop app (offline hot‑seat)

```bash
npm run dev
```

This runs `electron-vite dev` for `@boomtown/desktop`: main, preload, and the React renderer with
HMR. The setup screen lets you pick 2–6 seats, the edition (classic default), and the
cash/holdings visibility, then drops you on the board. Click a highlighted tile in the hand rack or
on the board to place it; the merger decisions surface as a modal.

---

## Testing

Tests run under a **Vitest workspace** with two projects:

| Project | Environment | Covers |
|---|---|---|
| `engine` | node | `packages/*/test/**` — the engine and `client-core` |
| `desktop` | jsdom | `apps/desktop/**/*.test.{ts,tsx}` — components via `@testing-library/react` |

```bash
npm test                # everything, once (304 tests)
npm run test:watch      # watch mode
npm run test:engine     # just the node project
npm run test:desktop    # just the jsdom project
npm run typecheck       # tsc --noEmit for both tsconfigs
npm run lint            # eslint (flat config)
npm run smoke           # build + boot the real Electron app, verify it renders
```

`npm run smoke` builds the app, launches Electron on the packaged output with
`BOOMTOWN_SMOKE=1`, waits for React to mount the setup screen, asserts **no Node
globals leaked into the renderer** (`require` / `process` / `module` / `global` /
`Buffer`), then exits. It needs a display (or `xvfb` on headless Linux). The same
check runs in `npm run dev` when `BOOMTOWN_SMOKE=1` is set.

**What the engine tests guarantee** (`npm run test:engine`):

- Every row of the `docs/rules.md` price/bonus table, for both editions.
- The `docs/naming.md` merge‑naming lineage, byte‑for‑byte against `design/build.py` (including
  Python's round‑half‑to‑even, so `Noquia → Noqu`).
- Determinism: a command log replays to an identical state; a 300‑game seeded fuzz of random legal
  moves runs to completion with no illegal‑move throw.
- Merger sequencing: the placed tile never counts toward size/price/bonus; largest survives;
  defunct chains resolve largest‑first, each fully before the next.

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

**Not built yet** — this is Phase E (U19). The plan is `electron-builder` with:

- macOS `dmg` (arm64 + x64), Windows `nsis`, Linux `AppImage`
- an `afterPack` hook that flips the Electron **fuses** already declared in
  `apps/desktop/electron/fuses.ts` (no `run-as-node`, ASAR integrity on, load only from ASAR)
- a tagged GitHub release workflow that builds and signs

Until then, `npm run app:build` gives you a runnable unpacked app under `apps/desktop/out/`.

### Toolchain note

`electron-vite` is pinned to **v4**: v5's config types require Vite 6, and Vitest 2 pins Vite 5.
This resolves when the toolchain moves to Vitest 3 / Vite 6 together.

---

## Design decisions

The full rationale lives in the plan's **Key Technical Decisions** (KTD1–KTD12) and in
`docs/decisions.md`. The load‑bearing ones:

### The ruleset is data, not code

Two published editions disagree on safe size, end trigger, bonus tiers, price bands,
sole‑shareholder policy, dead‑tile handling, the two‑player rule, and split rounding. That is
**configuration, not a fork**: one engine reads a `Ruleset` object; `classic` and `edition2015`
ship as presets and classic is the default. The 2015 secondary‑bonus column fits no multiplier, so
it ships as a literal lookup table verified against the rulebook's worked example.

### A custom headless engine, not a framework

`boardgame.io` was the closest fit — turn‑based, hidden state via `playerView`, generated bots —
but its phase/stage model does not cleanly express Boomtown's **nested, interruptible merger
resolution**, and it couples game state to its own server and storage. The engine here is a pure
TypeScript package with **no I/O**; it is the single source of truth for rules, for all three play
modes, and for the AI. `boardgame.io` and Colyseus patterns still inform the Phase D server.

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
cash/holdings visibility setting. The server will serialize only `viewFor(seat)` to each client.
`client-core` adds a `ClientView` on top — the seat's `legalMoves` and per‑hand‑tile effects,
which the renderer cannot compute itself because it never holds full `GameState`.

### `GameTransport` abstracts local and networked play

`LocalTransport` runs the engine in‑process (delivering updates on a microtask, so the store's
optimistic echo is real and observable); `workerTransport` runs the same `GameSession` in a Web
Worker to keep bot lookahead off the main thread; `SocketTransport` (Phase D) speaks to the
server. Everything above the interface — the Zustand store, dispatch, view reconciliation — is
identical for all three.

### Desktop first, 2D board

The Electron app is the primary product, not a web app packaged later — though the transport split
keeps a browser build reachable. The board is a **flat CSS grid** (`apps/desktop/src/board/`): the
108 cells sized by `aspect-ratio` so the board scales to fill its space, per‑industry colours,
click‑to‑place, the industry mark on each headquarters. This reverses an earlier "deliberately
basic 3D / React Three Fiber" call — see `docs/decisions.md`. Panels use Radix primitives for
accessible modals and CSS Modules for styling.

### Electron hardening

`contextIsolation` on, `nodeIntegration` off, `sandbox` on, a narrow preload bridge exposing one
frozen `window.boomtown` namespace, a strict renderer CSP with **no `unsafe-eval`** (applied as a
response header so it covers both the packaged `file://` load and the dev server), and build‑time
fuses. The offline engine runs in a renderer Web Worker; the main process owns window lifecycle
only.

### Bots: a `Policy` over the engine, no LLM

Phase C. A weighted heuristic evaluation (stock‑value delta, merger expected value with
majority/minority awareness, early founding, endgame rush) with optional shallow lookahead and
determinized sampling of hidden tiles. Difficulty scales three knobs — lookahead plies,
determinization sample count, blunder rate. It runs off the main thread and can be swapped for a
search‑based policy behind the same interface.

### Online identity is a per‑seat token, not an account

Phase D. Creating or joining a room mints a session token; reconnection presents it. No password,
no email, no persistence beyond the active game.

### Build order: engine first, offline before any server

Phase A proved the engine — especially the merger, where getting it wrong makes everything else
moot — in isolation. Phase B is a fully offline hot‑seat app. Phase C adds bots, Phase D the
server, Phase E packaging. Each phase ends at a demoable state.

---

## Where to read more

| File | What it holds |
|---|---|
| `docs/rules.md` | The complete rules model, reconciled from both editions — turn structure, merger sequencing, bonus ties, the full price/bonus table, edition config keys, invariants |
| `docs/naming.md` | The 28‑company pool, the merged‑name rule, flavour accretion, card consolidation |
| `docs/decisions.md` | What was decided and why, what is still open, and the traps already hit |
| `docs/plans/2026-09-06-1315-feat-boomtown-architecture-plan.md` | The architecture plan — 20 units, KTD1–12, verification contract |
| `design/build.py` | Generates the design canvas **and** is the reference implementation of the naming rules — port it, don't reimplement it |

Published design canvas:
<https://claude.ai/code/artifact/f1b58905-2da0-4cd0-9c2e-8d65624260a3>
