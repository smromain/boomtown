import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import strings from './constants.json';

/**
 * The two ways copy with a `{placeholder}` in it goes wrong, caught statically
 * rather than by someone spotting a literal `{name}` on screen.
 *
 * Both failures are quiet. A template rendered without `fill` puts braces in
 * front of a player; a `fill` whose values don't match its template leaves one
 * placeholder standing while the rest of the sentence reads fine. Neither
 * breaks a build, and a *negative* test assertion ("this text is absent") would
 * pass either way — which is precisely why the check belongs here rather than
 * in whichever component test happens to cover the screen.
 */

const SRC = join(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const lookup = (path: string): unknown =>
  path.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object' && part in node) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, strings);

/**
 * `const c = copy.rules;` and `const t = c.table;` are how the wordier files
 * stay readable, so resolving a reference means resolving those first. Three
 * passes is more than any chain in the app is deep.
 */
function aliases(src: string): Record<string, string> {
  const map: Record<string, string> = {};
  const declaration =
    /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*((?:copy|strings)(?:\.[\w$]+)*|[A-Za-z_$][\w$]*(?:\.[\w$]+)+)\s*;/g;
  for (let pass = 0; pass < 3; pass++) {
    for (const match of src.matchAll(declaration)) {
      const [, name, target] = match as unknown as [string, string, string];
      const [root, ...rest] = target.split('.');
      if (root === 'copy' || root === 'strings') map[name] = rest.join('.');
      else if (root && map[root]) map[name] = [map[root], ...rest].join('.');
    }
  }
  return map;
}

/** Split a call's arguments at the top level. `from` points just past the `(`. */
function callArguments(src: string, from: number): string[] {
  const args: string[] = [];
  let depth = 1;
  let start = from;
  for (let i = from; i < src.length && depth > 0; i++) {
    const ch = src[i]!;
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) {
      depth--;
      if (depth === 0) args.push(src.slice(start, i));
    } else if (ch === ',' && depth === 1) {
      args.push(src.slice(start, i));
      start = i + 1;
    }
  }
  return args;
}

/** Every copy path named in an expression, aliases resolved. */
function pathsIn(expression: string, alias: Record<string, string>): string[] {
  const roots = ['copy', 'strings', ...Object.keys(alias)];
  if (roots.length === 0) return [];
  const pattern = new RegExp(`\\b(${roots.join('|')})((?:\\.[\\w$]+)+)`, 'g');
  return [...expression.matchAll(pattern)].map(([, root, rest]) => {
    const tail = rest!.slice(1);
    return root === 'copy' || root === 'strings' ? tail : `${alias[root!]}.${tail}`;
  });
}

/** A nested `fill(...)` inside a value would otherwise donate its own keys. */
function withoutNestedFills(expression: string): string {
  let out = '';
  for (let i = 0; i < expression.length; ) {
    if (expression.startsWith('fill(', i)) {
      let depth = 1;
      i += 5;
      while (i < expression.length && depth > 0) {
        if ('([{'.includes(expression[i]!)) depth++;
        else if (')]}'.includes(expression[i]!)) depth--;
        i++;
      }
      continue;
    }
    out += expression[i];
    i++;
  }
  return out;
}

const files = sourceFiles(SRC).filter((f) => !f.includes('/copy/'));
const line = (src: string, index: number) => src.slice(0, index).split('\n').length;

describe('copy with placeholders in it', () => {
  it('is never rendered raw — every such string goes through fill()', () => {
    const raw: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const alias = aliases(src);
      const roots = ['copy', 'strings', ...Object.keys(alias)];

      // the index ranges covering the first argument of every fill() call
      const filled: [number, number][] = [];
      for (const match of src.matchAll(/\bfill\s*\(/g)) {
        const from = match.index! + match[0].length;
        const [first] = callArguments(src, from);
        if (first !== undefined) filled.push([from, from + first.length]);
      }

      const pattern = new RegExp(`\\b(${roots.join('|')})((?:\\.[\\w$]+)+)`, 'g');
      for (const match of src.matchAll(pattern)) {
        const [, root, rest] = match as unknown as [string, string, string];
        const path = root === 'copy' || root === 'strings' ? rest.slice(1) : `${alias[root]}.${rest.slice(1)}`;
        const value = lookup(path);
        if (typeof value !== 'string' || !value.includes('{')) continue;
        if (filled.some(([a, b]) => match.index! >= a && match.index! <= b)) continue;
        raw.push(`${file.replace(SRC, 'src')}:${line(src, match.index!)} — copy.${path} = ${JSON.stringify(value)}`);
      }
    }

    expect(raw).toEqual([]);
  });

  it('is filled with the values it actually asks for', () => {
    const mismatched: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const alias = aliases(src);

      for (const match of src.matchAll(/\bfill\s*\(/g)) {
        const args = callArguments(src, match.index! + match[0].length);
        if (args.length < 2) continue;
        const [templateExpr, valuesExpr] = args as [string, string];

        const values = withoutNestedFills(valuesExpr);
        const keys = new Set([
          ...[...values.matchAll(/(?:^|[{,\s])([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1]!),
          // shorthand: { name }
          ...[...values.matchAll(/(?:^|[{,])\s*([A-Za-z_$][\w$]*)\s*(?=[,}])/g)].map((m) => m[1]!),
        ]);

        // a ternary can name two templates; both have to be satisfied
        for (const path of pathsIn(templateExpr, alias)) {
          const template = lookup(path);
          if (typeof template !== 'string') continue;
          const needed = new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!));
          const missing = [...needed].filter((k) => !keys.has(k));
          const unused = [...keys].filter((k) => !needed.has(k));
          const where = `${file.replace(SRC, 'src')}:${line(src, match.index!)} — copy.${path}`;
          if (missing.length > 0) mismatched.push(`${where} never fills ${missing.join(', ')}`);
          else if (unused.length > 0) mismatched.push(`${where} is passed unused ${unused.join(', ')}`);
        }
      }
    }

    expect(mismatched).toEqual([]);
  });
});
