# Online play — the room and its security model

One PartyKit room object per game, authoritative over everything. This is the part of the system
with an adversary, so it is documented in terms of what an attacker can and cannot do.

Code: `packages/server/`. Wire contract: `packages/protocol/`. Client side:
`packages/client-core/src/transport/socket.ts` and `apps/desktop/src/{online,lobby}/`.

## The room is the authority

The room holds `GameState` and applies every command through the same `reduce` the desktop app
uses. A client sends commands and receives `viewFor(itsOwnSeat)` — never the bag, never another
hand — and, at a table with the books closed, an event stream redacted the same way: a purchase
names the corporation and carries no quantity or cost unless that seat is yours or its books are
open. So a modified client can cheat no more than it can guess. It is also the only authority on
whose turn it is, on who hosts, and on which seat a connection holds.

Each accepted command is appended to a persisted log **before** its events are observable. That is
what makes the room disposable: it hibernates between messages and rebuilds itself by replaying the
log on wake. A log that cannot replay parks the room read-only rather than throwing, because a
throw on wake would brick that room forever.

The log is not quite the whole of what a wake needs. Between the deal and the first move there is
nothing in it, and an empty log used to be indistinguishable from a room still sitting in the
lobby — so a room that hibernated in that window woke up amnesiac and answered the opening move
with "no game in progress" (#63). A durable *started* marker rides the lobby key alongside the host
seat and the lock, and a wake with that marker and an empty log rebuilds the base game from the
persisted config. The resolved seed is what makes the rebuild the same deal, which is the invariant
replay already leans on. A room whose storage says it started refuses a second `start` outright,
because the alternative failure is silent: the seed is persisted, so a re-deal deals the same
game.

Bot seats are played by the room itself, inline (the edge has no worker threads and the policy is
synchronous), so a game with one human and two bots needs nobody else connected.

## Getting in

Four things a joiner might have, and what each is worth:

| Holding | Gets you |
|---|---|
| The room's 160-bit address | A socket, and a knock |
| A live 8-character ticket | The address, for about fifteen minutes |
| A seat token | That seat back, once |
| Nothing | Nothing — there is no listing, no lobby browser, no enumeration |

### A room's address is not the code you read out

A room is addressed by **160 bits** (`mintRoomAddress`, 32 characters of a no-lookalike alphabet)
that the creator mints and nobody speaks. The **eight-character ticket** a player shares is a
separate object: the room claims it from a `directory` party at creation, it resolves to the address
for **15 minutes** (`TICKET_TTL_MS`), and it is retired the moment the last seat fills.

These used to be one thing, and that was the weakness. When the room *was* its code, the address
space was however large a code a person can read out — about a billion, which is unguessable among
friends and enumerable from a public endpoint. Split, the thing that must be unguessable is 160 bits
and the thing a person says only has to survive a few minutes.

The directory answers a miss uniformly: unissued, expired and retired tickets are all a bare 404, so
sweeping the space learns nothing from the shape of a failure. `Access-Control-Allow-Origin` is set
on the *read* path only — and was missing at first, which made joining by code impossible in a real
browser while every integration test stayed green, because Node's fetch does not enforce CORS.

### Having the way in gets you a knock, not a seat

A joiner does not take a seat by connecting. They send `knock`, get `waiting`, and appear in the
host's queue; the host sends `admit` or `decline`. There is no path from knocking to seated that a
joiner can drive alone.

- A knock expires after **5 minutes** (`KNOCK_TTL_MS`).
- A decline **sticks** — the declined connection id cannot knock again, so "turn away" does not mean
  "wait a second and try again".
- The host can `set-locked` to stop accepting knocks entirely once everyone has arrived.
- The host can `eject` a seat, which hands it to a bot. It never reopens: a seat returning to `open`
  mid-game could be claimed by whoever knocked next, handing a stranger someone else's holdings.
- The room knows which seat created the game and refuses `admit`, `decline`, `set-locked` and
  `eject` from any other. The client's own sense of being the host decides only what to draw.

So a leaked link degrades to a nuisance rather than a disaster: the cost is a knock the host
declines. It is also the one control here that needs no identity at all — the person who knows who
they invited decides.

### Seat tokens, not accounts

Being admitted mints a **256-bit** token (`mintToken`). Reconnecting presents it and the room
re-binds that seat. No password, no email, nothing that outlives the game. The token is compared in
**constant time** against every occupant (comparing only the claimed seat would leak which seats
exist), and it **rotates on every resume**, so a captured token is worth a single reconnect rather
than the rest of the game. A seat stays reserved by its token while its player is away — a dropped
connection is a pause, not a forfeit.

## What the room refuses

| Guard | Where | Limit |
|---|---|---|
| Frame size | `protocol/validate.ts` | 16 KB |
| Structural validation | `protocol/validate.ts` | Every message type, before `reduce` ever sees it |
| Validation strikes | `server/limits.ts` | 5 malformed frames closes the connection |
| Command rate | `server/limits.ts` | 50/s sustained, 400 burst, per connection |
| Connections | `server/limits.ts` | 24 per room |
| Commands per room | `server/lifecycle.ts` | 5,000, then the room stops accepting |
| Idle expiry | `server/lifecycle.ts` | 6 hours, by alarm, then storage is deleted |
| Protocol version | `server/room.ts` | Mismatch is refused at the door |
| Room address shape | `server/room.ts` | `create-room` only at a real 160-bit address |
| Config sanity | `server/seats.ts` | `configError` (seat count, bot seats, difficulty) and `humanlessRoom` |
| Display names | `server/seats.ts` | NFC-normalised, control/zero-width/bidi characters stripped, length capped |

Two notes on the numbers. The rate limit is calibrated against a *legitimate* client at full speed,
not against a person: the integration suite plays an entire game over a socket with no pacing — 8/s
and then 30/s both stalled it, which is exactly the "limits that punish real play" failure, caught
by the only test that plays a whole game. And the rate limit is not what bounds sustained abuse; the
per-room command ceiling is.

`create-room` is also refused for a table with no human seat. The creator takes the first *open*
seat, so an all-bot table would turn its own creator away with `room-full`, which reads as though
somebody else got there first. Note that an all-bot *game* is still perfectly legal — `GameRoom.start()`
plays one to a ranked result — which is why that check is `humanlessRoom` rather than part of
`configError`.

## The lobby, end to end

1. The client mints an address and connects to it, sending `hello` then `create-room` with the
   `RoomConfig` (seat count, edition, visibility, bot seats, optional seed).
2. The room validates the config, claims a ticket from the directory, and seats the creator in the
   first open seat — recording it as `hostSeat`.
3. Every lobby change broadcasts `room-state`. Only the host's copy carries the knock queue.
4. A joiner resolves the ticket over HTTP (`GET /parties/directory/<ticket>`), connects to the
   address it returns, and `knock`s.
5. The host admits; the joiner gets `welcome` with its seat and token.
6. The host sends `start` once every seat is filled (a bot seat counts as filled). The room deals,
   broadcasts `room-state` with `phase: 'playing'`, and sends each seat its first `update`.
7. The ticket is retired as soon as the last seat fills.

### A couch table instead of a host seat (#62)

`create-room` with `table: true` makes the creator the **table**: a connection with host authority
and no seat. It gets `table-welcome` with a token, handled exactly like a seat token (256 bits,
constant-time comparison, rotated on every resume, kept in the connection's persisted state). Every
seat is then filled by knocking, and `RoomState` reports `hostSeat: null` and `table: true`. The
table is sent `table-update`: the engine's `tableView`, with events redacted for a reader holding no
seat. The table cannot knock, and no seat can admit, lock, eject or start. `start` is host-only in
every room.

**Pacing.** A table can send `pace {holding}`. Once it has, the room plays bots one move at a time:
one move per `pace(false)`, which the table sends when its screen has settled after each change,
none while `pace(true)` holds a covering beat, and one forced move after `LIMITS.tableHoldMs` (20s)
so a stuck table cannot stall a game. A table that disconnects stops being paced, and a client that
never sends `pace` gets the old loop. Seat commands are never held.

**The phone page.** `apps/phone` is served by the room itself at `/phone/` (`"serve": "public"` in
`partykit.json`). The table's QR code is `https://<room host>/phone/#t=<ticket>`: the ticket rides in
the fragment, which never reaches a server log. The page resolves the ticket, knocks, and keeps the
seat token in `localStorage` so a locked phone or a reload resumes the seat. See
`docs/plans/2026-09-25-feat-couch-mode-plan.md`.

## Diagnosing it

- Client side: `Ctrl`/`Cmd`+`Shift`+`L` opens the netlog on any screen — every frame in and out,
  socket lifecycle, host resolution, lobby decisions, with a Copy button. Dev builds only: a
  packaged build ships neither the overlay nor the Settings switch, and captures nothing until
  `localStorage['boomtown.netlog']` is set to `on`, which mirrors the timeline to the console.
- Room side: every lobby decision prints one line. `npm run server:dev` shows them locally;
  `npx partykit tail` against the deployed room.
- `npm run test:server` boots a real `partykit dev` room and plays against it. See `testing.md`.

## What is not done

- **The room's bots are handed authoritative state.** `runBots` calls
  `policy.chooseMove(this.state, …)` where the local driver passes `beliefState(...)`. Online bots
  can therefore read hidden holdings, which at a closed table they should not. Tracked in
  `decisions.md`.
- **No abuse reporting, no bans.** The controls above are per-room and per-connection; nothing
  persists across rooms, deliberately, because nothing identifies a person.
- **No web build.** The threat model for a public URL — where a room is reachable by anyone rather
  than by whoever holds a ticket — is worked out in
  `plans/2026-09-14-feat-web-deployment-plan.md`, and only its security units (U26–U30) have
  shipped.
