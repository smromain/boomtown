# Architecture — the system as it stands

What exists, where it lives, and how the pieces reach each other. This describes the code as it is
today, not the plan it was built from; for that see `plans/` and for why any of it is shaped this
way see `decisions.md`.

## The shape in one paragraph

A pure TypeScript rules engine with no I/O sits at the bottom and knows nothing about screens or
sockets. Above it, a client layer owns state and talks to the engine through one interface —
`GameTransport` — which has three implementations: in-process, in a Web Worker, and over a
WebSocket to an authoritative room. The Electron app is a consumer of that client layer and cannot
tell which transport it has. The room is a consumer of the same engine and the same bot policy. So
hot-seat, bots and online play are three arrangements of one rules code path, which is why a rules
change cannot land in one mode and miss another.

```
                       ┌──────────────────────────────────────────┐
  apps/desktop         │  React renderer: board, panels, modals,  │
  (Electron)           │  beats, lobby, settings, sound           │
                       └───────────────┬──────────────────────────┘
                                       │ dispatch(command) / store subscription
                       ┌───────────────▼──────────────────────────┐
  packages/client-core │  GameClient · Zustand store · reconcile  │
                       │  bot driver · netlog                     │
                       └───────────────┬──────────────────────────┘
                                       │ GameTransport
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
     localTransport            workerTransport           socketTransport
     (same thread)           (renderer Web Worker)        (WebSocket)
              │                        │                        │
              │  GameSession           │  GameSession           │  wire messages
              └───────────┬────────────┘                        │  @boomtown/protocol
                          │                                     │
                  ┌───────▼─────────┐                 ┌─────────▼──────────────┐
                  │ packages/engine │◄────────────────│ packages/server        │
                  │ reduce/viewFor  │   same engine   │ PartyKit room + bots   │
                  └───────▲─────────┘                 └────────────────────────┘
                          │ legalMoves / evaluate
                  ┌───────┴─────────┐
                  │ packages/ai     │
                  └─────────────────┘
```

## Packages

### `packages/engine` — the rules (≈3,100 lines)

Headless and dependency-free. Public surface in `src/index.ts`; the load-bearing parts:

| Area | Files | Notes |
|---|---|---|
| Rulesets | `ruleset/{types,classic,edition2015,boomtown}.ts` | `Ruleset` is data. `PRESETS` maps id → preset; `boomtown` is `defaultRuleset` |
| State & views | `state.ts` | `GameState`, `PendingDecision`, and `viewFor(seat)` — the only way state leaves the engine |
| Setup | `setup.ts` | `createGame(SetupOptions)`; draws one company per industry, deals, seats, resolves the seed |
| Reducer | `reducer/index.ts` + `place/found/buy/turn/endcheck/endgame/motion` | `reduce(state, command)` → events + state, or a typed error. `replay(log)` rebuilds |
| Merger | `reducer/merge/{machine,bonuses}.ts` | The sequenced state machine and the bonus/tie maths |
| Pricing | `pricing.ts` | Price bands and bonus rows, including the 2015 secondary lookup |
| Queries | `queries/{legalMoves,evaluate}.ts` | What the AI and the UI both read |
| Naming | `naming/{index,syllables,blocklist}.ts` | `stem`, `fragment`, `displayName`, `accretedFlavour` |
| Pool | `pool.ts` | The 28 companies, seven industries, tiers and colours — **the pool of record** |
| Randomness | `rng.ts` | Seeded mulberry32. The only source of randomness in the package |

Rules that hold inside this package: no I/O, no `Math.random`, no `Date.now`, no throwing for an
illegal move, and `structuredClone`-safe state (the merger machine keeps its progress in the
serialisable snapshot because the reducer clones between commands).

### `packages/protocol` — the wire contract (≈600 lines)

Everything two processes must agree on, and nothing else.

- `messages.ts` — `ClientMessage` = `hello | create-room | knock | admit | decline | set-locked |
  eject | start | command`; `RoomMessage` = `welcome | waiting | room-state | update | error`.
- `dto.ts` — the serialisable shapes of a client view and an engine event.
- `errors.ts` — `ProtocolError` codes (`wrong-version`, `room-full`, `bad-token`, `rate-limited`,
  `room-locked`, `knock-declined`, `not-host`, `unknown-knock`, …) plus forwarded engine errors.
