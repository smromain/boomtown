import { describe, expect, it } from 'vitest';
import { MILESTONES, header, line, stallReport } from './bootLog.js';

describe('line', () => {
  it('leads with a right-aligned elapsed time so the column scans', () => {
    expect(line(42, 'hello')).toBe('[    42ms] hello');
    expect(line(1234567, 'later')).toBe('[1234567ms] later');
  });

  it('never prints a negative elapsed time', () => {
    expect(line(-5, 'clock went backwards')).toBe('[     0ms] clock went backwards');
  });
});

describe('header', () => {
  it('records the session and the graphics-relevant versions', () => {
    const text = header({
      app: 'Boomtown',
      version: '2026.9.1',
      session: 'gamescope, Steam Deck',
      platform: 'linux/x64',
      electron: '44.2.0',
      chrome: '138.0.0.0',
      at: new Date('2026-09-18T10:00:00.000Z'),
    });
    expect(text).toContain('Boomtown 2026.9.1');
    expect(text).toContain('2026-09-18T10:00:00.000Z');
    expect(text).toContain('linux/x64, electron 44.2.0, chrome 138.0.0.0');
    expect(text).toContain('session: gamescope, Steam Deck');
  });
});

describe('stallReport', () => {
  it('names the first milestone the launch never reached', () => {
    const report = stallReport(['process-start', 'app-ready', 'window-created'], 20_000);
    expect(report).toContain("reached 'window-created'");
    expect(report).toContain("never reached 'renderer-load-started'");
  });

  it('points at the gamescope notes, which is the whole reason it exists', () => {
    expect(stallReport(['process-start'], 20_000)).toContain('docs/steamos-game-mode.md');
  });

  it('has nothing to report when every milestone was reached', () => {
    expect(stallReport(MILESTONES, 20_000)).toContain('nothing to report');
  });
});
