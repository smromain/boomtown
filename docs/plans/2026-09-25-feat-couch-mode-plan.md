# Couch mode: the technical plan (#62)

**Status:** Built. U34–U38 and U40–U42 are in this branch and a full couch game has been played in a
browser (one table, two phones, one bot). U39 turned out not to be needed; see KTD31.
**Design:** [`2026-09-24-feat-streaming-mode-design.md`](2026-09-24-feat-streaming-mode-design.md),
section *Couch mode*, and the **Couch mode - the phone** board on the design canvas.
**Numbering:** units continue from the web-deployment plan (U34 on), decisions from KTD23.

## What is being built

The desktop becomes the table: the board, the market, the log and the beats, and nobody's hand. Each
person at the table plays from their phone, which shows their tiles, their cash and holdings, and
whatever decision the game is waiting on them for. Hot-seat's hand-off card goes away, because
nothing private is ever on the shared screen.

The room is the one that already runs online play. A couch game is an online room with no seat
behind the desktop, so it inherits admission, seat tokens, reconnection, hibernation and bots
without new machinery. The phones need the internet, and so does the desktop. Couch mode
without a network is out of scope (see *Not doing*).

```
 desktop (table)                      PartyKit room                    phones (seats)
 ───────────────                      ─────────────                    ──────────────
 create-room {table: true} ────────▶  no host seat, a table token
                          ◀────────   table-welcome {token}
 shows QR of /phone/#t=TICKET
                                      ◀──── knock (resolved via the ticket)
 admit ───────────────────────────▶   seat ─────────────────────────▶  welcome {seat, token}
 start ───────────────────────────▶
                          ◀────────   table-update {view: TableView}   update {view: ClientView}
                                      ◀──── command {…}
```

## Key technical decisions

**KTD23. The table's view is its own type, projected by the engine.** `tableView(state)` returns
a `TableView`: everything in `PlayerView` that is the same for every reader, and none of the
`your*` fields. It is built from the same public projection as `viewFor`. That is not a second copy,
so the two cannot drift. What the table is owed, it is owed by construction. The alternatives were
a sentinel seat (`viewFor(state, -1)`), which indexes `hands[-1]` and would lie about a player
who does not exist, and a `PlayerView` with blanked fields, which type-checks as a seat and
would be one careless `view.yourHand` away from rendering an empty hand as if it were real.

Cash and holdings follow the table's rules exactly as they would for a seat that holds nothing:
open at an open table, open for any seat in `openBooks`, `null` otherwise. The pending decision
reaches the table as `{ seat, kind }` only. A `dispose-shares` decision carries the share count,
which is the deciding seat's holdings, so it is withheld.

**KTD24. The table is a connection role, not a seat.** `create-room` gains `table: true`. The creator
is not seated. The connection is marked the table and becomes the room's host authority: it admits,
declines, locks, ejects and starts. `RoomState.hostSeat` becomes `number | null`, with `null`
meaning "the table hosts". `RoomState.table` says whether this room has one. A room has at
most one table. A second connection cannot become the table, because `create-room` is refused once
the room exists.

**KTD25. The table has a token, handled exactly like a seat's.** 256 bits from `mintToken`, compared
with `tokensMatch`, rotated on every resume, and kept in the connection's persisted state
(`connection.setState`) so it survives hibernation the same way seat tokens do. The room also
persists `table: true` in its lobby record. A woken room then still knows it is table-hosted,
even if the table's socket was down across the wake. A table that cannot reconnect leaves a
game the phones can still play, with nobody able to admit. That is the same failure a seat-hosted
room already has when its host is lost, and it gets the same answer (see *Open*).

**KTD26. The table gets `table-update`, redacted for a public reader.** Each accepted command
produces the usual per-seat `update`s, plus one `table-update` whose events go through
`redactEventsFor(state, events, null)`. The `null` reader already exists and hides purchase and
disposal amounts on a closed table. It carries the retrospective on the last update, exactly as
the seats' do, because settlement makes it free. The seats' `update` message is unchanged.

**KTD27. `start` is host-only.** Today any seated connection can send `start`. Nothing in the lobby
UI lets a guest do it, but the room does not refuse it. Couch mode makes the table the only
thing that should start a game, so `start` goes through `requireHost` along with the other host
messages. A seat-hosted room behaves as before for its host.

**KTD28. Protocol version 3.** `hostSeat` becoming nullable breaks an old client's reading of room
state, and two message types are new. Old desktop builds are refused with `wrong-version` rather than
misreading a table-hosted room.

**KTD29. The phone page is served by the room's own deploy.** PartyKit's `serve` puts a static
directory beside the room on the same origin: `https://<host>/phone/`. This was spiked on
`partykit@0.0.115` under `partykit dev --serve`. `index.html` and a JS file came back 200 with
the right content types, and the room kept answering on `/parties/main/…`. The room's CORS
headers already work for cross-origin clients, and same-origin needs none. One deploy ships
room and page together, so they cannot disagree about the protocol version.

