/**
 * Which distribution a build was made for, baked in at build time by
 * `electron.vite.config.ts` from `BOOMTOWN_DISTRIBUTION`. Empty for an ordinary
 * build — the installers on the release page.
 *
 * Its own module, with no `electron` import, so it is reachable from a test
 * without the Electron binary — the same reason `csp.ts` is not part of
 * `main.ts`.
 */
declare const __BOOMTOWN_DISTRIBUTION__: string | undefined;

/** Distributions whose own client installs and updates the app. */
const STORE_MANAGED = new Set(['itch']);

/**
 * The distribution this build was made for; `''` when it was not built for one.
 * `typeof` on an undeclared name is safe, which is what keeps this working
 * under vitest, where the build-time define does not run.
 */
export function distribution(): string {
  return typeof __BOOMTOWN_DISTRIBUTION__ === 'string' ? __BOOMTOWN_DISTRIBUTION__ : '';
}

/**
 * Whether something other than this app owns updating it.
 *
 * On itch.io the itch app installs the build into a directory it manages and
 * patches it in place. An app that also updated itself would be writing into
 * that directory behind the launcher's back — two updaters disagreeing about
 * what is installed, and a patch diff taken against files the launcher never
 * wrote. There is no update feed configured today so this changes nothing yet;
 * it is here so that adding one (see the `publish:` note in
 * `electron-builder.yml`) cannot quietly turn every itch install into that.
 */
export function updatesAreStoreManaged(dist: string = distribution()): boolean {
  return STORE_MANAGED.has(dist);
}
