/**
 * Plays a full online game through two real browsers against a real room.
 *
 * `drive.mjs` answers timing questions about a local all-bot table. This
 * answers the ones only the network can: that a room can be created and shared,
 * that a joiner *knocks* and is seated only when the host admits them, and that
 * two clients can then take turns to a ranked result.
 *
 * It exists because a browser found something no headless test could. The
 * ticket directory is read cross-origin, and it was answering without an
 * `Access-Control-Allow-Origin` header — so joining by code was impossible in
 * the real app while every integration test stayed green, because Node's fetch
 * does not enforce CORS. Anything about online play that has only ever been
 * checked headlessly has that shape of blind spot.
 *
 * Usage (needs both servers already up):
 *   cd packages/server && npx partykit dev &
 *   cd apps/desktop && npm run web &
 *   node ../../.claude/skills/run-app/scripts/drive-online.mjs --out /tmp/online
 *
 *   --url <url>    renderer, default http://localhost:5173
 *   --max <secs>   hard stop on the play loop, default 480
 *   --out <dir>    screenshots, default ./online-out
 *
 * Exits non-zero if the flow breaks before the game starts, so "the room is
 * broken" is distinguishable from "the game did not finish in time".
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { playToEnd, snapshot } from './playSeat.mjs';

const require = createRequire(import.meta.url);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const URL_BASE = arg('url', 'http://localhost:5173');
const OUT = arg('out', './online-out');
const MAX_MS = Number(arg('max', '480')) * 1000;
fs.mkdirSync(OUT, { recursive: true });

const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? '/opt/node22/lib/node_modules/playwright');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});

const problems = [];
let shot = 0;
const snap = (page, tag) =>
  snapshot(page, `${OUT}/${String(++shot).padStart(2, '0')}-${tag}.png`);
async function client(label) {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('pageerror', (e) => problems.push(`${label}: ${e.message}`));
  page.on('console', (m) => {
    // The missing favicon is expected; anything else in the console is not.
    if (m.type() === 'error' && !m.text().includes('favicon')) problems.push(`${label}: ${m.text()}`);
  });
  await page.goto(URL_BASE);
  await page.getByRole('button', { name: 'Play online' }).click();
  return page;
}

const fail = (why) => {
  console.error(`FAILED: ${why}`);
  process.exitCode = 1;
};

const host = await client('host');
await host.getByRole('button', { name: 'Create a room' }).click().catch(() => {});
await host.getByRole('radio', { name: '3 seats' }).click();
await host.getByRole('radio', { name: 'Bot', exact: true }).nth(2).click();
await host.getByRole('button', { name: 'Create room' }).click();
await host.getByRole('region', { name: 'Room lobby' }).waitFor({ timeout: 20000 });
const ticket = (await host.getByLabel('Room code').innerText()).replace(/[^0-9A-Z]/gi, '');
console.log(`room created, shareable code ${ticket}`);
await snap(host, 'host-lobby');

const guest = await client('guest');
await guest.getByRole('button', { name: 'Join with a code' }).click();
await guest.getByRole('textbox', { name: 'Room code' }).fill(ticket);
await guest.getByRole('button', { name: 'Join room' }).click();
await guest.getByRole('status').filter({ hasText: 'let you in' }).waitFor({ timeout: 20000 });
// The property host admission exists for: a code gets you a knock, not a seat.
if (await guest.getByText('(you)').count()) fail('the guest was seated without being admitted');
console.log('guest knocked, holds no seat');
await snap(guest, 'guest-waiting');

await host.getByRole('heading', { name: 'Knocking' }).waitFor({ timeout: 20000 });
await snap(host, 'host-knocking');
await host.getByRole('button', { name: 'Let in' }).click();
await guest.getByText('(you)').waitFor({ timeout: 20000 });
console.log('host admitted the guest');

await host.getByRole('button', { name: 'Start game' }).click({ timeout: 20000 });
for (const [page, who] of [[host, 'host'], [guest, 'guest']]) {
  await page.locator('[aria-label=Story]').waitFor({ timeout: 30000 }).catch(() => fail(`${who} never reached the table`));
}
console.log('game started on both clients');
await snap(host, 'host-playing');

const result = await playToEnd([host, guest], {
  maxMs: MAX_MS,
  onProgress: ({ turn, actions }) => console.log(`  turn ${turn} · ${actions} actions`),
});
await snap(host, 'host-final');
await snap(guest, 'guest-final');

console.log(`\nfinished: ${result.finished} · turns: ${result.highestTurn} · actions: ${result.actions}`);
console.log(`problems: ${problems.length ? problems.join(' | ') : 'none'}`);
if (!result.finished) console.log('(did not reach the end within --max; the room was still live)');
await browser.close();
