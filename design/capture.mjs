/**
 * Captures the running app into the design canvas.
 *
 * The canvas used to draw every screen by hand in build.py, and the app moved on
 * without it, until the canvas showed a game that no longer existed. Now the
 * app is the design: this script plays it in a real browser, in day and in night,
 * and writes each screen as an SVG with live text (dom-to-svg). build.py then
 * lays the SVGs out as artboards. After a UI change, re-run this and build.py,
 * and the canvas follows.
 *
 * Needs, from the repo root:
 *   npm run -w @boomtown/desktop web     # the renderer on :5173
 *   npm run server:dev                   # the room on :1999, for the online and couch screens
 * then:
 *   node design/capture.mjs [--only menu,beats,game,online,couch] [--png <dir>]
 *
 * Writes design/captures/<id>.svg and design/captures/manifest.json. --png also
 * writes a 2x screenshot of each frame there, for checking the SVGs by eye.
 * Playwright and Chromium come from the environment, as for the run-app skill.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = path.join(HERE, 'captures');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const ONLY = new Set((arg('only', 'menu,beats,game,online,couch')).split(','));
const PNG = arg('png', null);
const SHOTS = /^(table-|handoff-|after-|couch-play-)/;
const APP = arg('url', 'http://localhost:5173/');
const ROOM = arg('room', 'http://localhost:1999');

const { chromium } = require(process.env['PLAYWRIGHT_MODULE'] ?? '/opt/node22/lib/node_modules/playwright');
const EXECUTABLE = process.env['CHROMIUM_PATH'] ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// dom-to-svg is an ES module with dependencies; bundle it once for the page.
const bundle = path.join(OUT, '.dom-to-svg.js');
fs.mkdirSync(OUT, { recursive: true });
if (PNG) fs.mkdirSync(PNG, { recursive: true });
if (!fs.existsSync(bundle)) {
  const entry = path.join(OUT, '.dom-to-svg-entry.mjs');
  fs.writeFileSync(entry, "import { elementToSVG } from 'dom-to-svg'; window.__domToSvg = elementToSVG;\n");
  execFileSync(path.join(ROOT, 'node_modules/.bin/esbuild'),
    [entry, '--bundle', '--format=iife', `--outfile=${bundle}`, '--log-level=warning'], { cwd: ROOT });
  fs.rmSync(entry);
}
const DOM_TO_SVG = fs.readFileSync(bundle, 'utf8');

const manifestPath = path.join(OUT, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One frame. SVG of `root` (default: the whole page) with every raster embedded,
 * so the file stands alone on the canvas and in Figma.
 */
async function capture(page, id, rootSel = null) {
  await page.evaluate(() => document.fonts.ready);
  await page.addScriptTag({ content: DOM_TO_SVG });
  const out = await page.evaluate(async (rootSel) => {
    // The parser inside dom-to-svg reads gradients and cannot parse the
    // color(srgb …) form Chromium computes for color-mix(); hand it rgba().
    const fix = (v) => v.replace(/color\((?:srgb|srgb-linear|display-p3) ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/g,
      (m, r, g, b, a) => `rgba(${[r, g, b].map((x) => Math.round(Math.min(1, Math.max(0, +x)) * 255)).join(',')},${a ?? 1})`);
    if (!window.__gcsPatched) {
      const orig = window.getComputedStyle.bind(window);
      window.getComputedStyle = (el, ps) => new Proxy(orig(el, ps), {
        get(t, k) {
          if (k === 'getPropertyValue') return (p) => fix(t.getPropertyValue(p));
          const v = Reflect.get(t, k, t);
          if (typeof v === 'function') return v.bind(t);
          return typeof v === 'string' ? fix(v) : v;
        },
      });
      window.__gcsPatched = true;
    }
    const root = (rootSel && document.querySelector(rootSel)) || document.documentElement;
    const rect = root.getBoundingClientRect();
    // dom-to-svg drops CSS filters, and the header logo is brightened by one, so bake
    // each filtered image's filter into its pixels for the length of the capture.
    const baked = [];
    for (const img of root.querySelectorAll('img')) {
      const filter = getComputedStyle(img).filter;
      if (!filter || filter === 'none' || !img.complete || !img.naturalWidth) continue;
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.filter = filter;
      ctx.drawImage(img, 0, 0);
      const was = [img.src, img.style.filter];
      img.src = c.toDataURL('image/png');
      img.style.filter = 'none';
      await img.decode();
      baked.push([img, was]);
    }
    const doc = window.__domToSvg(root);
    for (const [img, [src, filter]] of baked) { img.src = src; img.style.filter = filter; }
    return { svg: new XMLSerializer().serializeToString(doc), w: Math.round(rect.width), h: Math.round(rect.height) };
  }, rootSel);
  // Plain href rather than xlink:href: some viewers drop the namespaced form, and the logo with it.
  fs.writeFileSync(path.join(OUT, `${id}.svg`), (await embedRasters(out.svg)).replace(/\bxlink:href=/g, 'href='));
  if (PNG) await page.screenshot({ path: path.join(PNG, `${id}.png`) });
  // Screens that show the table also go in as a picture. dom-to-svg cannot draw
  // the board's 3D tilt, its shadows, the striped empty band or the art layered
  // behind the log, so on the canvas these frames are screenshots; the SVG stays
  // alongside for Figma.
  if (SHOTS.test(id)) {
    const png = (await page.screenshot()).toString('base64');
    resampler ??= await (await browser.newContext()).newPage();
    const webp = await resampler.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/webp', 0.88).split(',')[1];
    }, `data:image/png;base64,${png}`);
    fs.writeFileSync(path.join(OUT, `${id}.webp`), Buffer.from(webp, 'base64'));
  }
  manifest[id] = { w: out.w, h: out.h };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
  console.log(`  ${id}  ${out.w}x${out.h}  ${Math.round(out.svg.length / 1024)}KB`);
}

