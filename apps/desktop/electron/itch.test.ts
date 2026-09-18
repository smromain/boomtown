import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const { CHANNELS, macBuildDir, target, stage } = await import('./itch.mjs');

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

  it('pushes the unpacked directories on every platform, never an installer', () => {
    // itch ranks a butler push of a build folder top-tier and traditional
    // installers second-worst; the AppImage is skipped for the same reason a
    // DMG is — one opaque file butler cannot patch well.
    const entries = [
      'mac-universal',
      'win-unpacked',
      'linux-unpacked',
      'Boomtown-1.0.0-universal.dmg',
      'Boomtown Setup 1.0.0.exe',
      'Boomtown-1.0.0.AppImage',
    ];
    expect(target('mac', entries).path).toBe('mac-universal');
    expect(target('win', entries).path).toBe('win-unpacked');
    expect(target('linux', entries).path).toBe('linux-unpacked');
  });

  it('every platform gets a manifest, since every platform pushes a directory', () => {
    const entries = ['mac-universal', 'win-unpacked', 'linux-unpacked'];
    for (const platform of ['mac', 'win', 'linux']) {
      expect(target(platform, entries).manifest).toMatch(/\.itch\.toml$/);
    }
  });

  it('says which build is missing rather than pushing the wrong thing', () => {
    expect(() => target('linux', ['mac-universal'])).toThrow(/no linux-unpacked in dist/);
    expect(() => target('win', ['mac-universal'])).toThrow(/no win-unpacked in dist/);
  });

  it('names the platforms it knows when handed one it does not', () => {
    expect(() => target('bsd', [])).toThrow(/unknown platform 'bsd'/);
  });
});

describe('staging the manifest', () => {
  it('copies the manifest to the root of the pushed directory as .itch.toml', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'boomtown-itch-'));
    await mkdir(join(dist, 'win-unpacked'));
    await writeFile(join(dist, 'win-unpacked', 'boomtown.exe'), '');

    const staged = await stage('win', dist, at('../build/itch'));

    expect(staged.pushPath).toBe(join(dist, 'win-unpacked'));
    // The manifest sits beside the executable, not inside a subdirectory —
    // the itch app reads it from the root of what it installed.
    expect(await readFile(join(dist, 'win-unpacked', '.itch.toml'), 'utf8')).toMatch(/path = "boomtown\.exe"/);
  });
});

describe('the manifests in the repo', () => {
  it('launch the executables electron-builder actually emits', async () => {
    // These are the same paths `afterPack.mjs` flips the fuses on — that hook
    // runs on every package and would fail the build if they were wrong, which
    // is the only evidence available without packaging here. `butler validate`
    // in the release workflow is the check against a real build.
    const [osx, windows, linux] = await Promise.all([
      readFile(at('../build/itch/osx.itch.toml'), 'utf8'),
      readFile(at('../build/itch/windows.itch.toml'), 'utf8'),
      readFile(at('../build/itch/linux.itch.toml'), 'utf8'),
    ]);
    expect(osx).toMatch(/^path = "Boomtown\.app"$/m);
    expect(windows).toMatch(/^path = "boomtown\.exe"$/m);
    expect(linux).toMatch(/^path = "boomtown"$/m);
    // `play` is the well-known name the itch app renders as "Play Now".
    for (const manifest of [osx, windows, linux]) {
      expect(manifest).toMatch(/^name = "play"$/m);
    }
  });
});

describe('the packaged targets', () => {
  const builder = readFileSync(at('../electron-builder.yml'), 'utf8');

  it('build only the release-page downloads — itch gets the unpacked dirs', () => {
    // A zip target would be dead weight: electron-builder leaves the unpacked
    // directory beside every installer, and that directory is what butler gets.
    expect(builder).not.toMatch(/target: zip/);
    expect(builder).toMatch(/target: dmg/);
    expect(builder).toMatch(/target: nsis/);
    expect(builder).toMatch(/target: AppImage/);
  });

  it('pins the Linux artifact name, so an archive target does not bury itself', () => {
    // `${name}` is the package name `@boomtown/desktop`, and an archive target
    // does not sanitise it the way the installer targets do. The slash survived
    // as a path separator, so the tarball was written to
    // `dist/@boomtown/desktop-<version>.tar.gz` — one directory below every
    // glob that looks for it. The build passed and the release shipped without
    // a Linux tarball at all. Same root cause as `executableName` below.
    const builder = readFileSync(at('../electron-builder.yml'), 'utf8');
    expect(builder).toMatch(/artifactName: \$\{productName\}/);
    expect(builder).not.toMatch(/artifactName: \$\{name\}/);
  });

  it('ships a Linux tarball beside the AppImage, which is not the same as a zip', () => {
    // The one archive target that earns its place. An AppImage is a FUSE-mounted
    // squashfs: it cannot run without libfuse2, and being mounted `nosuid` it
    // can never carry a SUID `chrome-sandbox` — so on a machine that also
    // restricts user namespaces, the renderer has no way to start and no
    // fallback. SteamOS in Game Mode is that machine. An extracted tarball is an
    // ordinary directory where the SUID helper can be restored.
    //
    // This is *not* the dead-weight zip above: that one would have duplicated
    // the unpacked directory butler already gets, where this is the only Linux
    // download on the release page that a Steam Deck can be pointed at.
    expect(builder).toMatch(/target: tar\.gz/);
  });
});

describe('the executable name the manifests point at', () => {
  it('is pinned in electron-builder.yml, not derived from the package name', () => {
    // Without `executableName`, electron-builder derives one from the package
    // name `@boomtown/desktop` and sanitises it to `@boomtowndesktop` — which
    // is what a real release actually produced, and what the Linux and Windows
    // manifests were pointing past. Pinning it is what makes those paths true.
    const builder = readFileSync(at('../electron-builder.yml'), 'utf8');
    expect(builder).toMatch(/^executableName: boomtown$/m);
  });
});