- `validate.ts` — `parseClientMessage` is the boundary between untrusted bytes and `reduce`:
  a 16 KB frame ceiling, a prototype-pollution-safe reviver, and a structural check per message
  type. It vouches for shape, never legality — the engine owns whether a move is allowed.
- `addresses.ts` — `mintRoomAddress` (160 bits), `mintTicket` (8 characters), `normaliseTicket`,
  `formatTicket`, over a 32-character alphabet with no O/I/L/U.
- `version.ts` — `PROTOCOL_VERSION`, a plain integer string that moves only when the wire breaks.

### `packages/ai` — bots (≈520 lines)

A `Policy` over the engine's own `legalMoves` and `evaluate`. No LLM anywhere.

- `heuristic.ts` / `policy.ts` — weighted scoring (stock-value delta, merger expected value with
  majority/minority awareness, early founding, endgame rush) with optional lookahead.
- `difficulty.ts` — one 1–10 dial driving two knobs: lookahead plies (1–6 greedy, 7–8 one ply, 9–10
  two) and a blunder rate. A weak bot is a strong bot that fumbles, which reads as human rather than
  broken.
- `ledger.ts` — a pure fold over the public log into per-seat, per-corporation purchase tallies,
  anchored to the publicly known issued total.
- `redact.ts` — `redactFor` / `beliefState`: a consistent `GameState` with the bot's own hand intact
  and every other secret replaced by a plausible deal, so a policy cannot read a hidden value even
  after someone deepens the lookahead.
- `vote.ts` — `backsMotion`, `wouldWinBySettlingNow`: a bot votes on where it *stands*, not on its
  balance. Routing the vote through the generic evaluator made every bot vote yes, because
  settlement realises everyone's equity at once.

### `packages/client-core` — state and transports (≈1,300 lines)

- `session.ts` — `GameSession` wraps engine state, applies commands, emits per-seat updates.
- `transport/types.ts` — the `GameTransport` seam.
- `transport/local.ts` — in-process, delivering updates on a microtask so the store's optimistic
  echo is real and observable.
- `transport/worker.ts` — the same session in a Web Worker, keeping bot lookahead off the main
  thread.
- `transport/socket.ts` — `partysocket` to the room, plus `SocketExtras` for the lobby-only verbs
  (`admit`, `decline`, `setLocked`, `eject`, `waitingAtDoor`).
- `store.ts` / `dispatch.ts` / `reconcile.ts` — a Zustand store, `createGameClient`, and view
  reconciliation shared by all three transports.
- `view.ts` — `clientView` adds what the renderer cannot compute without full state: this seat's
  `legalMoves` and the effect of each hand tile.
- `bots.ts` — `attachBotDriver`, which hands each bot seat a `beliefState` and watchdogs a stuck one.
- `netlog.ts` — the online-play diagnostic timeline the overlay renders.

### `packages/server` — the authoritative room (≈2,000 lines)

One PartyKit room object per game. `room.ts` is the PartyKit entry point; everything else is
testable core. Detail in `online-play.md`; the file map:

| File | Owns |
|---|---|
| `room.ts` | The socket lifecycle, the validation gate, rate limits, the message switch, alarms |
| `game-room.ts` | The game itself: config, seats, command log, server-side bots, room state |
| `seats.ts` | `SeatTable` (occupancy, tokens, ejection), name cleaning, `configError`, `humanlessRoom` |
| `admission.ts` | The `Door`: knocks, TTL, declines that stick, the lock |
| `directory.ts` | A separate party mapping ticket → room address, with a 15-minute TTL |
| `tokens.ts` | 256-bit seat tokens and constant-time comparison |
| `limits.ts` | Token-bucket rate limiting, connection cap, validation-failure strikes |
| `lifecycle.ts` | The command ceiling and the idle-expiry alarm |
| `storage.ts` | `CommandLog` over PartyKit storage, and a `MemoryStore` for tests |

### `apps/desktop` — the Electron app

**Main process** (`electron/`): `main.ts` (window, CSP header, dev overrides, smoke check),
`window.ts`, `preload.ts` (one frozen `window.boomtown`), `csp.ts`, `menu.ts`, `updater.ts`,
`distribution.ts` (store-managed updates), `afterPack.mjs` (fuses), `itch.mjs` (channel staging).

**Renderer** (`src/`), by folder:

