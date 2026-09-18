import { describe, expect, it } from 'vitest';
import { describeSession, extraSwitches, sessionShape } from './session.js';

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
