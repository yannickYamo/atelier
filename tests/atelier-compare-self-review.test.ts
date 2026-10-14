// tests/atelier-compare-self-review.test.ts — THE SELF-REVIEW ARM AND THE PREFLIGHT OF THE COMPARISON RUNNER.
//
// The strongest baseline the pilot met was the method in the prompt plus one call that checks the draft against the
// method and the material and writes it again. It lived in a script of its own; the deciding study needs it in the
// runner every arm shares, on the same transport and the same cap. And a paid run is preceded by one call that shows
// whether the answers fit the token limit: a study once lost a third of its cells to truncation it found afterwards.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

let backend: ChildProcess; let port = 0;
beforeAll(async () => {
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok) => { backend.stdout!.on('data', (b: Buffer) => { const m = /PORT (\d+)/.exec(String(b)); if (m) ok(Number(m[1])); }); });
  await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_answer: { answer: 'First draft, with a figure the material lacks: 90%.' }, emit_review: { review: 'Step 1 done. The 90% is not in the material.', answer: 'Reviewed draft, the figure removed.' } } }) });
});
afterAll(() => { backend.kill(); });

const run = (args: string[]) => spawnSync(process.execPath, [resolve('bench/compare/run.mjs'), ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted', '--price-in', '1', '--price-out', '1'], { encoding: 'utf8' });

describe('self-review:<skill>', () => {
  it('writes, then checks and writes again; the second answer is the row, both calls are its cost', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-sr-'));
    writeFileSync(join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'a', prompt: 'Write the teardown.', material: 'Facts.' })}\n`);
    writeFileSync(join(dir, 'skill.md'), 'Method: open with the read; source every figure.');
    const out = join(dir, 'out.jsonl');
    const r = run(['--tasks', join(dir, 'tasks.jsonl'), '--arm', `self-review:${join(dir, 'skill.md')}`, '--out', out, '--condition', 'self-review']);
    expect(r.status, r.stderr).toBe(0);
    const row = JSON.parse(readFileSync(out, 'utf8').trim()) as { response: string; calls: number; arm: string; review: string };
    expect(row.response).toBe('Reviewed draft, the figure removed.');
    expect(row.calls).toBe(2);
    expect(row.arm).toMatch(/^self-review:/);
    expect(row.review).toMatch(/not in the material/);
  });
});

describe('--preflight', () => {
  it('one call on the first task, its tokens against the limit said, nothing recorded', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-pf-'));
    writeFileSync(join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'a', prompt: 'Write it.' })}\n${JSON.stringify({ id: 'b', prompt: 'Again.' })}\n`);
    const out = join(dir, 'out.jsonl');
    const r = run(['--tasks', join(dir, 'tasks.jsonl'), '--arm', 'none', '--out', out, '--preflight']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/preflight: task a, \d+ output token\(s\) of a limit of 4096; \$\d+\.\d+ for the call/);
    expect(existsSync(out)).toBe(false);
  });
});
