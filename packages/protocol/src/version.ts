/**
 * The wire-protocol version — **not** the app's version, and deliberately not
 * in step with it. The app ships CalVer (`YYYY.M.N`, see `docs/deploying.md`)
 * because releases roll; this is a compatibility contract between a client and
 * a room, so it is a plain integer that moves only when that contract breaks.
 * Most releases leave it alone, which is the point: a dated app version tells a
 * player how fresh their build is, and this tells a room whether it can talk to
 * it. Tying them together would force a protocol break on every release.
 * Bump it whenever the message shapes, the
 * `viewFor` DTO, or the command/event unions change in a way an older client
 * or room could not parse. The client sends it in `hello`; the room rejects a
 * mismatch with a `wrong-version` error (KTD6, R12).
 */
export const PROTOCOL_VERSION = '1';
