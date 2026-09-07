import { join } from 'node:path';
import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses';

/**
 * The Electron security posture (KTD9) — build-time bit flips on the packaged
 * binary that permanently disable dangerous capabilities. This is the single
 * source of truth; `electron-builder.yml` runs the hook below.
 *
 * - RunAsNode off: the binary can't be re-invoked as a plain Node process.
 * - cookie encryption on.
 * - NODE_OPTIONS / --inspect off: no runtime code injection via env or CLI.
 * - asar integrity + OnlyLoadAppFromAsar on: the app bundle can't be swapped
 *   for tampered files on disk.
 */
export const FUSES = {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
};

/**
 * electron-builder `afterPack` hook. Flips the fuses on the packed Electron
 * binary *after* it is laid down but *before* it is signed and put in the
 * dmg/installer — the only point where the binary exists on disk and is still
 * writable.
 */
export default async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  const appName = packager.appInfo.productFilename;

  const binary = {
    darwin: join(appOutDir, `${appName}.app`, 'Contents', 'MacOS', appName),
    win32: join(appOutDir, `${appName}.exe`),
    linux: join(appOutDir, appName.toLowerCase()),
  }[electronPlatformName];

  if (!binary) {
    throw new Error(`afterPack: unknown platform ${electronPlatformName}`);
  }

  await flipFuses(binary, {
    ...FUSES,
    resetAdHocDarwinSignature: electronPlatformName === 'darwin',
  });

  console.log(`  • fuses flipped on ${electronPlatformName} binary (KTD9)`);
}
