import { describe, expect, it } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { menuTemplate } from './menu.js';

/** Every role in the template, hidden items included, flattened one level. */
const roles = (template: MenuItemConstructorOptions[]): string[] =>
  template.flatMap((menu) =>
    ((menu.submenu ?? []) as MenuItemConstructorOptions[]).map((item) => String(item.role)),
  );

/** Only what a player would actually see in the menu bar. */
const visibleRoles = (template: MenuItemConstructorOptions[]): string[] =>
  template
    .filter((menu) => menu.visible !== false)
    .flatMap((menu) =>
      ((menu.submenu ?? []) as MenuItemConstructorOptions[])
        .filter((item) => item.visible !== false)
        .map((item) => String(item.role)),
    );

describe('menuTemplate', () => {
  it('offers quit and the edit roles, and nothing else, in a packaged build', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const template = menuTemplate({ platform, dev: false });
      expect(template).toHaveLength(2);
      expect(roles(template)).toEqual([
        'quit',
        'undo',
        'redo',
        'undefined', // the separator, which carries no role
        'cut',
        'copy',
        'paste',
        'selectAll',
      ]);
    }
  });

  it('carries cut/copy/paste/select-all on every platform and build', () => {
    // On macOS these *are* the shortcuts: a webview's Cmd+C and Cmd+V are menu
    // accelerators, so without this menu they do nothing — and a lobby whose
    // whole job is handing out a code to paste is where that shows up first.
    for (const dev of [true, false]) {
      for (const platform of ['darwin', 'win32', 'linux'] as const) {
        expect(roles(menuTemplate({ platform, dev }))).toEqual(
          expect.arrayContaining(['cut', 'copy', 'paste', 'selectAll']),
        );
      }
    }
  });

  it('shows Edit on macOS, where people look for Paste, and hides it elsewhere', () => {
    const edit = (platform: NodeJS.Platform) =>
      menuTemplate({ platform, dev: false }).find((menu) => menu.label === 'Edit');
    expect(edit('darwin')?.visible).toBe(true);
    // Chromium handles Ctrl+C and Ctrl+V natively there, so the menu is only
    // carrying the accelerators — no reason to put browser furniture on screen.
    expect(edit('win32')?.visible).toBe(false);
    expect(edit('linux')?.visible).toBe(false);
  });

  it("drops the browser furniture — reload, force reload, devtools, zoom — from what a player sees", () => {
    for (const dev of [true, false]) {
      for (const platform of ['darwin', 'win32', 'linux'] as const) {
        const seen = visibleRoles(menuTemplate({ platform, dev }));
        for (const role of ['reload', 'forceReload', 'toggleDevTools', 'zoomIn', 'zoomOut', 'resetZoom']) {
          expect(seen).not.toContain(role);
        }
      }
    }
  });

  it('names the first menu for the app on macOS and File elsewhere', () => {
    expect(menuTemplate({ platform: 'darwin', dev: false, appName: 'Boomtown' })[0]?.label).toBe('Boomtown');
    expect(menuTemplate({ platform: 'win32', dev: false })[0]?.label).toBe('File');
  });

  it('keeps the reload and devtools shortcuts alive in dev, but out of sight', () => {
    const template = menuTemplate({ platform: 'linux', dev: true });
    // present, so the accelerators still fire while the app is being worked on
    expect(roles(template)).toEqual(expect.arrayContaining(['reload', 'forceReload', 'toggleDevTools']));
    // and hidden, so the menu a player meets is the packaged one
    expect(template.find((menu) => menu.label === 'Development')?.visible).toBe(false);
  });
});
