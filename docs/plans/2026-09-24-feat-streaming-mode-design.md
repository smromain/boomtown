# Streaming mode — design (#62)

**Status: proposed. Phase 1 (the lobby) is being built.** For review. Nothing here is decided until it moves to
`docs/decisions.md`.

## The problem, in one paragraph

A streamer shares the Boomtown window, and two kinds of thing on it should not reach the audience.
The **room code**, which sits at display size in the lobby header at exactly the moment a stream is
most likely running, and cannot be rotated once it leaks (one ticket per room, claimed once at
creation, `packages/server/src/room.ts` → `claimTicket`). And **everything private to the player**:
the hand, the placement highlights on the board that spell the hand out, the decision prompts, their
own cash and holdings at a closed-books table, and the amount of their own purchase. The comment on
the issue names the second half: a real streaming mode needs somewhere *outside the shared window*
for the tiles and every decision.

## The idea

> **In streaming mode the main window shows the table exactly as a spectator would see it.
> Everything only you should see moves to a second, small "private window" that you do not
> share.**

The streamer captures the main window in OBS (window capture, not display capture) and keeps the
private window on another monitor or beside the captured region. The audience sees a live table
with every seat's public moves; the streamer plays from the private window.

This is one rule rather than a list of things to blur, which is what keeps "streaming mode" from
accreting. The test for any future surface is the same question the app already asks at the
transport: *would a spectator at this table see it?* If not, it belongs in the private window.

## Why this is mostly already built

The app already knows how to render a spectator. `GameClientProvider` takes `localSeats`, and every
play surface gates on it: with no local seats the board renders `spectating` (no placement targets),
`TileRack` gets a hand-less `publicOnly` view and draws nothing, `DecisionModal` and `TurnModal`
never open, `Shareholders` shows only public books, and the hand strip shows `WaitingForSeat`
instead of the action bar.

So the main window in streaming mode is the existing `GameScreen` with **`localSeats={[]}`**.
The private window is a second subtree over **the same client and store**, with the real
`localSeats`, rendering only the private surfaces. No new redaction path, no new transport, no
second `reduce`.

## How the second window works

