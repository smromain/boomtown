import { describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard.js';

const withClipboard = (writeText: unknown) => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText === undefined ? undefined : { writeText },
    configurable: true,
  });
  return () => {
    if (original) Object.defineProperty(navigator, 'clipboard', original);
    else Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'clipboard');
  };
};

describe('copyText', () => {
  it('uses the modern API when it is there', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const restore = withClipboard(writeText);
    expect(await copyText('ABCD-1234')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('ABCD-1234');
    restore();
  });

  it('falls back to the selection trick when the shell has no clipboard API', async () => {
    const restore = withClipboard(undefined);
    const exec = vi.fn().mockReturnValue(true);
    // jsdom has no execCommand at all, which is also what an old shell looks like
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    expect(await copyText('ABCD-1234')).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
    // and it tidies up after itself
    expect(document.querySelector('textarea')).toBeNull();
    restore();
  });

  it('falls back when the modern API is there but refuses', async () => {
    const restore = withClipboard(vi.fn().mockRejectedValue(new Error('not allowed')));
    const exec = vi.fn().mockReturnValue(true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    expect(await copyText('ABCD-1234')).toBe(true);
    expect(exec).toHaveBeenCalled();
    restore();
  });

  it('says so when nothing worked, rather than claiming a copy', async () => {
    const restore = withClipboard(undefined);
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn().mockReturnValue(false);
    expect(await copyText('ABCD-1234')).toBe(false);
    restore();
  });
});
