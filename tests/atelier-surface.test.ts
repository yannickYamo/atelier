// tests/atelier-surface.test.ts — THE CODE A DEFAULT RUN CAN REACH ONLY GOES DOWN, AND SO DOES THE NUMBER OF MODEL READINGS.
//
// Every defect a person met lived in code a run could reach. So the reach of the two front doors is a number held
// here: the files and lines reached by value imports from the writer (cli/direct.ts) and from the check
// (cli/commands/verify.ts). A change that raises either fails; a change that deletes lowers the number in the same
// commit. The count of exported model readings is held the same way: a new reading retires one.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE = ['cli', 'core', 'adapters', 'providers', 'renderers'];

/** The relative modules a file imports for their values: `import type` and `export type` carry no code. */
function valueImports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of text.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'"`;]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of text.matchAll(/\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out.flatMap((spec) => {
    const base = resolve(dirname(file), spec).replace(/\.m?js$/, '');
    const hit = [`${base}.ts`, `${base}.mts`, join(base, 'index.ts')].find((p) => existsSync(p));
    return hit ? [hit] : [];
  });
}

/** Every source file reached from `entry`, itself included, with the lines they hold. */
export function reach(entry: string): { files: number; lines: number } {
  const seen = new Set<string>(); const todo = [resolve(ROOT, entry)];
  while (todo.length) { const f = todo.pop()!; if (seen.has(f)) continue; seen.add(f); todo.push(...valueImports(f)); }
  let lines = 0; for (const f of seen) lines += readFileSync(f, 'utf8').split('\n').length;
  return { files: seen.size, lines };
}

const sourceFiles = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? sourceFiles(p) : /\.m?ts$/.test(n) ? [p] : []; });

/** Exported model readings: a constant typed `Reading<…>` or a function that returns one. */
export function readings(): string[] {
  return SOURCE.flatMap((d) => sourceFiles(join(ROOT, d))).flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(/^export (?:const (\w+)\s*:\s*Reading<|function (\w+)\([^)]*\)\s*:\s*Reading<)/gm)].map((m) => `${relative(ROOT, f)}:${m[1] ?? m[2]}`));
}

// THE HELD NUMBERS. Lower them in the commit that deletes. A rise is the owner's decision, named in its commit:
// 17 Nov 2026, +2 lines on verify's side: the person's stated purpose reaches the writer.
// 19 Nov 2026, +20 and +12 (owner's go): with --style-review, the draft is read against the author's pieces by another model.
// 20 Nov 2026, +1 file and +147 lines, +5 on verify's side (owner's order): --voice-select, what a request takes of the pieces.
// 23 Nov 2026, +2 and +2 (owner's order): a fix in place is told what was asked of the piece before (the record's fix.earlier).
// 24 Nov 2026, -5 and +16 on verify's side (owner's order, the intent-first pass): the lines under a piece a run hands over.
const HELD = {
  'cli/direct.ts': { files: 145, lines: 34595 },
  'cli/commands/verify.ts': { files: 122, lines: 30350 },
} as const;
const READINGS_HELD = 39;

describe('the code a default run can reach only goes down', () => {
  it.each(Object.entries(HELD))('%s reaches no more than it did', (entry, held) => {
    const now = reach(entry);
    expect(now.files, `files reached from ${entry}`).toBeLessThanOrEqual(held.files);
    expect(now.lines, `lines reached from ${entry}`).toBeLessThanOrEqual(held.lines);
  });
  it('the held numbers are the present ones: a deletion lowers them in its own commit', () => {
    for (const [entry, held] of Object.entries(HELD)) expect(reach(entry)).toEqual(held);
  });
});

describe('a new model reading retires one', () => {
  it('the count of exported readings does not rise', () => {
    const now = readings();
    expect(now.length, now.join('\n')).toBeLessThanOrEqual(READINGS_HELD);
  });
});
