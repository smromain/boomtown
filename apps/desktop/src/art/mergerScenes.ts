/**
 * The Game Night skin's merger drawings (prototype): the survivor's
 * headquarters on the left, and a tower crane swinging the company it is
 * swallowing across to it. Drawn by hand in a 600×150 box, ground at y 132,
 * in the same flat, rough-lined style as the card scenes.
 *
 * A scene is assembled from parts in `drawings/mergers/` so any survivor can
 * meet any defunct company: `backdrop.svg`, one `hq-<industry>.svg` (coloured
 * `--gn-c`), `crane.svg`, the crane's load, `load-<industry>.svg` (coloured
 * `--gn-t`), and `swing-arrow.svg` over the top. A load is drawn in its own
 * box with its base at y 58 and its slings meeting the hook at (38, -8); here
 * it is hung from the trolley and set swinging.
 */
import { INDUSTRIES, type Industry } from '@boomtown/engine';
import { drawing } from './drawings.js';

const byIndustry = (prefix: string) =>
  Object.fromEntries(INDUSTRIES.map((industry) => [industry, drawing(`mergers/${prefix}-${industry}`)])) as Record<
    Industry,
    string
  >;

export const BACKDROP = drawing('mergers/backdrop');
export const HQ = byIndustry('hq');
export const LOAD = byIndustry('load');
const CRANE = drawing('mergers/crane');
const ARROW = drawing('mergers/swing-arrow');

/** The crane, with `load` hanging from its trolley on a swinging cable, and the arrow. */
export function crane(load: Industry): string {
  return `${CRANE}
<g class="gn-sway"><path d="M506 32 V54" fill="none" stroke="var(--gn-line)" stroke-width="1.6" stroke-linecap="round"/>
<g transform="translate(468 62) rotate(-5)">${LOAD[load]}</g></g>
${ARROW}`;
}

export function mergerScene(survivor: Industry, defunct: Industry): string {
  return `<g class="gn-rough">${BACKDROP}${HQ[survivor]}${crane(defunct)}</g>`;
}
