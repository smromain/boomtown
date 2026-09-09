import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { iconPath } from './window.js';

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * The app's identity as the OS sees it: what it is called, and the icon it
 * shows. All three of these are only visible once something is packaged and
 * installed, which is far too late to notice one of them drifted.
 */
describe('app identity', () => {
  const pkg = JSON.parse(readFileSync(at('../package.json'), 'utf8')) as {
    name: string;
    productName?: string;
  };
  const builder = readFileSync(at('../electron-builder.yml'), 'utf8');

  it('calls itself Boomtown, not the workspace package name', () => {
    // Electron prefers productName over name for app.getName(), the app menu
    // and the userData directory; without it the app is "@boomtown/desktop".
    expect(pkg.productName).toBe('Boomtown');
  });

  it('agrees with electron-builder on the product name', () => {
    expect(builder).toMatch(/^productName: Boomtown$/m);
  });

  it('points the packaged build at the generated icon', () => {
    expect(builder).toMatch(/^icon: build\/icon\.png$/m);
    // and ships it inside the app, for the window icon
    expect(builder).toMatch(/from: build\/icon\.png/);
  });
});

describe('the icon file', () => {
  const png = readFileSync(at('../build/icon.png'));

  it('exists as a PNG', () => {
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  it('is square and at least 512px, which is what macOS and Windows need', () => {
    // IHDR width/height are the two big-endian uint32s at offset 16.
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(512);
  });

  it('has an alpha channel, so the rounded corners are not black squares', () => {
    expect(png.readUInt8(25)).toBe(6); // colour type 6 = RGBA
  });
});

describe('iconPath', () => {
  it('reads the icon from the app resources once packaged', () => {
    expect(
      iconPath({ packaged: true, resourcesPath: '/Applications/Boomtown.app/Resources', mainDir: '/x' }),
    ).toBe('/Applications/Boomtown.app/Resources/icon.png');
  });

  it('reads it from the repo build directory in development', () => {
    // the main process runs out of `out/main/`, two levels under `build/`
    expect(iconPath({ packaged: false, resourcesPath: '/unused', mainDir: '/repo/apps/desktop/out/main' })).toBe(
      '/repo/apps/desktop/out/main/../../build/icon.png',
    );
  });

  it('resolves, in this repo, to the icon that actually exists', () => {
    // The relative hop above is only correct for one directory layout; this
    // is the check that catches it if the build output ever moves.
    const dev = iconPath({
      packaged: false,
      resourcesPath: '/unused',
      mainDir: at('../out/main'),
    });
    expect(existsSync(resolve(dev))).toBe(true);
  });
});
