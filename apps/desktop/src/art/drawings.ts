/**
 * The Game Night skin's drawings, one SVG file each under `drawings/`. The files
 * are the source: edit them by hand, or send them out for touch-up with the art
 * kit (`npm run art:export`, then `npm run art:import`, see `drawings/README.md`).
 *
 * Colours that follow the company or the lighting are written as `var(--gn-*)`
 * tokens, so one file serves every company, day and night. The wobble filter
 * and the crane's swing are added by the components, not drawn into the files.
 */
const FILES = import.meta.glob('./drawings/**/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

/** The markup inside a file's `<svg>` element, ready to set as an SVG's innerHTML. */
export function innerMarkup(file: string): string {
  const open = file.indexOf('<svg');
  const start = file.indexOf('>', open) + 1;
  const end = file.lastIndexOf('</svg>');
  if (open === -1 || start === 0 || end < start) throw new Error('not an <svg> file');
  return file.slice(start, end).trim();
}

/** One drawing's markup, by its path under `drawings/` without the extension. */
export function drawing(name: string): string {
  const file = FILES[`./drawings/${name}.svg`];
  if (file == null) throw new Error(`missing drawing: ${name}`);
  return innerMarkup(file);
}

/** Every drawing under a folder, in file-name order. */
export function drawingsIn(folder: string): string[] {
  const prefix = `./drawings/${folder}/`;
  return Object.keys(FILES)
    .filter((path) => path.startsWith(prefix))
    .sort()
    .map((path) => innerMarkup(FILES[path]!));
}
