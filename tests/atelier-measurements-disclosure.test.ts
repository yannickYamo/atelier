// tests/atelier-measurements-disclosure.test.ts — A DISCLOSURE THAT ROTS IS WORSE THAN NO DISCLOSURE.
//
// MEASUREMENTS.md exists because several comments in this tree state a number from a run whose
// record is not public. The document is only worth having if a reader can follow every pointer in
// it, so this file polices it in BOTH directions.
//
// Forward: every `file.ts:NN` in the table resolves, and the line it names still carries the number
// the row is about. A file gains three lines at the top and the whole table silently starts citing
// the wrong place; nothing else in the repository would notice.
//
// Backward: the hallmark figures — the ones a reviewer would quote — appear in the document if
// they appear in the tree. A new comment asserting 126 observations somewhere else must be listed,
// or the document has stopped being a complete account of what is claimed.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DOC = readFileSync('MEASUREMENTS.md', 'utf8');

/** `path/to/file.ts:12` and `path/to/file.ts:12-15`, as the table writes them. */
const REFS = [...DOC.matchAll(/`([a-z0-9/_.-]+\.ts):(\d+)(?:-(\d+))?`/g)]
  .map((m) => ({ file: m[1], from: Number(m[2]), to: Number(m[3] ?? m[2]) }));

const walk = (dir: string): string[] => readdirSync(dir).flatMap((e) => {
  const p = join(dir, e);
  if (statSync(p).isDirectory()) return e === 'node_modules' ? [] : walk(p);
  return p.endsWith('.ts') ? [p] : [];
});

describe('MEASUREMENTS.md points at real lines', () => {
  it('the test can see the document at all', () => {
    // Polarity: a regex that matched nothing would make every assertion below vacuous.
    expect(REFS.length).toBeGreaterThanOrEqual(14);
  });

  it('every cited file exists', () => {
    const missing = REFS.filter((r) => !existsSync(r.file)).map((r) => r.file);
    expect(missing, `MEASUREMENTS.md cites files that are not in the tree:\n${missing.join('\n')}`)
      .toEqual([]);
  });

  it('every cited line range still carries a number', () => {
    const stale: string[] = [];
    for (const r of REFS) {
      if (!existsSync(r.file)) continue;
      const lines = readFileSync(r.file, 'utf8').split('\n');
      const span = lines.slice(r.from - 1, r.to).join('\n');
      // The rows are about figures. A cited span with no digit means the file moved under us.
      if (!/\d/.test(span)) stale.push(`${r.file}:${r.from}-${r.to} no longer carries a number`);
    }
    expect(stale, stale.join('\n')).toEqual([]);
  });

  it('every cited line range is inside the file', () => {
    const past: string[] = [];
    for (const r of REFS) {
      if (!existsSync(r.file)) continue;
      const n = readFileSync(r.file, 'utf8').split('\n').length;
      if (r.to > n) past.push(`${r.file}:${r.to} is past end of file (${n} lines)`);
    }
    expect(past, past.join('\n')).toEqual([]);
  });
});

describe('MEASUREMENTS.md is a complete account of the hallmark figures', () => {
  // The figures a reviewer would quote back at us. Each must be disclosed wherever it is asserted.
  const HALLMARKS = ['126 observation', '150 observation', '138 scored', '28 of 30'];

  it('the census can see the shipped tree', () => {
    expect(['core', 'cli'].flatMap(walk).length).toBeGreaterThan(80);
  });

  it('a hallmark figure asserted in the tree is disclosed in the document', () => {
    const undisclosed: string[] = [];
    for (const h of HALLMARKS) {
      const asserted = ['core', 'cli'].flatMap(walk)
        .filter((f) => readFileSync(f, 'utf8').includes(h));
      // The FULL phrase, not the bare number. Matching just "126" passed against an unrelated
      // "the 126 above" in a neighbouring row, which made this whole direction vacuous.
      if (asserted.length > 0 && !DOC.includes(h)) {
        undisclosed.push(`"${h}" is asserted in ${asserted.join(', ')} but absent from MEASUREMENTS.md`);
      }
    }
    expect(undisclosed, undisclosed.join('\n')).toEqual([]);
  });
});
