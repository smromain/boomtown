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
  const scheme = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  try {
    const response = await fetch(`${scheme}://${host}/parties/directory/${ticket}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { address?: unknown };
    return typeof body.address === 'string' && isRoomAddress(body.address) ? body.address : null;
  } catch {
    return null;
  }
}
