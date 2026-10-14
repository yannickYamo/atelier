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

describe('review: the preflight judges each call, holds the cap, and says stop in its exit code', () => {
  it('a cap under one call is refused before anything is spent; a clean preflight exits 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-pf2-'));
    writeFileSync(join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'a', prompt: 'Write it.' })}\n`);
    writeFileSync(join(dir, 'skill.md'), 'Method.');
    const capped = run(['--tasks', join(dir, 'tasks.jsonl'), '--arm', `self-review:${join(dir, 'skill.md')}`, '--out', join(dir, 'o.jsonl'), '--preflight', '--cap', '0.3']);
    expect(capped.status).toBe(2);
    expect(capped.stderr).toMatch(/would pass the --cap of \$0\.3\. Nothing was spent/);
    const ok = run(['--tasks', join(dir, 'tasks.jsonl'), '--arm', `self-review:${join(dir, 'skill.md')}`, '--out', join(dir, 'o.jsonl'), '--preflight']);
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/in its longest call; \$\d+\.\d+ for the call \(2 calls\)/);
  });
});

describe('the runtime arm keeps Atelier\'s own verdict beside the answer', () => {
  it('a row of an atelier-runtime arm carries atelier_state, and the answer --answer-only would print', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-rt-')); const data = join(dir, 'data'); const proj = join(dir, 'proj');
    for (const d of [data, proj]) spawnSync('mkdir', ['-p', d]);
    writeFileSync(join(proj, 'example.md'), '# Review\n\nThe change is correct. One risk: the retry loop has no limit.\n');
    writeFileSync(join(proj, 'method.md'), '1. Name the one risk that matters most.\n2. Say whether the change is correct.\n');
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    const built = spawnSync(process.execPath, [resolve('dist/cli/atelier.mjs'), 'new', join(proj, 'example.md'), '--method', join(proj, 'method.md'), '--name', 'rev', '--yes'], { cwd: proj, env, encoding: 'utf8' });
    expect(built.status, built.stdout + built.stderr).toBe(0);
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: 'The change is correct. One risk: the cache is never cleared.' }, emit_observation: { applicable: true, present: true, why: 'seen' } } }) });
    writeFileSync(join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'a', prompt: 'Review this change.', material: 'diff --git a/x b/x\n+cache.set(k, v)\n' })}\n`);
    writeFileSync(join(dir, 'runtimes.json'), JSON.stringify({ rev: { cli: resolve('dist/cli/atelier.mjs'), data, proj, skill: 'rev',
      args: ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted', '--claims', 'pattern'] } }));
    const out = join(dir, 'rt.jsonl');
    const r = spawnSync(process.execPath, [resolve('bench/compare/run.mjs'), '--tasks', join(dir, 'tasks.jsonl'), '--arm', 'atelier-runtime:rev', '--runtimes', join(dir, 'runtimes.json'), '--out', out, '--condition', 'atelier', '--model', 'scripted'],
      { encoding: 'utf8', env: { ...env, ANTHROPIC_API_KEY: '' } });
    expect(r.status, r.stderr).toBe(0);
    const row = JSON.parse(readFileSync(out, 'utf8').trim()) as { response: string; atelier_state?: string; cost_usd: number };
    expect(row.response).toMatch(/The change is correct/);
    expect(['VERIFIED', 'NEEDS_REVIEW', 'BLOCKED']).toContain(row.atelier_state);
    expect(typeof row.cost_usd).toBe('number');
  });
});
