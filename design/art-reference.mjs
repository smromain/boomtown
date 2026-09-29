/**
 * Reference material for the art kit (`npm run art:export`): what the drawings
 * look like in the game, for the artist touching them up.
 *
 *   samples/      every drawing as the game draws it (company colours, the wobble,
 *                 day and night), one PNG each plus a sheet per kind, and
 *                 colours.png, which shows one drawing going from the kit's
 *                 colours to three companies by day and one by night
 *   screenshots/  the table, the corporation cards, the players' heads, a
 *                 founding and mergers, from games played by bots, day and night
 *   clips/        the same games recorded: mergers (the crane's swing), a
 *                 founding, and a stretch of play
 *
 * Needs the renderer on :5173 (`npm run -w @boomtown/desktop web`), then, from
 * the repo root:
 *
 *   node design/art-reference.mjs [--out art-kit/reference] [--only samples,play] [--max 600]
 *
 * Clips are cut with ffmpeg as .mp4 when one is found (FFMPEG, or ffmpeg on the
 * PATH); without it the whole game is kept as the browser's .webm. Playwright and
 * Chromium come from the environment, as for capture.mjs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env['PLAYWRIGHT_MODULE'] ?? '/opt/node22/lib/node_modules/playwright');
const EXECUTABLE = process.env['CHROMIUM_PATH'] ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const URL = process.env['BOOMTOWN_WEB'] ?? 'http://localhost:5173/';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const OUT = path.resolve(arg('out', 'art-kit/reference'));
const ONLY = new Set(arg('only', 'samples,play').split(','));
const MAX_SECONDS = Number(arg('max', 600));
const LIGHTS = ['day', 'night'];

function findFfmpeg() {
  for (const candidate of [process.env['FFMPEG'], 'ffmpeg']) {
    if (!candidate) continue;
    try {
      execFileSync(candidate, ['-version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // try the next
    }
  }
  return undefined;
}

const browser = await chromium.launch({ executablePath: EXECUTABLE });

/** Settings the app reads at start: the lighting, and no sound. */
const settle = (light) => (page) =>
  page.addInitScript((lighting) => {
    const raw = localStorage.getItem('boomtown.settings');
    const settings = raw ? JSON.parse(raw) : {};
    Object.assign(settings, { lighting, boardStyle: 'board-view', musicMuted: true, effectsVolume: 0 });
    localStorage.setItem('boomtown.settings', JSON.stringify(settings));
  }, light);

// ---------------------------------------------------------------- samples

