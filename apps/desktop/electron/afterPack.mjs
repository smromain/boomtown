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

/**
 * macOS only, and the reason the arm64 build would not launch at all.
 *
 * Flipping a fuse **rewrites the Mach-O**, which invalidates whatever signature
 * the binary arrived with. Apple Silicon *requires* a valid signature — an
 * invalid one is not a warning, the app simply refuses to open and macOS
 * reports it as "damaged". Intel is laxer, so the x64 build launched and merely
 * ran under Rosetta, which is why the two artifacts failed in different ways
 * from one cause.
 *
 * `resetAdHocDarwinSignature` re-signs the bundle ad-hoc after the flip,
 * preserving the hardened-runtime flags and entitlements. On a build that
 * electron-builder then signs with a real identity, that signature simply
 * replaces this one — so this is safe on both.
 */
function isDarwin(platform) {
  return platform === 'darwin' || platform === 'mas';
}

/**
 * electron-builder's `Arch` enum. Not imported: `builder-util` is electron-
 * builder's own internal package, not a dependency we declare, and the only
 * value this hook needs is a stable part of its public contract.
 */
const ARCH_UNIVERSAL = 4;

/**
 * Whether this invocation is packing a **per-arch intermediate** of a universal
 * build rather than a bundle that ships.
 *
 * A universal build calls this hook three times: once for the x64 pack, once for
 * arm64, and once more for the merged app. The first two are throwaway — `lipo`
 * rewrites their binaries during the merge, so any signature on them is
 * destroyed anyway.
 *
 * Signing them is worse than pointless. `@electron/universal` requires every
 * non-binary file to have an identical hash across the two inputs, and
 * `_CodeSignature/CodeResources` is a non-binary file that hashes the binaries —
 * so two ad-hoc signed inputs differ there and the merge refuses with "Expected
 * all non-binary files to have identical SHAs".
 */
export function isUniversalIntermediate(context) {
  if (!isDarwin(context.electronPlatformName)) return false;
  if (context.arch === ARCH_UNIVERSAL) return false;
  const targets = context.packager?.platformSpecificBuildOptions?.target ?? [];
  return targets.some((entry) => (entry?.arch ?? []).includes('universal'));
}

export function fusesFor(env = process.env, platform = process.platform, resign = true) {
  const posture = isSignedBuild(env) ? { ...BASE_FUSES, ...SIGNED_ONLY_FUSES } : { ...BASE_FUSES };
  return isDarwin(platform) && resign ? { ...posture, resetAdHocDarwinSignature: true } : posture;
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
 *
 * This used to say a re-sign was unnecessary because electron-builder signs
 * immediately afterwards. That holds only for a build with a real signing
 * identity. An unsigned local `npm run package` has nothing to repair the
 * signature the flip just invalidated, which on Apple Silicon means the app
 * will not open — hence `resetAdHocDarwinSignature` in `fusesFor`.
 */
export default async function afterPack(context) {
  const binary = binaryPath(context);
  // The *target* platform, not the build host — a cross-build still produces a
  // macOS bundle that needs re-signing.
  const fuses = fusesFor(process.env, context.electronPlatformName, !isUniversalIntermediate(context));
  await flipFuses(binary, fuses);
  const tier = isSignedBuild() ? 'full' : 'base (unsigned build)';
  const note = fuses.resetAdHocDarwinSignature
    ? ' + ad-hoc re-sign'
    : isUniversalIntermediate(context)
      ? ' (universal intermediate — the merged app is re-signed instead)'
      : '';
  console.log(`  • fuses flipped [${tier}]${note}: ${binary} (KTD9)`);
}
