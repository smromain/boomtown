import { copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Staging for an itch.io release.
 *
 * `npm run package` already produces everything itch needs — the difference is
 * *which* artifact goes up and what sits next to it. This module answers both,
 * and `main()` does the copying so the release workflow is a one-liner per
 * platform rather than a pile of shell.
 *
 * Three things decided here, each of them a way an itch upload usually goes
 * wrong:
 *
 * - **What to push.** macOS and Windows push the *unpacked build directory*,
 *   not the DMG or the installer: the itch app cannot install from a DMG, and
 *   an interactive NSIS installer fights the app for control of the install
 *   directory. Linux pushes the AppImage as it stands. Pushing directories is
 *   also what makes butler's block-diff patching work — it has nothing to diff
 *   inside an archive.
 * - **The channel name.** itch reads the platform off the channel name, so
 *   these are the plain `osx` / `windows` / `linux` keywords in kebab-case. A
 *   channel called something clever gets no platform tag and the page shows a
 *   download nobody's launcher will touch.
 * - **The manifest.** `build/itch/<platform>.itch.toml` is copied to the root
 *   of the pushed directory, naming the thing to launch. The AppImage is a
 *   single file with no root to copy into, and needs no manifest — it is the
 *   executable.
 */

/**
 * Resolved lazily rather than at import: under vitest `import.meta.url` is not
 * a `file:` URL, and the tests pass their own directories in anyway.
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

/** The one AppImage in `dist`. More than one means a stale build is still lying around. */
export function appImage(entries) {
  const images = entries.filter((e) => e.endsWith('.AppImage'));
  if (images.length === 0) throw new Error('no .AppImage in dist — run `npm run package` on Linux first');
  if (images.length > 1) {
    throw new Error(`more than one .AppImage in dist (${images.join(', ')}) — clear it and repackage`);
  }
  return images[0];
}

/**
 * What to push for a platform, and what to stage beside it.
 *
 * `manifest` is null where there is nowhere to put one: an AppImage is a single
 * file, so the itch app launches it directly.
 */
export function target(platform, entries) {
  switch (platform) {
    case 'mac':
      return { channel: CHANNELS.mac, path: macBuildDir(entries), manifest: 'osx.itch.toml' };
    case 'win':
      if (!entries.includes('win-unpacked')) {
        throw new Error('no win-unpacked in dist — run `npm run package` on Windows first');
      }
      return { channel: CHANNELS.win, path: 'win-unpacked', manifest: 'windows.itch.toml' };
    case 'linux':
      return { channel: CHANNELS.linux, path: appImage(entries), manifest: null };
    default:
      throw new Error(`unknown platform '${platform}' — expected one of ${PLATFORMS.join(', ')}`);
  }
}

/**
 * Stage the manifest and print the absolute path butler should push, so the
 * caller can do `butler push "$(node electron/itch.mjs mac)" user/game:osx`.
 */
export async function stage(platform, dist = distDir(), manifests = manifestsDir()) {
  const chosen = target(platform, await readdir(dist));
  const pushPath = join(dist, chosen.path);
  if (chosen.manifest) {
    await copyFile(join(manifests, chosen.manifest), join(pushPath, '.itch.toml'));
  }
  return { ...chosen, pushPath };
}

/* c8 ignore start — the CLI wrapper; `stage` is what the tests drive. */
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const platform = process.argv[2];
  stage(platform).then(
    ({ pushPath }) => process.stdout.write(pushPath),
    (error) => {
      process.stderr.write(`${String(error.message ?? error)}\n`);
      process.exit(1);
    },
  );
}
/* c8 ignore stop */
