import { describe, expect, it } from 'vitest';
import { buildCsp } from './csp.js';

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(';').map((chunk) => {
      const [name, ...values] = chunk.trim().split(/\s+/);
      return [name!, values];
    }),
  );
}

describe('buildCsp', () => {
  it('never allows unsafe-eval; the packaged build allows no inline scripts either (the U9 verification)', () => {
    for (const dev of [true, false]) {
      expect(buildCsp({ dev })).not.toContain("'unsafe-eval'");
    }
    expect(directives(buildCsp({ dev: false })).get('script-src')).toEqual(["'self'"]);
  });

  it('the dev server allows the inline Vite/React preamble', () => {
    expect(directives(buildCsp({ dev: true })).get('script-src')).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it('locks down the dangerous fetch surfaces', () => {
    const d = directives(buildCsp({ dev: false }));
    expect(d.get('object-src')).toEqual(["'none'"]);
    expect(d.get('base-uri')).toEqual(["'none'"]);
    expect(d.get('frame-ancestors')).toEqual(["'none'"]);
    expect(d.get('default-src')).toEqual(["'self'"]);
  });

  it('allows blob-backed web workers (the engine runs in one)', () => {
    expect(directives(buildCsp({ dev: false })).get('worker-src')).toContain('blob:');
  });

  it('opens localhost only in dev', () => {
    expect(buildCsp({ dev: true })).toContain('ws://localhost:*');
    expect(buildCsp({ dev: false })).not.toContain('localhost');
  });

  it('allows wss/https for connect-src in the packaged build (the online client, host unknown to main)', () => {
    const connect = directives(buildCsp({ dev: false })).get('connect-src');
    expect(connect).toContain("'self'");
    expect(connect).toContain('wss:');
    expect(connect).toContain('https:');
    // script-src stays locked — this does not widen script injection
    expect(directives(buildCsp({ dev: false })).get('script-src')).toEqual(["'self'"]);
  });

  it('still adds caller-supplied connect origins', () => {
    const csp = buildCsp({ dev: false, connectSrc: ['wss://play.boomtown.example'] });
    expect(directives(csp).get('connect-src')).toContain('wss://play.boomtown.example');
  });
});
