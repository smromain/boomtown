import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Staging for an itch.io release.
 *
 * `npm run package` already produces everything itch needs — the difference is
 * *which* artifact goes up and what sits next to it. This module answers both,
 * and `stage()` does the copying so the release workflow is a one-liner per
 * platform rather than a pile of shell.
 *
 * Three things decided here, each straight out of itch's own guidance:
 *
 * - **Push the unpacked build directory, on every platform.** itch's
 *   compatibility policy puts a butler push of a build folder in its top tier
 *   and traditional installers (NSIS, MSI, InnoSetup) in its second-worst,
 *   "may require administrator access and offer the poorest user experience".
 *   Its Windows page says it outright: instead of shipping an installer, just
 *   push the install folder. Its Linux page says make a portable build and push
 *   that. Its macOS page says push the `.app`, and put the `.app` and the
 *   manifest in a folder together when there is a manifest — which is exactly
 *   what we do. Pushing directories is also what butler patches against.
 * - **The channel name.** itch reads the platform off the channel name, so
 *   these are the plain `osx` / `windows` / `linux` keywords in kebab-case. A
 *   channel called something clever gets no platform tag, and the page then
 *   shows a download the launcher will not touch.
 * - **The manifest.** `build/itch/<platform>.itch.toml` is copied to the root
 *   of the pushed directory, naming the thing to launch under the well-known
 *   `play` action.
 *
 * - **On macOS, a new folder per release.** The `.app` is pushed as
 *   `v<version>/Boomtown.app`, never at a fixed path — see `macReleaseDir`.
 *
 * What is deliberately *not* handled here: symlinks and executable bits. butler
 * manages symlinks and fixes permissions on push, and the itch app fixes
 * permissions again at launch. That is only true of a butler push of a
 * directory, which is the other reason this never hands butler an archive.
 */

const here = () => fileURLToPath(new URL('.', import.meta.url));

/** Where `npm run package` leaves its output. */
export const distDir = () => join(here(), '..', 'dist');
/** Where the manifests live in the repo. */
export const manifestsDir = () => join(here(), '..', 'build', 'itch');

/**
 * itch channel per platform. The names carry the platform tag, so they are not
 * free to be prettier than this.
 */
export const CHANNELS = { mac: 'osx', win: 'windows', linux: 'linux' };

export const PLATFORMS = Object.keys(CHANNELS);

/**
 * The macOS build directory, given a listing of `dist`. A universal build lands
 * in `mac-universal`; a single-arch one in `mac` (or `mac-arm64` on an Apple
 * Silicon machine building only for itself), which is what a local
 * `npm run package` on a dev machine produces.
 */
export function macBuildDir(entries) {
  const found = ['mac-universal', 'mac', 'mac-arm64', 'mac-x64'].find((d) => entries.includes(d));
  if (!found) throw new Error(`no macOS build in dist — looked for mac-universal/mac, saw: ${entries.join(', ')}`);
  return found;
}

/** What to push for a platform, and the manifest to stage beside it. */
export function target(platform, entries) {
  switch (platform) {
    case 'mac':
      return { channel: CHANNELS.mac, path: macBuildDir(entries), manifest: 'osx.itch.toml' };
    case 'win':
      return { channel: CHANNELS.win, path: unpacked('win-unpacked', entries), manifest: 'windows.itch.toml' };
    case 'linux':
      return { channel: CHANNELS.linux, path: unpacked('linux-unpacked', entries), manifest: 'linux.itch.toml' };
    default:
      throw new Error(`unknown platform '${platform}' — expected one of ${PLATFORMS.join(', ')}`);
  }
}

/** An unpacked build directory electron-builder always leaves beside its installers. */
function unpacked(dir, entries) {
  if (!entries.includes(dir)) {
    throw new Error(`no ${dir} in dist — run \`npm run package\` on that platform first`);
  }
  return dir;
}

/** Where the macOS push is assembled, beside the build electron-builder left. */
export const MAC_STAGING_DIR = 'itch-osx';

