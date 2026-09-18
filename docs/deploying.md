# Deploying Boomtown

> Release *procedure* — what to click, which jobs run, which secrets matter — is in the README's
> **Cutting a release**. This document owns the parts that outlive a run: the room, versioning, and
> the itch.io pipeline. The rest of the documentation set is indexed in `README.md`.

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

## Versioning

Two version numbers exist here and they are not the same thing. Conflating them
is the mistake this section exists to prevent.

### The app: CalVer, `YYYY.M.N`

`2026.9.1` is the first release in September 2026, `2026.9.2` the second, and
`2026.10.1` the first in October. **`N` counts releases within the month, not
the day of the month** — so two releases on one day need no special case, and a
quiet month simply has fewer numbers.

Semver was the wrong shape for this project. Semver's whole job is to promise
something about compatibility — patch is safe, minor adds, major breaks — and
those promises are addressed to somebody integrating against a published API.
Boomtown has no API consumers. It has players, who get a rolling stream of
releases on a storefront, and for them the only useful question a version
answers is "how fresh is mine?". A date answers that. `1.4.2` does not, and
pretending otherwise means an argument about whether a bug fix plus a new sound
effect is a minor or a patch — an argument with no correct answer and no
audience.

**Leading zeros are forbidden, which is why the month is `9` and not `09`.**
electron-builder and electron-updater parse this string as semver, and
`2026.09.1` is not valid semver — a numeric identifier may not have a leading
zero. `2026.9.1` is both a valid semver and a date, which is what makes this
work at all rather than being a fight with the packaging tools. Ordering behaves
too: `2026.9.2` < `2026.10.1` < `2027.1.1`, because those are ordinary numeric
comparisons on major/minor/patch.

The `prepare` job resolves the version. Leave the workflow's version input blank
and it finds the highest `vYYYY.M.*` tag for the current month and adds one;
fill it in to force a value; a tag push uses the tag. A shape guard rejects
anything that is not `YYYY.M.N`, so a leading zero fails in `prepare` in seconds
rather than at packaging time twenty minutes later.

**An optional `-rcN` suffix rides along** for a rehearsal release: `2026.9.3-rc1`
is still valid semver, and semver orders a prerelease *below* its release, so an
rc and the real thing share an `N` on purpose. The auto-increment ignores rc tags
for the same reason — cutting `rc1` must not burn the number its release wants —
and the GitHub Release is marked as a prerelease.

`apps/desktop/package.json` stays at its placeholder `0.0.0` permanently. The
release version is stamped into the manifest for the build only and never
committed, so there is no version to bump by hand and no chance of the repo and
the release disagreeing.

The settings pane prints that version back, bottom-left of its footer, with the
date the bundle was built: `v2026.9.1 · released 2026-09-14`. Both are
compile-time constants from `apps/desktop/buildStamp.ts` — the renderer never
touches the Electron bridge, so `app.getVersion()` is not available to it, and
reading the manifest at config time picks up the `npm version` the workflow runs
one step earlier. The date is the build day in UTC, which for a release build is
the release date, because the workflow builds from the tag it has just cut;
`BOOMTOWN_BUILD_DATE` overrides it for a reproducible rebuild. A build that did
not come off the workflow still carries `0.0.0`, and the line reads *Unreleased
build* rather than printing a version no release ever had.

### The protocol: a plain integer

`PROTOCOL_VERSION` in `packages/protocol/src/version.ts` is a compatibility
contract between a client and a room, and it moves **only** when the wire
contract breaks — not on a release. Most releases leave it exactly where it is.

Tying it to the app version would force a protocol break on every release, which
would mean every desktop build older than an hour could no longer reach a room.
The two answer different questions: the app version tells a player how fresh
their build is, and the protocol version tells a room whether it can talk to it.

## itch.io

The same `npm run package` output, pushed with butler. What differs from the
release-page downloads is *which* artifact goes up, and it is not the one you
would guess.

### Push the unpacked directory, on all three platforms

itch's compatibility policy ranks distribution formats, and the gap between top
and bottom is wide:

