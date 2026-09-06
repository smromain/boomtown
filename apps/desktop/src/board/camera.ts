/**
 * A fixed orthographic isometric view (KTD8) — no orbit controls, no
 * perspective. The board reads the same every game.
 */
export const ISO_CAMERA = {
  position: [16, 18, 16] as [number, number, number],
  zoom: 34,
  near: 0.1,
  far: 100,
} as const;

/** Where the camera points. */
export const ISO_TARGET = [0, 0, 0] as const;
