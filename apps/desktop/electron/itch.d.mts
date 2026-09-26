/** itch channel name per platform — the name carries the platform tag. */
export const CHANNELS: { mac: string; win: string; linux: string };
export const PLATFORMS: string[];
/** `dist/`, where `npm run package` leaves its output. Resolved lazily. */
export function distDir(): string;
/** `build/itch/`, where the manifests live. Resolved lazily. */
export function manifestsDir(): string;

/** The macOS build directory in a `dist` listing (universal, else single-arch). */
export function macBuildDir(entries: string[]): string;
export interface ItchTarget {
  /** itch channel to push to. */
  channel: string;
  /** Path within `dist` to push. */
  path: string;
  /** Manifest to copy in beside it as `.itch.toml`. */
  manifest: string;
}

export function target(platform: string, entries: string[]): ItchTarget;
/** Where the macOS push is assembled inside `dist`. */
export const MAC_STAGING_DIR: string;
/** The per-release folder the macOS `.app` is pushed under, e.g. `v2026.9.2`. */
export function macReleaseDir(version: string | undefined): string;
/** `osx.itch.toml` with its launch path moved under the release folder. */
export function macManifest(template: string, releaseDir: string): string;
/** `version` is required for `mac` and ignored elsewhere. */
export function stage(
  platform: string,
  dist?: string,
  manifests?: string,
  version?: string,
): Promise<ItchTarget & { pushPath: string }>;