/**
 * Every raster the page drew (logo, skyline art) goes into the file as a data
 * URI, resampled to twice the size it is drawn at: the logo is drawn at about
 * 100px but ships at 1200, and embedding it whole in every frame put an
 * artboard past what the canvas editor will open.
 */
const rasterCache = new Map();
let resampler = null;
async function embedRasters(svg) {
  const images = [...svg.matchAll(/<image\b[^>]*>/g)].map((m) => m[0]);
  const drawn = new Map();
  for (const tag of images) {
    const href = (tag.match(/href="([^"]+)"/) || [])[1];
    const w = +(tag.match(/\bwidth="([\d.]+)"/) || [])[1] || 0;
    const h = +(tag.match(/\bheight="([\d.]+)"/) || [])[1] || 0;
    if (!href) continue;
    const [pw, ph] = drawn.get(href) || [0, 0];
    drawn.set(href, [Math.max(pw, w), Math.max(ph, h)]);
  }
  for (const [href, [w, h]] of drawn) {
    const key = `${href.slice(0, 200)}|${href.length}|${Math.round(w)}x${Math.round(h)}`;
    if (!rasterCache.has(key)) {
      let src = href.replace(/&amp;/g, '&');
      if (!src.startsWith('data:')) {
        const res = await fetch(src);
        if (!res.ok) { console.log(`  could not embed ${href}`); continue; }
        const type = res.headers.get('content-type')?.split(';')[0] || 'image/png';
        src = `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
      }
      resampler ??= await (await browser.newContext()).newPage();
      const out = await resampler.evaluate(async ({ src, w, h }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const scale = Math.min(1, (2 * Math.max(w, 1)) / img.naturalWidth, (2 * Math.max(h, 1)) / img.naturalHeight);
        if (scale >= 0.9) return src;
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/png');
      }, { src, w, h });
      rasterCache.set(key, out);
    }
    svg = svg.split(`"${href}"`).join(`"${rasterCache.get(key)}"`);
  }
  return svg;
}

// Lighting is a setting in localStorage; outside a game there is no header
// switch, so a menu pass sets it and reloads.
async function setTone(page, tone) {
  await page.evaluate((tone) => {
    const k = 'boomtown.settings';
    let s = {};
    try { s = JSON.parse(localStorage.getItem(k) || '{}'); } catch { /* fresh */ }
    s.lighting = tone;
    localStorage.setItem(k, JSON.stringify(s));
  }, tone);
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(700);
}

// Inside a game the header's sun/moon flips it. A modal makes the header inert
// to the mouse, so press it from script, the way a keyboard user never could.
async function flip(page, to) {
  const label = to === 'night' ? 'Switch to night' : 'Switch to day';
  await page.evaluate((l) => document.querySelector(`[aria-label="${l}"]`)?.click(), label);
  await sleep(350);
}
async function bothTones(page, id, rootSel) {
  await capture(page, `${id}-day`, rootSel);
  await flip(page, 'night');
  await capture(page, `${id}-night`, rootSel);
  await flip(page, 'day');
}

const browser = await chromium.launch({ executablePath: EXECUTABLE });
if (process.argv.includes('--embed-only')) {
  for (const f of fs.readdirSync(OUT).filter((f) => f.endsWith('.svg'))) {
    const p = path.join(OUT, f);
    fs.writeFileSync(p, await embedRasters(fs.readFileSync(p, 'utf8')));
  }
  console.log('re-embedded rasters in existing captures');
  await browser.close();
  process.exit(0);
}
const newPage = (opts = {}) => browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, ...opts });

// ---------------------------------------------------------------- menus and beats
if (ONLY.has('menu') || ONLY.has('beats')) {
  const page = await newPage();
  await page.goto(APP, { waitUntil: 'networkidle' });
  // Peak moments, in ms from the start of each beat's preview. The merger
  // stages run collide, blend, name, mass, bonus, settle.
  const beats = [
    ['founding', 'Founding', [1800]],
    ['merger', 'Merger (2-way)', [3500, 7000]],
    ['super-merger', 'Super Merger (3-way)', [5000, 11000]],
    ['motion', 'Motion', [1400]],
    ['endgame', 'Endgame', [1200]],
    ['victory', 'Victory', [6000]],
  ];
  for (const tone of ['day', 'night']) {
    await setTone(page, tone);
    if (ONLY.has('menu')) {
      await capture(page, `launch-${tone}`);
      await page.getByRole('button', { name: 'Settings' }).click(); await sleep(500);
      await capture(page, `settings-${tone}`);
      await page.keyboard.press('Escape'); await sleep(400);
      await page.getByRole('button', { name: 'Local game' }).click(); await sleep(600);
      await capture(page, `new-game-${tone}`);
      await page.goto(APP, { waitUntil: 'networkidle' }); await sleep(400);
      await page.getByRole('button', { name: 'Play online' }).click(); await sleep(700);
      await capture(page, `online-${tone}`);
      await page.goto(APP, { waitUntil: 'networkidle' }); await sleep(400);
      await page.getByRole('button', { name: 'Couch game' }).click(); await sleep(700);
      await capture(page, `couch-setup-${tone}`);
      await page.goto(APP, { waitUntil: 'networkidle' }); await sleep(400);
    }
    if (ONLY.has('beats')) {
      for (const [id, label, waits] of beats) {
        await page.getByRole('button', { name: 'Settings' }).click(); await sleep(400);
        await page.getByRole('button', { name: label, exact: true }).click();
        let t = 0;
        for (const [i, w] of waits.entries()) {
          await sleep(w - t); t = w;
          await capture(page, `beat-${id}${waits.length > 1 ? `-${i + 1}` : ''}-${tone}`, '[class*="_curtain_"]');
        }
        await page.keyboard.press('Escape'); await sleep(300);
        await page.keyboard.press('Escape'); await sleep(900);
      }
    }
  }
  await page.close();
}

// ---------------------------------------------------------------- a played game
/**
 * Two human seats and a bot, played by this script, so the table is seen from
 * a player's chair: the rack, the decisions, and the hand-off card between the
 * two humans. Each decision is captured the first time it comes up.
 */
if (ONLY.has('game')) {
  const page = await newPage();
  await page.goto(APP, { waitUntil: 'networkidle' });
  await setTone(page, 'day');
  await page.getByRole('button', { name: 'Local game' }).click(); await sleep(400);
  await page.getByRole('radio', { name: 'Bot', exact: true }).nth(2).click();
  await page.getByRole('button', { name: 'Start game' }).click(); await sleep(900);

  const seen = new Set();
  const once = async (id, rootSel) => { if (seen.has(id)) return; seen.add(id); await bothTones(page, id, rootSel); };
  const state = () => page.evaluate(() => {
    const vis = (e) => !!(e.offsetParent || e.getClientRects().length) && !e.closest('[inert],[aria-hidden="true"]');
    const dialogs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
    return {
      curtain: !!document.querySelector('[class*="_curtain_"]'),
      // Every decision modal is labelled "Game decision"; its text says which.
      dialogs: dialogs.map((d) => `${d.getAttribute('aria-label') || ''} · ${d.innerText.replace(/\s+/g, ' ').slice(0, 160)}`),
      buttons: [...document.querySelectorAll('button')].filter(vis).map((b) => b.getAttribute('aria-label') || b.textContent.trim()),
      over: !!document.querySelector('[aria-label="After the game"]'),
      turn: Number((document.body.innerText.match(/TURN\s+(\d+)/i) || [])[1] || 0),
    };
  });
  const click = async (name) => {
    // A board cell sits under the plate's 3D tilt, which Playwright's hit test
    // reads as covered; a script click is what a keyboard press would do.
    const ok = await page.evaluate((n) => {
      const b = [...document.querySelectorAll('button')].find((e) => (e.getAttribute('aria-label') || e.textContent.trim()) === n && !e.closest('[inert],[aria-hidden="true"]'));
      if (b) b.click();
      return !!b;
    }, name);
    if (!ok) console.log('  could not press', name);
    await sleep(350);
  };
  const clickIn = async (pattern) => {
    const loc = page.locator('[role=dialog] button').filter({ hasText: pattern }).first();
    if (await loc.count()) { await loc.click(); await sleep(350); return true; }
    return false;
  };

  const started = Date.now();
  let lastProgress = Date.now(), lastKey = '';
  let moved = false;
  while (Date.now() - started < 15 * 60_000) {
    const s = await state();
    const key = JSON.stringify([s.dialogs, s.buttons.slice(0, 12), s.turn]);
    if (key !== lastKey) { lastKey = key; lastProgress = Date.now(); }
    if (s.over) break;
    const has = (re) => s.buttons.find((b) => re.test(b));
    const inDialog = (re) => s.dialogs.some((d) => re.test(d));
    const pickFirst = async () => {
      const opts = page.locator('[role=dialog] button:not([disabled])').filter({ hasNotText: /Peek at the board|Resume/ });
      await opts.first().click(); await sleep(400);
    };

    if (s.curtain) { await page.keyboard.press('Escape'); await sleep(300); continue; }

    const handoff = has(/^I’m .* — show my (decision|turn)$/);
    if (handoff) { await once('handoff'); await click(handoff); continue; }

    if (inDialog(/Found a corporation/)) {
      await once('decision-found', '[role=dialog]');
      await pickFirst();
      continue;
    }
    if (inDialog(/Choose the surviving corporation|Which corporation folds next/)) {
      await once('decision-survivor', '[role=dialog]');
      await pickFirst();
      continue;
    }
    if (inDialog(/Dispose of/)) {
      await once('decision-disposal', '[role=dialog]');
      if (!(await clickIn(/^Sell all$/))) await clickIn(/^Keep all$/);
      await clickIn(/^Confirm$/);
      continue;
    }
    if (inDialog(/Wind the game up/)) {
      await once('decision-vote', '[role=dialog]');
      await clickIn(/^Vote to liquidate/);
      continue;
    }
    if (inDialog(/Before you finish/)) {
      // Out of useful tiles and short of the end size: move to liquidate once, which
      // puts the vote to the other seats; if it fails, just end the turn.
      await once('decision-end', '[role=dialog]');
      if (!moved && (await clickIn(/^Move to liquidate/))) { moved = true; continue; }
      await clickIn(/^End turn/);
      continue;
    }
    if (inDialog(/End the game/)) {
      await once('decision-end', '[role=dialog]');
      // End as soon as the table may: the ending is what we came for.
      const yes = page.locator('[role=dialog] button').filter({ hasText: /^End/ }).first();
      if (await yes.count()) { await yes.click(); await sleep(400); continue; }
    }
    if (inDialog(/Buy stock/)) {
      const more = page.locator('[role=dialog] button[aria-label^="one more"]:not([disabled])');
      const n = await more.count();
      if (n > 0) {
        await more.first().click(); await sleep(150);
        await more.first().click().catch(() => {}); await sleep(250);
        await once('decision-buy', '[role=dialog]');
        const buy = page.locator('[role=dialog] button').filter({ hasText: /^Buy \d/ }).first();
        if (await buy.count()) { await buy.click(); await sleep(400); continue; }
      }
      await clickIn(/^Buy nothing/); continue;
    }

    const places = s.buttons.filter((b) => /^Place at /.test(b));
    if (places.length) {
      if (s.turn >= 3 && !seen.has('table-early')) await once('table-early');
      if (s.turn >= 18 && !seen.has('table-mid')) {
        await once('table-mid');
        await click('Reference'); await sleep(500);
        await once('reference', '[role=dialog]');
        await page.keyboard.press('Escape'); await sleep(300);
      }
      // Prefer the tile that does the most, so the game reaches its decisions.
      const open = places.map((p) => p.slice('Place at '.length));
      const rack = s.buttons.filter((b) => /^\d{1,2}[A-I](merge|found|grow|idle)/.test(b) && open.includes(b.match(/^\d{1,2}[A-I]/)[0]));
      const pick = ['merge', 'found', 'grow', 'idle'].map((k) => rack.find((b) => b.includes(k))).find(Boolean);
      const tile = pick ? pick.match(/^\d{1,2}[A-I]/)[0] : open[0];
      await click(`Place at ${tile}`);
      continue;
    }
    if (Date.now() - lastProgress > 20_000) {
      console.log('  stuck:', JSON.stringify(s).slice(0, 600));
      lastProgress = Date.now();
    }
    await sleep(300);
  }

  // The after-game carousel: hold it still and step through its four frames.
  await sleep(1500);
  const pause = page.getByRole('button', { name: 'Pause' });
  if (await pause.count()) await pause.first().click();
  // Each frame is a tab; Forward would step through the companies one by one.
  for (const [frame, tab] of [['standings', 'Standings'], ['market', 'Tracking the market'],
    ['companies', 'Company by company'], ['awards', 'Awards']]) {
    // A script click: the carousel can sit under an inert layer while the victory beat clears.
    await page.waitForFunction((t) => [...document.querySelectorAll('[role="tab"]')]
      .some((el) => el.textContent.trim().startsWith(t)), tab, { timeout: 60000 });
    await page.evaluate((t) => [...document.querySelectorAll('[role="tab"]')]
      .find((el) => el.textContent.trim().startsWith(t)).click(), tab);
    await sleep(1200);
    await bothTones(page, `after-${frame}`);
  }
  await page.close();
}

// ---------------------------------------------------------------- online lobby
if (ONLY.has('online')) {
  const host = await newPage();
  await host.goto(APP, { waitUntil: 'networkidle' });
  await setTone(host, 'day');
  await host.getByRole('button', { name: 'Play online' }).click(); await sleep(500);
  await host.getByRole('button', { name: 'Create room' }).click(); await sleep(2500);
  // In streaming mode the code is masked until held; hold it for the joiner.
  const codeBtn = host.getByRole('button', { name: 'Hold to show the room code' });
  const masked = (await codeBtn.count()) > 0;
  if (masked) { await codeBtn.hover(); await host.mouse.down(); await sleep(400); }
  const code = (await host.evaluate(() => document.body.innerText)).match(/(?:^|\n)([A-Z0-9]{4})[^A-Z0-9\s]([A-Z0-9]{4})(?:\n|$)/);
  if (masked) await host.mouse.up();
  if (!code) throw new Error('no room code on the lobby screen');
  const guest = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await guest.goto(APP, { waitUntil: 'networkidle' });
  await guest.getByRole('button', { name: 'Play online' }).click(); await sleep(500);
  await guest.getByRole('button', { name: 'Join with a code' }).click(); await sleep(300);
  await guest.getByPlaceholder('ABCD-1234').fill(`${code[1]}-${code[2]}`);
  await guest.getByRole('button', { name: 'Join room' }).click(); await sleep(2500);
  await capture(guest, 'online-knocking-day');
  await bothTonesLobby(host, 'online-lobby');
  await host.close(); await guest.close();
}
async function bothTonesLobby(page, id) {
  // The lobby has no header switch, and a reload would drop the room.
  await capture(page, `${id}-day`);
  await page.evaluate(() => document.documentElement.setAttribute('data-lighting', 'night'));
  await sleep(300);
  await capture(page, `${id}-night`);
  await page.evaluate(() => document.documentElement.setAttribute('data-lighting', 'day'));
}

// ---------------------------------------------------------------- couch mode
/**
 * The desktop as the table and two phones as hands. The phones knock, the
 * table lets them in, and the phones play until each has shown its turn, its
 * buy screen and a founding.
 */
if (ONLY.has('couch')) {
  const table = await newPage();
  await table.goto(APP, { waitUntil: 'networkidle' });
  await setTone(table, 'day');
  await table.getByRole('button', { name: 'Couch game' }).click(); await sleep(600);
  await table.getByRole('radio', { name: 'Bot', exact: true }).nth(2).click();
  await table.getByRole('button', { name: 'Open the table' }).click(); await sleep(2500);
  const text = await table.evaluate(() => document.body.innerText);
  const m = text.match(/(?:^|\n)([A-Z0-9]{4})[^A-Z0-9\s]([A-Z0-9]{4})(?:\n|$)/);
  const code = m[1] + m[2];
  const phoneOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
  const phones = [];
  for (const name of ['Nadia', 'Ravi']) {
    const ctx = await browser.newContext(phoneOpts);
    const ph = await ctx.newPage();
    phones.push(ph);
    await ph.goto(`${ROOM}/phone/#t=${code}`, { waitUntil: 'networkidle' }); await sleep(1200);
    if (name === 'Nadia') await capture(ph, 'phone-join');
    await ph.locator('input').first().fill(name);
    await ph.getByRole('button', { name: 'Knock' }).click(); await sleep(1500);
    if (name === 'Nadia') {
      await capture(ph, 'phone-knocking');
      await bothTonesLobby(table, 'couch-table');
    }
    await table.getByRole('button', { name: 'Let in' }).first().click(); await sleep(1500);
  }
  await capture(phones[0], 'phone-seated');
  await table.getByRole('button', { name: 'Start game' }).click(); await sleep(3000);

  const seen = new Set();
  const started = Date.now();
  while (Date.now() - started < 5 * 60_000 && !['phone-found', 'phone-buy', 'phone-disposal'].every((k) => seen.has(k))) {
    for (const ph of phones) {
      const t = await ph.evaluate(() => document.body.innerText);
      const buttons = await ph.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !b.disabled).map((b) => b.getAttribute('aria-label') || b.textContent.trim()));
      if (/Your turn/i.test(t) && /Place a tile/i.test(t)) {
        const tiles = buttons.filter((b) => /^\d{1,2}[A-I](idle|found|grow|merge)/.test(b));
        const pick = ['found', 'grow', 'merge', 'idle'].map((k) => tiles.find((b) => b.includes(k))).find(Boolean);
        if (!pick) continue;
        const tile = pick.match(/^\d{1,2}[A-I]/)[0];
        await ph.getByRole('button', { name: new RegExp(`^${tile}`) }).first().click(); await sleep(400);
        if (!seen.has('phone-turn')) { seen.add('phone-turn'); await capture(ph, 'phone-turn'); await bothTones(table, 'couch-play'); }
        await ph.getByRole('button', { name: `Place ${tile}` }).click(); await sleep(1200);
        continue;
      }
      if (/Found a corporation/.test(t) && buttons.length) {
        if (!seen.has('phone-found')) { seen.add('phone-found'); await capture(ph, 'phone-found'); }
        await ph.locator('button:not([disabled])').first().click(); await sleep(1000);
        continue;
      }
      if (buttons.some((b) => /^Buy nothing/.test(b))) {
        if (process.env.CAPTURE_DEBUG) console.log('  phone-buy-buttons', JSON.stringify(await ph.evaluate(() => [...document.querySelectorAll('button')].map((b) => [b.getAttribute('aria-label'), b.textContent.trim(), b.disabled]))).slice(0, 900));
        const more = ph.locator('button[aria-label$="shares to buy +"]:not([disabled])');
        if (await more.count()) {
          await more.first().click(); await sleep(200);
          if (!seen.has('phone-buy')) { seen.add('phone-buy'); await capture(ph, 'phone-buy'); }
          await ph.locator('button').filter({ hasText: /^Buy \d/ }).first().click(); await sleep(1000);
        } else {
          await ph.getByRole('button', { name: /^Buy nothing/ }).click(); await sleep(1000);
        }
        continue;
      }
      if (buttons.includes('Confirm') && buttons.includes('Keep all')) {
        if (!seen.has('phone-disposal')) { seen.add('phone-disposal'); await capture(ph, 'phone-disposal'); }
        await ph.getByRole('button', { name: 'Sell all', exact: true }).click(); await sleep(200);
        await ph.getByRole('button', { name: 'Confirm', exact: true }).click(); await sleep(1000);
        continue;
      }
      const endTurn = buttons.find((b) => /^End turn/.test(b));
      if (endTurn) {
        if (!seen.has('phone-end')) { seen.add('phone-end'); await capture(ph, 'phone-end'); }
        await ph.getByRole('button', { name: /^End turn/ }).click(); await sleep(1000);
        continue;
      }
      if (process.env.CAPTURE_DEBUG) console.log('  phone', JSON.stringify({ t: t.slice(0, 300), buttons }).slice(0, 700));
      if (/is placing a tile|watch the table/i.test(t) && !seen.has('phone-waiting')) {
        seen.add('phone-waiting'); await capture(ph, 'phone-waiting');
      }
    }
    await sleep(500);
  }
  await table.close();
}

await browser.close();
console.log(`${Object.keys(manifest).length} frames in ${path.relative(ROOT, OUT)}`);
