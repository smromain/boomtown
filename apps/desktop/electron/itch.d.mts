/** itch channel name per platform — the name carries the platform tag. */
export const CHANNELS: { mac: string; win: string; linux: string };
export const PLATFORMS: string[];
/** `dist/`, where `npm run package` leaves its output. Resolved lazily. */
export function distDir(): string;
/** `build/itch/`, where the manifests live. Resolved lazily. */
export function manifestsDir(): string;

/** The macOS build directory in a `dist` listing (universal, else single-arch). */
export function macBuildDir(entries: string[]): string;
/** The one `.AppImage` in a `dist` listing. Throws on none or several. */
export function appImage(entries: string[]): string;

export interface ItchTarget {
  /** itch channel to push to. */
  channel: string;
  /** Path within `dist` to push. */
  path: string;
  /** Manifest to copy in beside it, or null where there is nowhere to put one. */
  manifest: string | null;
}

export function target(platform: string, entries: string[]): ItchTarget;
export function stage(
  platform: string,
  dist?: string,
  manifests?: string,
): Promise<ItchTarget & { pushPath: string }>;