/**
 * The folder the macOS `.app` sits in, inside what butler pushes. It changes
 * with every release, and that is the whole point: it is why an itch update
 * no longer crashes the game.
 *
 * The itch app updates a game by patching it where it is installed, and a file
 * that changed between two builds is patched **in place** — the same file on
 * disk, rewritten. Every release rewrites the signed Mach-O binaries in the
 * bundle (the ad-hoc signature seals `Info.plist`, which carries the version),
 * and macOS caches a binary's code signature against the file itself. A signed
 * binary rewritten in place no longer matches what the kernel cached, so the
 * next launch is killed with `SIGKILL (Code Signature Invalid)` until the game
 * is reinstalled or the Mac rebooted. Apple's own guidance for updating signed
 * code is to write a new file and move it into place, never to modify the old
 * one; we cannot change how the itch app writes, but we can make every file a
 * new one.
 *
 * Under a per-release folder every path in the bundle is new, so the itch app
 * writes each file fresh and deletes the old folder, whose paths the new build
 * no longer has. butler diffs by content across the whole build, not path by
 * path, so the download stays a patch rather than the whole app.
 */
export function macReleaseDir(version) {
  if (typeof version !== 'string' || !/^[0-9]+(\.[0-9]+)*(-[0-9A-Za-z.]+)?$/.test(version)) {
    throw new Error(
      `the macOS itch build needs the release version, e.g. \`itch:stage -- mac 2026.9.2\` — got '${version ?? ''}'`,
    );
  }
  return `v${version}`;
}

/**
 * The manifest for a macOS push: the repo's manifest with its launch path moved
 * under the release folder.
 */
export function macManifest(template, releaseDir) {
  const rewritten = template.replace(/^path = "([^"]+)"$/m, (_line, path) => `path = "${releaseDir}/${path}"`);
  if (rewritten === template) throw new Error('osx.itch.toml has no `path = "…"` line to rewrite');
  return rewritten;
}

/**
 * Stage the manifest and print the absolute path butler should push, so the
 * caller can do `butler push "$(node electron/itch.mjs mac 2026.9.2)" user/game:osx`.
 *
 * Windows and Linux push electron-builder's unpacked directory as it stands.
 * macOS copies the `.app` into `itch-osx/v<version>/` first (`macReleaseDir`
 * says why); the copy keeps symlinks as symlinks, which a framework bundle is
 * made of, and file modes, so the binaries stay executable.
 */
export async function stage(platform, dist = distDir(), manifests = manifestsDir(), version = undefined) {
  const chosen = target(platform, await readdir(dist));
  if (platform !== 'mac') {
    const pushPath = join(dist, chosen.path);
    await copyFile(join(manifests, chosen.manifest), join(pushPath, '.itch.toml'));
    return { ...chosen, pushPath };
  }

  const releaseDir = macReleaseDir(version);
  const built = join(dist, chosen.path);
  const pushPath = join(dist, MAC_STAGING_DIR);
  await rm(pushPath, { recursive: true, force: true });
  await mkdir(join(pushPath, releaseDir), { recursive: true });
  for (const entry of await readdir(built)) {
    if (!entry.endsWith('.app')) continue;
    await cp(join(built, entry), join(pushPath, releaseDir, entry), { recursive: true, verbatimSymlinks: true });
  }
  const template = await readFile(join(manifests, chosen.manifest), 'utf8');
  await writeFile(join(pushPath, '.itch.toml'), macManifest(template, releaseDir));
  return { ...chosen, path: MAC_STAGING_DIR, pushPath };
}

/* c8 ignore start — the CLI wrapper; `stage` is what the tests drive. */
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [platform, version] = process.argv.slice(2);
  stage(platform, undefined, undefined, version).then(
    ({ pushPath }) => process.stdout.write(pushPath),
    (error) => {
      process.stderr.write(`${String(error.message ?? error)}\n`);
      process.exit(1);
    },
  );
}
/* c8 ignore stop */
