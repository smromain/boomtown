import type { MenuItemConstructorOptions } from 'electron';

/**
 * The application menu, cut down to Quit and the edit roles.
 *
 * Electron's default menu is a browser's: Reload, Force Reload, Toggle
 * DevTools, zoom levels, a full Edit menu. None of that belongs on a board
 * game. Reload in particular is a trap — a game is renderer state, so reloading
 * mid-turn silently throws the table away, and it sits one key away from
 * nothing at all. The menu now offers what a desktop app must offer and
 * nothing else.
 *
 * Built as a pure function of platform and build type so the shape is a unit
 * test rather than something to check by eye on three operating systems.
 *
 * One thing the menu must carry: the edit roles. On macOS a webview's
 * Cmd+C/Cmd+V/Cmd+X/Cmd+A are *menu accelerators*, not native shortcuts — with
 * no Edit menu they do nothing at all, which is how a lobby that hands out a
 * code people are meant to paste ended up with a code nobody could paste. So
 * Edit is here, visible on macOS where every app has one and people look for
 * Paste under it, hidden elsewhere: Chromium handles Ctrl+C and Ctrl+V itself
 * on Windows and Linux, and a hidden item still registers its accelerator (the
 * same property the dev reload items below rely on).
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

  // Undo and redo are in the set because a text field without them is a text
  // field that punishes a mistyped code, and they cost nothing to include.
  const editMenu: MenuItemConstructorOptions = {
    label: 'Edit',
    visible: platform === 'darwin',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  };

  if (!dev) return [quitMenu, editMenu];

  // Dev builds keep the reload and devtools *shortcuts* — they are how the app
  // is worked on — but as hidden items, so the menu a player would see is the
  // same one the packaged app ships. A dev deliberately pressing Cmd+R knows
  // what it costs; a player browsing a menu does not.
  return [
    quitMenu,
    editMenu,
    {
      label: 'Development',
      visible: false,
      submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }],
    },
  ];
}
