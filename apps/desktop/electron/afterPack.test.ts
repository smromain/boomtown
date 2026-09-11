import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

vi.mock('@electron/fuses', async (importActual) => {
  const actual = await importActual<typeof import('@electron/fuses')>();
  return { ...actual, flipFuses: vi.fn().mockResolvedValue(undefined) };
});

const { BASE_FUSES, SIGNED_ONLY_FUSES, isSignedBuild, fusesFor, binaryPath, default: afterPack } =
  await import('./afterPack.mjs');
const { flipFuses } = await import('@electron/fuses');

const OUT = join('/tmp', 'out'); // platform-native separators, like the hook produces

const ctx = (electronPlatformName: string, over: Record<string, unknown> = {}) => ({
  electronPlatformName,
  appOutDir: OUT,
  packager: { appInfo: { productFilename: 'Boomtown' }, executableName: 'boomtown', ...over },
});

describe('fuse posture (KTD9)', () => {
  it('the base posture always locks down node re-entry and runtime injection', () => {
    expect(BASE_FUSES).toMatchObject({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
    });
  });

  it('asar integrity + OnlyLoadAppFromAsar are the signed-only tier', () => {
    expect(SIGNED_ONLY_FUSES).toMatchObject({
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    });
  });

  // Regression: the arm64 DMG was rejected by macOS as "damaged" and would not
  // open, while the x64 one launched and merely crawled under Rosetta. One
  // cause: flipping a fuse rewrites the Mach-O and invalidates the signature,
  // and Apple Silicon refuses to run a binary whose signature does not verify.
  it('re-signs ad-hoc on macOS, where a fuse flip invalidates the signature', () => {
    expect(fusesFor({}, 'darwin')).toMatchObject({ resetAdHocDarwinSignature: true });
    expect(fusesFor({}, 'mas')).toMatchObject({ resetAdHocDarwinSignature: true });
  });

  it('leaves the other platforms alone — only macOS enforces the signature', () => {
    expect(fusesFor({}, 'win32')).not.toHaveProperty('resetAdHocDarwinSignature');
    expect(fusesFor({}, 'linux')).not.toHaveProperty('resetAdHocDarwinSignature');
  });

  it('re-signs on a signed macOS build too — the real identity just replaces it', () => {
    expect(fusesFor({ CSC_LINK: 'x' }, 'darwin')).toMatchObject({
      resetAdHocDarwinSignature: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    });
  });

  it('keys off the target platform, not the build host', async () => {
    vi.mocked(flipFuses).mockClear();
    await afterPack(ctx('darwin'));
    expect(vi.mocked(flipFuses).mock.calls[0]?.[1]).toMatchObject({
      resetAdHocDarwinSignature: true,
    });
    vi.mocked(flipFuses).mockClear();
    await afterPack(ctx('win32'));
    expect(vi.mocked(flipFuses).mock.calls[0]?.[1]).not.toHaveProperty('resetAdHocDarwinSignature');
  });

  it('an unsigned build gets the base posture only (asar integrity would hang it)', () => {
    const env = { CSC_IDENTITY_AUTO_DISCOVERY: 'false' };
    expect(isSignedBuild(env)).toBe(false);
    expect(fusesFor(env)).not.toHaveProperty(String(FuseV1Options.EnableEmbeddedAsarIntegrityValidation));
    expect(fusesFor(env)).toMatchObject({ [FuseV1Options.RunAsNode]: false });
  });

  it('a signed build gets the full posture', () => {
    const env = { CSC_LINK: 'base64-cert-here' };
    expect(isSignedBuild(env)).toBe(true);
    expect(fusesFor(env)).toMatchObject({
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    });
  });

  it('no signing env at all is treated as unsigned', () => {
    expect(isSignedBuild({})).toBe(false);
  });
});

describe('binaryPath — the packed binary, post-rename', () => {
  it('macOS: inside the .app, named by productFilename', () => {
    expect(binaryPath(ctx('darwin'))).toBe(join(OUT, 'Boomtown.app', 'Contents', 'MacOS', 'Boomtown'));
    expect(binaryPath(ctx('mas'))).toBe(join(OUT, 'Boomtown.app', 'Contents', 'MacOS', 'Boomtown'));
  });

  it('Windows: <executableName>.exe at the top level', () => {
    expect(binaryPath(ctx('win32'))).toBe(join(OUT, 'boomtown.exe'));
  });

  it('Linux: <executableName> at the top level', () => {
    expect(binaryPath(ctx('linux'))).toBe(join(OUT, 'boomtown'));
  });

  it('falls back to lowercased productFilename when executableName is absent', () => {
    expect(binaryPath(ctx('linux', { executableName: undefined }))).toBe(join(OUT, 'boomtown'));
  });

  it('throws on an unknown platform rather than silently skipping', () => {
    expect(() => binaryPath(ctx('sunos'))).toThrow(/unknown platform/);
  });
});

describe('afterPack hook', () => {
  it('flips the fuses on the resolved binary', async () => {
    vi.mocked(flipFuses).mockClear();
    await afterPack(ctx('darwin'));
    expect(flipFuses).toHaveBeenCalledWith(
      join(OUT, 'Boomtown.app', 'Contents', 'MacOS', 'Boomtown'),
      expect.objectContaining({ [FuseV1Options.RunAsNode]: false }),
    );
  });

  it('propagates an unknown-platform error', async () => {
    await expect(afterPack(ctx('sunos'))).rejects.toThrow(/unknown platform/);
  });
});
