# Online play sat on "Waiting for the room…" — root cause, fix, and the net log

**Reported:** the released app, one human + two bots, "Play online" → the lobby
never filled in. Stuck on *Waiting for the room…*, Start disabled.

## Root cause: a frame delivered before anyone was listening

`socketTransport` fired `room-state` and the connection status into whatever
handlers existed **at that moment**, and kept no copy. The lobby cannot be one
of those handlers:

1. `createRoom()` awaits `client.connect()`, which resolves on the room's
   `welcome`.
2. The room sends `welcome` and `room-state` back to back
   (`joinSender` → `broadcastRoomState`), so the `room-state` frame is
   delivered while the app is still in `CreateJoin`.
3. Only then does React mount `SeatList`, whose `useEffect` subscribes.

The frame was already gone. Same for the socket's `open` status, which fires
before `connect()` even resolves — so `useConnectionStatus` sat on
`'connecting'` forever, which is what kept the Start button disabled.

**Why one human + two bots made it permanent.** A second human joining
triggers another `broadcastRoomState`, and the host's lobby catches up. With
bots there is no second joiner, so nothing was ever coming. The tests missed it
because both the integration tests (poll `transport.seat()`) and the lobby
unit-test fake (whose `onConnectionChange` calls back immediately on subscribe)
were unaffected by the loss.

## The fix

`packages/client-core/src/transport/socket.ts` now holds the last `room-state`,
the last lobby error, and the current connection status, and replays each to a
subscriber the moment it attaches. `onMessage` needs no such treatment —
`createGameClient` subscribes before `connect()` is called.

Also fixed alongside it:

- `SeatList` seeds its state from `transport.roomState()` instead of `null`.
- `filled` was `seats.every(...)` on a possibly empty array — vacuously true, so
  an unknown room offered a live Start button. It now requires a non-empty list.
- `connect()` takes a timeout (15s default): a socket that opens and is never
  answered used to leave the caller awaiting forever with nothing on screen.
- An `update` carrying a `rejection` now clears `outstandingCommand`, so a
  later lobby error isn't misattributed to a long-settled command.

Regression cover: `packages/client-core/test/socket-transport.test.ts` (fake
socket) and a real-room test in
`packages/server/test/socket-transport.integration.test.ts` that subscribes only
*after* connect resolves — it fails against the old transport with
`expected [] to have a length of 1`.

## The net log

Online failures are invisible after the fact, so `@boomtown/client-core` now
carries `netlog` — a 1000-entry ring buffer of every frame in and out, every
socket lifecycle event, host resolution, and each lobby decision.

- **Reading it in the app:** `Ctrl`/`Cmd`+`Shift`+`L` opens the overlay on any
  screen, with Copy for pasting into a bug report.
- **Dev builds:** on by default, mirrored to the console. Off under vitest.
- **Packaged builds:** off until Settings → *Log online play* turns it on
  (persisted in `localStorage`, so it survives the reload).
- **Room side:** `packages/server/src/log.ts`. Every lobby decision the room
  makes prints one `[room CODE] …` line — visible in `partykit dev`, and in
  `npx partykit tail` against the deployed room. Commands are deliberately not
  logged per-move; the command log already records those.

A stuck lobby should now be answerable from the timeline alone: either the
frames are there (a client bug) or they are not (a room or host-resolution bug).
