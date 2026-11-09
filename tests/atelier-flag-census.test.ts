// tests/atelier-flag-census.test.ts — EVERY FLAG THE CODE READS IS DECLARED.
//
// The parser tolerates an unknown flag (cli/runtime.ts), so a flag read in code but not declared takes no value: its
// value slides into the positionals, and `fix --carrier X "..."` took X as the complaint. Every flag a command reads is
// held here to the declared grammar. The scan is a parser of the code's form (a call and its string argument).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { VALUED_OPTIONS, BOOLEAN_OPTIONS } from '../cli/runtime.js';

const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.m?ts$/.test(e.name) ? [join(d, e.name)] : []));

describe('every flag the code reads is declared', () => {
  it('argv.includes, flag, flagEach and numericFlag name only declared flags', () => {
    const declared = new Set([...VALUED_OPTIONS, ...BOOLEAN_OPTIONS]);
    const read = new Map<string, string>();
    for (const f of [...walk('cli'), ...walk('core')]) {
      for (const m of readFileSync(f, 'utf8').matchAll(/(?:argv\.includes|flag|flagEach|numericFlag)\(\s*'--([a-z][a-z0-9-]*)'/g)) if (!read.has(m[1])) read.set(m[1], f);
    }
    expect(read.size).toBeGreaterThan(150);
    expect([...read].filter(([k]) => !declared.has(k)).map(([k, f]) => `--${k} (${f})`)).toEqual([]);
  });
});
