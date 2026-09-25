/**
 * Plays a Boomtown game in a real browser and reports what was on screen, when.
 *
 * The thing worth measuring in this app is *sequencing*: a beat is supposed to
 * own the screen for its whole run, with the table held still behind it. So
 * every sample records both what is on top (dialogs, status flourishes) and a
 * fingerprint of the game underneath (story panel, corporation band, board). A
 * beat window with a non-zero "moved underneath" count means play carried on
 * behind the curtain; an overlap means something opened over the beat. Both are
 * the bug this instrumentation exists to catch.
 *
 * Usage (from apps/desktop, with `npm run web` already serving):
 *   node ../../.claude/skills/run-app/scripts/drive.mjs [options]
 *
 *   --url <url>        default http://localhost:5173
 *   --seats <2-6>      default 3
 *   --edition <name>   Boomtown | Classic | Modern (default: leave as-is)
 *   --until <what>     game-over | merger | <seconds>   (default game-over)
 *   --max <seconds>    hard stop, default 600
 *   --out <dir>        screenshots + samples.json, default ./run-out
 *   --headed           run with a visible window (needs a display)
 *   --board <style>    board-view | skyline (default: whatever the settings remember).
 *                      Skyline also passes forceSkyline=1, because headless Chromium
 *                      draws WebGL in software and Skyline refuses a software renderer.
 *
 * Prints a timeline of overlay windows and exits non-zero if it never got into
 * a game, so a caller can tell "nothing happened" from "nothing went wrong".
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

const URL_ = arg('url', 'http://localhost:5173');
const SEATS = Number(arg('seats', 3));
const EDITION = arg('edition', null);
const UNTIL = arg('until', 'game-over');
const MAX_MS = Number(arg('max', 600)) * 1000;
const OUT = path.resolve(arg('out', 'run-out'));
const BOARD = arg('board', null);

// Playwright is installed globally in this environment, not in the repo — the
// app itself has no browser-automation dependency and shouldn't grow one.
const { chromium } = require(
  process.env['PLAYWRIGHT_MODULE'] ?? '/opt/node22/lib/node_modules/playwright',
);
const EXECUTABLE = process.env['CHROMIUM_PATH'] ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

fs.mkdirSync(OUT, { recursive: true });

// Chromium no longer falls back to SwiftShader for WebGL on its own; Skyline needs it asked for.
const gpuArgs = BOARD === 'skyline' ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] : [];
const browser = await chromium.launch({ headless: !flag('headed'), executablePath: EXECUTABLE, args: gpuArgs });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`); });

const target = new URL(URL_);
if (BOARD) target.searchParams.set('board', BOARD);
if (BOARD === 'skyline') target.searchParams.set('forceSkyline', '1');
await page.goto(target.toString(), { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'Local game' }).click();
await page.waitForTimeout(400);

// The setup screen is built from tile pickers, not selects or plain buttons:
// every option is a `role="radio"` inside a `role="radiogroup"`. Clicking them
// as buttons times out — that is the one non-obvious thing about driving it.
if (EDITION) await page.getByRole('radio', { name: new RegExp(`^${EDITION}`, 'i') }).first().click();
if (SEATS !== 3) await page.getByRole('radio', { name: String(SEATS), exact: true }).click();
await page.waitForTimeout(200);
for (let i = 0; i < SEATS; i++) {
  await page.getByRole('radio', { name: 'Bot', exact: true }).nth(i).click();
  await page.waitForTimeout(120);
}
await page.screenshot({ path: path.join(OUT, '00-setup.png'), fullPage: true });
await page.getByRole('button', { name: 'Start game' }).click();
await page.waitForTimeout(800);

const inGame = await page.evaluate(() => !!document.querySelector('[aria-label=Story]'));
if (!inGame) {
  await page.screenshot({ path: path.join(OUT, '00-failed-to-start.png') });
  console.error('never reached the game screen — see 00-failed-to-start.png');
  await browser.close();
  process.exit(1);
}
console.log(`in game: ${SEATS} bot seats at ${URL_}`);

const sample = () => page.evaluate(() => {
  const label = (el) => el.getAttribute('aria-label') || el.textContent.trim().slice(0, 40);
  const txt = (sel) => (document.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return {
    dialogs: [...document.querySelectorAll('[role=dialog]')].map(label),
    statuses: [...document.querySelectorAll('[role=status]')].map(label),
    // The game underneath. If any of this changes while a beat is up, the
    // table moved on behind it.
    story: txt('[aria-label=Story]').slice(0, 220),
    band: txt('[class*=band]').slice(0, 300),
    board: txt('[class*=board]').slice(0, 400),
    over: /Game over/i.test(document.body.textContent ?? ''),
  };
});

const samples = [];
const started = Date.now();
const stopAfter = /^\d+$/.test(UNTIL) ? Number(UNTIL) * 1000 : null;
let shots = 0, lastKey = '', sawMerger = false;

while (Date.now() - started < MAX_MS) {
  const s = await sample();
  s.t = Date.now();
  samples.push(s);

  const key = JSON.stringify(s.dialogs);
  if (key !== lastKey && s.dialogs.length > 0) {
    shots++;
    const name = s.dialogs[0].replace(/\W+/g, '_').slice(0, 28);
    await page.screenshot({ path: path.join(OUT, `${String(shots).padStart(2, '0')}-${name}.png`) });
  }
  lastKey = key;

  if (s.dialogs.some((d) => /merger/i.test(d))) sawMerger = true;
  if (s.over) break;
  if (UNTIL === 'merger' && sawMerger && !s.dialogs.some((d) => /merger/i.test(d))) break;
  if (stopAfter && Date.now() - started > stopAfter) break;
  await page.waitForTimeout(250);
}

await page.screenshot({ path: path.join(OUT, 'zz-final.png') });
fs.writeFileSync(path.join(OUT, 'samples.json'), JSON.stringify(samples, null, 1));
await browser.close();

// ---- timeline ----------------------------------------------------------
const t0 = samples[0].t;
const rel = (t) => `${((t - t0) / 1000).toFixed(1)}s`;
const windows = [];
let cur = null, base = null, moved = 0, overlaps = new Set();

for (const s of samples) {
  const top = s.dialogs[0] ?? null;
  const fp = JSON.stringify([s.story, s.band, s.board]);
  if (top && (!cur || cur.name !== top)) {
    if (cur) windows.push({ ...cur, endT: s.t, moved, overlaps: [...overlaps] });
    cur = { name: top, startT: s.t }; base = fp; moved = 0; overlaps = new Set();
  } else if (top && cur) {
    if (fp !== base) { moved++; base = fp; }
    for (const d of s.dialogs.slice(1)) overlaps.add(d);
    for (const o of s.statuses) if (!/waiting/i.test(o)) overlaps.add(`status: ${o}`);
  } else if (!top && cur) {
    windows.push({ ...cur, endT: s.t, moved, overlaps: [...overlaps] });
    cur = null;
  }
}
if (cur) windows.push({ ...cur, endT: samples.at(-1).t, moved, overlaps: [...overlaps] });

console.log('\n  window            secs  overlay                     moved underneath  overlapped by');
for (const w of windows) {
  const secs = ((w.endT - w.startT) / 1000).toFixed(1).padStart(5);
  console.log(
    `  ${rel(w.startT).padStart(6)}→${rel(w.endT).padEnd(7)}${secs}  ${w.name.padEnd(26)}  ${String(w.moved).padStart(3)}` +
    `               ${w.overlaps.length ? JSON.stringify(w.overlaps) : '—'}`,
  );
}
const held = windows.filter((w) => w.moved === 0 && w.overlaps.length === 0).length;
console.log(`\n${windows.length} overlay windows, ${held} held the screen cleanly (nothing moved underneath, nothing on top).`);
console.log(`game over: ${samples.at(-1).over} · samples: ${samples.length} · screenshots + samples.json in ${OUT}`);
if (pageErrors.length) console.log(`page errors:\n  ${[...new Set(pageErrors)].join('\n  ')}`);
