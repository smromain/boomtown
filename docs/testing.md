# Testing — the verification contract

What is actually guaranteed, by which suite, and how to run it. The counts are real as of the
current `main`.

## The suites

| Command | What runs | Count |
|---|---|---|
| `npm test` | Both Vitest projects | **857** |
| `npm run test:engine` | The `engine` project (node): `packages/*/test/**` — engine, protocol, ai, client-core, and the room's own logic | 467 |
| `npm run test:desktop` | The `desktop` project (jsdom): `apps/desktop/**/*.test.{ts,tsx}` — components through `@testing-library/react`, plus the Electron main-process modules | 390 |
| `npm run test:server` | Integration: a real `partykit dev` room (workerd) | 20 |
| `npm run typecheck` | `tsc --noEmit` for both tsconfigs | — |
| `npm run lint` | eslint, flat config (including the no-`Math.random`/`Date.now` rule in the engine) | — |
| `npm run smoke` | Builds and boots the real Electron app | — |

The integration suite lives outside both projects because it boots a server and is too slow for the
default run. CI (`.github/workflows/ci.yml`) runs lint, typecheck and `npm test`; the release
workflow runs typecheck and `npm test` on all three operating systems before it packages anything,
so a red suite fails the release. There is no flag to skip that.

## What the engine tests guarantee

- Every row of the `rules.md` price/bonus table, for both published editions — including the 2015
  secondary column, which is a printed lookup rather than a multiple of anything.
- Merger sequencing: the placed tile never counts toward size, price or bonus; largest survives;
  defunct chains resolve largest-first, each fully before the next; bonuses then disposal in
  mergemaker-clockwise order.
- The motion to liquidate: the window, the register, the quota (including `quotaBySeats`), and that
  a failed motion opens its backers' books for the rest of the game.
- The `naming.md` lineage, byte-for-byte against `design/build.py` — Python's round-half-to-even
  included, which is why `Noquia → Noqu`.
- Determinism: a command log replays to an identical state, and a 300-game seeded fuzz of random
  legal moves runs to completion with no illegal-move throw.
- Bots: every move a policy emits is one the reducer accepts, across a fuzzed full game and every
  pending-decision type; the same seed replays identically; a strong bot beats a weak one materially
  more often than chance; and a bot's redacted view is a legal, consistent `GameState`.
- The room's persistence: every command — human and bot — is in storage *before* its update goes
  out, and a woken room rebuilt from its stored config and log is deep-equal to the live state,
  including the normal case where no seed was supplied. A log that cannot replay parks the room
  read-only.
- The room's guards: token-bucket limits survive 250 unpaced commands (the calibration that two
  earlier numbers failed), tokens compare in constant time and rotate on resume, a declined knock
  stays declined, and an all-bot room is refused at creation.

## What the integration suite adds

Against a real room over a real socket:

- A full 1-human/2-bot game to a ranked result.
- Three clients each receiving only their own view.
- A knocker holding no seat until the host admits them.
- A dropped client resuming its seat on its token.
- A ticket that resolves to the room address and is retired when the last seat fills.
- The lobby getting its room state even when it subscribes *after* connecting — the regression
  behind the "Waiting for the room…" hang.
- `create-room` refused for a table with no human seat.

## What tests do not catch

Two classes of bug have only ever been found by running the real thing, and both are worth the
extra minutes:

1. **Anything about the browser's own rules.** The ticket directory answered without an
   `Access-Control-Allow-Origin` header, so joining by code was impossible in the app while
   seventeen integration tests stayed green — Node's fetch does not enforce CORS.
2. **Anything about time.** Whether a beat holds the screen for its whole run, whether the table
   plays on behind a curtain, whether one overlay opens over another. Vitest renders components
   against a live engine but cannot answer a question about sequencing.

Use the `run-app` skill for both (`.claude/skills/run-app/`):

```bash
cd apps/desktop && npm run web        # the renderer alone, on :5173
node ../../.claude/skills/run-app/scripts/drive.mjs --until game-over --out /tmp/boomtown-run
```

- `drive.mjs` watches an all-bot table and prints one row per overlay window, with a fingerprint of
  the game underneath — so "the table played on behind a curtain" and "something opened on top of
  the beat" are both visible in the timeline rather than inferred.
- `playSeat.mjs` plays a *human* seat one action at a time, which is what hot-seat and every online
  question need. Its header documents the three traps every rewrite rediscovered (answer a dialog
  before escaping it; decision buttons are not named after the decision; two buttons in a dialog
  navigate rather than answer).
- `drive-online.mjs` runs two browsers against a real room: create, read the ticket, knock, assert
  no seat, admit, start, play to a result.

## The smoke test

`npm run smoke` builds the app, launches Electron on the packaged output with `BOOMTOWN_SMOKE=1`,
waits for React to mount, asserts **no Node globals leaked into the renderer** (`require`,
`process`, `module`, `global`, `Buffer`), then exits.

It needs a real display. Under bare `Xvfb` with no window manager it has been seen to time out
waiting for the renderer, so treat it as a desktop check rather than a CI gate.

## Conventions worth keeping

- **Assert on something real.** `expect(await store.list({})).toHaveLength(0)` passed against a
  `Map` forever, because a `Map` has no `length`. If an assertion cannot fail, it is decoration.
- **Test the shipped config, not a mock of it.** `afterPack.test.ts` mocks `executableName`, which
  is how a Linux binary named `@boomtowndesktop` shipped with two itch manifests pointing at a file
  that did not exist. Where a value comes from a config file, read the config file.
- **A test that plays a whole game is worth ten that set up a state.** The motion to liquidate was
  unreachable when first built and twenty engine tests missed it, because they set the turn step by
  hand; playing whole games found it in one run.
- **Widening a type is not a passing typecheck.** `GameRoom.reconnect` widened to `{seat, token}`,
  which was assignable to the old shape, so `room.ts` kept returning the stale token and only the
  live integration tests noticed.
