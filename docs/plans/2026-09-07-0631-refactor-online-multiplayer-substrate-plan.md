---
title: Online Multiplayer Substrate - Plan
type: refactor
date: 2026-09-07
topic: online-multiplayer-substrate
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# Online Multiplayer Substrate - Plan

## Goal Capsule

- **Objective:** Two or more people on different machines can play a full game of Boomtown online by sharing a room code — the hidden state (bag, hands) stays authoritative, a dropped player rejoins and resumes their seat, and an interrupted room recovers and continues, all without anyone operating a server.
- **Means:** Run each room as one PartyKit edge object that *is* the authoritative `GameSession`, persisting its command log; connect the desktop app through a `SocketTransport` that satisfies the existing `GameTransport` interface.
- **Product authority:** `docs/rules.md` and `docs/naming.md` remain the rules authority. `docs/plans/2026-09-06-1315-feat-boomtown-architecture-plan.md` owns Boomtown's overall architecture and sequencing; this plan revises that plan's KTD6 and the Phase D units (U15–U18), and adds a knock-on to U19. Requirements R12 and R13 of the architecture plan are unchanged in intent — this plan changes only how they are met.
- **Open blockers:** None blocking planning. Two items are deferred to planning (see Outstanding Questions): where the room code physically lives in the repo, and the exact shape of the reconnect banner.
- **Enrichment:** This is the WHAT record. The HOW — revised KTD6, new KTD13, rewritten units U15–U19 — was folded into `docs/plans/2026-09-06-1315-feat-boomtown-architecture-plan.md` on 2026-09-07. `ce-work` executes Phase D from that plan.
- **Execution profile:** One revision pass. Phase D remains a single demoable milestone — an online room-code game played across two machines — reached with materially less custom infrastructure than the current KTD6.
- **Tail ownership:** Standard `ce-work` tail (branch, tests, commits). Deployment of the PartyKit room is `partykit deploy`, run by the maintainer; there is no server host to provision.

---

## Product Contract

### Summary

Replace the architecture plan's hand-rolled WebSocket server (KTD6 — a Node `ws` process, a room manager, a JSON-lines event log) with PartyKit: one edge room object per game that holds the authoritative `GameState`, applies every command through the same `reduce`, sends each client only its `viewFor(seat)`, and appends each accepted command to durable per-room storage so a game survives disconnects, evictions, and redeploys within a session. The desktop app connects through a `SocketTransport` that implements the existing `GameTransport` interface over `partysocket`. Bots play online exactly as they do locally.

### Problem Frame

Phases A–C of the architecture plan are built: the pure engine (`reduce`, `viewFor(seat)`, `replay()`), the `GameTransport` seam with two working implementations (`LocalTransport`, `workerTransport`), `GameSession` as the stateful `reduce` wrapper, and the non-LLM bot `Policy` with an auto-play driver. Phase D — online play — is not started; `packages/protocol` and `packages/server` are still `export {}` scaffolds.

The architecture plan's KTD6 specifies building the online substrate by hand: a minimal `ws` server, a room manager, and an append-only JSON-lines store, run on a small VPS. That plan's "Alternative Approaches Considered" section evaluated and rejected boardgame.io (its phase/stage model does not express the nested interruptible merger cleanly) and Colyseus (schema-sync re-couples engine state shape to the transport). Both rejections still hold.

What has changed is the ground the decision stands on. The engine, the transport seam, and the bot policy now exist and are proven, so the constraints on a multiplayer substrate are concrete rather than projected. For a friends-only hobby game, a self-hosted server is carrying cost — uptime, TLS, patching, a bill — with no matching benefit. A platform where "a room" is a first-class serverless primitive with WebSocket and durable storage built in collapses the room manager and the crash-recovery store into platform features, leaving a small amount of glue over code that is already written.

### Key Decisions

