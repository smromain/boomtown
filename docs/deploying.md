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

The `deploy-party` job in the release workflow (below) runs `npx partykit deploy`.
The CLI only takes its non-interactive (headless) auth path when **both** of these
repo secrets are present as env vars — set just one and the CLI silently falls back
to reading `~/.config/partykit`, which doesn't exist in CI, and dies with
`run npx partykit login`:

| Secret | Value |
|---|---|
| `PARTYKIT_TOKEN` | a token from partykit.io → account → tokens |
| `PARTYKIT_LOGIN` | your PartyKit account slug — the `<account>` in `boomtown.<account>.partykit.dev` (`smromain`) |

Set both at GitHub → repo Settings → Secrets and variables → Actions.

## itch.io

The same `npm run package` output, pushed with butler. Three things differ from
the release-page downloads, each of them a way an itch upload otherwise breaks.

**What goes up is not the installer.** The itch app cannot install from a DMG,
and the NSIS installer is interactive (`oneClick: false`, choose-your-own path) —
which fights a launcher that wants to own the install directory. So macOS and
Windows push the **unpacked build directory** (`dist/mac-universal/`,
`dist/win-unpacked/`), and `electron-builder.yml` builds a `zip` target
alongside the DMG and the installer so those directories exist. Linux pushes the
AppImage as it stands. Pushing directories is also what makes butler's
block-diff patching work — it has nothing to diff inside an archive.

**Never archive an `.app` by hand.** A macOS bundle carries symlinks (the
`Frameworks` directory) and executable bits; `zip -r` flattens both, and macOS
reports the result as "damaged and can't be opened" — the same message an
unsigned app gives, from an entirely different cause. Use electron-builder's
`zip` target, or push the directory and let butler do it.

**A manifest says what to launch.** `build/itch/<platform>.itch.toml` is copied
to the root of the pushed directory as `.itch.toml` by `electron/itch.mjs`. It
names `Boomtown.app` / `Boomtown.exe` under the well-known action name `play`,
which the itch app renders as the highlighted *Play Now* button. An AppImage is
a single file with no root to copy into, and needs none — it is the executable.

### Push

```bash
cd apps/desktop
npm run package
npm run itch:stage -- mac        # stages the manifest, prints the path to push
butler push "$(npm run --silent itch:stage -- mac)" smromain/boomtown:osx --userversion 1.0.0
```

Channel names carry the platform tag, so they are the plain keywords —
`osx`, `windows`, `linux` — in kebab-case. A channel named anything else ships a
build with no platform tag, which no launcher will pick up. `--userversion` puts
your semver on the page instead of a build number.

### CI

The itch push runs inside the **build** job, on each platform's own runner,
rather than as a later job. That is deliberate: `upload-artifact` does not
preserve the executable bit, so a `.app` or an AppImage that travelled through
an artifact would not launch.

Three steps: `Configure itch.io publishing` sets `ITCH_PUBLISH` when a
`BUTLER_API_KEY` secret exists (itch.io → settings → API keys) and skips the
rest when it does not — via an env var, because a step's own `env:` block is not
readable from its own `if:`. `Set up butler` installs the CLI. `Publish to
itch.io` stages the manifest and pushes. The itch target defaults to
`smromain/boomtown` and is overridable with an `ITCH_TARGET` repo variable.

butler comes from **`remarkablegames/setup-butler`, pinned by commit SHA**
(v3.0.2) rather than its moving `@v3` tag. It uses `@actions/tool-cache`, which
downloads, extracts, caches and puts butler on `PATH` — and in particular
extracts a zip correctly on all three runners, where a hand-rolled step needs
`7z` on Windows (no `unzip`) and `unzip` elsewhere (GNU tar cannot read zips).
The pin is the point: the action supplies the binary that is handed the itch API
key moments later, so the version that runs should be one that was chosen rather
than whatever the tag moved to. Bump it deliberately. The setup step is not
given the key — it does not need one to install a CLI.

One sharp edge to know: the action maps an arm64 macOS runner straight to
butler's `darwin-arm64` channel with no fallback, and offers no arch input. If
that channel is ever missing the mac leg fails outright rather than degrading to
the amd64 build.

### Auto-update is off for itch builds

The itch app installs into a directory it manages and patches it in place, so
the app must not also update itself. `BOOMTOWN_DISTRIBUTION=itch` at build time
is baked into the main process by `electron.vite.config.ts` and read by
`electron/distribution.ts`; `checkForUpdates()` returns early on it. There is no
update feed configured today, so this changes nothing yet — it is there so that
adding one cannot quietly turn every itch install into two updaters writing the
same files.

### Gatekeeper: the itch app is the path that works

An itch build is exactly as unsigned as the DMG on the release page, but the
consequence is not the same, and this is worth getting right on the itch page.

macOS refuses an unsigned app with "is damaged and can't be opened" when the
file carries the `com.apple.quarantine` attribute — which a *browser* applies to
anything it downloads. The itch app fetches and extracts the build itself, so
nothing ever applies that attribute and the same bytes launch normally. itch's
own docs say as much: players using the app do not hit this, and they suggest
encouraging players towards it.

