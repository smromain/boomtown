import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount React trees between tests so component state never leaks.
afterEach(() => {
  cleanup();
});
