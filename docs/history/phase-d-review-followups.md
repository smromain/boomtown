# Phase D — code-review follow-ups

`ce-code-review` (8 reviewers) ran on the Phase D + U19 diff (commits `f208b7f`..`439c678`).
Verdict: **Not ready**. The P0 and all five P1 findings were fixed in `7be2fc6`
(`fix(review): Phase D`). This file records the remaining findings, deferred by
explicit decision, so they are not lost.

Run artifacts (this machine, transient): `/tmp/compound-engineering-501/ce-code-review/20260907-073059-6157afd1/`.

## Deferred — P2

| # | File | Finding | Suggested fix |
|---|---|---|---|
| 8 | `packages/protocol/src/dto.ts` | The `DeepJsonSafe` compile-time guard is inert — the `_PlayerViewIsJson` type aliases are declared but never consumed, so a `never` result does not fail the build. | Consume the aliases (`type Assert<T extends true> = T; type _P = Assert<_PlayerViewIsJson>;`) or delete the guard and rely on the round-trip test. |
| 9 | `packages/server/src/seats.ts` | Dead code: `SeatTable.seatForConnection` / `seatForToken` / `botDifficulty` have no callers. | Delete all three. |
| 10 | `packages/client-core/src/transport/socket.ts` | `outstandingCommand` was never cleared after a successful reconcile, so a later bare `error` frame could be reported as a spurious rejection. | **Largely fixed in `7be2fc6`** (cleared on every clean update). The residual: an `error` that arrives between `send` and the confirming update still attaches to that command — acceptable, but worth a match-by-id if command IDs are ever added. |
| 11 | `packages/client-core/src/transport/socket.ts` | `partysocket` reconnect re-fired the `open` handler and re-sent `create-room`/`join`. | **Fixed in `7be2fc6`** (a `joined` flag). Kept here only because the review's stable `#` referenced it. |
| 13 | `packages/server/src/game-room.ts` | `botRngState` resets to its seed on every `rehydrate`, so post-wake bot moves are drawn from a rewound RNG. | Persist `botRngState` (`{ s: number }`) to `party.storage` after each `runBots` pass and restore it in `rehydrate`, or derive it from the command count. Determinism of the *command log* (R7) is unaffected; only future bot play after a wake diverges from what it would have been. |
| 14 | `packages/server/src/room.ts` | The `start` command is accepted from any seated connection, not just the room creator. The lobby UI only shows Start to the host. | Record the creator's seat on `GameRoom` at `create-room` time; reject `start` from any other seat with a `protocolError`. Low blast radius under the friends-only trust model. |

## Deferred — P3

| # | File | Finding | Note |
|---|---|---|---|
| 15 | `apps/desktop/src/lobby/useConnectionStatus.ts` | `SocketExtras.onRoomState` / `onConnectionChange` returned no unsubscribe. | **Fixed in `7be2fc6`** — all three subscription methods now return an unsubscribe, and the hooks return it from their effects. |
| 16 | `packages/client-core/src/transport/socket.ts` | Session token is transmitted in the WebSocket URL query string (CWE-598). | Acceptable under the friends-only trust model and hard to avoid with `partysocket` (`onConnect` only sees the handshake). Revisit if the trust model tightens: send the token in the first WS message, keep the deploy WSS-only. |
| 17 | `packages/server/src/seats.ts` | Reconnect binds a seat on a bearer token with no expiry, rotation, or replay limit (CWE-613). | Acceptable under the friends-only trust model. If it tightens: TTL, rotate on each reconnect, invalidate on game-over. |

## Deferred — from the residual-risks bucket

- **Config-form duplication** across `NewGame.tsx`, `CreateJoin.tsx`, and `SettingsDialog.tsx`;
  `CreateJoin` re-implements `resizeSeats()` and `seats.ts:setupOptionsFor` duplicates
  `gameConfig.ts:toSetupOptions`. Extract a `<GameOptionsFields>` component and reuse.
- **The `hello` wire message** (`packages/protocol/src/messages.ts`) is defined and
  round-trip-tested but never sent or consumed. Version travels in the `v` query param,
  identity in `name`. Drop the `Hello` interface, its `ClientMessage` arm, `room.ts`'s
  `case 'hello'`, and the export; fix the stale handshake comments.
- **`partykit-server.ts` globalSetup** does not kill the spawned `partykit dev` child on the
  readiness-timeout path and leaks its stdout listener. Kill the child in both reject paths.
- **`checkForUpdates`** swallows every `electron-updater` error into `{ available: false }` —
  a broken update feed is invisible to users and operators.
- **connection→seat is tracked in two places** (`room.ts` `seatByConnection` + `SeatTable`
  occupants). Pick one owner.

## Deploy / packaging — done since (2026-09-07)

The online room is deployed (`boomtown.smromain.partykit.dev`) and verified end to
end; the host is baked via `apps/desktop/.env.production`; `hostUrl.ts` now throws
in a release build with no host instead of falling back to localhost. `electron-builder`
produces a working, fuse-hardened unsigned `.dmg` on this machine — the fuses
(KTD9) are flipped by the new `electron/afterPack.mjs` (`afterPack.test.ts` guards
the posture), which U19 had left unwired. The fake auto-update feed URL was
removed; `updater.ts` stays a graceful no-op. See `docs/deploying.md`.

## Testing gaps still open

- `apps/desktop/electron/updater.ts` has no test (P1-severity coverage gap): the packaged
  guard, the version compare, the dynamic-import catch, and the dialog-response branch.
- **AE3** (redeploy mid-merger → replay → continue): the `rehydrate` deep-equality tests never
  enter a merger, so replay reconstruction of `state.merger.pending` is unproven. `seatOnClock`'s
  merger-pending branch is also untested.
- No integration test forces a real Durable Object eviction — AE2 and AE3 are verified only
  against a continuously-warm `partykit dev`.
- `room.ts` `onMessage` error branches (malformed JSON, create-room-when-exists,
  command-with-no-seat) are covered only by the opt-out integration suite.
- `runBots`' `if (!choice) return out` branch is untested.
