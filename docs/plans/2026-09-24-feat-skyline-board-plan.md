---
title: The Skyline Board (3D board as an option) - Plan
type: feat
date: 2026-09-24
topic: skyline-board
issue: 70
artifact_readiness: implemented
execution: code
---

# The Skyline Board - Plan

Issue [#70](https://github.com/smromain/boomtown/issues/70) asks for the WebGL board back, as a choice
beside the CSS board rather than instead of it. Steve's comment on the issue sets the two things it has
to do: **3D buildings that grow with company size**, and **a switch available in the game as well as in
Settings**.

This plan is the design, and it is now built (see `docs/decisions.md`, *Board rendering*). Where the build departed from it: Skyline has no design-canvas artboard (the decision records the option as outside the canvas), and a software renderer is detected by name as well as by `failIfMajorPerformanceCaveat`, which headless Chromium ignores. Not built yet: the industry glyph as a roof decal, and the dust puff on a demolition (the tower sinks without one). A clickable sketch of the look and of the overlay
trick lives at https://claude.ai/artifact/UHDu3csUWzzckrERKqgdKS (plain three.js, made-up table, real
company colours).

## What the 3D board is *for*

The issue is right that the current board is already dimensional (a 6° CSS tilt with per-cell
`translateZ` thickness, `board.module.css`), so a second renderer has to earn its ~0.5 MB by showing
something the CSS board cannot. That something is the comment on the issue: **the board becomes a
skyline.** Every chain is a district, its headquarters is a tower, and the tower's height is the chain's
size band. You read the state of the market off the height of the city.