| Folder | What is in it |
|---|---|
| `art/` | `Skyline` (the vector silhouette, four surfaces) and `NightSkyline` (the launch backdrop) |
| `audio/` | Effects and music managers, two independent volumes |
| `beats/` | The beat queue, triggers off engine events, and six beats: founding, buy, merger, motion, endgame, victory |
| `board/` | The 108-cell CSS grid and click-to-place |
| `client/` | The `GameClient` provider and `ownView` |
| `copy/` | `constants.json` — every word the app says — plus `copy.ts`, `Rich.tsx` and usage tests |
| `debug/` | The netlog overlay (`Ctrl`/`Cmd`+`Shift`+`L`) and `dump.ts` |
| `decisions/` | The decision modal and its five prompts: found, survivor, defunct order, disposal, vote |
| `game/` | The game screen and its furniture — header, action bar, corporation band, shareholders, story, rack, hand-off, motion panel, marquee |
| `lobby/` | `CreateJoin` and `SeatList` — creating or joining a room, the knock queue, the lock |
| `online/` | `onlineGame` (wiring a room into a `GameClient`), `hostUrl` (host resolution + ticket lookup), `randomName` |
| `panels/` | Buy controls and event text |
| `reference/` | The stock reference chart, generated from the ruleset |
| `settings/` | The settings dialog and the persisted `Settings` (with migrations) |
| `setup/` | The new-game screen: edition, seats, visibility |
| `ui/` | `Button`, `Panel`, `clipboard` |

## How a command travels

**Local game.** The renderer dispatches a `Command` → the store records an optimistic echo →
`localTransport` or `workerTransport` hands it to `GameSession` → `reduce` → events + new state →
a per-seat update → `reconcile` replaces the echo with the authoritative view → beats fire off the
events → the bot driver, if the next seat is a bot, chooses from a redacted state and dispatches.

**Online game.** The same dispatch → `socketTransport` sends `{type:'command'}` →
`parseClientMessage` vouches for its shape → rate limits and seat authority are checked → the room
runs the *same* `reduce` → the command is appended to the persisted log **before** its events are
observable → each connection receives only `viewFor(itsOwnSeat)` → any consecutive bot seats are
played by the room inline → the renderer above the transport behaves exactly as it does locally.

The asymmetries worth knowing: a room never sends another seat's hand or the bag; the room is the
only authority on whose turn it is; and a client's optimistic echo is discarded rather than merged
if the room disagrees.

## Hidden information

Three layers, each narrower than the one below:

1. `GameState` — everything, including all hands and the bag. Lives in the engine, the local
   session, or the room. Never serialised to a client.
2. `viewFor(seat)` → `PlayerView` — public state, that seat's own secrets, and counts (bag size,
   others' hand sizes). Applies the table's cash/holdings visibility, and the per-seat exception
   for anyone who backed a failed motion.
3. `clientView(view)` → `ClientView` — adds derived affordances (`legalMoves`, per-hand-tile
   effects) that the renderer cannot compute because it never holds full state.

Bots sit at a fourth point: `beliefState` gives a policy a full-shaped `GameState` whose hidden
parts are invented but consistent, because `reduce` needs a whole state to look ahead.

## Build topology

`electron-vite` produces three targets from one source tree: an **ESM** main process, a
**CommonJS** sandboxed preload (a sandboxed preload cannot be an ES module), and a Vite + React
renderer. Workspace packages resolve to source, so the bundle contains no second copy of the rules.
`vite.browser.config.mts` reuses the renderer options so the browser way of running the app cannot
drift from the Electron way.

Toolchain pins that are load-bearing: `electron-vite` at v4 (v5's config types want Vite 6, and
Vitest 2 pins Vite 5), and Electron pinned exactly so a packaged build never drifts under the fuses
hook.

## What is generated, and from what

| Output | Generator | Note |
|---|---|---|
| `design/*.dc.html`, `design/boomtown.html` | `design/build.py` | Also the reference implementation of the naming rules |
| `apps/desktop/build/icon.png` | `design/make_icon.py` | Stdlib only; re-run after changing the logo |
| `apps/desktop/src/assets/night/*.png` | `design/make_skyline.py` | Recolours `design/skyline.psd` onto the palette; needs `psd-tools` + `pillow` |
| `docs/screenshots/web/*.webp` | `docs/screenshots/make_web_copies.py` | Half-size copies for the README |

None of these are hand-edited. Edit the generator.
