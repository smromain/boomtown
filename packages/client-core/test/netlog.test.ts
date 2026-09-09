import { afterEach, describe, expect, it } from 'vitest';
import { netlog } from '@boomtown/client-core';

afterEach(() => {
  netlog.clear();
  netlog.setEnabled(false);
});

describe('netlog', () => {
  it('captures nothing while disabled, except warnings', () => {
    netlog.setEnabled(false);
    netlog.setMirror(false);
    netlog.log('socket', 'note', 'quiet');
    expect(netlog.entries()).toHaveLength(0);
    netlog.log('socket', 'warn', 'loud');
    expect(netlog.entries().map((e) => e.label)).toEqual(['loud']);
  });

  it('records ordered entries with a relative timestamp and formats them', () => {
    netlog.setEnabled(true);
    netlog.setMirror(false);
    netlog.log('socket', 'out', 'create-room', { seats: 3 });
    netlog.log('socket', 'in', 'welcome', { seat: 0 });
    const [first, second] = netlog.entries();
    expect(first!.seq).toBeLessThan(second!.seq);
    expect(first!.sinceStart).toBe(0);
    expect(netlog.asText()).toContain('-> create-room {"seats":3}');
    expect(netlog.asText()).toContain('<- welcome {"seat":0}');
  });

  it('keeps the buffer bounded and feeds subscribers', () => {
    netlog.clear();
    netlog.setEnabled(true);
    netlog.setMirror(false);
    const seen: string[] = [];
    const off = netlog.subscribe((entry) => seen.push(entry.label));
    for (let i = 0; i < 1200; i++) netlog.log('socket', 'note', `n${i}`);
    off();
    netlog.log('socket', 'note', 'after-unsubscribe');
    expect(netlog.entries()).toHaveLength(1000);
    // 1201 entries were logged (the loop plus the one after unsubscribing),
    // so the window starts at n201 — the oldest 201 have rolled off.
    expect(netlog.entries()[0]!.label).toBe('n201');
    expect(seen).toHaveLength(1200);
  });
});
