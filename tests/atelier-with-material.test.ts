// tests/atelier-with-material.test.ts — A FILE IS BOUND WITH A NAME; A BARE PATH IS REFUSED, NOT IGNORED.
//
// `--with notes.md` used to be read as a bare resource name: it bound nothing, the run was written with no
// material, and the model invented what the file would have supplied. Now a bare path is refused with the
// form that works, and `--with name=<file>` still binds the file.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');
const data = mkdtempSync(join(tmpdir(), 'atelier-with-'));
cpSync(resolve('tests/fixtures/v1-store'), data, { recursive: true });
const notes = join(data, 'notes.md');
writeFileSync(notes, 'The deploy failed at noon.');
const run = (...a: string[]): { code: number; out: string } => {
  try {
    return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: data, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: data }, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) { const x = e as { status?: number; stdout?: string; stderr?: string }; return { code: x.status ?? -1, out: `${x.stdout ?? ''}${x.stderr ?? ''}` }; }
};
const text = resolve('tests/fixtures/v1-store/texts/pass.md');

describe('--with', () => {
  it('a bare file path is refused, naming the form that binds it', () => {
    const r = run('verify', '--skill', 'locked', '--claims', 'pattern', '--with', notes, text);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/a file is bound with a name, --with notes=/);
  });
  it('name=<file> binds it, and a bare name still declares a resource', () => {
    expect(run('verify', '--skill', 'locked', '--claims', 'pattern', '--with', `notes=${notes}`, text).code).toBe(0);
    expect(run('verify', '--skill', 'locked', '--claims', 'pattern', '--with', 'incident-log', text).code).toBe(0);
  });
});