**A same-process child window, rendered with a React portal.** The renderer calls
`window.open('', 'boomtown-private', …)` and gets back a real `Window` in the same JS realm; React
renders the private subtree into its `document.body` with `createPortal`. Both windows then read the
one zustand store, so they cannot disagree about the game, and hidden state never crosses a process
boundary, never goes over IPC, and never touches the Electron bridge (so the "renderer never
touches the bridge" rule still holds).

- **Electron.** `main.ts` currently denies every `window.open`. It would allow exactly one frame
  name, `boomtown-private`, with `overrideBrowserWindowOptions` for a small always-on-top-capable
  window, the same hardened `webPreferences`, and a title of "Boomtown — private". Everything else
  stays denied. `will-navigate` protection already covers the child.
- **Browser build.** The same call opens a popup. Popups need a user gesture, so the window opens
  from a click — "Start game", "Enter game", or an explicit **Open private window** button — never
  from an effect. That keeps one code path for both shells and keeps `run-app` able to drive it
  (Playwright sees it as a `popup` page).
- **Styles.** A portal into another document brings no CSS. On open, the child's `<head>` gets
  clones of the parent's `<style>`/`<link rel=stylesheet>` nodes and the font faces, and a
  `MutationObserver` mirrors any added later (Vite injects CSS modules lazily in dev).
- **Content protection, as a bonus, not the mechanism.** In `did-create-window`, main calls
  `setContentProtection(true)` on the child. On Windows 10 2004+ that removes it from screen
  capture entirely, so even a display-capture stream shows a black box. macOS support is
  partial (newer capture APIs are reported to ignore it; unverified) and Linux has none. The
  design must be safe without it.

### What the private window holds

| During | Private window shows |
|---|---|
| Lobby (host) | The room code in full, with Copy |
| Your turn, place | Your rack, live — clicking a tile places it (the rack already dispatches `place-tile`) |
| Your turn, buy / end-check | The `TurnModal` content, inline |
| A decision owed by you | The `DecisionModal` content, inline: found, survivor, defunct order, disposal, vote |
| Off-turn | Your rack (read-only, effects live, as #61 has it), your cash and holdings |
| Hot-seat hand-off | The hand-off card — the private window is where the machine changes hands |
| Game over | Closes itself; settlement is public and the carousel is on the main window |

Prompts render **as page content, not as Radix dialogs**, in the private window. The window has
nothing else to be modal over, and a Radix focus trap across two documents is the part most likely
to fight back. That means splitting each modal into a body (the prompt) and a shell (the
`Dialog.Root`); the non-streaming path keeps the shell, the private window uses the body alone.
Minimize-to-pill goes away there, since the board is in the other window anyway.

### What the main window shows instead

The table as a spectator sees it, plus one card in the hand strip: **"Your hand is in the private
window"** with a **Reopen** button. While a decision is yours, `WaitingForSeat` already reads as
"waiting on {you}", which is the right thing for the audience to see.

## The leaks this has to close that `localSeats=[]` does not

1. **Your own purchase in the buy beat.** `BuyStockBeat` prints the cost and quantities whenever the
   event carries them, and the transport (rightly) does not redact your own purchase from you. In
   streaming mode the beat must treat the reader as a spectator: when the buying seat is local,
   pass `cost: null` and null picks, exactly the shape a closed table already sends for someone
   else's purchase. The rule in CLAUDE.md is "redact at the transport, never in the renderer"; this
   is the one place it bends, because the frame is going to the right reader and the leak is the
   screen, not the wire. Worth one line in `docs/decisions.md`.
2. **Sound.** Effects for your own moves are fine (placing a tile is public), but check that no cue
   is specific to something private, such as a distinct sound for drawing a dead tile.
3. **Error toasts.** A rejected command's message can name your tile. `ErrorToast` should render in
   the window where the command came from, which in streaming mode is the private one.
4. **The header's phase line.** It uses `useLocalActiveView`, so with no local seats it falls back to
   the public phase. Correct, but check it reads naturally ("Steve is buying" rather than blank).

## Failure modes, and which way each one fails

The rule: **streaming mode never falls back to putting private state on the main window by
itself.** A leak on stream is the failure that matters; an inconvenience to the streamer is not.

- **Private window closed mid-game.** The main window keeps `localSeats=[]` and shows the Reopen
  card. The turn waits, as it would for any seat. Nothing re-renders the hand in the main window.
- **Popup blocked (browser).** Same card. The Reopen button is the user gesture that unblocks it.
- **Streaming mode switched off mid-game.** Deliberate, from Settings: the private window closes and
  the main window gets its seats back. Switching it on mid-game does the reverse.
- **Reconnect, seat join, connecting banner.** The issue calls this out for the lobby code: a
  re-render must not unmask anything. Because masking is derived from the setting on every render,
  not held in component state that a remount resets, there is nothing to lose. The `run-app` check
  still has to prove it.

## The lobby half (the issue as written)

This ships first and stands alone.

- **Setting.** `streamingMode: boolean` in `Settings`, default `false`, in the *This machine* column.
  It needs no `SETTINGS_VERSION` bump: `loadSettings` merges stored values over defaults, so a new
  key arrives with its default. Label: "Streaming mode", hint: "Keeps the room code and your hand
  off the shared window."
- **Host's code block.** Masked from the first frame as `••••-••••`: the characters are replaced,
  not blurred, so the real code is not in the DOM or the capture. **Copy stays enabled**, because
  the clipboard is how the code actually travels. A **hold-to-show** control reveals it only while
  pressed (the one reveal that cannot be left on by accident). Once the private window exists, the
  unmasked code also lives there.
- **Joiner's field.** `type="password"` with the same hold-to-show while streaming mode is on, and
  cleared after a successful join. Paste still works.
- **Out of scope, deliberately.** Player names and knockers' names (a stranger's display name can
  reach a stream, but that is a moderation question, not this one). The netlog, which is being gated
  to dev builds.

## Phasing

1. **Lobby.** The setting, the masked code with hold-to-show and Copy, the joiner's field. Small,
   self-contained, and meets the issue's "done when".
2. **Private window, shell.** Allow the one frame name in `main.ts`, the portal host with style
   mirroring, open/reopen/close lifecycle, content protection. Private window shows only the rack.
   Main window runs with `localSeats=[]`.
3. **Private window, decisions.** Split `DecisionModal` and `TurnModal` into body and shell, render
   bodies in the private window, move `ErrorToast`, redact the buy beat, move the hand-off card.
4. **Docs.** `docs/decisions.md` gets the rule ("the main window is a spectator's view") and the buy
   beat exception; `docs/development.md` gets the OBS setup (window capture on the main window).

## Verification

- Unit: the setting round-trips; the code block never renders the ticket's characters while masked,
  across a remount; the buy beat nulls cost for a local seat in streaming mode.
- `run-app`, not just vitest: open a room with streaming mode on and screenshot the lobby through a
  connecting banner and a seat joining; play an all-bot game with one human seat and screenshot the
  main page at every step of a merger and a buy, asserting that no hand tile coordinate and no own
  cash figure appears in its text. Playwright drives the private window as the `popup` page.

## Hot-seat and the private window

A private window works because one person sits behind it. Hot-seat breaks that: two or more people
share one machine, and today the opaque hand-off card is what keeps them private, because everyone
takes turns looking at the same screen. Three options were weighed:

1. **One human per machine only.** Offer the private window only when this machine plays one human
   seat, and keep the hand-off card at hot-seat.
2. **A shared private window.** One private window hosts the hand-off card and then the claimed
   seat's hand. The people in the room take turns at a second monitor, which is the confusing part.
3. **Phones as private windows ("couch mode").** Every player holds their hand on their own phone,
   and the main window becomes a pure table view.

**Steve chose 3** (2026-09-25). It is specified below.

## Couch mode

> **The desktop app becomes the table: a board everyone watches, on a TV or a stream. Each player
> holds their hand on their own phone.** Nobody's private information is ever on the shared screen,
> so there is no hand-off card and nothing to cover.

### It is an online room with a table in it

Couch mode is not a new transport. It is an ordinary PartyKit room, the same one online play uses,
with two differences:

- **The desktop connects as the table, not as a seat.** It holds the host's authority (admit,
  decline, lock, start) but sits in no seat, and it receives the **public view**: what a spectator
  at that table is entitled to.
