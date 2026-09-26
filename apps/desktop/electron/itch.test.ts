import { readFileSync } from 'node:fs';
import { chmod, lstat, mkdtemp, mkdir, readFile, readdir, readlink, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const { CHANNELS, macBuildDir, macManifest, macReleaseDir, target, stage } = await import('./itch.mjs');

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

describe('staging the macOS build', () => {
  // A fake bundle with the two things a real one must survive the copy with:
  // an executable binary and a framework's `Current` symlink.
  async function macDist() {
    const dist = await mkdtemp(join(tmpdir(), 'boomtown-itch-mac-'));
    const app = join(dist, 'mac-universal', 'Boomtown.app', 'Contents');
    await mkdir(join(app, 'MacOS'), { recursive: true });
    await writeFile(join(app, 'MacOS', 'Boomtown'), 'binary');
    await chmod(join(app, 'MacOS', 'Boomtown'), 0o755);
    await mkdir(join(app, 'Frameworks', 'Electron Framework.framework', 'Versions', 'A'), { recursive: true });
    await symlink('A', join(app, 'Frameworks', 'Electron Framework.framework', 'Versions', 'Current'));
    return dist;
  }

  it('puts the .app under a folder named for the release, with the manifest at the root', async () => {
    // The itch app patches a changed file in place, and macOS kills a signed
    // binary that was rewritten in place. A new folder per release makes every
    // path new, so every file is written fresh instead.
    const dist = await macDist();
    const staged = await stage('mac', dist, at('../build/itch'), '2026.9.2');

    expect(staged.pushPath).toBe(join(dist, 'itch-osx'));
    expect(staged.channel).toBe('osx');
    expect(await readFile(join(staged.pushPath, '.itch.toml'), 'utf8')).toMatch(
      /^path = "v2026\.9\.2\/Boomtown\.app"$/m,
    );
    const binary = join(staged.pushPath, 'v2026.9.2', 'Boomtown.app', 'Contents', 'MacOS', 'Boomtown');
    expect((await stat(binary)).mode & 0o111).not.toBe(0);
    const current = join(
      staged.pushPath,
      'v2026.9.2',
      'Boomtown.app',
      'Contents',
      'Frameworks',
      'Electron Framework.framework',
      'Versions',
      'Current',
    );
    expect((await lstat(current)).isSymbolicLink()).toBe(true);
    expect(await readlink(current)).toBe('A');
  });

  it('leaves no earlier release behind when staged again', async () => {
    const dist = await macDist();
    await stage('mac', dist, at('../build/itch'), '2026.9.1');
    const staged = await stage('mac', dist, at('../build/itch'), '2026.9.2');
    expect((await readdir(staged.pushPath)).sort()).toEqual(['.itch.toml', 'v2026.9.2']);
  });

  it('refuses to stage without a version rather than reuse a fixed path', async () => {
    const dist = await macDist();
    await expect(stage('mac', dist, at('../build/itch'))).rejects.toThrow(/needs the release version/);
    expect(() => macReleaseDir('../escape')).toThrow(/needs the release version/);
  });

  it('accepts the CalVer shapes the release workflow produces', () => {
    expect(macReleaseDir('2026.9.2')).toBe('v2026.9.2');
    expect(macReleaseDir('2026.9.3-rc1')).toBe('v2026.9.3-rc1');
  });

  it('moves only the launch path under the release folder', () => {
    const manifest = '[[actions]]\nname = "play"\npath = "Boomtown.app"\n';
    expect(macManifest(manifest, 'v2026.9.2')).toBe('[[actions]]\nname = "play"\npath = "v2026.9.2/Boomtown.app"\n');
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

  it('build only the release-page installers — itch gets the unpacked dirs', () => {
    // A zip target would be dead weight: electron-builder leaves the unpacked
    // directory beside every installer, and that directory is what butler gets.
    expect(builder).not.toMatch(/target: zip/);
    expect(builder).toMatch(/target: dmg/);
    expect(builder).toMatch(/target: nsis/);
    expect(builder).toMatch(/target: AppImage/);
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
