// tests/atelier-field-writers.test.ts — A FIELD WITH A READER AND NO WRITER IS A DARK FEATURE.
//
// The anti-fabrication guard shipped this way: `prerequisites` was typed, checked by `invoke`, shown by
// `plan`, documented at length — and the only thing in the tree that ever set it was a test fixture. The
// reachability census passed, because it counts modules, and a module that READS a field is reachable.
// No user path could turn the feature on.
//
// This census works at the level where that failure lives. Every optional field on a Requirement must
// be WRITTEN somewhere in shipped code (an object literal assigning it), not only read. A new optional
// field fails here until something a person can reach sets it.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|mts)$/.test(p) ? [p] : [];
});

const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const FIELDS = ['prerequisites', 'measurement', 'realizes', 'phase'];

describe('every optional Requirement field has a writer on a path a person can reach', () => {
  const src = readFileSync('core/state/canonical-state.ts', 'utf8');
  const block = /export interface Requirement \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? '';
  const optional = [...block.matchAll(/readonly (\w+)\?:/g)].map((m) => m[1]);
  const shipped = ['core', 'cli', 'renderers', 'adapters'].flatMap(walk)
    .filter((f) => f !== join('core', 'state', 'canonical-state.ts'))
    .map((f) => ({ f, text: strip(readFileSync(f, 'utf8')) }));

  it('the census can see the fields it is policing, and no optional field escapes it', () => {
    expect(optional).toEqual(expect.arrayContaining(FIELDS));
    expect(optional.filter((f) => !FIELDS.includes(f))).toEqual([]);
  });

  it.each(FIELDS)('%s is assigned by shipped code, not only read', (field) => {
    // An assignment in an object literal — `field: value` or `{ field }` shorthand — outside a type.
    const assigns = [new RegExp(`[{,(]\\s*${field}\\s*:\\s*\\S`), new RegExp(`^\\s*${field}\\s*:\\s*\\S`), new RegExp(`\\{\\s*${field}\\s*\\}`)];
    const writers = shipped.filter(({ text }) => text.split('\n').some((line) =>
      !/\breadonly\b/.test(line) && !/^\s*(export\s+)?(interface|type)\b/.test(line) && assigns.some((re) => re.test(line))));
    expect(writers.map((w) => w.f), `${field} has readers but nothing a person can reach ever sets it`).not.toEqual([]);
  });
});