So the page copy should lead with the app for macOS, and keep the `xattr` line
as the fallback for anyone taking the direct download:

> **macOS:** install through the itch app and it just works. If you download the
> zip directly, macOS will call the app "damaged" — it isn't, it's unsigned, and
> macOS reports those the same way. Clear the flag once:
> `xattr -dr com.apple.quarantine /Applications/Boomtown.app`

None of this is a reason to skip signing: a signed build removes the caveat for
both paths, and the release workflow already signs whenever the secrets are
present.

## The desktop app (Electron)

Config: `apps/desktop/electron-builder.yml`. electron-vite bundles the renderer
and the main/preload processes from source (workspace packages via the vite
aliases, npm deps inlined), so the packaged app ships no `node_modules` — only
`out/**` and a minimal `package.json`.

### The app's icon and name

`apps/desktop/build/icon.png` (1024×1024) is the one icon source. electron-builder
converts it to `.icns` and `.ico` at package time, and `extraResources` copies it
into the installed app so `BrowserWindow` can use it as the window icon on
Windows and Linux (macOS uses the bundle icon instead).

It is generated from the existing logo — no separate artwork to keep in sync:

```bash
python3 design/make_icon.py     # apps/desktop/src/assets/boomtown-logo.png -> build/icon.png
```

The icon is the skyline mark alone, not the full wordmark: squeezed into a
square, "BOOMTOWN" is unreadable at the 16–32px sizes a taskbar actually draws.
Re-run the script after changing the logo and commit the result.

The name the OS shows comes from **`productName`** in `apps/desktop/package.json`
(Electron prefers it over `name`, which is the scoped workspace name) and from
the matching `productName` in `electron-builder.yml`. `electron/branding.test.ts`
fails if those two drift apart or the icon goes missing.

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

- macOS: `Boomtown-<version>-universal.dmg`
- Windows: `Boomtown Setup <version>.exe` (NSIS)
- Linux: `Boomtown-<version>.AppImage`

electron-builder only produces installers for the host OS's targets, so a full
three-OS release comes from the CI matrix, not one machine.

**macOS ships one universal bundle, not a DMG per architecture.** It used to
build both, and the x64 artifact was the one *without* an arch in its name — so
the obvious download was the wrong one for any Apple Silicon Mac, and it did not
fail loudly: an x64 bundle runs there under Rosetta 2 and is simply very slow. A
universal DMG is larger and always native.

The `afterPack` hook has to know about this. A universal build packs x64 and
arm64 separately, calls the hook on each, merges them with `@electron/universal`
and calls the hook once more on the merged app; the ad-hoc re-sign must happen
only on that last call. See *Security posture* below.

### Security posture (KTD9)

`electron/afterPack.mjs` flips the Electron fuses on the packed binary before
signing, in two tiers:

- **Every build** — `RunAsNode` off, cookie encryption on,
  `NODE_OPTIONS`/`--inspect` off.
- **Signed builds only** — `EnableEmbeddedAsarIntegrityValidation` +
  `OnlyLoadAppFromAsar`. These verify the bundle against a hash in a
  *code-signed* Info.plist; on an unsigned build there is no trustworthy
  signature to anchor to and the app hangs on launch, so the hook omits them
  (it detects signing from `CSC_LINK` / `WIN_CSC_LINK` / `APPLE_ID` /
  `CSC_IDENTITY_AUTO_DISCOVERY`).

`afterPack.test.ts` asserts both tiers and the per-platform binary path. Verify a
built app with `npx @electron/fuses read --app <path>.app`.

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

`.github/workflows/release.yml`. Two ways to trigger it:

- **Manual** — Actions tab → **Release** → *Run workflow*, enter a version like
  `1.0.0` (no leading `v`). The workflow creates the `v1.0.0` tag at the current
  commit of the default branch, then builds.
- **Tag push** — `git tag v1.0.0 && git push origin v1.0.0`.

Then, for that version, it:

1. **`prepare`** — validates the version is semver, creates the tag (manual only).
2. **`build`** (matrix: macOS / Windows / Linux) — `npm ci`, typecheck, full test
   suite, stamps the version into `apps/desktop/package.json` *for that build
   only* (not committed), `npm run package`, uploads the installers as artifacts.
3. **`release`** — downloads every OS's installers and publishes a **GitHub
   Release** for the tag with them attached (`softprops/action-gh-release`,
   auto-generated notes, marked prerelease if the version has a `-suffix`). Uses
   the built-in `GITHUB_TOKEN` — no PAT needed.
4. **`deploy-party`** — `npx partykit deploy` (needs both `PARTYKIT_TOKEN` and
   `PARTYKIT_LOGIN` — see the CI note above).

The repo's `package.json` version stays `0.0.0` until you bump it by hand between
releases; the workflow only stamps it transiently per build. Unsigned unless the
signing secrets above are set. No auto-update manifests until a `publish:` block
is added to `electron-builder.yml`.
