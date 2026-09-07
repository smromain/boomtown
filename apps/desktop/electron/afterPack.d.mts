import type { FuseVersion } from '@electron/fuses';

type FuseMap = { version?: FuseVersion } & Record<number, boolean>;

/** Flipped on every build. */
export const BASE_FUSES: FuseMap;
/** Added only on signed builds (asar integrity needs a trustworthy signature). */
export const SIGNED_ONLY_FUSES: FuseMap;

export function isSignedBuild(env?: NodeJS.ProcessEnv): boolean;
export function fusesFor(env?: NodeJS.ProcessEnv): FuseMap;

interface AfterPackContext {
  electronPlatformName: string;
  appOutDir: string;
  packager: { appInfo: { productFilename: string }; executableName?: string };
}

/** Resolve the packed Electron binary for the platform (post-rename). */
export function binaryPath(context: AfterPackContext): string;

/** electron-builder afterPack hook: flips the fuses on the packed binary. */
export default function afterPack(context: AfterPackContext): Promise<void>;
