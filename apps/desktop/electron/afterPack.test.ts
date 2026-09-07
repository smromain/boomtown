import { describe, expect, it, vi } from 'vitest';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

vi.mock('@electron/fuses', async (importActual) => {
  const actual = await importActual<typeof import('@electron/fuses')>();
  return { ...actual, flipFuses: vi.fn().mockResolvedValue(undefined) };
});

const { FUSES, default: afterPack } = await import('./afterPack.mjs');
const { flipFuses } = await import('@electron/fuses');

describe('Electron security fuses (KTD9)', () => {
  it('locks down every dangerous capability', () => {
    expect(FUSES).toMatchObject({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    });
  });
});

describe('afterPack hook', () => {
  const ctx = (electronPlatformName: string) => ({
    electronPlatformName,
    appOutDir: '/tmp/out',
    packager: { appInfo: { productFilename: 'Boomtown' } },
  });

  it('flips the fuses on the macOS binary inside the .app', async () => {
    vi.mocked(flipFuses).mockClear();
    await afterPack(ctx('darwin'));
    expect(flipFuses).toHaveBeenCalledWith(
      '/tmp/out/Boomtown.app/Contents/MacOS/Boomtown',
      expect.objectContaining({ resetAdHocDarwinSignature: true, [FuseV1Options.RunAsNode]: false }),
    );
  });

  it('targets the .exe on Windows and the lowercased name on Linux', async () => {
    vi.mocked(flipFuses).mockClear();
    await afterPack(ctx('win32'));
    expect(flipFuses).toHaveBeenCalledWith('/tmp/out/Boomtown.exe', expect.anything());

    await afterPack(ctx('linux'));
    expect(flipFuses).toHaveBeenCalledWith('/tmp/out/boomtown', expect.anything());
  });

  it('throws on an unknown platform rather than silently skipping', async () => {
    await expect(afterPack(ctx('sunos'))).rejects.toThrow(/unknown platform/);
  });
});
