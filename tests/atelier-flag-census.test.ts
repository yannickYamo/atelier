// tests/atelier-flag-census.test.ts — EVERY FLAG THE CODE READS IS DECLARED.
//
// The parser tolerates an unknown flag (cli/runtime.ts), so a flag read in code but not declared takes no value: its
// value slides into the positionals, and `fix --carrier X "..."` took X as the complaint. Every flag a command reads is
// held here to the declared grammar. The scan is a parser of the code's form (a call and its string argument).
// And every flag a command reads is said where a person can find it: in help (cli/help.ts, cli/atelier.mts) or in
// docs/USAGE.md, or it is on the short list below of flags no person types, each with why.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { VALUED_OPTIONS, BOOLEAN_OPTIONS } from '../cli/runtime.js';

const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.m?ts$/.test(e.name) ? [join(d, e.name)] : []));

/** Flags no person types, each with why: set by Atelier itself, or kept only so an old call still parses. */
const UNSAID: Readonly<Record<string, string>> = {
  'auto-reserve': 'pushed by atelier new onto its own intake',
  'fix-of': 'pushed by atelier fix onto the run it writes again',
  'corrections-of': 'pushed by atelier fix onto the run it writes again',
  'no-unsourced-note': 'the old way to turn off the unsourced marks, kept so old calls parse',
  conflict: 'the expert override for a clash between authors, documented in AGENTS.md',
};

const readFlags = (): Map<string, string> => {
  const read = new Map<string, string>();
  for (const f of [...walk('cli'), ...walk('core')]) {
    for (const m of readFileSync(f, 'utf8').matchAll(/(?:argv\.includes|flag|flagEach|flagAll|numericFlag)\(\s*'--([a-z][a-z0-9-]*)'/g)) if (!read.has(m[1])) read.set(m[1], f);
  }
  return read;
};

describe('every flag the code reads is said where a person finds it', () => {
  it('in help or USAGE, or on the short list of flags no person types', () => {
    const said = ['cli/help.ts', 'cli/atelier.mts', 'docs/USAGE.md'].map((f) => readFileSync(f, 'utf8')).join('\n');
    const unsaid = [...readFlags()].filter(([k]) => !UNSAID[k] && !new RegExp(`--${k}(?![a-z-])`).test(said)).map(([k, f]) => `--${k} (${f})`);
    expect(unsaid).toEqual([]);
    // the short list holds only flags still read, and none that help now says
    for (const k of Object.keys(UNSAID)) expect(readFlags().has(k), k).toBe(true);
  });
});

describe('every flag the code reads is declared', () => {
  it('argv.includes, flag, flagEach and numericFlag name only declared flags', () => {
    const declared = new Set([...VALUED_OPTIONS, ...BOOLEAN_OPTIONS]);
    const read = new Map<string, string>();
    for (const f of [...walk('cli'), ...walk('core')]) {
      for (const m of readFileSync(f, 'utf8').matchAll(/(?:argv\.includes|flag|flagEach|flagAll|numericFlag)\(\s*'--([a-z][a-z0-9-]*)'/g)) if (!read.has(m[1])) read.set(m[1], f);
    }
    expect(read.size).toBeGreaterThan(150);
    expect([...read].filter(([k]) => !declared.has(k)).map(([k, f]) => `--${k} (${f})`)).toEqual([]);
  });
});
