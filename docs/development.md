# Development — working on Boomtown

Everything needed to get the app running, drive it, and diagnose it. Packaging and publishing are in
`deploying.md`; what the tests guarantee is in `testing.md`.

## Prerequisites

- **Node 20+** (developed on 24), npm 10+. CI pins 20.
- A desktop OS with a display to launch Electron (`npm run dev`, `npm run smoke`). Headless
  environments can still install, typecheck, lint and run every test — including the integration
  suite — and can run the renderer in a browser.
- **Python 3** only for the design scripts. `build.py` and `make_icon.py` are stdlib;
  `make_skyline.py` needs `psd-tools` and `pillow`.

```bash
npm install     # or npm ci
```

Install scripts are allow-listed in the root `package.json` (`allowScripts`): `esbuild` for
Vite/Vitest, `workerd` for the PartyKit dev server, `fsevents` on macOS.

**The Electron binary is a ~150 MB download.** Where that is unavailable — a sandbox, an offline CI
— set `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. Everything except launching the GUI still works.

## Running it

```bash
npm run dev             # electron-vite dev: main, preload, renderer with HMR
npm run server:dev      # the PartyKit room on :1999, which a dev build talks to by default
```

### Without the Electron shell

The game surface never touches the Electron bridge, so the renderer runs in an ordinary browser.
This is the only way to drive the app from a script, and the way to see it at all on a machine with
no display:

```bash
cd apps/desktop && npm run web     # :5173, or BOOMTOWN_WEB_PORT
```

It uses `vite.browser.config.mts`, which reuses `electron.vite.config.ts`'s own renderer options so
the two ways of running the same code cannot drift.

### A local game

Pick 2–6 seats, mark each human or bot (with a 1–10 difficulty), choose the edition (Boomtown by
default) and the cash/holdings visibility. Click a highlighted tile in the rack or on the board to
place it; merger decisions surface as a modal. With more than one human seat, an opaque hand-off
card covers the screen between turns.

### An online game

"Play online" creates a room and shows an eight-character code to share, or knocks at one by code.
The room is authoritative: it deals, validates every command, plays the bots, and sends each client
only its own view. A dev build talks to `localhost:1999`; a release build talks to the host baked in
from `apps/desktop/.env.production`; Settings → **Online host** overrides both.

**A dev app against the deployed room.** Two things stop a plain `npm run dev` from reaching it: the
default host, and the dev CSP, which only allows `connect-src` to localhost. Override both:

```bash
env -u ELECTRON_RUN_AS_NODE \
  VITE_PARTYKIT_HOST=boomtown.smromain.partykit.dev \
  BOOMTOWN_DEV_CONNECT_SRC="wss://boomtown.smromain.partykit.dev,https://boomtown.smromain.partykit.dev" \
  npm run -w @boomtown/desktop dev
```

`env -u ELECTRON_RUN_AS_NODE` is only needed where the shell exports it (a terminal spawned by
Claude Code does): it makes the Electron binary run as plain Node and the app fails to boot.

**Two instances, for a two-player test.** The seat token lives in the renderer's `localStorage`, so
a second instance sharing the profile would resume as the same player instead of joining as a new
one. Give it its own port and profile:

```bash
env -u ELECTRON_RUN_AS_NODE \
  BOOMTOWN_DEV_PORT=5273 \
  BOOMTOWN_DEV_USER_DATA="$(mktemp -d)" \
  VITE_PARTYKIT_HOST=boomtown.smromain.partykit.dev \
  BOOMTOWN_DEV_CONNECT_SRC="wss://boomtown.smromain.partykit.dev,https://boomtown.smromain.partykit.dev" \
  npm run -w @boomtown/desktop dev
```

Create the room in one window and join by its code in the other.

### A couch game

"Couch game" opens a table (#62): this screen shows the board, and each seat is a phone. `npm run
server:dev` builds `apps/phone` first and the room serves it at `http://localhost:1999/phone/`, which
is where the table's QR code points. For a real phone on the same network, the QR has to name the
machine rather than `localhost`: set Settings → **Online host** to `<lan-ip>:1999` on the table.

`npm run phone:dev` serves the phone page from Vite on `:5174` with hot reload, talking to the room on
`localhost:1999` (or `VITE_PARTYKIT_HOST`). Open it as `http://localhost:5174/phone/#t=<CODE>`. In a
desktop browser, use the device toolbar and a separate profile per phone: the seat token lives in
`localStorage`.

