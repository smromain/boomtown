/**
 * The Game Night skin's corporation scenes (prototype): one small flat drawing
 * per industry, coloured through `--gn-*` custom properties so a scene follows
 * the corporation it sits on (`--gn-c`) and the day/night ground. Each is drawn
 * in a 300×96 box in `drawings/cards/<industry>.svg`; edit the drawings there.
 */
import { INDUSTRIES, type Industry } from '@boomtown/engine';
import { drawing } from './drawings.js';

export const SCENES = Object.fromEntries(INDUSTRIES.map((industry) => [industry, drawing(`cards/${industry}`)])) as Record<
  Industry,
  string
>;