async function samples() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  await settle('day')(page);
  await page.goto(`${URL}?skin=gamenight`);
  await page.getByRole('button', { name: 'Local game' }).waitFor();

  // Build the sheets out of the app's own modules, served by Vite, so they
  // draw with the real files, tokens and company colours.
  const build = async (light, kind) =>
    page.evaluate(
      async ([light, kind]) => {
        const [{ SCENES }, merger, { drawingsIn }, theme, { SEAT_COLOURS }, { EXPORT_PALETTE }] = await Promise.all([
          import('/src/art/scenes.ts'),
          import('/src/art/mergerScenes.ts'),
          import('/src/art/drawings.ts'),
          import('/src/game/industryTheme.ts'),
          import('/src/art/Portrait.tsx'),
          import('/src/art/kit.ts'),
        ]);
        const INDUSTRIES = Object.keys(SCENES);
        theme.applyLighting(light);
        document.getElementById('ref')?.remove();
        if (!document.getElementById('gn-rough')) {
          // The same filter as GameNightDefs in Scene.tsx.
          document.body.insertAdjacentHTML(
            'beforeend',
            `<svg width="0" height="0" style="position:absolute"><filter id="gn-rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`,
          );
        }
        const ground = getComputedStyle(document.body).backgroundColor;
        const ref = document.createElement('div');
        ref.id = 'ref';
        ref.style.cssText = `position:fixed;inset:0;z-index:99999;overflow:auto;background:${ground};padding:8px;font:600 13px system-ui,sans-serif;color:var(--ink, #1c2a47)`;
        ref.insertAdjacentHTML('afterbegin', '<style>#ref .gn-sway{animation:none}#ref figure{margin:0 16px 16px 0;display:inline-block;vertical-align:top}#ref figcaption{margin-top:4px}</style>');
        const svg = (box, markup, style = '', attrs = '') =>
          `<svg viewBox="${box}" style="display:block;${style}" ${attrs}>${markup}</svg>`;
        const figure = (id, caption, inner) => `<figure id="${id}">${inner}<figcaption>${caption}</figcaption></figure>`;
        const tokens = (industry) => {
          const { color, ink } = theme.industryTheme(industry);
          return `--gn-c:${color};--gn-ci:${ink};`;
        };
        let html = '';
        if (kind === 'cards') {
          html = INDUSTRIES.map((industry) =>
            figure(`card-${industry}`, industry, svg('0 0 300 96', `<g class="gn-rough">${SCENES[industry]}</g>`, `width:300px;height:96px;${tokens(industry)}`)),
          ).join('');
        } else if (kind === 'mergers') {
          html = INDUSTRIES.map((survivor, i) => {
            const defunct = INDUSTRIES[(i + 3) % INDUSTRIES.length];
            const style = `width:600px;height:150px;--gn-c:${theme.industryTheme(survivor).color};--gn-t:${theme.industryTheme(defunct).color}`;
            return figure(`merger-${survivor}-takes-${defunct}`, `${survivor} takes over ${defunct}`, svg('0 0 600 150', merger.mergerScene(survivor, defunct), style));
          }).join('');
        } else if (kind === 'portraits') {
          html = drawingsIn('portraits')
            .map((art, face) =>
              figure(
                `portrait-${face + 1}`,
                `head ${face + 1}`,
                `<div style="display:flex;gap:10px;align-items:end">${SEAT_COLOURS.map(
                  (ring, seat) =>
                    `<span style="display:block;border-radius:50%;overflow:hidden;border:3px solid var(--surface);background:${ring};width:${seat === 0 ? 96 : 36}px;height:${seat === 0 ? 96 : 36}px">${svg(
                      '0 0 40 40',
                      `<g transform="translate(20 20) scale(1.25) translate(-20 -17)"><g class="gn-rough">${art}</g></g>`,
                      'width:100%;height:100%',
                    )}</span>`,
                ).join('')}</div>`,
              ),
            )
            .join('');
        } else if (kind === 'colours') {
          // One drawing through the round trip: as the kit has it, then as the game colours it.
          const kit = Object.entries(EXPORT_PALETTE)
            .map(([token, { hex, opacity }]) => {
              if (opacity == null) return `--gn-${token}:${hex};`;
              const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
              return `--gn-${token}:rgba(${r},${g},${b},${opacity});`;
            })
            .join('');
          const card = (style, caption, art) => figure('', caption, svg('0 0 300 96', art, `width:300px;height:96px;${style}`));
          const game = (industry) => card(tokens(industry), `in the game (${light}): ${industry} colour`, `<g class="gn-rough">${SCENES.air}</g>`);
          html =
            `<div id="colours" style="display:inline-block;padding:16px 0 0 16px">` +
            card(kit, 'the kit file, as you draw it', SCENES.air) +
            ['air', 'energy', 'video'].map(game).join('') +
            `</div>`;
        }
        ref.insertAdjacentHTML('beforeend', `<div id="sheet" style="display:inline-block;padding:16px 0 0 16px">${html}</div>`);
        document.body.appendChild(ref);
        return [...ref.querySelectorAll('figure[id]')].map((f) => f.id).filter(Boolean);
      },
      [light, kind],
    );

  for (const light of LIGHTS) {
    const dir = path.join(OUT, 'samples', light);
    fs.mkdirSync(dir, { recursive: true });
    for (const kind of ['cards', 'mergers', 'portraits']) {
      const ids = await build(light, kind);
      await page.waitForTimeout(300);
      await page.locator('#sheet').screenshot({ path: path.join(dir, `${kind}.png`) });
      for (const id of ids) await page.locator(`#${id} > :first-child`).screenshot({ path: path.join(dir, `${id}.png`) });
    }
  }
  // The colour walk-through, once per lighting.
  for (const light of LIGHTS) {
    await build(light, 'colours');
    await page.waitForTimeout(200);
    const file = path.join(OUT, 'samples', `colours-${light}.png`);
    await page.locator('#sheet').screenshot({ path: file });
  }
  await page.close();
  console.log(`samples: ${path.join(OUT, 'samples')}`);
}

// ---------------------------------------------------------------- play

