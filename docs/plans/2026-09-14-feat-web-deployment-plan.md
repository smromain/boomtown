---
title: Web Deployment - Plan
type: feat
date: 2026-09-14
topic: web-deployment
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-session
execution: code
---

# Web Deployment - Plan

## Goal Capsule

- **Objective:** Boomtown is playable at a public URL with no install — hot-seat and bots offline in the browser, and online play against the same authoritative room the desktop app uses — on a deployment built to be safe to leave unattended: no accounts, no stored personal data, unguessable rooms, host-admitted seats, and hard resource ceilings on every path a stranger can reach.
- **Means:** Ship the existing renderer as a static, integrity-pinned origin (no application server of our own), keep every dynamic behaviour inside the PartyKit room, and replace the desktop era's friends-only trust model with an explicit public-internet threat model: capability-based room identity, host admission, boundary schema validation, per-connection rate limits, and room lifetimes.
- **Product authority:** `docs/rules.md` and `docs/naming.md` remain the rules authority and are untouched by this plan. `docs/plans/2026-09-06-1315-feat-boomtown-architecture-plan.md` owns the overall architecture (KTD1–12, U1–U20); `docs/plans/2026-09-07-0631-refactor-online-multiplayer-substrate-plan.md` owns the online substrate (KTD13, U15–U19). This plan adds KTD14–KTD22 and U21–U33, and **supersedes the substrate plan's "friends-only trust model" Key Decision for the public web deployment only** — the desktop build's behaviour is unchanged.
- **Open blockers:** None blocking planning. Two product calls are deferred to the maintainer (see Outstanding Questions): whether small screens are gated or supported, and whether the public deployment allows rooms that are entirely bots.
- **Enrichment:** This is the WHAT record for a deployment target, not a rules change. No engine, ruleset, naming, or merger behaviour is in scope; the engine is consumed exactly as built.
- **Execution profile:** Three phases, each demoable. Phase F is a static offline build (no server involvement at all). Phase G turns on online play with the hardened room. Phase H is the operational surface that makes a public URL defensible.
- **Tail ownership:** Standard `ce-work` tail (branch, tests, commits). Deployment is a CI job against Cloudflare Pages and `partykit deploy`; no host to provision, no machine to patch.

---

## Product Contract

### Summary

Serve the existing Boomtown renderer from a static origin as a first-class play surface alongside the desktop app, sharing one component tree, one engine, and one room implementation. The browser build runs local hot-seat and bot games entirely client-side with no network dependency, and joins online games over the same `SocketTransport` and PartyKit room the desktop app already uses. Because the URL is public, the deployment is designed for the adversary rather than for friends: rooms are addressed by unguessable capability URLs, seats are admitted by the room's host rather than claimed first-come, every inbound message is schema-validated and rate-limited before it reaches the engine, every room has a bounded lifetime and a bounded command log, and the origin serves a strict CSP with no third-party code of any kind. No accounts, no cookies, no analytics, no chat, and no user content that outlives the room.

### Problem Frame

The browser build is already most of the way built, by accident of good layering rather than by plan. `apps/desktop/vite.browser.config.mts` serves the whole renderer to an ordinary browser today — it exists so the screenshot and playthrough tooling can drive a scriptable page — and its own comment records why it works: nothing in the game surface touches the Electron shell except `src/debug/dump.ts`, which guards on `window.boomtown`. The strict dependency direction (`desktop → client-core → protocol → engine`) means the renderer has no Node, no IPC, and no filesystem in its path. Settings already live in `localStorage`. Fonts are already self-hosted `@font-face`. Music already defers to first user interaction, so autoplay policy is already handled. The engine already runs in a Web Worker.

The server side is likewise already a web service: `packages/server` is a PartyKit room per game with a durable per-command log, hibernation with replay on wake, and seats reserved by token across disconnects.

So the work is not "port the game to the web". It is three other things.

**First, the shell the Electron main process used to provide.** The renderer's Content-Security-Policy is applied by `apps/desktop/electron/csp.ts` as a response header from the main process. A static host has no main process, so that protection evaporates unless it is re-established as a deployment artifact — and re-established in a way that cannot silently drift from the desktop string it was tested against.

**Second, two client gaps that only a browser exposes.** The seat token lives solely in `socket.ts`'s closure (`myToken`); a reload drops the seat while the room continues to reserve it. And there is no URL routing anywhere in the renderer — not one reference to `location` or `history` — because the desktop share mechanism is a six-character code read aloud. On the web, the share mechanism is a link, and a tab reload is routine rather than exotic.

**Third, and the reason this plan is shaped the way it is: the trust model changes.** The substrate plan chose a friends-only model deliberately and correctly — "a room code is shared out-of-band; anyone with it can take an open seat… does nothing about griefing" — because reaching a desktop room required installing an unsigned binary first. That install step was doing real security work: it kept the population of people who could reach a room to people who had been handed a build. A public URL removes it. The same room code space (`makeRoomCode`: six characters from a 32-symbol alphabet, about 30 bits) that is unguessable-in-practice for a handful of friends is enumerable in minutes by a script against a public endpoint. The command log grows without bound and nothing deletes a room. Bots run inline in the room object, so an all-bot room is free CPU for whoever asks for one. None of these are defects in the desktop product; all of them are defects in a public deployment of it.

### Key Decisions