- **A PartyKit room object is the authoritative `GameSession`.** One room per game. It holds the full `GameState`, reduces every command, and serializes only `viewFor(seat)` to each client — the public/secret split is unchanged. (session-settled: user-directed — chosen over the architecture plan's self-hosted `ws` server, and over a zero-infrastructure peer-to-peer host: the user wants no server to operate but will deploy code. Governs R1, R2, R3.)
- **PartyKit specifically, not raw Cloudflare Durable Objects.** Accept a thin framework layer (`onConnect`/`onMessage`/`onClose`, URL room routing, `party.storage`, a matching client lib) for the boilerplate it removes. (session-settled: user-directed — chosen over hand-writing the Durable Object class, and over leaving the platform choice to planning: fastest path, least to learn. Governs R1.)
- **Friends-only trust model.** A room code is shared out-of-band; anyone with it can take an open seat. The room object validates every command through `reduce` and never trusts a client, but does nothing about griefing. (session-settled: user-directed — chosen over a host-lock lobby and over public games with matchmaking: minimal server policing. Governs R4, R6.)
- **Persist the command log; replay on wake.** Every accepted command is appended to the room's durable storage before its events go out. On any wake — hibernation, eviction, redeploy — the room replays its log through `replay()` and continues. (session-settled: user-directed — chosen over holding state only in memory, and over cross-day persistence: fully meets R7 and R9, and keeps the deferred replay/spectate viewer trivially reachable. Governs R7, R9.)
- **`SocketTransport` wraps `partysocket`.** The desktop transport implements the existing `GameTransport` interface using `partysocket` for reconnect and backoff, so `client-core` and every panel stay transport-agnostic. (session-settled: user-directed — chosen over hand-rolling the reconnect loop on a raw `WebSocket`: do not re-solve backoff. Governs R11.)
- **Bots run inline in the room object.** The edge runtime has no Node worker threads; the bot `Policy` is synchronous, so the room object calls it directly when it is a bot's turn. (session-settled: user-directed — chosen over keeping bots a local-only feature: reuses the existing bot package unchanged. Governs R8.)
- **The host URL is baked into the build, overridable in settings.** The release build embeds the maintainer's deployed PartyKit host; a settings field lets a technical user point at their own deployment; a dev build points at the local PartyKit dev server. (session-settled: user-directed — chosen over an always-baked-in URL and over an always-user-entered one: zero setup for players, still forkable. Governs R12, R13.)
- **The `protocol` package stays, shrunk to the application message contract.** PartyKit owns the transport frame, so `protocol` carries only the app-level message union (command, events, pending-decision, error, room-state, hello/welcome), the serialized `viewFor(seat)` DTO shape, and a protocol version check. (Governs R10.)

### Requirements

#### The authoritative room

- R1. Each online game runs as one PartyKit room object addressed by a room code. The platform routes a connection for a given code to that room's single instance; there is no separate room-manager process or room registry to build.
- R2. The room object holds the authoritative `GameState` and is the only place `reduce` runs for that game. It imports `@boomtown/engine` directly; no rules logic is reimplemented for the server.
- R3. On every command the room object rejects it if it is out of turn or illegal per `reduce`, otherwise applies it and sends `viewFor(seat)` events to each connected client. A pending merger decision is sent only to the seat that owns it.
- R4. A client's connection is bound to exactly one seat in one room. The room mints a per-seat session token on join (no account, no password, no persistence beyond the game) and a reconnecting client presents that token to resume its seat.
- R5. The room enforces seat capacity: it accepts joins up to the configured seat count, rejects an over-capacity join with a typed error, and starts the game when seats are filled or the room creator starts it.
- R6. The room applies the table's cash/holdings visibility setting (open or hidden) to every `viewFor(seat)` it sends, in every mode. No client ever receives another seat's hand tiles or the bag contents — a captured payload for one seat proves this.

#### Durability and recovery

- R7. Every accepted command is appended to the room object's durable storage before its resulting events are dispatched. A crash between the two loses nothing.
- R8. Bot and empty seats are played by the engine's bot `Policy`, run inline in the room object on a bot's turn. Difficulty is configured at room creation, as in local play. The bot resolves every pending decision type without stalling the room.
- R9. On any wake — hibernation, platform eviction, or a code redeploy mid-game — the room object rebuilds its authoritative state by replaying its stored command log through the engine, then continues. The replayed state is deep-equal to the state the live run held.

#### The wire contract

- R10. One `protocol` package defines the application message envelopes (command, events, pending-decision, error, room-state, hello/welcome), the serialized shape of `viewFor(seat)` and of events, and a protocol version carried in `hello`. A version mismatch is rejected with a typed error. No engine-internal type crosses the wire raw.

#### The desktop client

- R11. The desktop app plays an online game through a `SocketTransport` that satisfies the same `GameTransport` contract as `LocalTransport` — `client-core`, the store, and every panel behave identically whether wired to local or socket transport. A dropped connection reconnects and restores the current view without a reload.
- R12. The desktop app has a create-a-room / join-with-a-code flow: the creator sees the room code to share; a joiner enters a code and a display name. A seat list shows seats, which are filled, and bot seats, with a disconnect-and-retry banner while a connection is down.
- R13. The PartyKit host URL used by the client defaults to a value baked in at build time, with a settings field that overrides it. A development build targets the local PartyKit dev server.

### Actors

- A1. **Room creator** — starts a room, shares the code out-of-band, and starts the game. Has no special powers during play beyond starting; not a moderator.
- A2. **Joiner** — enters a room code and a display name, takes an open seat, plays their turns.
- A3. **The room object** — the authoritative referee. Holds hidden state, validates and applies every command, filters each client's view, persists the command log, plays bot seats, and recovers itself on wake.
- A4. **Bot seat** — a seat with no human, played by the engine `Policy` inside A3.

### Key Flows

- F1. Create and start a room
  - **Trigger:** A1 chooses "play online" and creates a room.
  - **Steps:** The client connects to the room object for a fresh code; the room reports empty room-state; A1 shares the code; A2s join and take seats (F2); A1 starts; the room deals via the engine and sends each seat its opening `viewFor`.
  - **Covers R1, R4, R5, R12.**

- F2. Join by code
  - **Trigger:** A2 enters a room code and display name.
  - **Steps:** The client connects to that room object; the room checks capacity (R5), assigns an open seat, mints a session token (R4), and broadcasts updated room-state; the client stores the token.
  - **Covers R1, R4, R5, R12.**

- F3. A turn, online
  - **Trigger:** It is a connected human seat's turn.
  - **Steps:** The client dispatches a command through `SocketTransport`; the room validates it per `reduce` (R3), appends it to durable storage (R7), applies it, and sends `viewFor(seat)` events to each client — the pending decision, if any, only to its owner; a bot seat's turn is played inline by the room (R8).
  - **Covers R2, R3, R6, R7, R8, R11.**

- F4. Drop and reconnect
  - **Trigger:** A player's connection drops mid-game (sleep, network blip).
  - **Steps:** `partysocket` retries with backoff; the client shows the disconnect banner (R12); on reconnect the client re-presents its session token; the room re-binds the seat and sends the current `viewFor`; the banner clears.
  - **Covers R4, R11, R12.**

- F5. Room recovery
  - **Trigger:** The room object wakes from hibernation or eviction, or new code is deployed mid-game.
  - **Steps:** The room reads its stored command log, replays it through the engine to rebuild authoritative state (R9), and resumes serving connected clients their current `viewFor`.
  - **Covers R7, R9.**

### Acceptance Examples

- AE1. Hidden-state leak check
  - **Covers R6.**
  - **Given** a 3-seat online game in progress with the visibility setting "hidden".
  - **When** the payload stream to seat B is captured for a full turn.
  - **Then** it contains none of seat A's or seat C's hand tiles, none of the bag contents, and no opponent cash or holdings figures.

- AE2. Reconnect resumes the same seat
  - **Covers R4, R11.**
  - **Given** a player in seat 2 of an online game whose connection has dropped.
  - **When** their client reconnects and presents the seat-2 session token.
  - **Then** they are re-bound to seat 2 (not a new seat, not rejected) and receive the current game view, including any pending decision they own.

- AE3. Redeploy mid-merger
  - **Covers R7, R9.**
  - **Given** an online game paused on a pending merger disposal decision.
  - **When** the room object is evicted and woken again (or new server code is deployed).
  - **Then** the room replays its command log, the pending disposal decision is still open and addressed to the same seat, and play continues correctly from that point.

- AE4. Over-capacity join
  - **Covers R5.**
  - **Given** an online room whose seats are all filled.
  - **When** another client tries to join with the code.
  - **Then** the join is rejected with a typed error the client can display, and no seat state changes.

- AE5. Out-of-turn command
  - **Covers R3.**
  - **Given** an online game where it is seat 0's turn.
  - **When** seat 1's client sends a place-tile command.
  - **Then** the room rejects it with the engine's typed error and no state changes.

- AE6. Transport parity
  - **Covers R11.**
  - **Given** a scripted non-merge turn.
  - **When** it is run once with the store wired to `LocalTransport` and once wired to `SocketTransport` against a room object.
  - **Then** the store's observable state transitions are the same in both runs.

### Success Criteria

- A full classic-edition game is played start to finish in an online room across two machines, ending with a correct ranking, including at least one multi-corporation merger resolved through the pending-decision flow.
- A player who closes their laptop lid mid-game and reopens it rejoins the same seat and finishes the game.
- The hidden-state leak check (AE1) passes against a real captured payload.
- A mid-game redeploy of the room code does not lose or corrupt an in-progress game (AE3).
- The maintainer deploys the room with a single `partykit deploy`; players need no configuration.

### Scope Boundaries

#### Deferred for later — not precluded by this substrate

- **Asynchronous and cross-day games** — long-lived rooms, turn notifications, explicitly resuming a room hours or days later. The command log is already durable; what is missing is lobby UX for rejoining an old room.
- **A replay / spectate viewer** built on the stored command log.
- **Automatic bot takeover of a permanently-departed human seat** — a dropped human's seat waits; the room does not substitute a bot for them mid-game. (Bot *seats* configured at room creation are in scope — R8.)

#### Outside this product's identity

- Public game browser, matchmaking, lobby discovery.
- Moderation, reporting, kick/ban, per-turn server-enforced timers.
- User accounts, authentication, persistent identity across games.
- A hosted web build of the client — the desktop app is the product; the transport seam keeps a browser build reachable but it is not a target here.

### Dependencies / Assumptions

- **PartyKit account and deployment.** The maintainer creates a PartyKit (Cloudflare) account and runs `partykit deploy`. The free tier is assumed sufficient for hobby-scale use.
- **The engine and bot packages are edge-runtime clean.** Verified: `packages/engine/src` and `packages/ai/src` import no Node built-ins, `process`, `Buffer`, or `crypto`. The architecture plan's U1 constraint ("engine, protocol, ai target both Node and browser — no Node built-ins") holds, so the room object can import them directly.
- **`partysocket` as a client dependency.** A small WebSocket wrapper with reconnect/backoff; not a Cloudflare lock-in (it speaks plain WebSocket).
- **`replay()` already exists** in `packages/engine` and is tested — room recovery reuses it, no new engine work.
- **The repo uses npm workspaces**, not pnpm as the architecture plan's Assumptions state; that plan already permits an equivalent substitution.

### Outstanding Questions

#### Resolved during planning (2026-09-07)

- **Repo location:** `packages/server` is repurposed as the PartyKit party (`partykit.json` + `src/room.ts`), not a new `party/` directory — keeps the workspace dependency edges. See the architecture plan's Output Structure and U16.
- **Persistence shape:** per-command sequential storage keys (`cmd:<n>` + a `seq` counter), replayed via `replay()` on wake — the `party.storage` 128 KiB per-value cap rules out one growing array. Architecture plan KTD13.

#### Deferred to Planning

- The exact shape and copy of the reconnect / disconnect banner in the desktop lobby (R12) — a non-blocking bar keyed off a store connection-status field; visual detail, not scope.
- Whether the room object also exposes a lightweight read-only room-state endpoint for a future lobby "is this room still alive" check, or defers that entirely with the async-games work.
- How `protocol` version mismatches surface to the player in the desktop UI (R10) — the typed `wrong-version` error exists; its presentation is a planning detail.

### Sources / Research

- `docs/plans/2026-09-06-1315-feat-boomtown-architecture-plan.md` — the architecture plan this revises. Relevant: KTD5 (`GameTransport` seam), KTD6 (the substrate decision being revised), KTD11 (session token, not account), R12 and R13 (online requirements, unchanged in intent), U15–U18 (the Phase D units), U19 (settings — gains the host-URL field), and "Alternative Approaches Considered" (boardgame.io and Colyseus, still rejected).
- `packages/engine/src/index.ts` — the public surface the room object consumes: `createGame`, `reduce`, `replay`, `viewFor`, `legalMoves`.
- `packages/client-core/src/transport/types.ts` — the `GameTransport` interface `SocketTransport` must satisfy.
- `packages/client-core/src/transport/local.ts` and `transport/worker.ts` — the two existing transport implementations to mirror.
- `packages/client-core/src/session.ts` — `GameSession`, the "one per room" wrapper the room object becomes.
- `packages/ai/src/policy.ts` — `heuristicPolicy`, run inline by the room object for bot seats.
- PartyKit documentation (`docs.partykit.io`) — room object lifecycle, `party.storage`, hibernation, `partysocket`, `partykit deploy`.