**KTD30. The phone URL carries the ticket in the fragment.** The QR code encodes
`https://<host>/phone/#t=ABCD2345`. A fragment is never sent to the server and never lands in
an access log. The phone resolves the ticket through the directory, exactly as the desktop's
join-by-code does, then connects and knocks. The table admits. The phone keeps its seat token in
`localStorage`, keyed by room address, so a locked screen or a reloaded tab resumes the seat
rather than knocking again.

**KTD31. The phone client is React, built by Vite into the server package.** It is small, but not
from scratch: it reuses the copy file, the desktop's pure decision arithmetic
(`panels/buying`, `decisions/disposal`, `game/motion`, `reference/priceReference`) through an
`@desktop` alias, `formatTicket`/`normaliseTicket`, and the socket transport. A second UI stack
would mean a second copy of every decision's wording and a second place for them to diverge.
*As built:* the desktop's prompt components turned out to be mostly modal layout, and the phone's
sheets are thin over the same copy and arithmetic, so the body/shell split (U39) was dropped. It builds to `packages/server/public/phone/`, which is gitignored and produced by the
release workflow before `partykit deploy`.

**KTD32. Room bots wait for the table's beats.** Online today, `runBots` plays every consecutive bot
move inline, and the table would receive them in one burst. A couch table is a shared screen
whose beats are the show, so the table tells the room when a covering beat starts and ends
(`{ type: 'pace', holding }`), and the room parks the bot loop while it is held. The hold is
capped server-side (`LIMITS.tableHoldMs`, 20s, longer than the ~18s merger beat), after which one
bot move is forced. Seat
commands are never held, only bots. This is the one change that alters an existing loop, so it
is its own unit (U38) and ships with a test that a dropped table cannot stall a game.

## Units

| Unit | What | Where | State |
|---|---|---|---|
| **U34** | `TableView` and `tableView(state)`; `viewFor` rebuilt on the shared public projection | `packages/engine` | Built |
| **U35** | Protocol v3: `create-room.table`, `table-welcome`, `table-update`, nullable `hostSeat`, `RoomState.table`, validator | `packages/protocol` | Built |
| **U36** | Table connection in the room: create, token, reconnect, host authority, `table-update` fan-out, persisted `table`, `start` host-only | `packages/server` | Built |
| **U37** | Client side of the table: a socket transport mode with no seat, a store slice for the table view, `SeatList` for a table host | `packages/client-core`, `apps/desktop` | Built |
| **U38** | Bot pacing: `pace` message, parked bot loop, server-side cap | `packages/protocol`, `packages/server` | Built |
| U39 | Prompt body/shell split: each decision's body renders without the modal chrome | `apps/desktop/src/prompts` | Not needed |
| **U40** | The table screen: GameScreen with no local seats, the couch lobby with the QR code, the waiting-on line for decisions | `apps/desktop` | Built |
| **U41** | The phone client: `apps/phone`, Vite build into `packages/server/public/phone`, `serve` in `partykit.json` | new package | Built |
| **U42** | Release wiring: build the phone page before `partykit deploy`; the dev scripts serve it locally | `.github/workflows`, root scripts | Built |

### U34. The table's view

- `TableView` in `packages/engine/src/state.ts`. It is `PlayerView` without `you`, `yourHand`,
  `yourCash`, `yourHoldings` and `pendingDecision`, plus `decision: { seat, kind } | null`.
- `viewFor` and `tableView` both build on one `publicProjection(state, reader: Seat | null)`.
  `reader` only decides the `bare` test for cash and holdings.
- Tests: across a whole seeded bot game at a closed Boomtown table, at every step:
  - the table view never carries a hand;
  - a seat's cash and holdings are null unless the table is open or the seat is in `openBooks`;
  - `decision` names the same seat as the owner's `pendingDecision`, with no payload;
  - every field the two share is equal to the same field in each seat's `viewFor`, except
    cash and holdings.

### U35. Protocol v3

- `CreateRoom.table?: boolean`. The validator rebuilds the message rather than passing it through,
  so an unknown field no longer rides along.
- `TableWelcome { type: 'table-welcome', token }`.
- `TableUpdate { type: 'table-update', view: TableViewDTO, events, retrospective? }`.
- `RoomState.hostSeat: number | null` and `RoomState.table: boolean`.
- `PROTOCOL_VERSION = '3'`. The round-trip test pins `TableViewDTO` as JSON-safe.

### U36. The table in the room

- `GameRoom.tableHosted` is persisted in the lobby record as `table`. When it is true,
  `hostSeat` is null.
- `seatUpdates` becomes `updates`, which adds one `{ kind: 'to-table' }` outbound when the room
  is table-hosted. `currentTableUpdate()` serves a reconnect.