| Tier | Format | What the player gets |
|---|---|---|
| **Platinum** | a butler push of a build folder | no admin rights, pause/resume, integrity checks and file healing, binary patch updates, near-instant uninstall |
| Gold | `.zip`, `.rar`, `.tar` | installs without extra disk space or admin rights, but no automatic upgrades or integrity checks |
| Silver | `.7z`, `.tar.xz` | must be downloaded to disk first, using temporary space |
| **Bronze** | **NSIS, MSI, InnoSetup** | "may require administrator access and offer the poorest user experience" |
| Oh No | `.deb`, `.rpm`, `.pkg`, custom installers | unsupported |

So the installers we build for the GitHub release page are exactly what must
*not* go to itch. Each platform page says the same thing in its own words: the
Windows page says that instead of shipping an installer, push the install
folder; the Linux page says make a portable build and push it; the macOS page
says push the `.app`, and put the `.app` and the manifest in a folder together
when there is a manifest. `electron/itch.mjs` pushes `dist/mac-universal/`,
`dist/win-unpacked/` and `dist/linux-unpacked/` — the directories
electron-builder packs *before* it builds each installer, so they cost nothing
extra to produce.

The AppImage is skipped for the same reason the DMG and the NSIS installer are:
one opaque file butler cannot patch well, which additionally needs FUSE on the
player's machine. It stays *a* Linux download on the GitHub release page.

**Linux ships two downloads, not one.** The AppImage is the better desktop
download and keeps that job. Beside it goes a `.tar.gz` of the same build, for
SteamOS and for anything added to Steam: an AppImage is a FUSE-mounted squashfs,
so it cannot run where libfuse2 is absent, and being mounted `nosuid` it can
never carry a SUID `chrome-sandbox` — which on a machine that also restricts
user namespaces leaves an Electron renderer with no way to start at all. An
extracted tarball is an ordinary directory where that helper can be restored.
See [`steamos-game-mode.md`](steamos-game-mode.md). This costs one more target
in `electron-builder.yml` and one more glob in the release workflow; the
unpacked directory butler gets is untouched.

**Symlinks and permissions are not our problem, as long as we push a
directory.** butler manages symlinks and fixes file permissions on push, and the
itch app fixes permissions again at launch. That is what spares a `.app` bundle
the mangling a hand-rolled `zip -r` would inflict, and what spares a Linux
binary the missing executable bit — a direct download without it gives players
"Error -10810" on macOS. None of it applies to an archive we build ourselves,
which is the other reason butler is never handed one.

### The manifest

`build/itch/<platform>.itch.toml` is copied to the root of the pushed directory
as `.itch.toml` by `electron/itch.mjs`, naming what to launch under the
well-known `play` action, which the itch app renders as a highlighted *Play Now*
button.

The launch paths are `Boomtown.app`, `boomtown.exe` and `boomtown` — lowercase
on Windows and Linux because that is what electron-builder emits. They are the
same paths `electron/afterPack.mjs` flips the Electron fuses on, and that hook
runs on every package and would fail the build if they were wrong.

### Push

```bash
cd apps/desktop
npm run package
npm run itch:stage -- mac        # stages the manifest, prints the path to push
butler validate  "$(npm run --silent itch:stage -- mac)"
butler push      "$(npm run --silent itch:stage -- mac)" <your-itch-user>/boomtown:osx --userversion 2026.9.1
```

Channel names carry the platform tag, so they are the plain keywords — `osx`,
`windows`, `linux` — in kebab-case. A channel named anything else ships a build
with no platform tag, which the launcher will not pick up. `--userversion` puts
your semver on the page instead of a build number.

`butler validate` is not optional politeness: it exits non-zero on a launch
target that does not exist, a misspelled manifest key, or a missing
prerequisite, and itch recommends wiring it into CI. It is the only check in
this repo that runs against a real packaged build — the unit tests can only
assert what the manifests *say*.

### CI

The itch push runs inside the **build** job, on each platform's own runner,
rather than as a later job. That is deliberate: `upload-artifact` does not
preserve the executable bit, so a `.app` or a Linux binary that travelled
through an artifact would arrive unlaunchable.

Three steps: `Configure itch.io publishing` sets `ITCH_PUBLISH` when a
`BUTLER_API_KEY` secret exists (itch.io → settings → API keys) and skips the
rest when it does not — via an env var, because a step's own `env:` block is not
readable from its own `if:`. `Set up butler` installs the CLI. `Publish to
itch.io` stages the manifest, validates, and pushes.

