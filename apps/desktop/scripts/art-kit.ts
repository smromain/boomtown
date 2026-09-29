/**
 * The art kit's command line (see `src/art/drawings/README.md`).
 *
 *   npm run art:export [-- <folder>]   writes the drawings with plain colours to art-kit/
 *   npm run art:import -- <folder>     takes touched-up drawings back into src/art/drawings/
 *
 * The folder may come back flattened or with extra files: a drawing is matched by
 * its path, or else by its file name, and anything unmatched is reported and left.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { EXPORT_PALETTE, exportDrawing, importDrawing, type Dom } from '../src/art/kit.js';

const DRAWINGS = fileURLToPath(new URL('../src/art/drawings/', import.meta.url));
const { window } = new JSDOM('');
const dom: Dom = { DOMParser: window.DOMParser, XMLSerializer: window.XMLSerializer };

const svgsUnder = (dir: string): string[] =>
  fs.readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.toLowerCase().endsWith('.svg'))
    .map((file) => file.split(path.sep).join('/'))
    .sort();

function exportKit(out: string) {
  const names = svgsUnder(DRAWINGS);
  for (const name of names) {
    const target = path.join(out, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, exportDrawing(dom, fs.readFileSync(path.join(DRAWINGS, name), 'utf8')));
  }
  fs.copyFileSync(path.join(DRAWINGS, 'README.md'), path.join(out, 'README.md'));
  fs.writeFileSync(path.join(out, 'palette.json'), `${JSON.stringify(EXPORT_PALETTE, null, 2)}\n`);
  const swatches = Object.entries(EXPORT_PALETTE);
  const rows = swatches.map(([token, { hex, opacity, note }], i) => {
    const y = 16 + i * 30;
    const alpha = opacity == null ? '' : ` fill-opacity="${opacity}"`;
    return `<rect x="16" y="${y}" width="48" height="22" rx="4" fill="${hex}"${alpha} stroke="#1c2a47"/>` +
      `<text x="76" y="${y + 15}" font-family="sans-serif" font-size="13" fill="#1c2a47">${hex}  ${token}: ${note}</text>`;
  });
  fs.writeFileSync(
    path.join(out, 'palette.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 ${swatches.length * 30 + 24}" width="560" height="${swatches.length * 30 + 24}">\n` +
      `<rect width="100%" height="100%" fill="#fbfaf6"/>\n${rows.join('\n')}\n</svg>\n`,
  );
  console.log(`Exported ${names.length} drawings to ${out}`);
}

function importKit(from: string) {
  const known = svgsUnder(DRAWINGS);
  const byFile = new Map(known.map((name) => [path.posix.basename(name), name]));
  let changed = 0;
  let failed = 0;
  for (const file of svgsUnder(from)) {
    if (path.posix.basename(file) === 'palette.svg') continue;
    const name = known.includes(file) ? file : byFile.get(path.posix.basename(file));
    if (name == null) {
      console.log(`?  ${file}: not one of the drawings, left alone`);
      continue;
    }
    const was = fs.readFileSync(path.join(DRAWINGS, name), 'utf8');
    try {
      const result = importDrawing(dom, fs.readFileSync(path.join(from, file), 'utf8'), was, name.replace(/\.svg$/, ''));
      const notes = [
        ...result.warnings,
        ...(result.newColours.length > 0 ? [`colours outside the palette: ${result.newColours.join(' ')}`] : []),
      ];
      if (result.svg !== was) {
        fs.writeFileSync(path.join(DRAWINGS, name), result.svg);
        changed++;
      }
      console.log(`${result.svg === was ? '=' : 'M'}  ${name}${notes.map((note) => `\n     ${note}`).join('')}`);
    } catch (error) {
      failed++;
      console.log(`!  ${name}: ${(error as Error).message}; not imported`);
    }
  }
  console.log(`\n${changed} drawing(s) updated${failed > 0 ? `, ${failed} refused` : ''}.`);
  if (failed > 0) process.exitCode = 1;
}

const [command, folder] = process.argv.slice(2);
if (command === 'export') exportKit(path.resolve(folder ?? 'art-kit'));
else if (command === 'import' && folder != null) importKit(path.resolve(folder));
else {
  console.error('usage: art-kit export [folder] | art-kit import <folder>');
  process.exitCode = 2;
}
