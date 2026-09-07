import { app, dialog } from 'electron';

/**
 * Auto-update check on launch (U19). Uses `electron-updater` against the
 * generic feed in `electron-builder.yml`. A no-op in development and when
 * `electron-updater` is not installed (it is a packaged-build-only dependency);
 * that keeps the dev and test paths free of the native module.
 */
export async function checkForUpdates(): Promise<{ available: boolean }> {
  if (!app.isPackaged) return { available: false };

  try {
    const { autoUpdater } = await import('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-downloaded', (info) => {
      void dialog
        .showMessageBox({
          type: 'info',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          message: `Boomtown ${info.version} is ready to install.`,
        })
        .then((result) => {
          if (result.response === 0) autoUpdater.quitAndInstall();
        });
    });
    const result = await autoUpdater.checkForUpdates();
    return { available: Boolean(result?.updateInfo && result.updateInfo.version !== app.getVersion()) };
  } catch {
    // electron-updater absent (dev / CI) — nothing to check
    return { available: false };
  }
}
