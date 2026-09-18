/**
 * What kind of Linux session the app was launched into, and what that session
 * can be asked to do.
 *
 * This exists because of a bug that only ever appeared on SteamOS: the same
 * Linux build plays normally in desktop mode and hangs on a dark, empty window
 * in **Game Mode**, where it cannot be quit or relaunched. Game Mode is not a
 * desktop — it is gamescope, a micro-compositor, with Steam owning the launch
 * and, depending on how the shortcut is configured, a pressure-vessel container
 * between the app and the host. Three differences from KDE, any of which can
 * strand an Electron app.
 *
 * No `electron` import, on purpose: the detection is a pure function of the
 * environment, so it is a unit test rather than something only a Steam Deck can
 * answer. Same reason `csp.ts` and `distribution.ts` are not part of `main.ts`.
 */

export type Env = Readonly<Partial<Record<string, string>>>;

export interface SessionShape {
  /**
   * gamescope is compositing this window: Steam Deck Game Mode, a gamescope
   * session on a desktop, or an embedded `gamescope` invocation.
   *
   * gamescope is a compositor, not a desktop. It draws no title bar, has no
   * taskbar, and shows one surface at a time. A window that is merely
   * *maximized* therefore has no visible close control, nothing to alt-tab to,
   * and no way for the player to restore or move it — which is most of what
   * "it locks up and can't be shut down" describes even when the renderer is
   * perfectly healthy. Under gamescope the app opens true fullscreen instead.
   */
  readonly gamescope: boolean;

  /** Steam launched the app (Game Mode, Big Picture, or a desktop-mode shortcut). */
  readonly steam: boolean;

  /** Running on Steam Deck hardware. */
  readonly steamDeck: boolean;

  /**
   * A Steam Linux Runtime container (pressure-vessel) sits between the app and
   * the host. This is a prime suspect for the hang: Electron's SUID/namespace
   * sandbox and the container's own bubblewrap can conflict, and when the
   * zygote cannot spawn, the window is created and shown but the renderer
   * never starts — a live process behind a window that never paints. Detected
   * and logged rather than worked around, because silently dropping the
   * sandbox (KTD9) is not a trade this app makes on its own.
   */
  readonly container: boolean;
}

const truthy = (value: string | undefined): boolean => value != null && value !== '' && value !== '0';

/**
 * Read the session shape off the environment.
 *
 * Game Mode exports `XDG_CURRENT_DESKTOP=gamescope` and a
 * `GAMESCOPE_WAYLAND_DISPLAY`; Steam exports a `SteamGameId`/`SteamAppId` pair
 * and `SteamOverlayGameId` for anything it launches, `SteamDeck=1` on the
 * hardware; pressure-vessel exports `PRESSURE_VESSEL_*` and the freedesktop
 * `container` marker. Several are checked for each fact because Valve has
 * moved them between releases and a missed variable costs a wrong diagnosis.
 */
export function sessionShape(env: Env = process.env): SessionShape {
  const desktop = (env['XDG_CURRENT_DESKTOP'] ?? '').toLowerCase();
  return {
    gamescope:
      truthy(env['GAMESCOPE_WAYLAND_DISPLAY']) ||
      truthy(env['GAMESCOPE_LIMITER_FILE']) ||
      desktop.split(':').includes('gamescope'),
    steam:
      truthy(env['SteamGameId']) ||
      truthy(env['SteamAppId']) ||
      truthy(env['SteamOverlayGameId']) ||
      truthy(env['SteamClientLaunch']),
    steamDeck: truthy(env['SteamDeck']),
    container:
      truthy(env['PRESSURE_VESSEL_RUNTIME']) ||
      truthy(env['PRESSURE_VESSEL_RUNTIME_BASE']) ||
      truthy(env['PRESSURE_VESSEL_PREFIX']) ||
      truthy(env['STEAM_RUNTIME']) ||
      truthy(env['container']),
  };
}

/**
 * Extra Chromium switches to apply before `app.whenReady()`, read from
 * `BOOMTOWN_ELECTRON_FLAGS`.
 *
 * Deliberately an escape hatch and **not** a set of defaults. The candidate
 * fixes for a Game Mode hang — `--no-sandbox`, `--disable-gpu`,
 * `--disable-gpu-sandbox`, `--in-process-gpu`, `--ozone-platform=wayland` —
 * each trade away security or performance for every Linux player, and none of
 * them can be confirmed anywhere but on the device. Shipping a guess as a
 * default would make the app permanently worse to maybe fix one machine. This
 * lets the guess be *tested* on that machine, one flag at a time, with no
 * rebuild and no change for anyone who does not set the variable. See
 * `docs/steamos-game-mode.md` for the order to try them in.
 *
 * Comma- or whitespace-separated. `--flag=value` and bare `--flag` both work;
 * anything not starting with `--` is dropped rather than passed through, so a
 * typo cannot turn into a positional argument Chromium reads as a URL.
 */
export function extraSwitches(env: Env = process.env): { name: string; value: string }[] {
  return (env['BOOMTOWN_ELECTRON_FLAGS'] ?? '')
    .split(/[,\s]+/)
    .filter((flag) => flag.startsWith('--') && flag.length > 2)
    .map((flag) => {
      const body = flag.slice(2);
      const eq = body.indexOf('=');
      return eq === -1 ? { name: body, value: '' } : { name: body.slice(0, eq), value: body.slice(eq + 1) };
    });
}

/**
 * The one-line session summary written to the boot log.
 *
 * The whole point of the log is that a player on a Steam Deck can send back a
 * file that names the environment, so keep this readable rather than
 * structured: it is read by a person, once, when something has gone wrong.
 */
export function describeSession(shape: SessionShape): string {
  const facts = [
    shape.gamescope ? 'gamescope' : 'desktop compositor',
    shape.steamDeck ? 'Steam Deck' : null,
    shape.steam ? 'launched by Steam' : null,
    shape.container ? 'inside a Steam Linux Runtime container' : null,
  ].filter(Boolean);
  return facts.join(', ');
}
