import { loadSettings } from '../settings/settings.js';
import { isRoomAddress } from '@boomtown/protocol';
import { copy } from '../copy/copy.js';

/**
 * The PartyKit host the online client connects to. Precedence:
 *   1. a non-blank value the player set in Settings (U19) — for a self-hosted deploy
 *   2. the host baked in at build time (`VITE_PARTYKIT_HOST`, from
 *      `apps/desktop/.env.production` for a release build)
 *   3. `localhost:1999` — the `partykit dev` default, **dev builds only**
 *
 * A release build (`import.meta.env.PROD`) with no baked host and no override is
 * a packaging mistake — falling back to localhost would silently ship an app
 * that can't reach any server. Fail loudly instead.
 */
export function partykitHost(): string {
  const override = loadSettings().partykitHost.trim();
  if (override) return override;

  const baked = (import.meta.env.VITE_PARTYKIT_HOST as string | undefined)?.trim();
  if (baked) return baked;

  if (import.meta.env.PROD) {
    throw new Error(copy.online.noHostConfigured);
  }

  return 'localhost:1999';
}

/**
 * Resolve a shared ticket to the room address it stands for.
 *
 * Tickets are minted by the room and live in the directory party for a few
 * minutes (`packages/server/src/directory.ts`); an unissued, expired and
 * retired ticket are all the same 404, so this returns null for all three
 * rather than reporting which — there is nothing useful to tell a player apart
 * from "that code is not working", and anything more precise is a hint to
 * somebody sweeping the space.
 */
export async function resolveTicket(ticket: string): Promise<string | null> {
  const host = partykitHost();
  try {
    const response = await fetch(`${schemeFor(host)}://${host}/parties/directory/${ticket}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { address?: unknown };
    return typeof body.address === 'string' && isRoomAddress(body.address) ? body.address : null;
  } catch {
    return null;
  }
}

/** Plain HTTP for a local dev room, HTTPS for anything deployed. */
function schemeFor(host: string): 'http' | 'https' {
  return host.startsWith('localhost') || host.startsWith('127.') || /^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(host)
    ? 'http'
    : 'https';
}

/**
 * Where a phone joins a couch table (#62): the page the room's own deploy
 * serves beside it (`packages/server/public/phone`). Without a ticket it is the
 * address a person types; with one, it is what the QR code carries.
 *
 * The ticket rides in the fragment, which a browser never sends to the server,
 * so it lands in no access log. A dev room on `localhost` is only reachable
 * from this machine: to scan from a real phone, set the online host in
 * Settings to this machine's address on the local network.
 */
export function phoneUrl(ticket?: string): string {
  const host = partykitHost();
  const base = `${schemeFor(host)}://${host}/phone/`;
  return ticket ? `${base}#t=${ticket}` : base;
}
