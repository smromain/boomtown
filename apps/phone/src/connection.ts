import { isRoomAddress, isTicket, normaliseTicket } from '@boomtown/protocol';

/**
 * Where the room is. In a build this page is served by the room's own deploy
 * (`/phone/` beside `/parties/…`), so the room is simply this page's host. The
 * Vite dev server is not the room, so a dev page talks to `partykit dev`.
 */
export function roomHost(): string {
  if (import.meta.env.DEV) {
    const override = (import.meta.env['VITE_PARTYKIT_HOST'] as string | undefined)?.trim();
    return override || 'localhost:1999';
  }
  return window.location.host;
}

function scheme(host: string): 'http' | 'https' {
  return /^(localhost|127\.|\d+\.\d+\.\d+\.\d+)/.test(host) ? 'http' : 'https';
}

/**
 * The ticket the QR code carried, from the fragment. A fragment never reaches
 * the server, which is why the ticket rides there: it lands in no access log.
 */
export function ticketFromHash(hash: string = window.location.hash): string | null {
  const match = /(?:^#|&)t=([^&]+)/.exec(hash);
  if (!match) return null;
  const ticket = normaliseTicket(decodeURIComponent(match[1]!));
  return isTicket(ticket) ? ticket : null;
}

/**
 * Resolve a ticket to the room's address, exactly as the desktop's join-by-code
 * does. Unissued, expired and retired tickets are all the same null.
 */
export async function resolveTicket(ticket: string): Promise<string | null> {
  const host = roomHost();
  try {
    const response = await fetch(`${scheme(host)}://${host}/parties/directory/${ticket}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { address?: unknown };
    return typeof body.address === 'string' && isRoomAddress(body.address) ? body.address : null;
  } catch {
    return null;
  }
}

/**
 * The seat this phone holds, kept in the tab's storage so a locked screen or a
 * reloaded page resumes it rather than knocking again. The token rotates on
 * every resume, so what is stored is always the latest one.
 */
export interface Session {
  readonly address: string;
  readonly token: string;
  readonly name: string;
}

const SESSION_KEY = 'boomtown.phone.session.v1';
const NAME_KEY = 'boomtown.phone.name.v1';

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Session>;
    if (typeof value.address !== 'string' || !isRoomAddress(value.address)) return null;
    if (typeof value.token !== 'string' || typeof value.name !== 'string') return null;
    return { address: value.address, token: value.token, name: value.name };
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // A private window can refuse storage; the seat still works until reload.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // nothing to clear
  }
}

export function loadName(): string | null {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // remembered for next time only
  }
}