## Environment variables

| Variable | Read by | Effect |
|---|---|---|
| `VITE_PARTYKIT_HOST` | renderer (`src/online/hostUrl.ts`) | The host the online client dials. Baked at build time; blank in dev means `localhost:1999` |
| `BOOMTOWN_DEV_CONNECT_SRC` | main (`electron/main.ts`) | Comma-separated origins added to the **dev** CSP's `connect-src`. Ignored by packaged builds, which already allow `wss:`/`https:` |
| `BOOMTOWN_DEV_PORT` | `electron.vite.config.ts` | Renderer port for this dev instance (default 5173) |
| `BOOMTOWN_DEV_USER_DATA` | main | A private Electron profile directory for this dev instance |
| `BOOMTOWN_WEB_PORT` | `vite.browser.config.mts` | Port for the browser-only renderer |
| `BOOMTOWN_SMOKE` | main | Run the smoke assertions and exit |
| `BOOMTOWN_SMOKE_SHOT` | main | Where the smoke run writes its screenshot |
| `BOOMTOWN_DISTRIBUTION` | build (`electron.vite.config.ts`) | Stamped into the main bundle; `itch` means updates are store-managed and the updater stands down |
| `ELECTRON_SKIP_BINARY_DOWNLOAD` | npm install | Skip the Electron binary |

`BOOMTOWN_DEV_PORT` and `BOOMTOWN_DEV_USER_DATA` are unset in normal use and in CI.

## Diagnosing online play

`Ctrl`/`Cmd`+`Shift`+`L` opens the online-play log on any screen: every frame in and out, socket
lifecycle, host resolution and lobby decisions, with a Copy button for bug reports. **Dev builds
only** — both the overlay and the Settings → **Log online play** switch are gated on
`import.meta.env.DEV`, so a packaged build captures nothing and shows neither. To get a timeline out
of a release, set `localStorage['boomtown.netlog'] = 'on'` and reload: capture and the console
mirror come back, read from devtools rather than the overlay.

Room-side, every lobby decision prints one line — visible in `npm run server:dev`, or
`npx partykit tail` against the deployed room.

## Driving the app from a script

See `testing.md` and `.claude/skills/run-app/`. Short version: serve the renderer with
`npm run web`, then drive it with Playwright. `drive.mjs` watches an all-bot table and reports which
overlay owned the screen when; `playSeat.mjs` plays a human seat; `drive-online.mjs` runs two
browsers against a real room.

Two things about this UI will cost time if you don't know them:

- **The setup screen is tile pickers, not buttons.** Edition, seat count and human/bot are
  `role="radio"` inside a `role="radiogroup"`. `getByRole('button', { name: 'Bot' })` times out;
  `getByRole('radio', { name: 'Bot', exact: true }).nth(seat)` works.
- **Beats are dismissible.** Click the beat or press space/enter to advance a stage, escape to skip
  the rest — much faster than waiting out a 16-second sequence.

Useful anchors, all stable: `[aria-label=Story]` (the right column, and the marker that a game has
actually started), `role="dialog"` for beats, modals and the hand-off card, `role="status"` for the
buy flourish.

A `404` for `/favicon.ico` is expected — `index.html` declares no icon. Any *other* console error in
a run is real.

## Conventions

- **Copy lives in `apps/desktop/src/copy/constants.json`.** Components import from `copy/copy.ts`.
  There is a test that fails on a component holding its own sentence.
- **Styling is CSS Modules**, one module per folder, with the palette in `src/styles/global.css`.
  Colours come from the variables there, never from a literal in a component.
- **Motion respects `prefers-reduced-motion`.** `beats/useReducedMotion.ts` for components; a media
  query in the module for anything animated in CSS.
- **Don't hand-edit generated files.** See the table at the end of `architecture.md`.
- **Accessible names are the plain ones.** Where a control's visible text is flavour, the
  `aria-label` is the plain description — and beware collisions: `"Copy the room code"` contains
  `"Room code"`, which made `getByLabel('Room code')` match two elements and broke a driver script.

## Commit and branch conventions

Work on a branch, never on `main`. Commit messages are prose: a short subject line, then what
changed and *why it is shaped that way* — the traps and the reasoning are the point, since they are
what the next session reads. The repository's history is the primary record of how a decision was
reached; `decisions.md` is the summary of where it landed.
