import type BoomtownRoom from './room.js';
import type TicketDirectory from './directory.js';

/**
 * The Worker's bindings (`wrangler.jsonc`). `routePartykitRequest` maps each
 * Durable Object binding to a URL segment by kebab-casing its name, so `Main`
 * serves `/parties/main/<room>` and `Directory` `/parties/directory/<ticket>` —
 * the same paths hosted PartyKit used, which is why no client changed.
 */
export interface Env {
  readonly Main: DurableObjectNamespace<BoomtownRoom>;
  readonly Directory: DurableObjectNamespace<TicketDirectory>;
  /** `public/`: the couch-mode phone page at `/phone/` (#62). */
  readonly ASSETS: Fetcher;
  /** Where the bare domain sends a visitor. Empty in dev, where `/` is a 404. */
  readonly LANDING_URL: string;
}
