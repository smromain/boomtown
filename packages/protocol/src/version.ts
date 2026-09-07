/**
 * The wire-protocol version. Bump it whenever the message shapes, the
 * `viewFor` DTO, or the command/event unions change in a way an older client
 * or room could not parse. The client sends it in `hello`; the room rejects a
 * mismatch with a `wrong-version` error (KTD6, R12).
 */
export const PROTOCOL_VERSION = '1';