- **One renderer, two build targets — not a second app.** The web build is a build mode of `apps/desktop`, reusing `vite.browser.config.mts`'s lineage, not a new `apps/web` package. (chosen over forking a web app: a second component tree is a second place for the hot-seat privacy rule and the merger UI to drift, and the whole value of the current layering is that there is exactly one of each. Governs R1, R21.)
- **A static origin with no application server of ours.** The web build is immutable hashed files on a CDN edge. Every dynamic behaviour — identity, admission, state, persistence — stays inside the PartyKit room, which already never trusts a client. (chosen over adding a small API server for room brokering: an origin with no server-side code has no server-side vulnerability, no session store to breach, and nothing to patch. Governs R2, R6.)
- **Security headers are a generated, tested artifact derived from one source.** `csp.ts` becomes the single source for both the Electron response header and the static host's `_headers` file, with a test that fails if the web policy is weaker than the packaged desktop policy. (chosen over hand-writing a `_headers` file: a hand-copied policy is a policy that silently rots. Governs R7, R8.)
- **The web build's `connect-src` is pinned to exactly one room origin, and the host override is removed on web.** The desktop build keeps the user-settable "Online host" (a self-hoster needs it); the web build drops it and pins the single origin it was built for. (chosen over carrying `wss:` to the web: a broad `connect-src` on a public origin turns any future injection into an exfiltration channel. A self-hoster builds their own origin, which is the honest way to self-host a web app anyway. Governs R8, R9.)
- **Room identity is a capability, not a guessable name.** A room is addressed by a 160-bit random id that appears only in the share link. The human six-character code is demoted to a short-lived claim ticket that resolves to that id and expires; it is never the room's actual address. (chosen over keeping the six-character code as the room address: 30 bits is enumerable from a public endpoint, and the fix has to be the address space, not a rate limit on guessing it. Governs R10, R11.)
- **Seats are admitted by the host, not claimed first-come.** A joiner knocks; the room creator admits or declines; the room seats nobody without an explicit admission. (chosen over open seating behind an unguessable link: a leaked or shoulder-surfed link should cost you an unwanted knock, not a hijacked seat mid-game. It is also the only griefing control that does not require identity. Governs R12, R13.)
- **Session tokens are per-tab, rotated, and never in a URL.** 256 bits of entropy, minted by the room, held in `sessionStorage` keyed by room id, rotated on every successful resume, never written to `localStorage`, never placed in the address bar, never logged. (chosen over `localStorage` persistence and over putting the token in the link: `sessionStorage` dies with the tab, rotation bounds the value of a captured token, and a token in a URL is a token in history, in bookmarks, and in any referrer. Governs R14, R15.)
- **Every inbound message is validated at the boundary before it reaches the engine.** Byte-size cap, JSON parse guard, and a schema check in `@boomtown/protocol` that rejects anything not matching the message union — then, and only then, `reduce`. (chosen over relying on `reduce` to reject nonsense: `reduce` is a rules referee, not a parser, and defence belongs at the edge where the untrusted bytes arrive. Governs R16.)
- **Every room has a ceiling and an expiry.** Bounded commands per room, bounded room lifetime with an alarm that deletes storage, bounded concurrent room creation per source, bounded connections per room. (chosen over unbounded rooms: unbounded durable storage reachable by anonymous strangers is the abuse surface, and a game of Boomtown has a known finite size, so the ceilings cost legitimate play nothing. Governs R17, R18, R19.)
- **No accounts, no cookies, no analytics, no chat — each a deliberate, permanent non-goal.** (chosen over any of them: each one adds a class of obligation — credential storage, consent banners, data-subject requests, moderation — with no gameplay benefit. A game with no chat needs no moderation policy. Governs R20, R22, R23.)
- **The web build and the room deploy together from one commit, from CI only.** Content-hashed filenames, `npm ci` against the committed lockfile, actions pinned by SHA, build provenance attested, and no human deploy path. (chosen over maintainer-laptop deploys: the browser silently executes whatever the origin serves, so the build's provenance *is* the user's security boundary. Governs R24, R25.)
- **Small screens are gated in v1, not badly supported.** An honest "Boomtown needs a wider window" beats a broken layout. (chosen over a rushed responsive pass: a phone layout is a genuine redesign of the card row, the register and the rack, and it should go through the design canvas, not a media query. Governs R5.)

### Requirements

#### The web build

- R1. The browser build is produced from the same renderer source as the desktop app by a documented script, with no duplicated component tree and no web-only fork of any game surface.
- R2. The build output is static files only — no server-side rendering, no application server, no runtime code generation. Filenames are content-hashed and immutable; the HTML entry is the only non-cacheable document.
- R3. With no network available after first load, the browser build plays a complete hot-seat game and a complete game against bots, start to ranked finish, using the Web Worker engine transport.
- R4. First load over a cold cache transfers no more than a stated budget (proposed: 2.5 MB compressed, excluding music), enforced by a CI gate that fails the build when exceeded. Music is fetched lazily after play begins and never blocks interaction; sound effects ship compressed.
- R5. Below a stated minimum viewport the app shows an explanatory screen rather than a degraded layout, and says what it needs. Above it, every existing panel, the board, the rack and every modal are usable without horizontal scrolling.

#### Origin security posture

