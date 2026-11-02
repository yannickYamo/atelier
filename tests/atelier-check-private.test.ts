// THE PRE-PUSH GUARD: a private term in a tracked file stops the push and is listed; the terms live in an untracked
// file, never in the repository. Whole words only, any case; an untracked file is not searched.
import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BUILT_IN } from '../scripts/check-private.mjs';

const SCRIPT = resolve('scripts/check-private.mts');
const TSX = resolve('node_modules/.bin/tsx');
const repo = (files: Record<string, string>, untracked: Record<string, string> = {}): string => {
  const d = mkdtempSync(join(tmpdir(), 'atelier-private-'));
  execFileSync('git', ['init', '-q'], { cwd: d });
  for (const [f, body] of Object.entries(files)) writeFileSync(join(d, f), body);
  execFileSync('git', ['add', ...Object.keys(files)], { cwd: d });
  for (const [f, body] of Object.entries(untracked)) writeFileSync(join(d, f), body);
  return d;
};
const terms = (lines: string): string => { const p = join(mkdtempSync(join(tmpdir(), 'atelier-terms-')), 'terms'); writeFileSync(p, lines); return p; };
const run = (dir: string, termsFile: string) => spawnSync(TSX, [SCRIPT, dir], { encoding: 'utf8', env: { ...process.env, ATELIER_PRIVATE_TERMS: termsFile } });

describe('check:private', () => {
  it('lists every hit as file:line and exits 1; case is ignored, a longer word is no hit, an untracked file is not read', () => {
    const d = repo({ 'a.md': 'Line one.\nWe met Quillfeather on Tuesday.\n', 'b.ts': '// quillfeathers and quillfeather-ish\nconst x = 1;\n', 'c.md': 'the blue  heron study\n' },
      { 'notes.md': 'Quillfeather again' });
    const r = run(d, terms('# private\nquillfeather\n\nBlue Heron\n'));
    expect(r.status).toBe(1);
    // "quillfeathers" is a longer word; "quillfeather-ish" holds the term as a whole word before the hyphen.
    expect(r.stderr).toContain('a.md:2: quillfeather');
    expect(r.stderr).toContain('b.ts:1: quillfeather');
    expect(r.stderr).toContain('c.md:1: blue heron');
    expect(r.stderr).not.toContain('notes.md');
    expect(r.stderr).toContain('(3)');
  });
  it('the built-in markers are checked with no private list at all', () => {
    const d = repo({ 'a.md': `see ${BUILT_IN[0]} for this\n` });
    const r = run(d, join(tmpdir(), 'no-such-terms-file'));
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('checking the built-in markers only');
    expect(r.stderr).toContain(`a.md:1: ${BUILT_IN[0]}`);
  });
  it('a clean repository passes and says how many terms were checked', () => {
    const r = run(repo({ 'a.md': 'Nothing private here.\n' }), terms('quillfeather\n'));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`(${BUILT_IN.length + 1} checked)`);
  });
});