- **Every human seat is a phone.** A phone knocks, the table admits it, and the phone gets `welcome`
  with a seat and a token, exactly as a desktop joiner does today. Bot seats work as they do now.

So everything the room already guarantees carries over unchanged: `viewFor(seat)` per phone,
`redactEventsFor` per reader, knock/admit, rotating seat tokens, rate limits, expiry. A couch table
can also mix in remote players: a friend across town joins by code from their own desktop as usual.

**The room lives in the cloud, not on the local network.** Phones and the table all reach the
deployed PartyKit room over the internet, the way Jackbox works. The alternative, a server inside
the Electron app on the LAN, would put a listening socket on the player's machine, a new security
surface and firewall prompts on every platform, to save a dependency on internet access that online
play already has.

### Joining from a phone

1. The desktop picks **Couch game** from the menu and sets the table up (seats, bots, edition).
2. The table screen shows a **QR code** and the eight-character code beside it. The QR encodes a
   link to the hosted web build carrying the **ticket**, not the room's address: the ticket expires
   in about fifteen minutes and is retired when the last seat fills, so a QR photographed off a
   stream is worth a knock for a few minutes at most.
3. The phone opens the link, picks a name, and knocks. The knock appears on the TV; whoever holds
   the mouse lets it in.
4. When every seat is filled, Start deals. The phone switches to the hand screen, and the TV to the
   board.

Under **streaming mode** the QR and the code are masked the same way the lobby code is now: replaced
rather than blurred, with hold-to-show. The room has to be joinable without the stream seeing it, so
the players in the room can hold the button while scanning.

### What the phone shows

The **private surface**, the same one the private window was going to render, now at phone size:

- Your rack, live on your turn: tap a tile to place it. Effect labels (found, grow, merge, dead)
  carry what the board would tell you, and the board itself is on the TV.