- R6. The origin serves no third-party code, fonts, styles, images, or beacons — no CDN for libraries, no analytics, no tag manager, no embedded frames. Every byte the browser executes comes from the deployment's own origin.
- R7. The origin sets, as response headers: a Content-Security-Policy, `Strict-Transport-Security` with a long max-age and `includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, and a `Permissions-Policy` denying every feature the game does not use (camera, microphone, geolocation, payment, USB, serial, sensors, display capture, and interest-cohort style APIs).
- R8. The Content-Security-Policy for the web build is at least as strict as the packaged desktop policy on every directive, and specifically: `default-src 'self'`; `script-src 'self'` with no `'unsafe-inline'` and no `'unsafe-eval'`; `object-src 'none'`; `base-uri 'none'`; `form-action 'none'`; `frame-ancestors 'none'`; `style-src 'self'` with inline *attribute* styles allowed only via `style-src-attr` (which is what Radix's positioning needs — the current blanket `style-src 'unsafe-inline'` is wider than required); `img-src 'self' data: blob:`; `font-src 'self'`; `worker-src 'self' blob:`. `require-trusted-types-for 'script'` is set with a policy allowlist.
- R9. `connect-src` on the web build names exactly the origin of the room deployment it was built against, plus `'self'` — no scheme wildcards. The renderer's "Online host" override is absent from the web build, and the build fails if it is reachable there.

#### Room identity and admission

- R10. A room's address is a random identifier of at least 160 bits from a cryptographic source. It is generated client-side or room-side, never derived from a name, a timestamp, a counter, or a sequence, and never rendered in any log.
- R11. The human-readable six-character code is a claim ticket resolved by a directory that maps it to a room address. A ticket expires after a short window (proposed: 15 minutes) or once the room's seats are all filled, whichever comes first, after which it resolves to nothing. Ticket resolution is rate-limited per source and returns an indistinguishable negative response for an expired, wrong, and never-issued ticket.
- R12. Possession of a room address permits knocking, not seating. A joiner presents a display name and waits; the room's creator sees the knock and admits or declines it; only an admission binds a seat. A declined or unanswered knock leaves room state unchanged.
- R13. The creator can lock a room (no further knocks accepted), fill any remaining seat with a bot, and remove a seated player, converting their seat to a bot without disturbing the game's continuity or its command log's replayability.

#### Session identity

- R14. Seat tokens carry at least 256 bits of entropy from a cryptographic source, are compared in constant time, are minted only by the room, and never appear in a URL, a log line, an error message, or `localStorage`.
- R15. A token is stored in `sessionStorage` keyed by room address. On a reload the client resumes its seat without re-knocking; on success the room issues a fresh token and invalidates the old one. An unknown, expired, or already-rotated token is refused with a single typed error and no information about whether the room or the seat exists.

#### Abuse resistance and resource limits

- R16. Every inbound message is rejected before reaching the engine unless it is under a byte cap (proposed: 16 KiB), parses as JSON, and validates against the `@boomtown/protocol` message union by an explicit schema check. Validation failures are counted per connection; a connection exceeding a threshold is closed.
- R17. Each connection is rate-limited by a token bucket over commands. Exceeding it produces a typed error, not a queue; sustained excess closes the connection. Limits are generous against human play and tight against a script.
- R18. Each room has a bounded command log (proposed: a ceiling comfortably above the longest plausible game), a bounded connection count, a bounded seat count, and an inactivity expiry after which an alarm deletes the room's stored state entirely. No room persists indefinitely.
- R19. Room creation and ticket resolution are rate-limited per source. A room whose seats are all bots is subject to a stricter creation limit than a room seating a human (or is disallowed on the public deployment — see Outstanding Questions), because bot turns are server compute.
- R20. The deployment sets no cookies and uses no storage that survives the tab for anything but the player's own display preferences. There is no cross-room, cross-session, or cross-device identifier of any kind.

#### Continuity, privacy and provenance

- R21. The desktop app's behaviour, packaging, and security posture are unchanged by this work. Any file shared between the two builds is changed only in ways the existing desktop tests still assert.
- R22. Display names are normalized and bounded room-side before broadcast: length capped, Unicode-normalized, control, bidirectional-override and zero-width characters stripped, whitespace collapsed. Every client receives the same normalized string. Names exist only for the room's lifetime.
- R23. The deployment collects no analytics, no telemetry and no behavioural data. Room-side logging records no room address, no token, no display name, and no IP address beyond what the platform records for its own operation; the README's existing no-telemetry claim stays literally true of the web build.
- R24. The web origin and the room are deployed only by CI, from one commit, using `npm ci` against the committed lockfile, with third-party actions pinned by commit SHA and build provenance attested. There is no interactive deploy path in the documented workflow.
- R25. The room accepts the current protocol version and the immediately preceding one, and refuses anything else with a typed, human-readable error naming what to do. Browsers get the new client on reload while installed desktop builds lag, so version skew is treated as the normal case rather than an incident.

### Actors

- A1. **Player on the web** — opens a URL, plays hot-seat or bots with no network, or knocks at a room they were linked to.
- A2. **Room creator (host)** — creates a room, shares the link, admits or declines knocks, locks the room, may replace a player with a bot. Has no power over the rules, the deal, or another seat's hidden state.
- A3. **The room object** — the authoritative referee, unchanged in its rules role, now additionally the admission authority, the rate limiter, the input validator, and the owner of its own expiry.
- A4. **The directory** — a single object that resolves a short-lived claim ticket to a room address and then forgets it. Holds no game state.
- A5. **The static origin** — serves immutable files and security headers. Executes nothing.
- A6. **An adversary with the URL** — anyone on the internet. May enumerate, flood, replay, script, and probe; is assumed to be able to read anything the origin serves and anything their own client receives.

### Key Flows

- F1. Play with no server at all
  - **Trigger:** A1 opens the origin and chooses a local game.
  - **Steps:** The static build loads; the engine starts in a Web Worker; hot-seat or bot play runs entirely client-side; music loads lazily in the background after first interaction; nothing contacts the room.
  - **Covers R1, R2, R3, R4.**
- F2. Create a room and admit friends
  - **Trigger:** A2 chooses online play and creates a room.
  - **Steps:** A 160-bit address is minted; the room registers a short-lived claim ticket with A4; A2 shares either the link or the six-character ticket; each A1 arrives and knocks with a display name; A2 admits each in turn; the room mints a seat token per admission; A2 starts; remaining seats become bots.
  - **Covers R10, R11, R12, R13, R14, R22.**
- F3. Reload mid-game
  - **Trigger:** A1 reloads the tab, or restores it after a crash.
  - **Steps:** The client reads its token for that room address from `sessionStorage` and resumes; the room verifies it in constant time, rebinds the seat, rotates the token, and sends the current filtered view including any pending decision the seat owns; the old token no longer resolves.
  - **Covers R15, and the substrate plan's R11 reconnect behaviour unchanged.**
- F4. A stranger finds the room
  - **Trigger:** A6 obtains or guesses an address, or brute-forces tickets.
  - **Steps:** Ticket guessing is rate-limited and indistinguishable on failure; address guessing is infeasible at 160 bits; possession of an address yields only a knock, which A2 declines; a flood of knocks trips the per-source limit and then the connection cap; nothing in the game state changes and no seated player is disturbed.
  - **Covers R10, R11, R12, R17, R19.**
- F5. A malformed or hostile client
  - **Trigger:** A6 connects with a hand-written client.
  - **Steps:** Oversized frames are dropped at the byte cap; non-conforming messages fail schema validation before reaching `reduce`; repeated failures close the connection; well-formed but illegal commands are refused by the engine as they already are; no path reaches another seat's hidden state because only `viewFor(seat)` is ever serialized.
  - **Covers R16, R17, and the substrate plan's R6 hidden-state guarantee unchanged.**
- F6. The room ages out
  - **Trigger:** A room goes quiet.
  - **Steps:** An alarm fires after the inactivity window; the room deletes its command log and config; the address stops resolving; a later connection to it is refused as a fresh unknown room.
  - **Covers R18, R23.**

### Acceptance Examples

- AE1. With the device offline after first load, a three-seat hot-seat game plays from deal to ranked standings, and the hand-off card covers the screen between seats exactly as on desktop.
- AE2. The deployed origin's response headers match the generated policy byte for byte, and an automated check fails if any directive is weaker than the packaged desktop build's.
- AE3. A page served by the deployment cannot open a socket to any origin but the configured room: an injected script attempting it is blocked by CSP, observable as a violation rather than a connection.
- AE4. Ten thousand sequential claim-ticket guesses from one source are rate-limited, and the timing and body of a miss are indistinguishable from those of an expired ticket.
- AE5. Given a room address but no admission, a scripted client cannot obtain a seat, cannot observe any seat's hand tiles or the bag, and cannot cause any state transition; the host sees knocks and nothing else changes.
- AE6. A reload mid-merger resumes the same seat with its pending disposal decision intact, and the pre-reload token is thereafter refused.
- AE7. A client sending 64 KiB of junk, then a valid-looking message with an unknown discriminant, then a hundred commands in a second, is disconnected without the room's state advancing and without an unhandled exception in the room.
- AE8. A room left idle past its window has no stored keys remaining, and reconnecting to its address behaves exactly like connecting to an address that never existed.
- AE9. A cold first load stays within the stated transfer budget with music excluded, and the CI gate fails a deliberately oversized build.
- AE10. A desktop build one protocol version behind joins a current room and plays; two versions behind is refused with a message naming the fix.

### Success Criteria

- Someone with a link plays a full online game in a browser with no install, and a reload does not cost them their seat.
- The origin scores clean on an external header and TLS audit, with no third-party requests observed in a full session.
- The room's abuse ceilings are provable by test rather than by argument: each of R16–R19 has a test that exercises the limit and asserts the refusal.
- Nothing in the desktop product changes, and its suite is green throughout.
- The privacy claim in the README remains literally true of the web build without qualification.

### Scope Boundaries

#### Deferred for later — not precluded by this plan

- A mobile or small-screen layout, as its own design-canvas-led project.
- A landing page built from the existing screenshot set and poster.
- Spectating, replays from the command log, and a shareable end-of-game summary.
- Offline installability (a service worker / PWA). Attractive, and deliberately after the security posture is settled, because a service worker is persistent executable code on the origin.
- Any form of matchmaking, lobby browser, or public room list.

#### Outside this product's identity

- Accounts, sign-in, profiles, or any persistent player identity.
- In-room chat, emotes, or free-text between players beyond the display name.
- Analytics, telemetry, A/B testing, advertising, or monetization.
- Server-side storage of anything that outlives a room.

### Dependencies / Assumptions

- The engine, the naming module, the bot policy, and `viewFor(seat)` are consumed unchanged; this plan adds no rules behaviour.
- PartyKit (on Cloudflare) remains the room platform, and its storage, hibernation, alarms, and per-room addressing are available. Cloudflare Pages is assumed as the static origin so page and room share one edge, one account, and one custom domain; the plan's only hard requirement of the host is response-header control, so another static host with a headers file is a drop-in.
- Radix's inline styling needs `style-src-attr 'unsafe-inline'` and nothing wider. This is an assumption to verify early in U22 — if a component injects a full stylesheet, the tightening is smaller than planned and the policy should say so honestly rather than be loosened silently.
- `@boomtown/protocol` is the right home for boundary schema validation, keeping validation and the message union in one place rather than duplicating shapes in the room.
- The existing `netlog` diagnostic timeline records no room address or token, or is adjusted in U31 so that it does not.

### Outstanding Questions

#### For the maintainer

- **Small screens: gate or support in v1?** This plan assumes a gate (R5). Supporting phones is the single largest piece of work in the vicinity and is a redesign, not a media query.
- **Are all-bot rooms allowed on the public deployment?** They are the cheapest way to spend someone else's CPU, and they are also how the screenshot tooling drives a game. R19 proposes a stricter limit; disallowing them publicly while keeping them in local play is the safer call if the tooling can run against a local room.
- **Domain and the HSTS preload commitment.** Preloading is effectively irreversible on browser timelines; worth deciding before the first deploy rather than after.
- **Does the web build become the primary product** — with desktop as the offline option — or stay the secondary surface? This changes what the README leads with, not what gets built.

#### Deferred to planning

- The exact numeric ceilings in R16–R19. The plan fixes their existence and their testability; the values want one pass of real play data.
- Whether the directory is a second PartyKit party or a room-side convention, and how ticket rate limiting is keyed given edge IP visibility.
- Whether host admission is a new protocol message pair or an extension of the existing `hello`/`welcome` handshake.

### Sources / Research

- `apps/desktop/vite.browser.config.mts` — the existing browser entry and its note on why the renderer is shell-independent.
- `apps/desktop/electron/csp.ts` — the policy this plan generalizes, including its stated reasons for `wss:`/`https:` and blanket `style-src 'unsafe-inline'`.
- `apps/desktop/src/online/hostUrl.ts` — host precedence and `makeRoomCode` (six characters, 32-symbol alphabet).
- `packages/client-core/src/transport/socket.ts` — `myToken` held only in closure; `resume` intent already implemented.
- `packages/server/src/{room,game-room,seats,storage}.ts` — hibernation with replay, seat reservation by token, the unbounded `cmd:` log.
- `docs/deploying.md` — the existing PartyKit deploy and CI secret handling.
- `docs/plans/2026-09-07-0631-refactor-online-multiplayer-substrate-plan.md` — the friends-only trust model this plan supersedes for the public deployment.

---

## Planning Contract

### Key Technical Decisions

Continuing the architecture plan's series (KTD1–12) and the substrate plan's KTD13.

- **KTD14. The web target is a build mode of `apps/desktop`.** `npm run build:web` reuses the browser Vite config; Electron-only modules (menu, updater, preload bridge) are excluded by entry point, not by runtime branching, so no dead shell code ships.
- **KTD15. One policy source, two emissions.** `csp.ts` grows a target parameter (`electron-packaged`, `electron-dev`, `web`) and a serializer for each destination; the web emission is written into the static output's `_headers` at build time and asserted by test against the desktop string.
- **KTD16. Capability-addressed rooms with an expiring ticket directory.** Room address: 160 bits from `crypto.getRandomValues`, base32-encoded, used as the PartyKit room id. A directory object maps six-character tickets to addresses with a TTL and per-source resolution limits, and holds nothing else.
- **KTD17. Admission is a state machine in the room, not a client convention.** Seats move `open → knocking → admitted → seated → vacated`; only the creator's connection can drive `knocking → admitted`, and the transition is part of the persisted command log so it survives hibernation and replays identically.
- **KTD18. Tokens are rotating bearer capabilities.** 256 bits, minted room-side, compared in constant time, rotated on every resume, invalidated on rotation, stored per-tab.
- **KTD19. Validation is a boundary layer in `@boomtown/protocol`.** A `parseClientMessage(bytes)` returning a discriminated result is the only way a message reaches the room's logic; `reduce` is never handed unvalidated input.
- **KTD20. Governance is a room concern, enforced by alarms and counters.** Each room owns its own expiry alarm, its own command ceiling, and its own per-connection buckets; nothing external polices it, so there is no central component to fail open.
- **KTD21. The deployment unit is one commit.** The web bundle and the room deploy from the same CI run; the bundle records the protocol version it was built with, and the room enforces the N/N−1 window.
- **KTD22. The small-screen gate is a first-class screen.** Not a `@media` hide — a real component with copy, so the failure mode is legible rather than a broken board.

### Assumptions

- Cloudflare Pages `_headers` applies to every served path including the HTML entry; if not, headers move to a Pages Function and the "no server-side code" property weakens to "no server-side state", which is a decision to record rather than absorb silently.
- PartyKit exposes alarms (or an equivalent scheduled wake) for room expiry. If it does not, expiry is enforced lazily on next connect plus a scheduled sweep, which is weaker but still bounded.
- Edge-visible client IP is available to the room for per-source limiting; if it is not trustworthy, limits key on connection and room instead, and the plan says so rather than claiming a guarantee it cannot make.
- Content-hashed immutable assets make cache invalidation a non-issue; only the HTML entry needs a short cache lifetime.

### High-Level Technical Design

#### Threat model

The public deployment assumes an adversary who can: read every byte the origin serves; read every byte their own client receives; write any bytes they like to the socket; enumerate the ticket space; and script all of it. It does **not** assume a compromised platform, a malicious host, or an attacker who has already achieved script execution on the origin.

What is protected, and by what:

| Asset | Threat | Control |
|---|---|---|
| Another seat's hand tiles, the bag | Passive observation of the wire | `viewFor(seat)` filtering only (existing, unchanged) — the room never serializes what a seat may not see |
| A seat in a game in progress | Link leak, shoulder-surf, enumeration | 160-bit address (R10) + host admission (R12) + rotating per-tab tokens (R14, R15) |
| Room state integrity | Hand-written client, replay, out-of-turn | Boundary schema validation (R16) then `reduce` as the only mutator (existing) |
| Room availability | Flood, oversized frames, knock storms | Byte cap, per-connection buckets, connection caps, close-on-abuse (R16, R17) |
| Platform resources | Unbounded logs, immortal rooms, bot farms | Command ceiling, inactivity expiry with deletion, creation limits (R18, R19) |
| The player's browser | Injection, exfiltration, clickjacking | Strict CSP with no inline script, Trusted Types, pinned `connect-src`, `frame-ancestors 'none'` (R7, R8, R9) |
| The player's privacy | Tracking, retention, identity correlation | No cookies, no analytics, no accounts, per-tab storage only, room-lifetime data only (R20, R22, R23) |
| The delivered bundle | Supply chain, tampered deploy | CI-only deploy, lockfile install, SHA-pinned actions, attested provenance, no third-party origin (R6, R24) |

What is explicitly *not* defended against, and why that is acceptable: a host who is themselves hostile to their guests (they can decline knocks and eject players — that is the point of the role); collusion between players; and traffic analysis of connection timing by the platform.

#### Where each concern lives

```
static origin (Cloudflare Pages)        no code, no state
  index.html (short cache)              content-hashed assets (immutable)
  _headers                              generated from csp.ts at build time