That is the whole justification, and it is also the name: the option is the **Skyline** board, the
default is the **Flat** board (it isn't flat, but it is the one without buildings). A camera, lighting and
"plastic pieces" are means, not ends.

## What each cell looks like

| Cell | Board View (today) | Skyline board |
|---|---|---|
| empty | paper tile with its coordinate | bare lot, coordinate painted on the ground |
| unincorporated | grey tile | a construction pad: slab and a crane-yellow hoarding, one storey |
| corporation, not HQ | industry gradient + glyph | a low-rise block in the industry colour, 1–2 storeys, height varied per tile by a hash of the tile id so a district reads as streets, not a slab |
| headquarters | proud tile + badge | **the tower** (below) |
| playable (your turn) | pulsing ring | a glowing survey outline on the lot, and a floating marker above rooftop height so a tower in front can never hide it |
| dead | struck through | a red "condemned" cross on the lot |

**The tower.** Height follows chain size (decided 2026-09-25), stepped by the size bands of the price
table rather than by raw tile count, so a 41-tile chain doesn't pierce the ceiling. Share price is not
used: it would make a tier-3 chain tower over a same-size tier-1 chain. With classic's
`bandCuts: [2, 3, 4, 5, 10, 20, 30, 40]` that is nine heights, from two storeys at size 2 to roughly
eleven at 41+. Two extra touches carry information the flat board shows elsewhere:

- **Safe** (`CorpView.safe`) tops the tower with a lit crown and an antenna. You can see from across the
  table which chains can no longer be eaten.
- **Lineage.** Each company the chain has eaten (`CorpView.eaten`) adds a thin band in *that* company's
  colour near the tower's base, in order. The merged-name rule, drawn as architecture: `Radio Hut-Mart`
  is a red tower standing on a gold stripe.

The industry glyph stays on the tower's roof as a flat decal, so the takeover still changes shape and not
only colour (#18).

## What the moments look like

| Moment | Skyline behaviour |
|---|---|
| Tile placed | a slab drops onto the lot |
| Chain founded | the tower rises out of the lot to its first height |
| Chain grows a band | the tower grows a storey, with a short scaffold flicker |
| Merger | the defunct tower is **demolished** (sinks into a dust puff), its district repaints in the survivor's colour using the same outward wave the flat board uses (`sweepDelay`), and the survivor's tower grows and gains a lineage stripe |
| Chain goes safe | the crown lights |

Beats already cover the screen for the big moments. The board must **not** play its own animation behind
a covering beat, or it is wasted: the skyline holds its animation queue while `coversTheScreen(active)`
is true and plays it when the curtain lifts. This is the same rule the hot-seat hand-off lives by, and
the flat board's recolour sweep should arguably do it too.

Under `prefers-reduced-motion`: no rise, sink, sway or idle drift. Every change is a cut, the camera is
fixed, and the rotate buttons snap instead of swinging.

## The part that matters most: one contract, two painters

The DOM grid (`role="grid"`, `role="gridcell"`, per-cell `aria-label`, `<button>` on playable cells) is
what tests, the `run-app` driver and screen readers stand on. The Skyline board keeps it **whole and
live**, not as a hidden mirror.

**Why that is cheap here.** The camera is orthographic. An orthographic projection maps the ground plane
to the screen by a 2D affine transform, so the same DOM grid the Board View renders can be laid over the
canvas with one CSS `matrix()` that puts every cell exactly on its lot. Clicks, hover, keyboard focus and
the accessible tree then come from the real DOM, with no raycasting at all. The canvas is
`pointer-events: none` and `aria-hidden`; the grid's cells go transparent and the canvas draws their
focus and hover states from the DOM's own state.

Towers stand up out of that plane, so a click on a tower's facade lands on the lot behind it. That is
harmless by construction: playable lots are always empty (a tile can only be placed on an empty cell),
the non-HQ blocks are low, and the floating marker sits above rooftop height.

**The camera rotates freely (decided 2026-09-25).** Drag sideways to spin the board, and drag up or down
to tilt it, clamped between a low three-quarter view and nearly top-down. Buttons at the board's corner
turn it to the next quarter from wherever the drag left it, and a third button resets the view. Every
orthographic camera maps the ground by an affine transform, so free rotation keeps the overlay trick:
the matrix is simply recomputed on each rendered frame. The sketch shows the click grid staying on its
lots through a drag.

- **Click versus drag.** A press that moves under 5 px is a click on the cell under it. A real drag
  swallows the click it ends in, so spinning the board can never place a tile.
- **Coordinates stay readable.** The ground labels are repainted upright whenever the camera crosses
  into another quarter.
- **Rendering stays on demand.** Frames render only while a drag or a swing is in progress.
- **Reduced motion.** The buttons snap instead of swinging and there is no inertia. Dragging still works,
  because the player is the one moving the camera.
- **Keyboard.** `[` and `]` turn by a quarter and `0` resets the view, unless a text field has focus
  (the same guard the Header uses for `?` and F1).
- **The view is per-session UI state, not a setting.** Every game opens at the default angle. The
  `run-app` driver resets the view before it screenshots, so captures stay reproducible.

**The refactor**, worth doing regardless:

```
board/
  boardModel.ts        useBoardModel({ spectating }) → cols, rows, RenderCell[], pick, busy, mergedAt
                       (today's classify / cellTargets / sweepDelay, moved out of Board.tsx)
  BoardGrid.tsx        the DOM contract: roles, labels, buttons, clicks. Paints cells itself in Flat mode;
                       goes transparent and takes an overlay transform in Skyline mode
  Board.tsx            picks the painter from settings; renders BoardGrid, plus <Skyline> when selected
  skyline/
    skylineModel.ts    pure: RenderCell[] + corporations + ruleset → buildings (height, colour, crown, stripes)
    Skyline.tsx        lazy: import('./scene.js'), mounts the canvas, owns fallback
    scene.ts           plain three.js: renderer, ortho camera, instanced lots and blocks, towers, labels
```

`skylineModel.ts` is pure and unit-tested like `pick.ts`; `scene.ts` only draws what it is handed.

## Library: plain three.js, no R3F

Measured on 2026-09-24 with esbuild, minified, a scene using the renderer, ortho camera, instanced mesh,
standard material, two lights and a canvas texture:

| Stack | Minified | Gzipped |
|---|---|---|
| **three 0.186 alone** | **537 KB** | **134 KB** |
| R3F + drei (with `<Text>`) + three, React excluded | ~1.04 MB | ~290 KB |
| The removed stack (R3F + drei + troika), per `decisions.md` | ~2.2 MB | — |

The scene is small (108 lots, at most seven towers) and driven by a model that changes once per command,
so React-in-the-scene buys nothing. `scene.ts` is imperative three, mounted from one `useEffect`.

**Text without a font pipeline.** Coordinates are painted once into a `CanvasTexture` atlas using the app's
own `@font-face` (already loaded), then mapped onto the lots. No troika, no SDF generation, no font files.
Company names never go on the board; the band and the panels already carry them.

**Bundle, honestly.** The scene lives behind `import()`, so its chunk is never parsed unless Skyline is
on, and the web build never even downloads it. The installers and itch.io channels still grow by about
half a megabyte, because electron-vite bundles everything from source. That is the cost to accept.
The CSP needs nothing new: three uses no `eval`, and chunks are `'self'`.

**Render on demand.** No `requestAnimationFrame` loop while nothing is moving. The scene renders when the
model changes, while an animation runs, and on resize; it stops entirely when the document is hidden or a
covering beat is up. The table idles at zero GPU.

## The switch

- **Setting:** `boardStyle: 'board-view' | 'skyline'` on `Settings`, default `'board-view'`. `loadSettings` merges
  stored over defaults, so an added key needs no migration and no version bump.
- **Lighting (decided 2026-09-25: both):** `lighting: 'day' | 'night'`, default `'day'`. Shared with the whole app (decided 2026-09-25): Skyline reads the same key the app-wide day/night tokens (#64) will, so the board and the screen always match. Day is
  the paper palette Board View uses; night is a dark board with lit windows that matches the launch
  screen's skyline (`assets/night`). It is one uniform switch in the scene (background, two lights, the
  ground palette and the windows' emissive intensity), not a second renderer, so the cost is a second
  look to keep polished rather than a second code path. It sits beside `boardStyle` in Settings and
  shows only when Skyline is selected; the in-game toggle stays the single Board View/Skyline switch.
- **In Settings:** under *This machine*, beside the volumes. It is a preference about this screen, never a
  table rule, so it never travels to the room and online opponents can each pick their own.
- **In the game:** a small icon toggle in the Header's brand region, next to the speaker, for the same
  reason the volume lives there (it is a property of the app, not the table). Switching mid-game is
  instant in both directions because both painters render from the same model.

## Falling back instead of going black

The option must never cost anyone the board.

1. **No WebGL2** (context creation fails): Board View, once-per-session notice.
2. **Software renderer:** create the context with `failIfMajorPerformanceCaveat: true`; if that fails,
   same as above.
3. **Slow machine:** time the first animated frames; if the median is over ~50 ms, drop to Board View.
4. **Context lost** mid-game, or the chunk fails to load: drop to Board View on the spot. The DOM grid never
   went away, so the player loses nothing but the buildings.

The stored setting stays `'skyline'` (it is a preference, not a verdict), and Settings shows a line saying
this machine couldn't run it. Copy in the house voice, e.g. *"Your graphics card declined to finance the
skyline. Board View it is."*

**The automated harness trips rule 2.** Headless Chromium runs SwiftShader, which is exactly a software
renderer. The `run-app` driver therefore needs a force flag (`?board=skyline&forceSkyline=1` in the
browser build) so it can actually exercise the Skyline path, and the skill should say so.

## Everything else stays 2D

Panels, modals, beats, the hand-off card and the merger decisions are all DOM and unchanged. The canvas
sits inside `.boardSlot` in normal flow, below every overlay, with no z-index of its own, so the curtain
covers it the way it covers the Board View. Hot-seat privacy is unaffected: the board is public state,
and the Skyline reads the same `spectating`-aware view the Board View does.

## Tests

- `board.test.tsx` runs under `describe.each(['board-view', 'skyline'])`. jsdom has no WebGL, so under
  `'skyline'` the scene module is mocked and the test asserts against the DOM grid in overlay mode, which
  is exactly the contract. Same roles, same labels, same clicks.
- `skylineModel.test.ts`: height per band at both editions' cuts, crown at `safe`, lineage stripes in
  eaten order, deterministic per-tile block heights.
- Fallback: a unit test with a stubbed context that fails, and one that reports a slow first frame.
- `run-app` on both painters: a full bot game, a merger, and the beats over the board, with a screenshot
  set of the skyline at a few moments.

## Decisions to record

- `docs/decisions.md`, **Accepted**: *Board rendering* becomes "CSS board by default; WebGL Skyline as a
  per-machine option". **Superseded** gains the reversal of the reversal, stating why: the original 3D
  board reproduced a flat design at 2.2 MB; this one draws something the CSS board can't (a skyline that
  encodes size, safety and lineage) at a quarter of the weight, behind a lazy import.
- **The design canvas** gains a `b_board_skyline` artboard in `design/build.py`, so the look is settled
  where every other artboard is, rather than invented in code. The companion sketch linked at the top of this
  plan is a starting point for it, not a substitute.

## Alternatives considered

- **Towers in CSS.** Stack `preserve-3d` boxes on the existing board. No bundle cost and one painter.
  Rejected: the 6° tilt that keeps the flat board readable hides any height worth drawing, a steeper tilt
  breaks the flat board, Chromium's `preserve-3d` depth sorting glitches with intersecting boxes, and
  lighting has to be faked per face. It would be a worse skyline and a worse flat board.
- **R3F + drei again.** Idiomatic, but roughly double the weight for a scene with no React-shaped
  complexity, and it re-imports the text pipeline the first attempt paid for.
- **Raycast picking with a hidden DOM mirror.** What the issue anticipated. Unnecessary with an
  orthographic camera, and a hidden mirror is a second source of truth that can drift from what is drawn.
- **Quarter turns only.** This was the first draft. Steve asked for free rotation as well, and it costs
  little: the overlay matrix is recomputed per frame, and the reset view keeps screenshots reproducible.

## Build order

1. Extract `boardModel.ts` and `BoardGrid.tsx`; Board View unchanged, all tests green. (Mergeable alone.)
2. `boardStyle` and `lighting` settings and both switches, wired to a placeholder painter.
3. `skylineModel.ts` with tests.
4. `scene.ts`: static skyline, overlay matrix, free rotation with drag/click separation, quarter-turn and reset buttons, fallback.
5. Moments: rise, grow, demolish, crown, held behind covering beats; reduced motion.
6. Canvas artboard, `decisions.md`, `run-app` force flag, verification on both painters.

## Open questions for Steve

1. ~~**Height by size band or by share price?**~~ Decided 2026-09-25: chain size.
2. ~~**Day or night?**~~ Decided 2026-09-25: both, as a setting, defaulting to day, with a one-click sun/moon toggle on the board itself. See *The switch*.
3. ~~**Name.**~~ Decided 2026-09-25: **Skyline** and **Board View**.