- Your cash and holdings.
- On your turn, the buy step and the end-of-turn choice.
- Every decision you owe: founding, survivor, defunct order, disposal, and the vote.
- Off-turn, a quiet "watching" state naming whose turn it is.

That means splitting each of `DecisionModal`'s prompts and `TurnModal`'s steps into a **body**
(the prompt) and a **shell** (the Radix dialog). The desktop keeps the shell; the phone renders the
bodies as full-screen pages. It is the same split the private window needed, so none of that work is
lost.

The phone never shows the board, the beats or the story; those are the table's job. A mini-board may
earn a place later, but the first version bets that people look up at the TV.

### What the table shows

The existing `GameScreen` with **no local seats**, the spectator path described above: the board
read-only, no rack, no prompts, `WaitingForSeat` in the hand strip, and every beat on the big
screen. Sound plays here and not on the phones.

### What has to be built

| Piece | Where | Size |
|---|---|---|
| A **public view**: `viewFor` with no seat, so the table can be sent state with every private field removed | `packages/engine` | Small. `redactEventsFor` already takes `reader: null` |
| A **table connection**: `create-room` with `table: true` seats nobody, holds host authority by a table token, and is sent the public view | `packages/server`, `packages/protocol` | Medium. Today authority is `hostSeat`; it becomes "the host connection", which may or may not hold a seat |
| **The couch lobby** on desktop: QR, code, knock queue, start | `apps/desktop/src/lobby` | Medium |
| **Prompt bodies split from their shells** | `apps/desktop/src/decisions`, `game/TurnModal` | Medium, and shared with any future private window |
| **The phone client**: a route in the web build that knocks by ticket and renders the private surface at phone width | `apps/desktop` web build | Large. Needs artboards on the design canvas first |
| **The hosted web build** | Web-deployment plan, U21 to U25 | Large, and already planned. Couch mode cannot ship before it |

### Consequences worth deciding on purpose

- **It depends on the web build being deployed.** Everything up to the phone client can be built
  and tested against a local room and the browser build, which `run-app` already drives. Phones
  can't join until the web origin exists.
- **The web plan's small-screen gate has to give way.** R5 of that plan says "Boomtown needs a wider
  window" on a phone. The phone client needs an exception: the private surface is designed for a
  phone, and the rest of the game stays gated.
- **Every human needs a phone.** A player without one could be given a seat played on the table
  screen behind the old hand-off card, but that brings back the problem this solves. First version:
  no, a seat is a phone or a bot.
- **Room bots and beats.** Locally, bots pause while a beat covers the screen (`BotHold`). A room's
  bots don't wait for anyone's beats, so on a TV the table would play on behind a merger. The room
  needs to learn to hold its bots while the table has a covering beat up.
- **Room bots still read authoritative state** (the open item in `docs/decisions.md`). Couch mode
  does not make that worse, but it makes online bots more visible, so it is a good moment to close.

### Does couch mode replace the private window?

Probably. A streamer playing alone could open a couch table on the desktop and play their own hand
from their phone, which is everything the private window offered, with one mechanism instead of
two. The private window's remaining advantage is that it needs no phone and no internet. The
recommendation is to **build couch mode and drop the private window**, keeping phases 2 and 3 above
only as the body/shell split both of them need.

### Couch mode phasing

1. **Public view and table connection** (engine, protocol, server), with integration tests against
   a real `partykit dev` room: a table connection admits, starts, and is never sent a hand.
2. **Body/shell split** of the prompts. No behaviour change on desktop.
3. **Couch lobby and table screen** on desktop, driven by a browser page standing in for a phone.
4. **Phone client** on the design canvas, then built.
5. **Ship** once the web build is deployed.

## Decided

- **Phase 1 ships on its own** (Steve, 2026-09-25).
- **The private window is off by default** (Steve, 2026-09-25), as its own setting separate from
  streaming mode.
- **Hot-seat privacy goes to phones: couch mode** (Steve, 2026-09-25).

## Still open

1. **Build couch mode and drop the private window?** Recommended: yes.
2. **Always-on-top for the private window**, if it survives. Recommended: off, with a pin button.
