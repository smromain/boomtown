import type { FuseVersion } from '@electron/fuses';

/** The fuse posture (KTD9) — single source of truth, asserted by afterPack.test.ts. */
export const FUSES: { version: FuseVersion } & Record<number, boolean>;

interface AfterPackContext {
  electronPlatformName: string;
  appOutDir: string;
  packager: { appInfo: { productFilename: string } };
}

/** electron-builder afterPack hook: flips FUSES on the packed binary. */
export default function afterPack(context: AfterPackContext): Promise<void>;
