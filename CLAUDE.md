# Boomtown

A desktop game of corporate consolidation — the mechanics of **Acquire**, re-themed and renamed,
with a variant of our own.

**Where it stands.** Built and shipping. `v2026.9.1` is published with macOS, Windows and Linux
installers; the release workflow also pushes the unpacked builds to itch.io and deploys the online
room from the same commit. Hot-seat, bots and online play all work; 999 unit tests and 23
integration tests are green. Builds are **unsigned**, so macOS needs one `xattr` command on first
launch. The work now is refinement, not construction.

Read this file for the shape of the thing and the rules a change has to respect; read `docs/` for
anything specific. `docs/decisions.md` under **Open** is the honest list of what is not done.

## Read these first

| File | What it holds |
|---|---|
| `docs/README.md` | The index: which document owns which question, and what is current versus archival |
| `docs/architecture.md` | The system as it stands — packages, dependency direction, how a command travels, where each concern lives |
| `docs/rules.md` | The complete rules model: two published editions reconciled, the Boomtown variant specified, turn structure, merger sequencing, bonus ties, the price/bonus table, every `Ruleset` key |
| `docs/naming.md` | The 28-company pool, the merged-name rule, flavour accretion, card consolidation |
| `docs/decisions.md` | What was decided and why, what has been superseded, and what is still open |
| `docs/development.md` | Running the app (Electron, browser, two instances), the environment variables, diagnosing online play |
| `docs/testing.md` | What each suite guarantees and how to run it — the verification contract |
| `docs/online-play.md` | The room: addresses and tickets, knock/admit, seat tokens, rate limits, hibernation |
| `docs/deploying.md` | Cutting a release, the PartyKit deploy, itch.io channels, versioning |

## The map

```
packages/
  engine/        headless rules — no I/O, no randomness but one seeded PRNG
  protocol/      the wire contract — message union, DTOs, typed errors, validation, addresses
  ai/            bot Policy over the engine — heuristics, a redacted view, the vote
  client-core/   GameSession, GameTransport (local / worker / socket), store, bot driver, netlog
  server/        the authoritative PartyKit room — seats, admission, command log, server-side bots
apps/
  desktop/       Electron app — hardened shell, board, panels, decision modals, beats, sound, lobby,
                 and the after-game carousel (`src/after/`)
docs/            the documentation set above, plus plans/, history/ and screenshots/
design/          build.py (design canvas + reference naming implementation), make_icon.py,
                 make_skyline.py (recolours skyline.psd into the launch backdrop)
```

**The dependency direction is strict and `engine` depends on nothing.** `protocol` depends only on
engine types; `client-core` and `server` depend on engine + protocol; `desktop` depends on
`client-core`. There is exactly one `reduce` code path for hot-seat, bots and online play.

## Constraints that shape the code

These are the things a change has to respect. Each is load-bearing, and most were learned by
getting them wrong once.

- **The ruleset is data, not code.** Two published editions disagree on safe size, end trigger,
  bonus tiers, price bands, sole-shareholder policy, dead tiles, the two-player rule and split
  rounding. One engine reads a `Ruleset` object; `classic` and `edition2015` are presets.
  **Boomtown** — classic's numbers plus closed books and a vote that can end the game early — is a
  third preset rather than a fork, and **it is the default**. A bare `createGame` deals a
  closed-books table whose turn can hold at end-check for a motion; a caller that wants the plain
  published game asks for `classic` by name.

- **Determinism is absolute.** A single seeded mulberry32 PRNG carried in state is the only
  randomness under `packages/engine`. `Math.random` and `Date.now` are banned there by lint,
  because one unseeded call breaks replay, reconnection and bot reproducibility at once. The
  command log is the persistence substrate: it replays to an identical state or the room parks
  read-only rather than throwing.

- **`reduce` never throws for a rule violation.** Every action is a typed `Command`;
  `reduce(state, command)` returns events plus a new state, or a typed `EngineError`. A throw means
  a bug, not an illegal move.

- **Merger resolution is the only genuinely sequenced part of the game.** Defunct chains largest
  first; per chain, bonuses then disposal in mergemaker-clockwise order; each fully resolved before
  the next. It is an explicit state machine yielding typed pending decisions
  (`choose-survivor`, `choose-defunct-order`, `dispose-shares` — and `cast-vote`, which rides the
  same channel), each naming the seat that owns it. Get this wrong and nothing else matters.

- **The placed tile never counts** toward either corporation when sizes, prices or bonuses are
  computed. It joins the survivor afterwards.

- **A corporation has two names.** `baseName` belongs to the headquarters marker and never changes
  — held defunct stock, refounding and the board badge all key off it. `displayName` is *derived*
  from the base name plus an ordered list of what it has eaten, never stored. The naming code is
  **ported from `design/build.py`**, not reimplemented from prose: a prose reimplementation already
  failed once by returning whole-word fragments.

- **Hidden information is real.** Hand tiles and the draw pile are always hidden. `viewFor(seat)`
  is the only way state reaches a client, and the room serialises nothing else. Cash and holdings
  visibility is a per-table setting rather than a rule **for the two published editions**; the
  Boomtown preset fixes it closed (`forcedVisibility`), because at an open table the register a
  motion publishes is already public and the disclosure it charges for costs nothing.

