import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const { CHANNELS, macBuildDir, appImage, target, stage } = await import('./itch.mjs');

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

describe('itch channels', () => {
  // itch reads the platform tag off the channel name, so these three strings
  // are not decorative — a channel named anything else ships an untagged build.
  it('are the platform keywords itch recognises', () => {
    expect(CHANNELS).toEqual({ mac: 'osx', win: 'windows', linux: 'linux' });
  });
});

describe('what gets pushed', () => {
  it('prefers the universal macOS build over a single-arch one', () => {
    expect(macBuildDir(['mac', 'mac-universal', 'Boomtown-1.0.0-universal.dmg'])).toBe('mac-universal');
  });

  it('falls back to a single-arch macOS build, which is what a dev machine makes', () => {
    expect(macBuildDir(['mac-arm64'])).toBe('mac-arm64');
  });

  it('says so when there is no macOS build at all', () => {
    expect(() => macBuildDir(['win-unpacked'])).toThrow(/no macOS build/);
  });

  it('pushes the unpacked directories, never the DMG or the installer', () => {
    // The whole point: the itch app cannot install from a DMG, and an
    // interactive NSIS installer fights it for the install directory.
    const entries = ['mac-universal', 'win-unpacked', 'Boomtown-1.0.0-universal.dmg', 'Boomtown Setup 1.0.0.exe'];
    expect(target('mac', entries).path).toBe('mac-universal');
    expect(target('win', entries).path).toBe('win-unpacked');
  });

  it('pushes the AppImage as it stands, with no manifest', () => {
    const found = target('linux', ['Boomtown-1.0.0.AppImage']);
    expect(found).toMatchObject({ channel: 'linux', path: 'Boomtown-1.0.0.AppImage', manifest: null });
  });

  it('refuses an ambiguous dist rather than pushing a stale AppImage', () => {
    expect(() => appImage(['Boomtown-1.0.0.AppImage', 'Boomtown-0.9.0.AppImage'])).toThrow(/more than one/);
  });

  it('names the platforms it knows when handed one it does not', () => {
    expect(() => target('bsd', [])).toThrow(/unknown platform 'bsd'/);
  });
});

describe('staging the manifest', () => {
  it('copies the manifest to the root of the pushed directory as .itch.toml', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'boomtown-itch-'));
    await mkdir(join(dist, 'win-unpacked'));
    await writeFile(join(dist, 'win-unpacked', 'Boomtown.exe'), '');

    const staged = await stage('win', dist, at('../build/itch'));

    expect(staged.pushPath).toBe(join(dist, 'win-unpacked'));
    // The manifest sits beside the executable, not inside a subdirectory —
    // the itch app reads it from the root of what it installed.
    expect(await readFile(join(dist, 'win-unpacked', '.itch.toml'), 'utf8')).toMatch(/path = "Boomtown\.exe"/);
  });
});

describe('the manifests in the repo', () => {
  it('launch the product name electron-builder actually produces', async () => {
    // productName in electron-builder.yml decides both of these filenames; if
    // it is ever renamed, the manifests point at something that is not there.
    const [osx, windows] = await Promise.all([
      readFile(at('../build/itch/osx.itch.toml'), 'utf8'),
      readFile(at('../build/itch/windows.itch.toml'), 'utf8'),
    ]);
    expect(osx).toMatch(/^path = "Boomtown\.app"$/m);
    expect(windows).toMatch(/^path = "Boomtown\.exe"$/m);
    // `play` is the well-known name the itch app renders as "Play Now".
    expect(osx).toMatch(/^name = "play"$/m);
    expect(windows).toMatch(/^name = "play"$/m);
  });
});

describe('the packaged targets', () => {
  const builder = readFileSync(at('../electron-builder.yml'), 'utf8');

  it('builds a zip for macOS as well as the DMG, because itch cannot use a DMG', () => {
    expect(builder).toMatch(/target: zip/);
    const mac = builder.slice(builder.indexOf('\nmac:'), builder.indexOf('\nwin:'));
    expect(mac).toMatch(/target: dmg/);
    expect(mac).toMatch(/target: zip/);
  });

  it('builds a zip for Windows as well as the installer', () => {
    const win = builder.slice(builder.indexOf('\nwin:'), builder.indexOf('\nnsis:'));
    expect(win).toMatch(/target: nsis/);
    expect(win).toMatch(/target: zip/);
  });
});
