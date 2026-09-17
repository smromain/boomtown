import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * What this build calls itself, as compile-time constants for the renderer.
 *
 * The version is read from `apps/desktop/package.json` at config time. That
 * file sits at `0.0.0` in the repo on purpose — CalVer is resolved at release
 * time, so there is nothing to bump by hand — and the release workflow runs
 * `npm version` to stamp it *before* the build, which is what puts a real
 * number here (see `docs/deploying.md`). A `0.0.0` reaching the renderer
 * therefore means exactly one thing: this build did not come off the release
 * workflow, and the settings pane says so rather than printing a number no
 * release ever had.
 *
 * The date is the day the bundle was built, UTC. For a release build that is
 * the release date, because the workflow builds from the tag it just cut.
 * `BOOMTOWN_BUILD_DATE` overrides it for a reproducible rebuild.
 *
 * Both are defined here rather than read at runtime because the renderer never
 * touches the Electron bridge — `app.getVersion()` is not available to it, and
 * reaching for it would be the one thing that stops the game running in an
 * ordinary browser.
 */
export function buildStamp(configDir: string | URL): Record<string, string> {
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', configDir)), 'utf8')) as {
    version?: string;
  };
  return {
    __BOOMTOWN_VERSION__: JSON.stringify(pkg.version ?? '0.0.0'),
    __BOOMTOWN_BUILT__: JSON.stringify(
      process.env['BOOMTOWN_BUILD_DATE'] ?? new Date().toISOString().slice(0, 10),
    ),
  };
}