- **The event log obeys the same rule as the view.** It did not, and that was a real leak: the room
  filtered each connection's view and handed everyone one shared array of events, so a closed
  table's purchase quantities and costs reached every client whether the UI printed them or not.
  `redactEventsFor` is now called at **both** transports, per reader — under
  `publicPurchaseDetail: false` a purchase names the corporation and carries no amount unless the
  seat is yours or its books are open. Redact at the transport, never in the renderer: a number a
  client should not have must not be in the frame it receives.

- **A bot sees what a player at that table could see.** `redactFor`/`beliefState` hand a policy a
  consistent but redacted `GameState` — its own hand intact, everyone else's replaced by a
  plausible deal. A bot has to run `reduce` to look ahead, so the honest boundary is a redacted
  argument rather than a narrower one. *The room does not do this yet* — see the open item in
  `docs/decisions.md`.

- **Having the way in gets you a knock, not a seat.** A joiner who has the room's address or a live
  code is moved to *knocking* and no further; the host admits or declines. There is no path from
  knocking to seated that a joiner can drive alone, and the room is the authority on who hosts.

- **A room's address is not the code you read out.** The address is 160 bits the creator mints,
  never shown. The eight-character code is a separate expiring ticket that resolves to it for about
  fifteen minutes. Collapsing the two is what made the old scheme weak.

- **Hot-seat is private by construction.** An opaque hand-off card covers the screen between two
  human seats. The turn advances the instant a buy resolves, so anything that covers the screen
  defers the hand-off and anything that does not, does not — a light beat that got this wrong leaked
  the next player's hand for a second every turn.

- **The end-of-game record is a fold over the command log, built where the log is.**
  `retrospective(initial, commands)` replays the log to produce the per-turn series, the company
  timeline and the 22 superlatives (#68, #69). It needs no stored state and replays identically —
  and it must be built by the *authority*: the room from its own log, the local session from its
  own. Folding it client-side out of the event stream would hand a closed table a different history
  per reader, which is the bug #60 closed. It goes out whole and unredacted at settlement, which is
  the one moment that costs nothing, because settlement already publishes every seat's cash and
  holdings.

- **Copy lives in one file.** `apps/desktop/src/copy/constants.json` holds every word the app says.
  Components import from `copy/copy.ts` and hold no sentences of their own.

- **The renderer never touches the Electron bridge** except `src/debug/dump.ts`, which checks first.
  That is what lets the whole game run in an ordinary browser, which is the only way to drive it
  from a script.

## Working here

```bash
npm install            # workspaces; ELECTRON_SKIP_BINARY_DOWNLOAD=1 where there is no display
npm test               # 999 unit tests, both projects
npm run typecheck      # both tsconfigs
npm run lint           # eslint flat config
npm run test:server    # 23 integration tests against a real partykit dev room
npm run dev            # the Electron app
npm run server:dev     # the room on :1999, which a dev build talks to by default
```

Run `npm run typecheck`, `npm run lint` and `npm test` before committing; run `npm run test:server`
when anything under `packages/server`, `packages/protocol` or the online client changes.

**Tests that pass are not proof the app works.** Two classes of bug have only ever been caught in a
real browser: a missing CORS header that made joining by code impossible while seventeen integration
tests stayed green, and anything about *timing* — whether a beat holds the screen for its whole run,
whether the table plays on behind a curtain. Use the `run-app` skill (`.claude/skills/run-app/`) for
those: it serves the renderer and drives it with Playwright.

**Don't hand-edit generated files.** `design/*.dc.html` comes from `design/build.py`;
`apps/desktop/build/icon.png` from `make_icon.py`; `apps/desktop/src/assets/night/*.png` from
`make_skyline.py`. Edit the generator and re-run it.

## Working on the design canvas

`design/build.py` is the source of truth for every artboard. To change the design, edit `build.py`,
then:

```bash
cd design && python3 build.py
```

Then re-seed and republish via the `design` skill where the session has it, keeping
`design/boomtown.html` as the file path so the artifact URL is preserved. Without that skill the
`build.py` edits and the regenerated `.dc.html` files still stand; only the republish waits.

**The canvas is editable in the browser and Steve edits it.** Before regenerating, re-read the
published artifact and diff it against the working files — six flavour lines and two company names
were edited in the browser on 2026-09-06 and had to be folded back into `build.py`. Diff *visible
text*, not markup: the editor rewrites `<path/>` as `<path></path>` and escapes `&`, so a raw diff
is mostly noise.

Note that `build.py`'s company pool has drifted from the one that ships
(`packages/engine/src/pool.ts` is the pool of record), so **the canvas shows companies that are not
in the game**. See *Known divergence* in `docs/naming.md`.

Published design canvas (9 artboards over 3 pages):
https://claude.ai/code/artifact/f1b58905-2da0-4cd0-9c2e-8d65624260a3

## Legal position, stated once

The rules and mechanics of a board game are not protectable and can be implemented freely.
**ACQUIRE** is a live Hasbro/Avalon Hill trademark, as are the original corporation names — none of
which are used. Everything in this project is original or a parody of a defunct brand.
**Nothing has been trademark-searched.** See the open questions in `docs/decisions.md`.
