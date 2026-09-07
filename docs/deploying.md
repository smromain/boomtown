# Deploying Boomtown

Two independent artifacts: the **online room** (PartyKit, for cross-machine play)
and the **desktop app** (Electron installers). Neither depends on the other at
runtime — a desktop build with no reachable room simply can't start online games.

## The online room (PartyKit)

Code: `packages/server/` — one PartyKit room object per game (KTD6). The wire
contract is `@boomtown/protocol` (U15); the room reuses the pure engine and the
bot policy directly.

### Deploy

```bash
cd packages/server
npx partykit login      # GitHub OAuth, once per machine
npm run deploy           # = partykit deploy
```

The room name is `boomtown` (`partykit.json`), so the deploy URL is
`https://boomtown.<your-partykit-account>.partykit.dev`. **First deploy of a new
subdomain takes a few minutes** for the edge TLS cert to be issued — an HTTP/WS
probe fails with a TLS handshake error until then; this is normal.

Currently deployed: **`boomtown.smromain.partykit.dev`**.

### Verify

```bash
# a plain GET returns 500 "No onRequest handler" — correct, the room is WS-only
curl https://boomtown.<account>.partykit.dev/parties/main/probe
```

For a real check, `npm run test:server` from the repo root runs the integration
suite against a local `partykit dev`; the deployed room runs the same code.

### CI

`.github/workflows/release.yml`'s `deploy-party` job runs `npx partykit deploy`
on every `v*` tag, using the `PARTYKIT_TOKEN` repo secret (create one at
partykit.io → account → tokens).

## The desktop app (Electron)

Config: `apps/desktop/electron-builder.yml`. electron-vite bundles the renderer
and the main/preload processes from source (workspace packages via the vite
aliases, npm deps inlined), so the packaged app ships no `node_modules` — only
`out/**` and a minimal `package.json`.

### The baked online host

`apps/desktop/.env.production` sets `VITE_PARTYKIT_HOST`, baked into the renderer
at build time and read by `src/online/hostUrl.ts`. Precedence at runtime:

1. a non-blank **"Online host"** in Settings (per-user override, for a self-hosted room)
2. the baked `VITE_PARTYKIT_HOST`
3. `localhost:1999` — **dev builds only**; a release build with no host throws

To point a build at a different room, edit `.env.production`. Do **not** set an
empty `VITE_PARTYKIT_HOST` env var in CI — it shadows the file with a blank value.

### Build installers

```bash
cd apps/desktop
npm run package          # electron-vite build && electron-builder
```

Output in `apps/desktop/dist/`:

- macOS: `Boomtown-<version>-arm64.dmg`, `Boomtown-<version>.dmg` (x64)
- Windows: `Boomtown Setup <version>.exe` (NSIS)
- Linux: `Boomtown-<version>.AppImage`

electron-builder only produces installers for the host OS's targets, so a full
three-OS release comes from the CI matrix, not one machine. The x64 dmg on an
arm64 Mac occasionally fails in `hdiutil` (an environmental flake) — retry, or
build `--arm64` only for local testing.

### Security posture (KTD9)

`electron/afterPack.mjs` flips the Electron fuses on the packed binary before
signing: `RunAsNode` off, cookie encryption on, `NODE_OPTIONS`/`--inspect` off,
asar integrity + `OnlyLoadAppFromAsar` on. `afterPack.test.ts` asserts the
posture; verify a built app with `npx @electron/fuses read --app <path>.app`.

### Signing

Unset by default → **unsigned** artifacts (Gatekeeper will warn on first launch).
The release workflow reads signing secrets when present:

| Platform | Secrets |
|---|---|
| macOS | `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |
| Windows | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` |

### Auto-update

Wired in code (`electron/updater.ts`) but **no feed configured** — a packaged
build ships without an update channel and `checkForUpdates()` is a graceful
no-op. To enable, add a `publish:` block to `electron-builder.yml` (see the
comment there) once a hosting target (GitHub Releases, S3, …) is chosen.

### Release

Push a `v*` tag → `release.yml` builds all three OSes, packages, uploads the
installers as workflow artifacts, and deploys the PartyKit room. It does **not**
create a GitHub Release or attach the installers to one yet — that's a manual
step (or a follow-up to the workflow) pending the auto-update decision.