/** Plays one game, seat 0 played by this script and the rest by bots, recording it. */
async function play(light, ffmpeg) {
  const shots = path.join(OUT, 'screenshots');
  const clips = path.join(OUT, 'clips');
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), `art-reference-${light}-`));
  for (const dir of [shots, clips]) fs.mkdirSync(dir, { recursive: true });
  const size = { width: 1280, height: 800 };
  const context = await browser.newContext({ viewport: size, recordVideo: { dir: raw, size } });
  const page = await context.newPage();
  const started = Date.now();
  const at = () => (Date.now() - started) / 1000;
  await settle(light)(page);
  await page.goto(`${URL}?skin=gamenight`);
  await page.getByRole('button', { name: 'Local game' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('radio', { name: '4 seats', exact: true }).click();
  await page.getByRole('radio', { name: 'Human', exact: true }).nth(0).click();
  for (let i = 1; i < 4; i++) await page.getByRole('radio', { name: 'Bot', exact: true }).nth(i).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.waitForTimeout(1000);

  const shot = (name, locator = page) => locator.screenshot({ path: path.join(shots, `${name}-${light}.png`) }).catch(() => {});
  const moments = { merger: [], founding: [], table: [] };
  let lastKey = '';
  let lastTable = 0;
  let tables = 0;
  let turns = 0;
  while (at() < MAX_SECONDS) {
    const dialogs = page.locator('[role=dialog]:visible');
    const count = await dialogs.count();
    const key = count ? ((await dialogs.first().getAttribute('aria-label')) ?? 'dialog') : '';
    if (key !== lastKey && key === 'Merger') {
      moments.merger.push(at());
      if (moments.merger.length <= 3) {
        await page.waitForTimeout(1600);
        await shot(`merger-${moments.merger.length}`);
      }
    } else if (key !== lastKey && key === 'A corporation is founded') {
      moments.founding.push(at());
      if (moments.founding.length <= 2) {
        await page.waitForTimeout(1200);
        await shot(`founding-${moments.founding.length}`);
      }
    }
    lastKey = key;
    if (!count && at() - lastTable > 40) {
      lastTable = at();
      tables++;
      moments.table.push(at());
      if (tables <= 4) await shot(`table-${tables}`);
      // The close-ups keep the latest, when the most companies are on the table.
      await shot('corporation-cards', page.getByRole('region', { name: 'Corporations' }));
      await shot('players-heads', page.getByRole('region', { name: 'Shareholders' }));
    }
    if (count) {
      await decide(page, dialogs.first(), turns++);
      continue;
    }
    const over = await page.evaluate(() => !document.querySelector('[aria-label=Story]') && /standings|awards|final/i.test(document.body.textContent ?? ''));
    if (over) break;
    const tiles = page.locator('[aria-label="Your tiles"] button:enabled');
    const n = await tiles.count();
    if (n) {
      await tiles.nth(turns++ % n).click();
      await page.waitForTimeout(600);
      continue;
    }
    const end = page.getByRole('button', { name: /^(End turn|End my turn|Buy stock)$/ }).first();
    if ((await end.count()) && (await end.isEnabled().catch(() => false))) await end.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.close();
  await context.close();
  const video = fs.readdirSync(raw).find((f) => f.endsWith('.webm'));
  const full = path.join(raw, video);

  if (!ffmpeg) {
    fs.renameSync(full, path.join(clips, `game-${light}.webm`));
    console.log(`play ${light}: no ffmpeg, kept the whole game as clips/game-${light}.webm`);
  } else {
    const cut = (from, seconds, name) =>
      execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, from)), '-i', full, '-t', String(seconds),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', '-an', path.join(clips, `${name}-${light}.mp4`)]);
    moments.merger.slice(0, 3).forEach((t, i) => cut(t - 0.4, 9, `merger-${i + 1}`));
    moments.founding.slice(0, 1).forEach((t) => cut(t - 0.4, 5, 'founding'));
    if (moments.table.length > 1) cut(moments.table[1], 30, 'play');
  }
  fs.rmSync(raw, { recursive: true, force: true });
  console.log(`play ${light}: ${moments.merger.length} mergers, ${moments.founding.length} foundings in ${at().toFixed(0)}s`);
}

/** Seat 0's decisions: a modest buy, sell or trade in a merger, otherwise the first choice. */
async function decide(page, dialog, turn) {
  const names = await dialog
    .getByRole('button')
    .evaluateAll((els) => els.filter((e) => !e.disabled).map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim()));
  const click = async (re) => {
    const b = dialog.getByRole('button', { name: re }).first();
    if ((await b.count()) && (await b.isEnabled())) {
      await b.click().catch(() => {});
      return true;
    }
    return false;
  };
  if (await click(/^I’m .* show my decision/)) {
    // the hand-off card
  } else if (names.some((x) => /one more/.test(x))) {
    const plus = dialog.getByRole('button', { name: /one more/ });
    const m = await plus.count();
    for (let j = 0; j < m; j++) {
      const b = plus.nth((j + turn) % m);
      if (await b.isEnabled()) {
        await b.click();
        break;
      }
    }
    if (!(await click(/^Buy \d/))) await click(/Buy nothing/);
  } else if (names.some((x) => /^Keep all/.test(x))) {
    if (!(await click(/Trade the most/))) await click(/^Sell all/);
    await click(/^Confirm/);
  } else {
    const pick = names.find((x) => x && !/peek|resume|reference|rules|close/i.test(x));
    if (pick) await click(new RegExp(`^${pick.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    else await page.keyboard.press('Space');
  }
  await page.waitForTimeout(500);
}

if (ONLY.has('samples')) await samples();
if (ONLY.has('play')) {
  const ffmpeg = findFfmpeg();
  await Promise.all(LIGHTS.map((light) => play(light, ffmpeg)));
}
await browser.close();
