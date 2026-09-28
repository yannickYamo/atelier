// tests/atelier-phase-a-gate.test.ts — WHAT AN AUTOMATIC PROMOTION MAY NOT HIDE.
//
// Two gaps in the gate, pinned through the binary. A REQUIRED rule the owner took off the floor's
// composite (`--observe`) could regress under an automatic promotion, because the regression flag was
// hard-wired false. And an automatic promotion said "every instrument holding its authority" while most
// of the standard was read by no instrument at all. Both are now said, or refused, where it installs.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
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
const run = (data: string, proj: string, ...args: string[]): string => {
  try {
    return execFileSync('node', [CLI, ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'],
      { encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj } });
  } catch (e) { const x = e as { status?: number; stdout?: string; stderr?: string }; return `EXIT:${x.status}\n${x.stderr ?? ''}${x.stdout ?? ''}`; }
};

const seed = async (): Promise<{ data: string; proj: string }> => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-pa-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-pa-proj-'));
  run(data, proj, 'add', '--statement', 'Never say synergy.', '--kind', 'BOUNDARY', '--materiality', 'REQUIRED', '--measure', 'LEXICON:synergy');
  run(data, proj, 'add', '--statement', 'Never say leverage.', '--kind', 'BOUNDARY', '--materiality', 'REQUIRED', '--measure', 'LEXICON:leverage');
  run(data, proj, 'add', '--statement', 'Never say paradigm.', '--kind', 'BOUNDARY', '--materiality', 'REQUIRED', '--measure', 'LEXICON:paradigm');
  // A judgement rule: ratified, REQUIRED, and read by no instrument.
  run(data, proj, 'add', '--statement', 'Open on the concrete failure, not the thesis.', '--kind', 'GENERATIVE', '--materiality', 'REQUIRED');
  run(data, proj, 'ratify-close', '--work-type', 'writing');
  run(data, proj, 'build', '--name', 'focus');
  const corpus = join(proj, 'mine'); mkdirSync(corpus);
  for (const i of [1, 2, 3]) writeFileSync(join(corpus, `p${i}.md`), `Piece ${i}.`);
  const file = join(proj, 'tasks.txt');
  writeFileSync(file, Array.from({ length: 10 }, (_, i) => `Task ${i + 1}.`).join('\n\n'));
  // synergy and leverage block; paradigm is REQUIRED but only observed.
  run(data, proj, 'floor', '--skill', 'focus', '--corpus', corpus, '--tasks', file, '--enforce', '1', '--enforce', '2');
  await post({ byTool: { emit_piece: { piece: 'the synergy answer, synergy upon synergy' }, emit_proposals: { proposals: [{ change: 1, why: 'skimmed' }] } } });
  run(data, proj, 'floor', '--skill', 'focus', '--baseline');
  for (let i = 0; i < 6; i++) run(data, proj, 'floor', '--skill', 'focus', '--qualify');
  return { data, proj };
};

describe('through the binary: the gate says what nothing read, and a REQUIRED rule may not regress', () => {
  it('an automatic promotion names the ratified rules no instrument read', async () => {
    const { data, proj } = await seed();
    await post({ byTool: { emit_piece: { piece: 'the synergy answer, synergy upon synergy' }, emit_proposals: { proposals: [{ change: 1, why: 'skimmed' }] } },
      when: [{ contains: 'Before you finalize', answer: { piece: 'the plain answer' } }] });
    const out = run(data, proj, 'optimize', '--skill', 'focus', '--promote', '--cap', '50');
    expect(out).toContain('gate AUTO_PROMOTE');
    expect(out).toMatch(/Not read by any instrument: 1 ratified rule\(s\) \(x4\)/);
  }, 300_000);

  it('a REQUIRED rule marked OBSERVE that regresses is a deterministic regression: rejected, not installed', async () => {
    const { data, proj } = await seed();
    const L = { root: data, skillName: 'focus' };
    const before = store.getActive(L);
    // The candidate fixes the target (no synergy) by breaking the observed REQUIRED rule.
    await post({ byTool: { emit_piece: { piece: 'the synergy answer, synergy upon synergy' }, emit_proposals: { proposals: [{ change: 1, why: 'skimmed' }] } },
      when: [{ contains: 'Before you finalize', answer: { piece: 'the paradigm answer, paradigm upon paradigm' } }] });
    const out = run(data, proj, 'optimize', '--skill', 'focus', '--promote', '--cap', '50');
    expect(out).not.toContain('gate AUTO_PROMOTE');
    expect(out).toMatch(/gate AUTO_REJECT\. a previously-passing deterministic invariant now fails.*REQUIRED rule\(s\) .* regressed/);
    expect(store.getActive(L)).toBe(before);
  }, 300_000);
});