- `room.ts`:
  - `create-room {table: true}` marks the sender the table (`setState({ table: true, token })`),
    sends `table-welcome`, and claims the ticket. It does not seat the sender.
  - `onConnect` with a token tries the table's token before the seats'. On a match it rotates the
    token, re-marks the connection and sends the current table update.
  - `onStart` restores the table's token from connection state after a wake.
  - `requireHost` accepts the table connection when the room is table-hosted, and only the
    host seat otherwise.
  - `broadcastRoomState` sends knocks to the host, whichever kind it is.
  - `dispatch` delivers `to-table` to the table connection.
  - `start` requires the host.
  - `eject`'s "not your own seat" guard applies only when a seat hosts.
- Integration tests against a real `partykit dev`:
  - a table creates a room and gets a token and no seat;
  - a phone knocks, the table admits, and the phone is seated;
  - a seat cannot admit or start;
  - the table can start, and after a move the table receives a `table-update` with no hand and
    no purchase amounts while the seats receive their own;
  - the table reconnects by token, the old token then fails, and it gets the current view;
  - a seat-hosted room behaves exactly as before.

### U37. The client side of the table

The socket transport grows a table mode. It connects, sends `create-room {table: true}` and keeps
the table token for resume, the same way it keeps a seat token. `GameClientState` gains
`table: TableView | null`. The table screen reads the public board from it, and `anyView` falls
back to it, so the existing spectator-safe reads work unchanged. `SeatList` already draws from
`game.isHost` and the room state. A table host is a host with no seat of its own, so the
"(you)" suffix and the self-eject guard key off `mySeat` being null.

### U38. Bot pacing

*As built:* pacing is opt-in and step-wise. A table that has sent `pace` is paced: the room plays
one bot move per `pace(false)` (the table sends it once the screen has settled after each change),
holds while `pace(true)`, forces one move after `LIMITS.tableHoldMs`, and stops pacing the moment the
table disconnects. The original sketch follows.

`{ type: 'pace', holding: boolean }` comes from the table only. While holding, `runBots` returns
before the next bot move and the room arms a release deadline (a few seconds, one constant). Release
or the deadline resumes the loop. The hold lives in memory only: a woken room is never holding, which
fails toward the game carrying on. A seat command during a hold is accepted as normal. Only the
bot loop parks.

### U39. Prompt body and shell

Each decision prompt today is one component that draws both the modal and the choice. It is split
into a body, which takes the view and a `send` callback and draws the choice, and the modal shell
the desktop wraps it in. The phone renders the same bodies in a full-screen sheet. The design
canvas's phone board is the reference for the phone layout.

### U40. The table screen

- `GameScreen` runs with `localSeats={[]}`, which already renders a table with nothing local to
  play. It reads the board from the table view.
- The couch lobby replaces the room code with a QR code of the phone URL. The code still shows
  underneath for anyone who would rather type it.
- Decisions show as a waiting-on line naming the seat, never the choice.
- The hand-off card never appears, because there is no local seat to hand off between.

### U41. The phone client

- `apps/phone` is a Vite React app built to `packages/server/public/phone/`.
- It has four screens, drawn on the canvas:
  - join: name, then knock;
  - waiting to be admitted;
  - your turn: hand, cash and holdings, the tile to play, buy;
  - the decision sheet (buy, dispose, vote, found, survivor, defunct order, end of turn).
- Buying and disposal are steppers built from `legalMoves` and the ruleset, not free inputs, so
  the phone can never compose an illegal command.
- `partykit.json` gains `"serve": "public"`, and `partykit dev` serves it the same way.

### U42. Release

The release workflow builds `apps/phone` before `partykit deploy`. `npm run server:dev` builds it
once and serves it, and a watch mode is optional. `docs/deploying.md` and `docs/development.md`
gain a paragraph each.

## Verification

- Unit: U34 above, plus validator cases for every new field and message.
- Integration: U36 above, and U38's "a dropped table cannot stall bots".
- Browser, with the `run-app` skill, for what only a browser shows:
  - two phone-sized pages and one table page on one room;
  - the table never shows a hand, including during the buy beat and the merger beats;
  - a phone's locked screen resumes the seat;
  - the table's beats hold the bots and then let them go.

## Not doing

- **Local-network couch mode.** It would need the desktop to run a room itself, which is a second
  server implementation, and phones on hotel and conference Wi-Fi often cannot reach a laptop
  anyway.
- **Accounts or a phone app.** A web page and a seat token are the whole identity story, as online.
- **Mixing a desktop seat into a couch game.** The desktop is the table or a seat, not both. A
  player without a phone can use a second browser window on any device.

## Open

- **Losing the table.** If the table's token is gone (the desktop crashed and hibernation dropped
  the connection state), the phones can finish the game, but nobody can admit or eject. A
  seat-hosted room has the same hole. Handing host authority to the first phone would close it,
  and is left for later.
- **Always-on-top** for the private window, from the design, is unaffected by this plan.
