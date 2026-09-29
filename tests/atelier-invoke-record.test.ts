// tests/atelier-invoke-record.test.ts — WHAT `invoke` DELIVERS WHEN A CALL FAILS, AND WHAT IT RECORDS.
//
// Driven through the binary against the scripted backend, because every defect here was invisible
// to a unit test: a draft call failing inside `runOnce`, a record missing what a study arm needs to
// be reproduced, a binding note that only the CLI prints.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;
const post = async (body: unknown): Promise<void> => {
  const send = (): Promise<Response> => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify(body) });
  try { await send(); } catch { await send(); }
};
beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run npm run build first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
});
afterAll(() => { backend.kill(); });
const run = (data: string, proj: string, args: readonly string[], env: Record<string, string> = {}): string => {
  try {
    return execFileSync('node', [CLI, ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'],
      { encoding: 'utf8', cwd: proj, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ...env } });
  } catch (e) { const x = e as { status?: number; stdout?: string; stderr?: string }; return `EXIT:${x.status}\n${x.stderr ?? ''}${x.stdout ?? ''}`; }
};

const built = (): { data: string; proj: string; L: store.StoreLayout } => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-inv-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-inv-proj-'));
  run(data, proj, ['add', '--statement', 'Never say leverage.', '--kind', 'BOUNDARY', '--materiality', 'REQUIRED', '--measure', 'LEXICON:leverage']);
  run(data, proj, ['ratify-close', '--work-type', 'writing']);
  run(data, proj, ['build', '--name', 'house']);
  return { data, proj, L: { root: data, skillName: 'house' } };
};

describe('a failed draft call costs that draft, not the run', () => {
  it('one of three draft calls fails: the other two are kept, one is delivered, the failure is recorded', async () => {
    const { data, proj, L } = built();
    await post({ byTool: { emit_piece: { piece: 'A plain note.' } }, failNext: 1 });
    const out = run(data, proj, ['invoke', '--skill', 'house', '--drafts', '3', '--claims', 'pattern', 'write a note']);
    expect(out).not.toMatch(/^EXIT/);
    expect(out).toContain('A plain note.');
    const rec = store.listInvocations(L)[0];
    expect(rec.selection).toMatchObject({ drafts: 3, written: 2 });
    expect(rec.selection?.failed).toHaveLength(1);
    expect(rec.selection?.failed?.[0]).toMatch(/HTTP 500/);
  }, 120_000);

  it('POLARITY — when every draft call fails there is nothing to deliver, and nothing is recorded', async () => {
    const { data, proj, L } = built();
    await post({ byTool: { emit_piece: { piece: 'A plain note.' } }, failNext: 3 });
    const out = run(data, proj, ['invoke', '--skill', 'house', '--drafts', '3', '--claims', 'pattern', 'write a note']);
    expect(out).toMatch(/^EXIT:1[\s\S]*HTTP 500/);
    expect(store.listInvocations(L)).toHaveLength(0);
  }, 120_000);
});
