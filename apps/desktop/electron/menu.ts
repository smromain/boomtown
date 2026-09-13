import type { MenuItemConstructorOptions } from 'electron';

/**
 * The application menu, cut down to Quit.
 *
 * Electron's default menu is a browser's: Reload, Force Reload, Toggle
 * DevTools, zoom levels, a full Edit menu. None of that belongs on a board
 * game. Reload in particular is a trap — a game is renderer state, so reloading
 * mid-turn silently throws the table away, and it sits one key away from
 * nothing at all. The menu now offers the one thing a desktop app must offer
 * and nothing else.
 *
 * Built as a pure function of platform and build type so the shape is a unit
 * test rather than something to check by eye on three operating systems.
 *
 * The menu is the only thing removed. Copy and paste inside the app's own text
 * fields keep working: those are the webview's native edit shortcuts, not menu
 * accelerators, and taking the Edit menu away does not disable them.
 */
export function menuTemplate({
  platform,
  dev,
  appName = 'Boomtown',
}: {
  platform: NodeJS.Platform;
  dev: boolean;
  appName?: string;
}): MenuItemConstructorOptions[] {
  // On macOS the first menu is the application menu and takes the app's name;
  // everywhere else Quit conventionally lives under File.
  const quitMenu: MenuItemConstructorOptions = {
    label: platform === 'darwin' ? appName : 'File',
    submenu: [{ role: 'quit' }],
  };

  if (!dev) return [quitMenu];

  // Dev builds keep the reload and devtools *shortcuts* — they are how the app
  // is worked on — but as hidden items, so the menu a player would see is the
  // same one the packaged app ships. A dev deliberately pressing Cmd+R knows
  // what it costs; a player browsing a menu does not.
  return [
    quitMenu,
    {
      label: 'Development',
      visible: false,
      submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }],
    },
  ];
}
