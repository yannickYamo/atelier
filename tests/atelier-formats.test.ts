// tests/atelier-formats.test.ts — WHAT A FORMAT FIXES, CHECKED; WHAT GOOD MEANS, LEFT TO THE OWNER.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FORMATS, formatOf, checkFormat } from '../core/observers/formats.js';
import { decideSpecifics } from '../core/loop/claim-extract.js';
import { checkDraft } from '../core/loop/run-repair.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const v = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;

describe('format profiles', () => {
  it('a class names a format however it is written', () => {
    expect(formatOf('LinkedIn post')?.id).toBe('linkedin-post');
    expect(formatOf('essay')).toBeNull();
    expect(formatOf(null)).toBeNull();
  });

  it('a hard limit is the product\'s floor: an over-long post fails the check', () => {
    const r = checkDraft('d', v, 'x'.repeat(300), { format: FORMATS['x-post'], guardClaims: false });
    const line = r.checked.find((c) => c.requirementId === 'FORMAT')!;
    expect(line.result.verdict).toBe('VIOLATED');
    expect(line.result.detail).toMatch(/300 characters; a post on X holds at most 280/);
    expect(r.failed).toBe(true);
  });

  it('the usual length and the fold only warn', () => {
    const hook = 'A'.repeat(230);
    const f = checkFormat(`${hook}\n\nShort.`, FORMATS['linkedin-post']);
    expect(f.hard).toEqual([]);
    expect(f.soft.map((s) => s.why).join(' ')).toMatch(/opening line runs 230 characters.*folds after about 210/);
    const r = checkDraft('d', v, `${hook}\n\nShort.`, { format: FORMATS['linkedin-post'], guardClaims: false });
    expect(r.failed).toBe(false);
    expect(r.checked.find((c) => c.requirementId === 'FORMAT·usual')?.materiality).toBe('PREFERRED');
  });

  it('no format, no format line: nothing is assumed about an unknown class', () => {
    expect(checkDraft('d', v, 'x'.repeat(300), { guardClaims: false }).checked.some((c) => c.requirementId.startsWith('FORMAT'))).toBe(false);
  });

  it('in a strict format, a "public" specific must trace to the person too', () => {
    const text = 'Global cloud spend passed $600 billion in 2024.';
    const sp = [{ sentence: 1, text: '$600 billion in 2024', kind: 'FIGURE' as const, attributed: false, source: 'PUBLIC' as const, support: '' }];
    expect(decideSpecifics(text, sp, '', '', false, 't', false).claims).toHaveLength(0);
    expect(decideSpecifics(text, sp, '', '', false, 't', true).claims).toHaveLength(1);
  });
});

describe('through the binary: a skill built for X holds its posts to 280 characters', () => {
  it('verify fails an over-long post, and says why', () => {
    const CLI = resolve('dist/cli/atelier.mjs');
    if (!existsSync(CLI)) throw new Error('build first');
    const data = mkdtempSync(join(tmpdir(), 'atelier-fmt-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-fmt-proj-'));
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
    const run = (...a: string[]): { out: string; code: number } => {
      try { return { out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }), code: 0 }; } catch (e) {
        const x = e as { stdout?: string; stderr?: string; status?: number }; return { out: `${x.stdout ?? ''}${x.stderr ?? ''}`, code: x.status ?? 1 };
      }
    };
    run('add', '--statement', 'Never say leverage.', '--kind', 'BOUNDARY', '--applies-when', 'GENERAL', '--materiality', 'REQUIRED', '--measure', 'LEXICON:leverage');
    run('ratify-close', '--work-type', 'writing');
    run('build', '--name', 'posts', '--class', 'x-post');
    const file = join(proj, 'p.md');
    writeFileSync(file, 'This post runs on and on. '.repeat(14));
    const r = run('verify', '--skill', 'posts', file);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/FORMAT/);
    expect(r.out).toMatch(/a post on X holds at most 280/);
  });
});
