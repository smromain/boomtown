const SETTING_KEY = 'boomtown.partykitHost';

/**
 * The PartyKit host the online client connects to. Precedence:
 *   1. a non-blank value the player set in Settings (U19) — for a self-hosted deploy
 *   2. the host baked in at build time (`VITE_PARTYKIT_HOST`)
 *   3. `localhost:1999` — the `partykit dev` default, for a development build
 */
export function partykitHost(): string {
  try {
    const override = localStorage.getItem(SETTING_KEY)?.trim();
    if (override) return override;
  } catch {
    // localStorage unavailable — fall through
  }
  const baked = import.meta.env.VITE_PARTYKIT_HOST as string | undefined;
  if (baked && baked.trim()) return baked.trim();
  return 'localhost:1999';
}

export function setPartykitHostOverride(value: string): void {
  try {
    if (value.trim()) localStorage.setItem(SETTING_KEY, value.trim());
    else localStorage.removeItem(SETTING_KEY);
  } catch {
    // ignore — a session without localStorage just uses the default
  }
}

export function partykitHostOverride(): string {
  try {
    return localStorage.getItem(SETTING_KEY) ?? '';
  } catch {
    return '';
  }
}

/** A short, shareable room code. */
export function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O, 1/I
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}
