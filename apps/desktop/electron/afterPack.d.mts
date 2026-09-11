import type { FuseVersion } from '@electron/fuses';

type FuseMap = { version?: FuseVersion; resetAdHocDarwinSignature?: boolean } & Record<
  number,
  boolean
>;

/** Flipped on every build. */
export const BASE_FUSES: FuseMap;
/** Added only on signed builds (asar integrity needs a trustworthy signature). */
export const SIGNED_ONLY_FUSES: FuseMap;

interface AfterPackContext {
  electronPlatformName: string;
  appOutDir: string;
  /** electron-builder's `Arch` enum; `4` is universal. */
  arch?: number;
  packager: {
    appInfo: { productFilename: string };
    executableName?: string;
    platformSpecificBuildOptions?: { target?: { arch?: string[] }[] };
  };
}

export function isSignedBuild(env?: NodeJS.ProcessEnv): boolean;
/**
 * The fuse posture for a target platform. `platform` is the *target*
 * (`context.electronPlatformName`), not the build host: a macOS bundle needs an
 * ad-hoc re-sign after the flip whatever machine produced it.
 */
export function fusesFor(
  env?: NodeJS.ProcessEnv,
  platform?: string,
  resign?: boolean,
): FuseMap;

/**
 * Whether this invocation is packing a per-arch intermediate of a universal
 * build — a bundle `lipo` is about to rewrite, which must not be signed or the
 * merge refuses it.
 */
export function isUniversalIntermediate(context: AfterPackContext): boolean;


/** Resolve the packed Electron binary for the platform (post-rename). */
export function binaryPath(context: AfterPackContext): string;

/** electron-builder afterPack hook: flips the fuses on the packed binary. */
export default function afterPack(context: AfterPackContext): Promise<void>;
