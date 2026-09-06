/**
 * Content-Security-Policy for the renderer. Set as a response header from the
 * main process (see `main.ts`) so it applies to both the packaged `file://`
 * load and the dev server.
 *
 * `script-src` is `'self'` only — no `'unsafe-eval'`, no `'unsafe-inline'` — which
 * is the property U9's verification checks. `style-src` allows `'unsafe-inline'`
 * because Radix and drei inject positioning styles; style injection is a far
 * smaller risk surface than script injection.
 */
export interface CspOptions {
  /** Dev loads the renderer from the Vite dev server and needs its HMR socket + eval-free module serving. */
  readonly dev: boolean;
  /** Extra origins the renderer may open sockets to (the multiplayer server, added in U18). */
  readonly connectSrc?: readonly string[];
}

export function buildCsp({ dev, connectSrc = [] }: CspOptions): string {
  const devConnect = dev ? ['ws://localhost:*', 'http://localhost:*'] : [];

  const directives: Record<string, readonly string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...devConnect, ...connectSrc],
    'worker-src': ["'self'", 'blob:'],
    'child-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
    'frame-ancestors': ["'none'"],
  };

  return Object.entries(directives)
    .map(([directive, values]) => `${directive} ${values.join(' ')}`)
    .join('; ');
}
