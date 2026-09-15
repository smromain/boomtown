import { describe, expect, it } from 'vitest';
import { MAX_MESSAGE_BYTES, parseClientMessage } from '../src/index.js';

const frame = (value: unknown) => JSON.stringify(value);

const goodConfig = {
  seatCount: 3,
  edition: 'boomtown',
  visibility: 'hidden',
  bots: { 2: 5 },
  seed: 1,
};

describe('what gets through', () => {
  it('accepts every message the client actually sends', () => {
    const messages = [
      { type: 'hello', protocolVersion: '1', displayName: 'Ana' },
      { type: 'hello', protocolVersion: '1', displayName: 'Ana', token: 'tok' },
      { type: 'create-room', config: goodConfig },
      { type: 'join' },
      { type: 'start' },
      { type: 'command', command: { type: 'place-tile', tile: '1A' } },
    ];
    for (const message of messages) {
      const parsed = parseClientMessage(frame(message));
      expect(parsed.ok, `${message.type} should parse`).toBe(true);
    }
  });

  it('passes a command through structurally, leaving legality to the engine', () => {
    // A command with a type but nonsense payload is the engine's to refuse —
    // duplicating its union here would be a second definition to keep in step.
    const parsed = parseClientMessage(frame({ type: 'command', command: { type: 'place-tile', tile: 99 } }));
    expect(parsed.ok).toBe(true);
  });
});

describe('what does not', () => {
  const refused = (raw: string | ArrayBuffer) => {
    const parsed = parseClientMessage(raw);
    expect(parsed.ok).toBe(false);
    return parsed.ok ? null : parsed.error;
  };

  it('refuses a frame over the size cap without parsing it', () => {
    const huge = frame({ type: 'command', command: { type: 'x', pad: 'a'.repeat(MAX_MESSAGE_BYTES) } });
    expect(refused(huge)?.code).toBe('message-too-large');
  });

  it('refuses non-JSON', () => {
    expect(refused('{not json')?.code).toBe('malformed-message');
  });

  it('refuses JSON that is not an object', () => {
    expect(refused('[1,2,3]')).not.toBeNull();
    expect(refused('"a string"')).not.toBeNull();
    expect(refused('null')).not.toBeNull();
  });

  it('refuses an unknown message type', () => {
    expect(refused(frame({ type: 'drop-tables' }))?.message).toMatch(/unknown message type/);
  });

  it('refuses a message with no type at all', () => {
    expect(refused(frame({ command: { type: 'place-tile' } }))).not.toBeNull();
  });

  it('refuses a command that is not an object, or carries no type', () => {
    expect(refused(frame({ type: 'command', command: 'place-tile' }))).not.toBeNull();
    expect(refused(frame({ type: 'command', command: {} }))).not.toBeNull();
    expect(refused(frame({ type: 'command' }))).not.toBeNull();
  });

  it('refuses a hello with the wrong field types', () => {
    expect(refused(frame({ type: 'hello', protocolVersion: 1, displayName: 'Ana' }))).not.toBeNull();
    expect(refused(frame({ type: 'hello', protocolVersion: '1', displayName: 7 }))).not.toBeNull();
    expect(refused(frame({ type: 'hello', protocolVersion: '1', displayName: 'Ana', token: 9 }))).not.toBeNull();
  });

  it('refuses an absurd display name before anything downstream sees it', () => {
    const message = { type: 'hello', protocolVersion: '1', displayName: 'a'.repeat(500) };
    expect(refused(frame(message))?.code).toBe('malformed-message');
  });

  it('refuses a malformed room config', () => {
    const bad: Record<string, unknown>[] = [
      { ...goodConfig, seatCount: 'three' },
      { ...goodConfig, seatCount: 3.5 },
      { ...goodConfig, edition: 'monopoly' },
      { ...goodConfig, visibility: 'translucent' },
      { ...goodConfig, bots: [1, 2] },
      { ...goodConfig, bots: { notANumber: 5 } },
      { ...goodConfig, bots: { 2: 'hard' } },
      { ...goodConfig, seed: 'random' },
    ];
    for (const config of bad) {
      expect(parseClientMessage(frame({ type: 'create-room', config })).ok).toBe(false);
    }
  });
});

describe('prototype pollution', () => {
  it('drops __proto__ rather than carrying it into the room', () => {
    const raw = '{"type":"command","command":{"type":"place-tile","__proto__":{"polluted":true}}}';
    const parsed = parseClientMessage(raw);
    expect(parsed.ok).toBe(true);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    if (parsed.ok && parsed.message.type === 'command') {
      expect(Object.keys(parsed.message.command)).not.toContain('__proto__');
    }
  });
});

describe('binary frames', () => {
  it('reads a valid message out of an ArrayBuffer', () => {
    const bytes = new TextEncoder().encode(frame({ type: 'join' }));
    expect(parseClientMessage(bytes.buffer as ArrayBuffer).ok).toBe(true);
  });

  it('applies the size cap to binary frames too', () => {
    const bytes = new Uint8Array(MAX_MESSAGE_BYTES + 1);
    const parsed = parseClientMessage(bytes.buffer as ArrayBuffer);
    expect(parsed.ok).toBe(false);
  });
});