**The itch target has no default.** It comes from an `ITCH_TARGET` repo variable
holding `<your itch user>/<project>`, and without it the push is skipped with a
warning rather than attempted. A publish step that guesses an account name can
aim at the wrong project, and the guess stays invisible until it fails — the
itch username is not necessarily the GitHub one, which is exactly the assumption
that made this a default in the first place.

butler comes from **`remarkablegames/setup-butler`, pinned by commit SHA**
(v3.0.2) rather than its moving `@v3` tag. It uses `@actions/tool-cache`, which
downloads, extracts, caches and puts butler on `PATH` on all three runners. The
pin is the point: the action supplies the binary that is handed the itch API key
moments later, so the version that runs should be one that was chosen rather
than whatever the tag moved to. Bump it deliberately. The setup step is not
given the key — it does not need one to install a CLI.

One sharp edge: the action maps an arm64 macOS runner straight to butler's
`darwin-arm64` channel with no fallback, and offers no arch input. If that
channel is ever missing, the mac leg fails outright rather than degrading to the
amd64 build.

### Auto-update is off for itch builds

The itch app checks for game updates on launch and every 30 minutes after, and
installs them by removing files the new build does not have while leaving
everything else in place. An app that also updated itself would be writing into
that same directory behind the launcher's back.

`BOOMTOWN_DISTRIBUTION=itch` at build time is baked into the main process by
`electron.vite.config.ts` and read by `electron/distribution.ts`;
`checkForUpdates()` returns early on it. There is no update feed configured
today, so this changes nothing yet — it is there so that adding one cannot
quietly turn every itch install into two updaters fighting.

Player settings are unaffected either way: they live in Electron's per-user
`userData`, not in the install directory the itch app manages.

### Gatekeeper: the itch app is the path that works

An itch build is exactly as unsigned as the DMG on the release page, but the
consequence is not the same, and this is worth getting right on the itch page.

macOS refuses an unsigned app with "is damaged and can't be opened" when the
file carries the `com.apple.quarantine` attribute — which a *browser* applies to
anything it downloads, and which is what triggers the code-signing, developer-ID
and notarization checks in the first place. The itch app fetches and extracts
the build itself, so nothing applies that attribute and Gatekeeper is never
invoked. itch says as much on its macOS page: players not using the app may see
the warning, and it recommends encouraging players towards the app.

So the page copy should lead with the app on macOS, and keep the `xattr` line as
the fallback for anyone taking the direct download:

> **macOS:** install through the itch app and it just works. If you download
> directly, macOS will call the app "damaged" — it isn't, it's unsigned, and
> macOS reports those the same way. Clear the flag once:
> `xattr -dr com.apple.quarantine /Applications/Boomtown.app`

This is a workaround, not the fix. Signing and notarizing removes the caveat for
both paths at once, and the release workflow already signs whenever the Apple
secrets are present — the missing piece is an Apple Developer account, not code.

### Two things itch offers that we have not taken up

Both are deliberate, and both are worth revisiting rather than forgetting:

- **The itch sandbox.** A manifest action can set `sandbox = true` to opt in.
  itch's sandbox denies by default and explicitly blocks a game from reading
  itch credentials and browser data; on macOS it is `sandbox-exec`, on Linux
  bubblewrap or firejail, on Windows a restricted local account. Boomtown needs
  its own install directory and the network and nothing else, so it is a
  plausible fit — but Linux exposes network access as a per-game setting, which
  could break online play, and this needs testing on all three platforms before
  it is claimed.
- **itch API identity.** A manifest action can request `profile:me` scope, and
  the app then passes `ITCHIO_API_KEY` to the game, which can identify the
  itch.io account playing and verify it owns a copy. itch names exactly our
  problem as the use case: restricting online play to legitimate owners.
  Deferred with a named revisit trigger — the reasoning, the shape it would take
  (a signal on host admission, never a gate in front of it), and what would have
  to be true first live in *Alternative Approaches Considered* in
  `docs/plans/2026-09-14-feat-web-deployment-plan.md`. Short version: it only
  reaches players launching through the itch app, it retires almost none of that
  plan's controls, and under pay-what-you-want "owns a copy" collapses into "has
  a free account" — while checking for an actual payment would shut out the
  players pay-what-you-want exists to welcome.
