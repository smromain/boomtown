import { routePartykitRequest } from 'partyserver';
import type { Env } from './env.js';

// @boomtown/server's Worker entry (`wrangler.jsonc` `main`). The Durable Object
// classes must be exported from here under the `class_name`s wrangler binds.
export { default as BoomtownRoom } from './room.js';
export { default as TicketDirectory } from './directory.js';

/**
 * One Worker serves the whole domain: the room and the ticket directory under
 * `/parties/…`, the phone page under `/phone/`, and the bare domain as a
 * redirect to wherever the game is listed. They share a host on purpose — the
 * phone page takes the room to be the host it was loaded from.
 */
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice('www.'.length);
      return Response.redirect(url.toString(), 301);
    }

    const party = await routePartykitRequest(request, env);
    if (party) return party;

    if (url.pathname === '/' && env.LANDING_URL) return Response.redirect(env.LANDING_URL, 302);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