browser (apps/desktop renderer, web mode)
  router          /  and  /r/<address>          U25
  resume          sessionStorage token per room U26
  worker engine   local play, no network         existing
  socket          pinned origin, no override     U21 + U29 client half

PartyKit
  directory party   ticket -> address, TTL, rate limits          U27
  room party        admission SM, validation, buckets, alarms    U28-U30
                    + existing: reduce, viewFor, command log, hibernation
```

The dependency direction is unchanged: nothing above `client-core` learns about the web, and nothing in the engine learns about either.

### Output Structure

New: `apps/desktop/src/web/` (entry, router, small-screen gate), `apps/desktop/build-web/` (headers generation), `packages/protocol/src/validate.ts`, `packages/server/src/{directory,admission,limits,lifecycle}.ts`, `.github/workflows/deploy-web.yml`. Modified: `apps/desktop/electron/csp.ts`, `apps/desktop/package.json`, `packages/client-core/src/transport/socket.ts`, `packages/server/src/{room,game-room,seats}.ts`, `docs/deploying.md`, `README.md`.

---

## Implementation Units

### Unit Index

| U-ID | Title | Key files | Depends on |
|---|---|---|---|
| U21 | Web build target and static output | `apps/desktop/vite.browser.config.mts`, `src/web/`, `package.json` | U19 |
| U22 | Security headers as a generated artifact | `apps/desktop/electron/csp.ts`, `build-web/headers.ts` | U21 |
| U23 | Asset diet and first-load budget gate | `src/audio/`, `src/assets/`, CI budget check | U21 |
| U24 | Small-screen gate and responsive audit | `src/web/TooSmall.tsx`, panel CSS | U21 |
| U25 | Routing and the share link | `src/web/router.ts`, `src/lobby/CreateJoin.tsx` | U21 |
| U26 | Seat-token persistence and rotation | `packages/client-core/src/transport/socket.ts`, `src/online/` | U25 |
| U27 | Capability room addresses and the ticket directory | `packages/server/src/directory.ts`, `src/online/hostUrl.ts` | U25 |
| U28 | Host admission state machine | `packages/server/src/admission.ts`, `seats.ts`, `src/lobby/SeatList.tsx` | U27 |
| U29 | Message boundary validation and rate limits | `packages/protocol/src/validate.ts`, `packages/server/src/limits.ts` | U27 |
| U30 | Room lifecycle, ceilings and expiry | `packages/server/src/lifecycle.ts`, `storage.ts` | U29 |
| U31 | Privacy posture: names, logs, no cookies | `packages/server/src/{seats,log}.ts`, `packages/client-core/src/netlog.ts` | U28 |
| U32 | CI: provenance, deploy, protocol-skew gate | `.github/workflows/deploy-web.yml`, `release.yml` | U22, U30 |
| U33 | Operations: runbook, kill switch, docs | `docs/deploying.md`, `docs/web-operations.md` | U32 |

---

### Phase F — The static build (no server involved)

### U21. Web build target and static output

- **Goal:** `npm run build:web` produces a static, content-hashed bundle of the existing renderer that plays local games in a browser, with no Electron code and no host override.
- **Requirements:** R1, R2, R9, R21.
- **Dependencies:** U19.
- **Files:** `apps/desktop/vite.browser.config.mts`, `apps/desktop/src/web/main.tsx`, `apps/desktop/src/web/env.ts`, `apps/desktop/package.json`, `apps/desktop/.env.web.production`, root `package.json`.
- **Approach:**
  1. Add a `build` section to the browser config: hashed asset filenames, no sourcemaps in production (or uploaded-but-unserved), target the baseline browsers the project supports.
  2. A `src/web/main.tsx` entry that mounts the same `App` and omits every Electron affordance; `debug/dump.ts` already guards on `window.boomtown` and needs no change.
  3. Remove the "Online host" control from the settings surface when built for web — a compile-time flag consumed in `hostUrl.ts` so the override path does not exist in the bundle rather than being hidden in the UI.
  4. `.env.web.production` supplies the single room origin; the build fails loudly if it is absent, mirroring the existing `hostUrl.ts` PROD behaviour.
- **Patterns to follow:** `vite.browser.config.mts`'s existing reuse of `electron.vite.config.ts`'s renderer options — keep that so aliases cannot drift.
- **Test scenarios:**
  - The built bundle contains no reference to `window.boomtown`, `electron`, or `require`.
  - The built bundle contains no code path reading the host override setting.
  - A production build with no configured room origin fails the build rather than emitting a bundle.
- **Verification:** `npm run build:web` emits a static directory; serving it with any static file server plays a hot-seat game end to end; `npm run typecheck` and the desktop suite stay green.

### U22. Security headers as a generated artifact

- **Goal:** One policy source emits both the Electron response header and the static host's headers file, and the web policy is provably no weaker than the desktop one.
- **Requirements:** R7, R8, R9.
- **Dependencies:** U21.
- **Files:** `apps/desktop/electron/csp.ts`, `apps/desktop/electron/csp.test.ts`, `apps/desktop/build-web/headers.ts`, `apps/desktop/build-web/headers.test.ts`, emitted `_headers`.
- **Approach:**
  1. Extend `CspOptions` with a target: `electron-packaged`, `electron-dev`, `web`. The web target sets `script-src 'self'`, splits `style-src 'self'` from `style-src-attr 'unsafe-inline'`, pins `connect-src` to `'self'` plus the one room origin, and adds `require-trusted-types-for 'script'`.
  2. `headers.ts` serializes the full header set — CSP plus HSTS, `nosniff`, `Referrer-Policy: no-referrer`, COOP, CORP, and a deny-everything `Permissions-Policy` — into the host's `_headers` format, written into the build output as a build step.
  3. A comparison test parses both policies into directive sets and fails if any web directive admits a source the packaged desktop directive does not.
  4. Verify the Radix assumption first: if a component needs a full stylesheet rather than a style attribute, record it in the file's comment and adjust, rather than widening quietly.
- **Patterns to follow:** `csp.ts`'s existing doc comment style — it explains *why* each loosening exists, and that discipline is the reason this unit is cheap.
- **Test scenarios:**
  - The web CSP contains no `'unsafe-inline'` in `script-src` and no `'unsafe-eval'` anywhere.
  - The web `connect-src` contains no scheme wildcard and names exactly the configured origin.
  - A deliberately weakened web directive fails the comparison test.
  - The emitted `_headers` parses and covers every served path.
- **Verification:** `npm test` passes both CSP suites; a local static serve shows the headers on the HTML entry and on a hashed asset.

### U23. Asset diet and first-load budget gate

- **Goal:** A cold first load is small enough to be pleasant, and stays that way.
- **Requirements:** R4, R6.
- **Dependencies:** U21.
- **Files:** `apps/desktop/src/audio/musicManager.ts`, `apps/desktop/src/assets/{music,sound}/`, a CI budget script.
- **Approach:**
  1. Music (currently ~15 MB across four tracks, one of them 7 MB) moves out of the bundle graph to fetched-on-demand URLs, requested after play begins and after the existing interaction unlock, never blocking first interaction.
  2. Sound effects (currently WAV) ship compressed; the six effects should total well under a hundred kilobytes.
  3. Code-split the reference chart and any art-heavy surface behind dynamic import.
  4. A CI script sums the compressed transfer of the entry graph, excluding lazily-fetched media, and fails above the budget. The number is printed on every build so a regression is visible before it is a gate failure.
- **Test scenarios:**
  - No music file appears in the entry chunk graph.
  - Starting a game with the network throttled and music blocked plays normally; music simply never arrives.
  - A deliberately oversized asset fails the budget gate.
- **Verification:** `npm run build:web` reports the transfer number; the gate fails on a seeded regression.

### U24. Small-screen gate and responsive audit

- **Goal:** Narrow viewports get an honest explanation; everything above the floor is genuinely usable.
- **Requirements:** R5, R22 (copy quality).
- **Dependencies:** U21.
- **Files:** `apps/desktop/src/web/TooSmall.tsx`, `apps/desktop/src/copy/copy.ts`, panel and board CSS modules.
- **Approach:**
  1. A real screen — logo, one sentence of copy in the game's voice, the minimum it wants — shown below the floor (the Electron window's existing 1024 × 700 is the natural starting value).
  2. Audit every panel, modal and the rack between the floor and a typical laptop: no horizontal scroll, no clipped decision modal, no unreachable button. The board already scales by `aspect-ratio`; the card row and the register are the likely offenders.
  3. Keep the gate a component, not a media-query hide, so it is testable and its copy lives with the rest of the copy.
- **Test scenarios:**
  - At one pixel below the floor the gate renders; at the floor the game renders.
  - At the floor, the merger disposal modal and the setup screen are fully visible without scrolling.
- **Verification:** `npm test` desktop suite; a Playwright pass at the floor, at 1440, and at 1920 via the existing `run-app` tooling.

---

### Phase G — Online on the web, hardened

### U25. Routing and the share link

- **Goal:** A room is a link; a reload returns to the same place.
- **Requirements:** R11, R12 (entry half), R15 (entry half).
- **Dependencies:** U21.
- **Files:** `apps/desktop/src/web/router.ts`, `apps/desktop/src/lobby/CreateJoin.tsx`, `apps/desktop/src/copy/copy.ts`.
- **Approach:**
  1. Two routes and no framework: `/` (title) and `/r/<address>` (knock or resume). History API, no hash, with a static-host fallback so a deep link cold-loads.
  2. Creating a room pushes its address; the share affordance offers the link and, separately, the six-character ticket for reading aloud.
  3. The desktop build keeps its code-entry flow unchanged; the router is web-entry-only.
- **Test scenarios:**
  - A cold load of `/r/<address>` lands on the knock screen for that address.
  - An address of the wrong shape lands on the title screen with an explanation, not an error.
  - The desktop lobby flow is unchanged.
- **Verification:** `npm test`; a Playwright cold-load of a deep link.

### U26. Seat-token persistence and rotation

- **Goal:** A reload keeps your seat, and a captured token is worth little.
- **Requirements:** R14, R15.
- **Dependencies:** U25.
- **Files:** `packages/client-core/src/transport/socket.ts`, `apps/desktop/src/online/onlineGame.ts`, `packages/server/src/{seats,game-room}.ts`.
- **Approach:**
  1. Client: store the token in `sessionStorage` under the room address on `welcome`, read it on boot, call the existing `resume` path. Never `localStorage`; never the URL.
  2. Room: mint 256-bit tokens from a cryptographic source, compare in constant time, and on a successful resume issue a new token and invalidate the presented one. Token rotation is a logged command so replay stays faithful.
  3. One typed refusal for unknown, expired and rotated tokens alike — no oracle distinguishing them.
- **Patterns to follow:** the existing `resume` intent in `socket.ts` and `onlineGame.ts`; the token rebinding in `game-room.ts`.
- **Test scenarios:**
  - Covers AE6. Reload mid-merger resumes the seat with the pending decision intact.
  - The pre-rotation token is refused after a resume.
  - Unknown, expired and rotated tokens produce byte-identical refusals.
  - No token value appears in any log line or `netlog` entry.
- **Verification:** `npm run test:server` recovery suite extended; a browser reload test through the `run-app` tooling.

### U27. Capability room addresses and the ticket directory

- **Goal:** Rooms stop being enumerable.
- **Requirements:** R10, R11, R19 (ticket half).
- **Dependencies:** U25.
- **Files:** `packages/server/src/directory.ts`, `packages/server/partykit.json`, `apps/desktop/src/online/hostUrl.ts`, `packages/protocol/src/`.
- **Approach:**
  1. Room address: 160 bits from `crypto.getRandomValues`, base32 with an unambiguous alphabet, used directly as the PartyKit room id.
  2. A directory party mapping ticket → address with a TTL, deleting the entry on expiry or when the room reports its seats filled. It stores nothing else and answers nothing else.
  3. Resolution is rate-limited per source with a uniform negative response and no timing signal between miss types.
  4. `makeRoomCode` stays, demoted: it mints tickets, not addresses. Its comment should say so, since its current name invites the old assumption.
- **Test scenarios:**
  - Covers AE4. Bulk ticket guessing is limited; misses are indistinguishable.
  - An expired ticket resolves to nothing; the room behind it is still reachable by address.
  - Addresses are drawn from a cryptographic source and never appear in a log.
- **Verification:** `npm run test:server`; an integration test driving the directory under `partykit dev`.

### U28. Host admission state machine

- **Goal:** Having the link gets you a knock, not a seat.
- **Requirements:** R12, R13.
- **Dependencies:** U27.
- **Files:** `packages/server/src/admission.ts`, `seats.ts`, `game-room.ts`, `packages/protocol/src/`, `apps/desktop/src/lobby/SeatList.tsx`.
- **Approach:**
  1. Seat lifecycle `open → knocking → admitted → seated → vacated` in the room, persisted through the command log so hibernation and replay reproduce it exactly.
  2. New protocol messages for knock, admit, decline, lock, and eject. Only the creator's bound connection may drive admit/decline/lock/eject; every other sender gets a typed refusal.
  3. Ejecting converts a seat to a bot mid-game without disturbing the log's replayability — the same path the existing bot-fills-empty-seat behaviour uses.
  4. Lobby UI: a knock queue for the host, a waiting state for the joiner, both in the existing lobby idiom.
- **Test scenarios:**
  - Covers AE5. A scripted client with the address and no admission obtains nothing and changes nothing.
  - A non-creator's admit is refused.
  - An admission survives a hibernation wake and replays identically.
  - An ejected seat continues as a bot and the game completes to a ranked result.
- **Verification:** `npm run test:server`; the integration suite extended to a knock-and-admit game.

### U29. Message boundary validation and rate limits

- **Goal:** Nothing unvalidated reaches the engine, and nobody can shout.
- **Requirements:** R16, R17.
- **Dependencies:** U27.
- **Files:** `packages/protocol/src/validate.ts`, `packages/server/src/limits.ts`, `room.ts`.
- **Approach:**
  1. `parseClientMessage(raw)` in `protocol`: byte cap, JSON guard, explicit schema check against the message union, returning a discriminated result. It is the only route into room logic.
  2. `limits.ts`: a per-connection token bucket over commands and a separate counter for validation failures, both held in connection state so they survive hibernation.
  3. Exceeding the command bucket is a typed error; sustained excess and repeated validation failures close the connection.
  4. Prototype-pollution-safe parsing (null-prototype objects, rejected `__proto__` keys) as part of the schema layer.
- **Test scenarios:**
  - Covers AE7. Oversized junk, an unknown discriminant, and a command flood in sequence all fail closed with no state advance and no unhandled throw.
  - A payload with `__proto__` does not pollute.
  - A human-paced game never trips a limit.
- **Verification:** `npm test` protocol suite; `npm run test:server` limits suite.

### U30. Room lifecycle, ceilings and expiry

- **Goal:** No room lives forever and no log grows forever.
- **Requirements:** R18, R19.
- **Dependencies:** U29.
- **Files:** `packages/server/src/lifecycle.ts`, `storage.ts`, `room.ts`.
- **Approach:**
  1. A command ceiling per room, comfortably above the longest plausible game, refusing further commands with a typed terminal error rather than growing.
  2. An inactivity alarm that deletes every stored key for the room; afterwards the address behaves like one that never existed.
  3. Connection count and seat count caps per room; creation limits per source, stricter for a room with no human seat.
  4. The caps are named constants in one file with their reasoning, so tuning is a documented change rather than a scattered edit.
- **Test scenarios:**
  - Covers AE8. An expired room has no stored keys and is indistinguishable from an unknown address.
  - The command ceiling refuses cleanly mid-game without corrupting the log.
  - Exceeding the connection cap refuses the newcomer and disturbs nobody seated.
- **Verification:** `npm run test:server` lifecycle suite with a fake clock.

---

### Phase H — Operations

### U31. Privacy posture: names, logs, no cookies

- **Goal:** The no-telemetry claim is literally true, and nothing sensitive is ever written down.
- **Requirements:** R20, R22, R23.
- **Dependencies:** U28.
- **Files:** `packages/server/src/{seats,log}.ts`, `packages/client-core/src/netlog.ts`, `README.md`.
- **Approach:**
  1. Room-side name normalization: NFC, length cap, strip control, bidi-override and zero-width characters, collapse whitespace, reject empty after normalization. Every client receives the identical normalized string.
  2. Audit `roomLog`/`roomWarn` and `netlog` for room addresses, tokens and names; redact at the logging call, not at the sink.
  3. Confirm no cookie is set anywhere and that `localStorage` holds only display preferences.
  4. Update the README's privacy paragraph to cover the web build explicitly.
- **Test scenarios:**
  - A name containing RTL overrides and zero-width joiners is normalized identically for every client.
  - No log line in a full game contains an address, a token, or a name.
  - A full session sets no cookies.
- **Verification:** `npm test`; a Playwright session asserting zero cookies and zero third-party requests.

### U32. CI: provenance, deploy, protocol-skew gate

- **Goal:** The bytes the browser runs come from a commit, not from a laptop.
- **Requirements:** R24, R25.
- **Dependencies:** U22, U30.
- **Files:** `.github/workflows/deploy-web.yml`, `.github/workflows/release.yml`, `packages/protocol/src/`.
- **Approach:**
  1. A deploy job beside the existing `deploy-party`: `npm ci`, build, emit headers, publish to Pages, then deploy the room — same commit, same run, room first so a new client never meets an older room.
  2. Third-party actions pinned by commit SHA; build provenance attested; no interactive deploy documented or supported.
  3. Per-PR preview deploys, which also give the screenshot tooling a real URL.
  4. The room accepts protocol N and N−1; a test asserts both, and a third case asserts the refusal message names the fix.
- **Test scenarios:**
  - Covers AE10. N−1 plays; N−2 is refused with an actionable message.
  - A build with a mismatched lockfile fails rather than resolving fresh.
- **Verification:** a green deploy run; headers observed on the deployed origin match the generated file.

### U33. Operations: runbook, kill switch, docs

- **Goal:** There is a written answer to "it is being abused" that is not "improvise".
- **Requirements:** R18, R19, R23.
- **Dependencies:** U32.
- **Files:** `docs/web-operations.md`, `docs/deploying.md`, `README.md`.
- **Approach:**
  1. A runbook: what the limits are, how to tighten them, how to take online play down while leaving local play working (the static build must degrade to offline play, not to a blank page), and how to purge a room.
  2. A documented kill switch — a deployed configuration that refuses new rooms while letting existing ones finish.
  3. `docs/deploying.md` gains the web origin alongside the room; the README gains a "play in your browser" route beside the installers.
- **Test scenarios:**
  - With the room unreachable, the web build still plays local and bot games and says clearly that online is unavailable.
- **Verification:** a rehearsal of the kill switch against a preview deployment.

---

## Verification Contract

| Gate | Command | Applies to |
|---|---|---|
| Type + build | `npm run typecheck` | all units |
| Unit + integration tests | `npm test` | all units |
| Room suite | `npm run test:server` | U26–U31 |
| Web build | `npm run build:web` | U21–U24 |
| Header parity | CSP comparison test (web no weaker than packaged desktop) | U22 |
| First-load budget | CI transfer-size gate | U23 |
| No third-party requests | Playwright session asserting zero off-origin requests and zero cookies | U22, U31 |
| Hidden-state leak check | existing payload assertion, re-run over the web client | U26, U28 |
| Abuse ceilings | limit tests for each of R16–R19 | U29, U30 |
| Deep-link and resume | Playwright cold-load and mid-game reload | U25, U26 |
| Desktop regression | full desktop suite + `npm run smoke` | all units (R21) |

---

## Definition of Done

**Global:**

- Every Requirement R1–R25 is met by at least one unit and its tests.
- A full Boomtown-preset game plays start to ranked finish in a browser: hot-seat offline, against bots offline, and online across two browsers on different machines.
- A reload mid-merger resumes the seat with its pending decision, and the old token is dead.
- Each of R16–R19 has a test that exercises the limit and asserts the refusal — the abuse posture is demonstrated, not asserted.
- The deployed origin serves the generated headers, makes no third-party request, and sets no cookie, observed in a real session.
- The desktop product is unchanged: its suite and `npm run smoke` are green, and its installers are byte-comparable but for the version.
- `docs/decisions.md` records the trust-model change (friends-only for desktop; admission-based for the public web deployment) and any open question this work resolved or raised.

**Per unit:** the unit's Verification line holds and its test scenarios are covered by real tests.

---

## Risks & Mitigations

- **The trust-model change is the crux, not the build.** Shipping the static build is easy enough that it will be tempting to open online play before admission, limits and expiry exist. Mitigation: Phase F is explicitly server-free and demoable on its own, so there is a shippable milestone that does not require the hardening to be rushed.
- **A strict CSP that breaks a Radix surface at runtime, not at build.** Mitigation: verify the `style-src-attr` assumption first in U22, and add the Playwright pass over every modal under the real headers — a CSP failure is silent in the console-free case.
- **Rate limits that punish real play.** A merger's rapid-fire disposals are the legitimate burst. Mitigation: bucket sizes derived from a recorded real game, and a test that replays one without tripping any limit.
- **The directory is a single point of failure for joining by ticket.** Mitigation: it is not on the path for joining by link, so its loss degrades convenience, not availability — and a room in progress never consults it.
- **Edge IP may not be a reliable limiting key.** Mitigation: state the limitation honestly in the runbook, key on connection and room as well, and treat per-source limits as friction rather than a guarantee.
- **Version skew becomes routine rather than exceptional.** Mitigation: the N/N−1 window (R25), same-commit deploys, and a refusal message that names the fix.
- **Unbounded storage is the quiet one.** The existing command log has no ceiling and no room has an expiry; this is invisible until it is a bill. Mitigation: U30 is a Phase G unit, not a follow-up, and its tests use a fake clock so expiry is proven rather than hoped for.
- **A public URL invites attention the project has not had.** Mitigation: the kill switch and runbook (U33) exist before launch, and local play never depends on the room being up.

---

## Alternative Approaches Considered

- **A separate `apps/web` package.** Clean separation, and a tempting place to make web-specific choices. Rejected: two component trees means two implementations of the hot-seat privacy rule and the merger UI, which is precisely the invariant the project cannot afford to have drift.
- **Keeping the six-character room code as the room address, protected by rate limiting.** Simple, and preserves the read-it-aloud flow exactly. Rejected: about 30 bits is not an address space you can defend with a rate limit on a public endpoint, and the right fix is entropy, not throttling. The ticket directory keeps the read-aloud flow without making the short code load-bearing.
- **Open seating behind an unguessable link (the desktop model, unchanged).** Fewer moving parts and no admission UI. Rejected for the public deployment: links leak — pasted into a group chat, screenshotted, shoulder-surfed — and the failure mode is a hijacked seat in a game in progress, which cannot be undone. Host admission makes the failure mode an unwanted knock.
- **Accounts, even lightweight ones.** Would give durable identity, stable reconnection and a basis for blocking. Rejected: it introduces credential storage, recovery flows, and personal data retention into a project whose entire privacy claim is that it holds none of those. Rotating per-tab capabilities give the reconnection benefit with none of the obligation.
- **A small API server in front of the room** for brokering, admission and limits. Familiar shape, easy to reason about. Rejected: it is a service to run, patch and pay for, and it duplicates authority that the room already holds — the room is the only component that can enforce these rules atomically with the game state.
- **A service worker for offline play from day one.** Very attractive for a game that works offline anyway. Deferred deliberately: a service worker is long-lived executable code on the origin with its own update semantics, and it should be added after the security posture is settled, not alongside it.
- **Analytics "just to see if anyone plays".** Rejected: it would falsify the README's standing claim, and the question it answers is not worth what it costs. If reach ever needs measuring, the platform's own aggregate request counts are already there and need no code.
