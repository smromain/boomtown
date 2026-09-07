import { configureTextBuilder } from 'troika-three-text';

/**
 * drei's `<Text>` (troika) spins up a Web Worker for typesetting, and that
 * worker `importScripts()`es a `blob:` URL — which the renderer CSP
 * (`script-src 'self'`) blocks, so every label silently fails and takes the
 * `<Canvas>` subtree down with it.
 *
 * Running typesetting on the main thread avoids the worker entirely; SDF glyph
 * generation still uses the GPU. The label set is tiny (digits, A–I) so the
 * main-thread cost is negligible. Import this once before any `<Text>` mounts.
 */
configureTextBuilder({ useWorker: false });
