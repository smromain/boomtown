/**
 * Room-side logging. `console` in a PartyKit room reaches `partykit dev` and
 * `npx partykit tail` for a deployed room, which is the only window into a
 * live game — so every lobby decision the room makes says so out loud, in one
 * line, prefixed with the room code.
 *
 * Kept to the lobby and lifecycle: joins, starts, seat bookkeeping, errors.
 * Per-command chatter would bury it, and the command log already records
 * every move.
 */
export function roomLog(code: string, label: string, detail?: Record<string, unknown>): void {
  const suffix = detail === undefined ? '' : ` ${safeDetail(detail)}`;
  console.log(`[room ${code}] ${label}${suffix}`);
}

export function roomWarn(code: string, label: string, detail?: Record<string, unknown>): void {
  const suffix = detail === undefined ? '' : ` ${safeDetail(detail)}`;
  console.warn(`[room ${code}] ${label}${suffix}`);
}

function safeDetail(detail: Record<string, unknown>): string {
  try {
    return JSON.stringify(detail) ?? '';
  } catch {
    return String(detail);
  }
}
