/**
 * What this build is, for the line at the foot of the settings pane.
 *
 * The two constants are stamped in by `apps/desktop/buildStamp.ts` at config
 * time. The `typeof` guards are not ceremony: anything that bundles the
 * renderer without those defines — a future config, a consumer's own Vite
 * setup — would otherwise throw a ReferenceError on import and take the whole
 * settings dialog down over a version string.
 *
 * `released` is false for the repo's placeholder `0.0.0`, which is every build
 * that did not come off the release workflow.
 */
export interface BuildInfo {
  readonly version: string;
  /** ISO `YYYY-MM-DD`, UTC — the release date for a release build. */
  readonly date: string;
  readonly released: boolean;
}

export function buildInfo(): BuildInfo {
  const version = typeof __BOOMTOWN_VERSION__ === 'string' ? __BOOMTOWN_VERSION__ : '0.0.0';
  const date = typeof __BOOMTOWN_BUILT__ === 'string' ? __BOOMTOWN_BUILT__ : '';
  return { version, date, released: version !== '0.0.0' };
}
