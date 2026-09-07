/**
 * A straight top‑down orthographic view (KTD8 keeps the 3D renderer; the design's
 * board is a flat grid, so we look at it flat). No orbit, no perspective.
 */
export const BOARD_CAMERA = {
  position: [0, 30, 0.001] as [number, number, number],
  zoom: 39,
  near: 0.1,
  far: 200,
} as const;

export const BOARD_TARGET = [0, 0, 0] as const;
