import { join } from 'node:path';
import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses';

/**
 * The Electron security posture (KTD9) — build-time bit flips on the packaged
 * binary that permanently disable dangerous capabilities. `electron-builder.yml`
 * runs the hook below.
 *
 * Two tiers:
 *
 * ALWAYS — safe on any build:
 *   - RunAsNode off: the binary can't be re-invoked as a plain Node process.
 *   - cookie encryption on.
 *   - NODE_OPTIONS / --inspect off: no runtime code injection via env or CLI.
 *
 * SIGNED BUILDS ONLY — asar integrity + OnlyLoadAppFromAsar. These make Electron
 * verify the app bundle against a hash embedded in a *code-signed* Info.plist;
 * on an unsigned build there is no trustworthy signature to anchor to and the
 * app hangs or refuses to launch. electron-builder only injects the asar hash
 * when it signs, so we gate these on the same condition.
 */
export const BASE_FUSES = {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
};

export const SIGNED_ONLY_FUSES = {
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
};

/** Whether this build is being code-signed (macOS identity / Windows cert). */
export function isSignedBuild(env = process.env) {
  if (env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') return false;
  return Boolean(env.CSC_LINK || env.WIN_CSC_LINK || env.CSC_NAME || env.APPLE_ID);
}

export function fusesFor(env = process.env) {
  return isSignedBuild(env) ? { ...BASE_FUSES, ...SIGNED_ONLY_FUSES } : { ...BASE_FUSES };
}

/**
 * The packed Electron binary, by platform. electron-builder renames it from
 * `electron` to the app name in `beforeCopyExtraFiles`, which runs *before* this
 * hook — so at afterPack time the names below are already in place. mac: inside
 * the `.app`; win/linux: the top-level executable, named by `executableName`.
 */
export function binaryPath({ electronPlatformName, appOutDir, packager }) {
  const app = packager.appInfo.productFilename; // e.g. "Boomtown"
  const exe = packager.executableName ?? app.toLowerCase(); // e.g. "boomtown"
  switch (electronPlatformName) {
    case 'darwin':
    case 'mas':
      return join(appOutDir, `${app}.app`, 'Contents', 'MacOS', app);
    case 'win32':
      return join(appOutDir, `${exe}.exe`);
    case 'linux':
      return join(appOutDir, exe);
    default:
      throw new Error(`afterPack: unknown platform ${electronPlatformName}`);
  }
}

/**
 * electron-builder `afterPack` hook. Flips the fuses on the packed binary.
 * electron-builder's own signing step runs immediately after, so a re-sign here
 * is unnecessary.
 */
export default async function afterPack(context) {
  const binary = binaryPath(context);
  const fuses = fusesFor();
  await flipFuses(binary, fuses);
  const tier = isSignedBuild() ? 'full' : 'base (unsigned build)';
  console.log(`  • fuses flipped [${tier}]: ${binary} (KTD9)`);
}
