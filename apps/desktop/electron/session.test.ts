import { describe, expect, it } from 'vitest';
import { describeSession, extraSwitches, launchEnvironment, sessionShape } from './session.js';

/** The environment a Steam Deck in Game Mode actually hands a non-Steam shortcut. */
const gameMode = {
  XDG_CURRENT_DESKTOP: 'gamescope',
  GAMESCOPE_WAYLAND_DISPLAY: 'gamescope-0',
  SteamDeck: '1',
  SteamGameId: '17654321098765432',
  SteamOverlayGameId: '17654321098765432',
};

describe('sessionShape', () => {
  it('reads Steam Deck Game Mode off the environment', () => {
    const shape = sessionShape(gameMode);
    expect(shape).toMatchObject({ gamescope: true, steam: true, steamDeck: true });
  });

  it('sees a plain desktop as none of those', () => {
    const shape = sessionShape({ XDG_CURRENT_DESKTOP: 'KDE', WAYLAND_DISPLAY: 'wayland-0' });
    expect(shape).toEqual({ gamescope: false, steam: false, steamDeck: false, container: false });
  });

  it('finds gamescope in a colon-joined XDG_CURRENT_DESKTOP', () => {
    // The spec makes this a colon-separated list, and a bare `includes` on the
    // raw string would also match a desktop merely *named* like one.
    expect(sessionShape({ XDG_CURRENT_DESKTOP: 'gamescope:Steam' }).gamescope).toBe(true);
    expect(sessionShape({ XDG_CURRENT_DESKTOP: 'not-gamescope-at-all' }).gamescope).toBe(false);
  });

  it('spots a Steam Linux Runtime container', () => {
    expect(sessionShape({ ...gameMode, PRESSURE_VESSEL_RUNTIME: 'sniper' }).container).toBe(true);
    expect(sessionShape(gameMode).container).toBe(false);
  });

  it('treats an empty or zero variable as unset', () => {
    // Valve exports `SteamDeck=0` on non-Deck hardware, so presence is not truth.
    expect(sessionShape({ SteamDeck: '0' }).steamDeck).toBe(false);
    expect(sessionShape({ GAMESCOPE_WAYLAND_DISPLAY: '' }).gamescope).toBe(false);
  });

  it('is desktop-shaped when the environment says nothing at all', () => {
    expect(sessionShape({})).toEqual({ gamescope: false, steam: false, steamDeck: false, container: false });
  });
});

describe('extraSwitches', () => {
  it('is empty unless the escape hatch is set — no guessed defaults ship', () => {
    expect(extraSwitches({})).toEqual([]);
    expect(extraSwitches(gameMode)).toEqual([]);
  });

  it('parses bare flags and flags with values', () => {
    expect(extraSwitches({ BOOMTOWN_ELECTRON_FLAGS: '--no-sandbox,--ozone-platform=wayland' })).toEqual([
      { name: 'no-sandbox', value: '' },
      { name: 'ozone-platform', value: 'wayland' },
    ]);
  });

  it('accepts whitespace as a separator, because that is how a command line is typed', () => {
    expect(extraSwitches({ BOOMTOWN_ELECTRON_FLAGS: '--disable-gpu --in-process-gpu' })).toEqual([
      { name: 'disable-gpu', value: '' },
      { name: 'in-process-gpu', value: '' },
    ]);
  });

  it('drops anything that is not a flag rather than passing it through', () => {
    // A stray word would otherwise reach Chromium as a positional argument,
    // which it reads as a URL to open.
    expect(extraSwitches({ BOOMTOWN_ELECTRON_FLAGS: 'no-sandbox, --, https://example.com, --real' })).toEqual([
      { name: 'real', value: '' },
    ]);
  });
});

describe('describeSession', () => {
  it('names a Game Mode launch in one readable line', () => {
    expect(describeSession(sessionShape(gameMode))).toBe('gamescope, Steam Deck, launched by Steam');
  });

  it('says so plainly on a desktop', () => {
    expect(describeSession(sessionShape({}))).toBe('desktop compositor');
  });
});

describe('launchEnvironment', () => {
  it('reports the two things Steam injects that break an Electron app', () => {
    // The overlay hooks GL/Vulkan inside the process; the library path points at
    // Steam's own bundled runtime. A binary that runs from a terminal and fails
    // under Steam has almost always met one of these, and neither leaves any
    // other trace.
    const lines = launchEnvironment({
      LD_PRELOAD: '/home/deck/.steam/root/ubuntu12_32/gameoverlayrenderer.so',
      LD_LIBRARY_PATH: '/home/deck/.steam/root/ubuntu12_32/steam-runtime/lib',
    });
    expect(lines).toContain('LD_PRELOAD=/home/deck/.steam/root/ubuntu12_32/gameoverlayrenderer.so');
    expect(lines).toContain('LD_LIBRARY_PATH=/home/deck/.steam/root/ubuntu12_32/steam-runtime/lib');
  });

  it('shows an unset variable as empty rather than omitting it', () => {
    // "LD_PRELOAD=" is a finding; a missing line is ambiguous with a version
    // that never looked.
    expect(launchEnvironment({})).toContain('LD_PRELOAD=');
  });

  it('truncates a long value, because this file gets pasted into issues', () => {
    const lines = launchEnvironment({ LD_LIBRARY_PATH: 'x'.repeat(500) }, 20);
    const line = lines.find((l) => l.startsWith('LD_LIBRARY_PATH='));
    expect(line).toBe(`LD_LIBRARY_PATH=${'x'.repeat(20)}… (500 chars)`);
  });

  it('reports only a named allowlist, never the whole environment', () => {
    // An environment dump is a good way to publish a token by accident.
    const lines = launchEnvironment({ AWS_SECRET_ACCESS_KEY: 'hunter2', GITHUB_TOKEN: 'ghp_x' });
    expect(lines.join('\n')).not.toMatch(/hunter2|ghp_x|AWS_SECRET|GITHUB_TOKEN/);
  });
});
