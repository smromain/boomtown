/**
 * A fixed, near‑top‑down orthographic view (KTD8) — no orbit controls, no
 * perspective. Steep enough that every cell's coordinate label reads straight,
 * with just enough tilt to keep the board from looking perfectly flat. The
 * board renders the same every game.
 */
export const BOARD_CAMERA = {
  position: [0, 26, 7] as [number, number, number],
  zoom: 52,
  near: 0.1,
  far: 200,
} as const;

/** Where the camera points. */
export const BOARD_TARGET = [0, 0, 0] as const;
