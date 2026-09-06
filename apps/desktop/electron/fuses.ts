import { FuseV1Options, FuseVersion } from '@electron/fuses';

/**
 * Electron fuses — build-time bit flips on the packaged binary that permanently
 * disable dangerous capabilities (KTD9). Consumed by `electron-builder`'s
 * `afterPack` hook in U19; kept here so the security posture lives in one place.
 */
export const fuseConfig = {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
} as const;
