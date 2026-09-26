---
name: run-app
description: Launch Boomtown and actually play it — serve the renderer to a browser and drive a real all-bot game with Playwright, capturing screenshots and a timeline of which overlay owned the screen when. Use this whenever the task is to run, start, open, screenshot, or demo the app, to watch a beat/animation/modal in motion, or to confirm any UI change works in the real game rather than only in vitest — including "play a bot game", "show me the merger beat", "does the prompt still open over it", or any question about sequencing between beats, modals and bot turns.
---

# Running Boomtown for real

Vitest renders components against a live engine, which is enough for most
questions. What it cannot answer is anything about *time*: whether a beat holds
the screen for its whole run, whether the table keeps playing behind a curtain,
whether one overlay opens over another. Those need the real app, real timers and
a real bot driver, and that is what this skill is for.

The app ships as Electron, but the game surface never touches the Electron
bridge — only `src/debug/dump.ts` reaches for `window.boomtown`, and it checks
first. So the renderer runs in an ordinary browser, which is scriptable in a way
the packaged shell is not. That is the whole trick.

## The two commands

```bash
cd apps/desktop
npm run web                      # serves the renderer on :5173 (BOOMTOWN_WEB_PORT to move it)
node ../../.claude/skills/run-app/scripts/drive.mjs --until game-over --out /tmp/boomtown-run
```

`npm run web` uses `vite.browser.config.mts`, which reuses `electron.vite.config.ts`'s
own renderer options so the workspace aliases can't drift between the two ways of
running the same code. Start it in the background and wait for the port to answer
before driving — `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/`.

`drive.mjs` starts a local game with every seat a bot and watches it play. Read
the header of the script for its full options; the ones that matter most:

| option | what it does |
|---|---|
| `--until game-over \| merger \| <seconds>` | when to stop. `game-over` is a complete game, roughly 2–4 minutes of bot play |
| `--seats 2–6`, `--edition Boomtown\|Classic\|Modern` | table shape; the default is 3 seats on whatever edition the settings remember (Boomtown) |
| `--out <dir>` | screenshots and `samples.json` land here; put it outside the repo |
| `--headed` | a visible window, if a display is available |
| `--board board-view \| skyline` | which board to draw. Skyline passes `forceSkyline=1` and turns on SwiftShader, because headless Chromium draws WebGL on the CPU and Skyline otherwise refuses a software renderer and falls back to Board View |

An all-bot table is the point: nobody has to answer a prompt for the game to
reach its own set pieces, so a founding, a merger, a motion and the ending all
arrive on their own.

## Reading the output

The script samples the page four times a second and prints one row per overlay
window:

```
  window            secs  overlay                     moved underneath  overlapped by
   62.3s→79.0s     16.7  Merger                        0               —
```

Each sample records what is on top *and* a fingerprint of the game underneath
(story panel, corporation band, board). That pairing is what makes the run
diagnostic rather than decorative:

- **moved underneath > 0** — the table played on behind the overlay. For a beat
  that covers the screen that is a bug: the moves happen unwatched and the beat
  queue, which collapses to the latest, drops most of them.
- **overlapped by** — something opened on top of the beat. A modal over a
  curtain is the failure that made a merger look like it played twice, because
  the beat unmounted and remounted at stage one.
- **a beat window far shorter than its sequence** (the merger's staged run is
  ~16.5s solo, longer with more chains) — it was torn down early.

Screenshots are written on every overlay change, numbered in order, plus
`zz-final.png`. **Look at them.** A blank or half-painted frame is a failure the
timeline alone will not show you.

## Driving it by hand

When the question is about a human seat rather than a bot table, write your own
Playwright script against the same server. Two things about this UI will cost
you time if you don't know them:

- **The setup screen is tile pickers, not buttons.** Edition, seat count and
  human/bot are all `role="radio"` inside a `role="radiogroup"`
  (`src/setup/Choice.tsx`). `getByRole('button', { name: 'Bot' })` times out;
  `getByRole('radio', { name: 'Bot', exact: true }).nth(seat)` works.
- **Beats are dismissible.** Click the beat or press space/enter to advance a
  stage, escape to skip the rest — much faster than waiting out a 16s sequence
  when you only need to get past it.

Useful anchors, all stable: `[aria-label=Story]` (the right-column narration,
and the marker that a game has actually started), `role="dialog"` for beats,
modals and the hand-off card, `role="status"` for the buy-stock flourish.

## Environment notes

- Playwright is installed globally (`/opt/node22/lib/node_modules/playwright`)
  and Chromium lives at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
  The script defaults to both and takes `PLAYWRIGHT_MODULE` / `CHROMIUM_PATH`
  overrides. Don't add a browser-automation dependency to the repo for this —
  the app doesn't need one.
- A `404` for `/favicon.ico` is expected: `index.html` declares no icon. Ignore
  it; any *other* console error in the run's "page errors" list is real.
- Kill the dev server when you're done, and keep run output out of the working
  tree — `git status` should be clean when you finish.
