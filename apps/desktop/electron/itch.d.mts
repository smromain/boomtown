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
export function stage(
  platform: string,
  dist?: string,
  manifests?: string,
): Promise<ItchTarget & { pushPath: string }>;
