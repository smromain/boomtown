import { describe, expect, it } from 'vitest';
import { distribution, updatesAreStoreManaged } from './distribution.js';

describe('who owns updating this build', () => {
  it('is us, for an ordinary build', () => {
    expect(updatesAreStoreManaged('')).toBe(false);
  });

  it('is the launcher, for an itch build', () => {
    // The itch app installs into a directory it manages and patches in place;
    // self-updating there means two updaters writing the same files.
    expect(updatesAreStoreManaged('itch')).toBe(true);
  });

  it('is us, for a distribution we have not heard of', () => {
    // Fail towards the behaviour that works everywhere rather than silently
    // disabling updates on a typo.
    expect(updatesAreStoreManaged('itch.io')).toBe(false);
  });

  it('reads an unset build-time define as no distribution at all', () => {
    // The define does not run under vitest, so this is the undeclared-global
    // path — it must not throw.
    expect(distribution()).toBe('');
    expect(updatesAreStoreManaged()).toBe(false);
  });
});
