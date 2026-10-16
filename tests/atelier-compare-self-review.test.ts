// tests/atelier-compare-self-review.test.ts — THE SELF-REVIEW ARM AND THE PREFLIGHT OF THE COMPARISON RUNNER.
//
// The strongest baseline the pilot met was the method in the prompt plus one call that checks the draft against the
// method and the material and writes it again. It lived in a script of its own; the deciding study needs it in the
// runner every arm shares, on the same transport and the same cap. And a paid run is preceded by one call that shows
// whether the answers fit the token limit: a study once lost a third of its cells to truncation it found afterwards.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
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
      args: ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--claims', 'pattern'] } }));
    const out = join(dir, 'rt.jsonl');
    const r = spawnSync(process.execPath, [resolve('bench/compare/run.mjs'), '--tasks', join(dir, 'tasks.jsonl'), '--arm', 'atelier-runtime:rev', '--runtimes', join(dir, 'runtimes.json'), '--out', out, '--condition', 'atelier', '--model', 'scripted'],
      { encoding: 'utf8', env: { ...env, ANTHROPIC_API_KEY: '' } });
    expect(r.status, r.stderr).toBe(0);
    const row = JSON.parse(readFileSync(out, 'utf8').trim()) as { response: string; atelier_state?: string; cost_usd: number };
    expect(row.response).toMatch(/The change is correct/);
    expect(['VERIFIED', 'NEEDS_REVIEW', 'BLOCKED']).toContain(row.atelier_state);
    expect(typeof row.cost_usd).toBe('number');
    expect((row as { calls?: number }).calls).toBeGreaterThan(0);
  });
});

describe('review: a strict refusal on the runtime arm is a row with its verdict and its cost', () => {
  // A stand-in for `atelier invoke --json` that answers the way a strict refusal does: the record on stdout with no
  // output, the refusal on stderr, exit 3. What is under test is how the runner records it.
  it('is written with no response, its reasons, atelier_state, the record\'s cost, its calls and seconds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-rt-strict-'));
    const record = { output: null, answer: null, delivered: false, costUsd: 0.0123, model: 'scripted', maxTokens: 4096, steering: 'all',
      eval: { record: { state: 'BLOCKED' }, spend: [{ purpose: 'draft', usd: 0.01, calls: 3, inputTokens: 900, outputTokens: 300 }, { purpose: 'claims', usd: 0.0023, calls: 2, inputTokens: 400, outputTokens: 50 }] } };
    writeFileSync(join(dir, 'cli.mjs'), `process.stdout.write(${JSON.stringify(JSON.stringify(record))});
process.stderr.write('atelier: not delivered (strict delivery): p1 is broken; p2 is broken. The text is kept with the record: atelier report x.\\n');
process.exitCode = 3;\n`);
    writeFileSync(join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'a', prompt: 'Review this change.' })}\n`);
    writeFileSync(join(dir, 'runtimes.json'), JSON.stringify({ s: { cli: join(dir, 'cli.mjs'), data: dir, proj: dir, skill: 's', args: ['--provider', 'openai-compatible', '--price-in', '1', '--price-out', '1'] } }));
    const out = join(dir, 'rt.jsonl');
    const r = spawnSync(process.execPath, [resolve('bench/compare/run.mjs'), '--tasks', join(dir, 'tasks.jsonl'), '--arm', 'atelier-runtime:s', '--runtimes', join(dir, 'runtimes.json'), '--out', out, '--condition', 'atelier', '--model', 'scripted'],
      { encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: '' } });
    expect(r.status, r.stderr).toBe(0);
    const row = JSON.parse(readFileSync(out, 'utf8').trim()) as Record<string, unknown>;
    expect(row).toMatchObject({ response: null, delivered: false, reasons: ['p1 is broken', 'p2 is broken'], atelier_state: 'BLOCKED', cost_usd: 0.0123, calls: 5,
      usage: { input_tokens: 1300, output_tokens: 350 } });
    expect(typeof row.seconds).toBe('number');
  });
  it('a CLI from before the answer field is refused, not recorded without its list', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-rt-old-'));
    writeFileSync(join(dir, 'cli.mjs'), `import { appendFileSync } from 'node:fs'; appendFileSync(${JSON.stringify(join(dir, 'calls'))}, 'x');
process.stdout.write(${JSON.stringify(JSON.stringify({ output: 'Merge it.', costUsd: 0.01, eval: { record: { state: 'NEEDS_REVIEW' } } }))});\n`);
    writeFileSync(join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'a', prompt: 'Review this change.' })}\n`);
    writeFileSync(join(dir, 'runtimes.json'), JSON.stringify({ s: { cli: join(dir, 'cli.mjs'), data: dir, proj: dir, skill: 's', args: ['--provider', 'openai-compatible', '--price-in', '1', '--price-out', '1'] } }));
    const r = spawnSync(process.execPath, [resolve('bench/compare/run.mjs'), '--tasks', join(dir, 'tasks.jsonl'), '--arm', 'atelier-runtime:s', '--runtimes', join(dir, 'runtimes.json'), '--out', join(dir, 'o.jsonl'), '--model', 'scripted'],
      { encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: '' } });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/gives no "output" and "toCheck"/);
    // a setup error stops at once: retried, it would pay for the same run three times
    expect(readFileSync(join(dir, 'calls'), 'utf8')).toBe('x');
    expect(existsSync(join(dir, 'o.jsonl'))).toBe(false);
  });
});

describe('the judge reads the review, never the footer only Atelier writes', () => {
  it('a code-review run with a listed specific records the review as delivered, and the list as to_check', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-rt-footer-')); const data = join(dir, 'data'); const proj = join(dir, 'proj');
    for (const d of [data, proj]) spawnSync('mkdir', ['-p', d]);
    writeFileSync(join(proj, 'example.md'), '# Review\n\nThe change is correct. One risk: the retry loop has no limit.\n');
    writeFileSync(join(proj, 'method.md'), '1. Say whether the change is correct.\n2. Name the one risk that matters most.\n3. Locate it by file and line.\n');
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    const built = spawnSync(process.execPath, [resolve('dist/cli/atelier.mjs'), 'new', join(proj, 'example.md'), '--method', join(proj, 'method.md'), '--name', 'rev', '--yes'], { cwd: proj, env, encoding: 'utf8' });
    expect(built.status, built.stdout + built.stderr).toBe(0);
    const review = 'The change is correct. One risk: 95% of callers hit the retry path on line 40.';
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: review }, emit_observation: { applicable: true, present: true, why: 'seen' },
      emit_specifics: { specifics: [{ sentence: 2, text: '95% of callers', kind: 'FIGURE', attributed: false, source: 'NONE', support: '' }] } } }) });
    writeFileSync(join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'a', prompt: 'Review this change.', material: 'diff --git a/r.ts b/r.ts\n+for (;;) retry()\n' })}\n`);
    writeFileSync(join(dir, 'runtimes.json'), JSON.stringify({ rev: { cli: resolve('dist/cli/atelier.mjs'), data, proj, skill: 'rev',
      args: ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--claims', 'model', '--claims-model', 'scripted'] } }));
    const out = join(dir, 'rt.jsonl');
    const r = spawnSync(process.execPath, [resolve('bench/compare/run.mjs'), '--tasks', join(dir, 'tasks.jsonl'), '--arm', 'atelier-runtime:rev', '--runtimes', join(dir, 'runtimes.json'), '--out', out, '--condition', 'atelier', '--model', 'scripted'],
      { encoding: 'utf8', env: { ...env, ANTHROPIC_API_KEY: '' } });
    expect(r.status, r.stderr).toBe(0);
    const row = JSON.parse(readFileSync(out, 'utf8').trim()) as { response: string; to_check: string[]; unverified: number; failed: number; claims_instrument: string | null };
    expect(row.response).toContain('95% of callers');
    expect(row.response).not.toMatch(/Not found in what you supplied/);
    expect(row.to_check).toHaveLength(1);
    expect(typeof row.unverified).toBe('number');
    expect(typeof row.failed).toBe('number');
  });
});

describe('a filtered or declined task is a row, and the arm goes on', () => {
  const tasks3 = (dir: string) => { writeFileSync(join(dir, 'tasks.jsonl'), ['a', 'b', 'c'].map((id) => JSON.stringify({ id, prompt: `Review change ${id.toUpperCase()}-ID.` })).join('\n') + '\n'); };
  const count = async (): Promise<number> => ((await (await fetch(`http://127.0.0.1:${port}/__count`)).json()) as { count: number }).count;
  it('a provider filter on task b: three rows, b FILTERED with no response, called once, the run exits 0', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-filter-')); tasks3(dir); writeFileSync(join(dir, 'skill.md'), 'Method.');
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_answer: { answer: 'A review.' } }, when: [{ contains: 'B-ID', finish: 'content_filter' }] }) });
    const before = await count();
    const out = join(dir, 'o.jsonl');
    const r = run(['--tasks', join(dir, 'tasks.jsonl'), '--arm', `skill:${join(dir, 'skill.md')}`, '--out', out, '--condition', 'plain']);
    expect(r.status, r.stderr).toBe(0);
    expect(await count() - before).toBe(3);
    const rows = readFileSync(out, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(rows.map((x) => x.case_id)).toEqual(['a', 'b', 'c']);
    expect(rows[1]).toMatchObject({ response: null, delivered: false, filtered: 'CONTENT_FILTER', cost_estimated: true });
    expect(typeof rows[1].cost_usd).toBe('number');
    expect(rows[0].response).toBe('A review.');
    expect(r.stderr).toMatch(/filtered: 1 of 3 rows \(plain\)/);
  });
  it('on the self-review arm, a filter on the second call is a FILTERED row that says which call', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-filter-sr-')); tasks3(dir); writeFileSync(join(dir, 'skill.md'), 'Method.');
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_answer: { answer: 'Draft.' }, emit_review: { review: 'ok', answer: 'Reviewed.' } },
      when: [{ containsAll: ['B-ID', 'Your draft:'], finish: 'content_filter' }] }) });
    const out = join(dir, 'o.jsonl');
    const r = run(['--tasks', join(dir, 'tasks.jsonl'), '--arm', `self-review:${join(dir, 'skill.md')}`, '--out', out, '--condition', 'self-review']);
    expect(r.status, r.stderr).toBe(0);
    const rows = readFileSync(out, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(rows[1]).toMatchObject({ response: null, filtered: 'CONTENT_FILTER', filtered_call: 2, calls: 2 });
    expect(rows[2].response).toBe('Reviewed.');
  });
  it('a transport failure on every call still stops after three attempts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-down-')); tasks3(dir); writeFileSync(join(dir, 'skill.md'), 'Method.');
    const r = spawnSync(process.execPath, [resolve('bench/compare/run.mjs'), '--tasks', join(dir, 'tasks.jsonl'), '--arm', `skill:${join(dir, 'skill.md')}`, '--out', join(dir, 'o.jsonl'),
      '--provider', 'openai-compatible', '--base-url', 'http://127.0.0.1:1', '--model', 'scripted', '--price-in', '1', '--price-out', '1'], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/a: attempt 3 failed/);
    expect(r.stderr).toMatch(/failed three times/);
  });
  it('a runtime run whose call was filtered is a FILTERED row, not a failure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-rt-filter-'));
    writeFileSync(join(dir, 'cli.mjs'), `process.stderr.write('atelier: openai-compatible filtered the response (finish_reason: content_filter). Nothing was recorded.\\n'); process.exitCode = 1;\n`);
    writeFileSync(join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'a', prompt: 'Review this change.' })}\n`);
    writeFileSync(join(dir, 'runtimes.json'), JSON.stringify({ s: { cli: join(dir, 'cli.mjs'), data: dir, proj: dir, skill: 's', args: ['--provider', 'openai-compatible', '--price-in', '1', '--price-out', '1'] } }));
    const out = join(dir, 'o.jsonl');
    const r = spawnSync(process.execPath, [resolve('bench/compare/run.mjs'), '--tasks', join(dir, 'tasks.jsonl'), '--arm', 'atelier-runtime:s', '--runtimes', join(dir, 'runtimes.json'), '--out', out, '--model', 'scripted'],
      { encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: '' } });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(readFileSync(out, 'utf8').trim())).toMatchObject({ response: null, filtered: 'CONTENT_FILTER', cost_estimated: true });
  });
});

describe('review: a filter reported as an HTTP 400, and the cost of a filtered call', () => {
  // The Anthropic API reports its own output filter as a 400 ("Output blocked by content filtering policy"), not as a
  // stop reason, so it reached the runner as a plain failure: retried three times, then the arm stopped.
  let server: Server; let base = ''; let calls = 0;
  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = ''; req.on('data', (c: Buffer) => { body += c.toString(); });
      req.on('end', () => {
        calls += 1; res.setHeader('content-type', 'application/json'); res.setHeader('connection', 'close');
        if (body.includes('B-ID')) { res.statusCode = 400; res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Output blocked by content filtering policy' } })); return; }
        res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'tool_use', stop_sequence: null,
          content: [{ type: 'tool_use', id: 't', name: 'emit_answer', input: { answer: 'A review.' } }], usage: { input_tokens: 10, output_tokens: 10 } }));
      });
    });
    await new Promise<void>((ok) => { server.listen(0, '127.0.0.1', () => { ok(); }); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => { server.closeAllConnections(); server.close(); });
  it('is a FILTERED row, sent once, and the arm goes on', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-400-filter-'));
    writeFileSync(join(dir, 'tasks.jsonl'), ['a', 'b', 'c'].map((id) => JSON.stringify({ id, prompt: `Review change ${id.toUpperCase()}-ID.` })).join('\n') + '\n');
    writeFileSync(join(dir, 'skill.md'), 'Method.');
    const out = join(dir, 'o.jsonl'); calls = 0;
    // spawned without blocking: the fake API above answers on this process's event loop
    const r = await new Promise<{ status: number | null; stderr: string }>((ok) => {
      const p = spawn(process.execPath, [resolve('bench/compare/run.mjs'), '--tasks', join(dir, 'tasks.jsonl'), '--arm', `skill:${join(dir, 'skill.md')}`, '--out', out, '--model', 'claude-opus-5', '--per-call', '0.3'],
        { env: { ...process.env, ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: base } });
      let stderr = ''; p.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      p.on('close', (status) => { ok({ status, stderr }); });
    });
    expect(r.status, r.stderr).toBe(0);
    expect(calls).toBe(3);
    const rows = readFileSync(out, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    // charged one call's allowance, marked an estimate
    expect(rows[1]).toMatchObject({ response: null, filtered: 'CONTENT_FILTER', cost_estimated: true, cost_usd: 0.3 });
    expect(rows[2].response).toBe('A review.');
  });
  it('a filtered second self-review call is charged one call plus the first call\'s real cost, not a whole cell more', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-filter-cost-'));
    writeFileSync(join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'b', prompt: 'Review change B-ID2.' })}\n`);
    writeFileSync(join(dir, 'skill.md'), 'Method.');
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_answer: { answer: 'Draft.' }, emit_review: { review: 'ok', answer: 'R.' } },
      when: [{ containsAll: ['B-ID2', 'Your draft:'], finish: 'content_filter' }] }) });
    const out = join(dir, 'o.jsonl');
    const r = run(['--tasks', join(dir, 'tasks.jsonl'), '--arm', `self-review:${join(dir, 'skill.md')}`, '--out', out, '--per-call', '0.4']);
    expect(r.status, r.stderr).toBe(0);
    const row = JSON.parse(readFileSync(out, 'utf8').trim()) as { cost_usd: number; filtered_call: number; usage: { output_tokens?: number } };
    expect(row.filtered_call).toBe(2);
    expect(row.cost_usd).toBeGreaterThanOrEqual(0.4);
    expect(row.cost_usd).toBeLessThan(0.41);
    expect(row.usage.output_tokens).toBeGreaterThan(0);
  });
  it('a runtime run stopped by a 400 filter, or refused by an OpenAI-compatible backend, is a FILTERED row', () => {
    for (const [msg, kind] of [['atelier: 400 {"type":"error","error":{"message":"Output blocked by content filtering policy"}}', 'CONTENT_FILTER'],
      ['atelier: openai-compatible refused the request: I cannot help with that. No candidates were produced.', 'REFUSAL']] as const) {
      const dir = mkdtempSync(join(tmpdir(), 'atelier-rt-400-'));
      writeFileSync(join(dir, 'cli.mjs'), `process.stderr.write(${JSON.stringify(msg + '\n')}); process.exitCode = 1;\n`);
      writeFileSync(join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 'a', prompt: 'Review this change.' })}\n`);
      writeFileSync(join(dir, 'runtimes.json'), JSON.stringify({ s: { cli: join(dir, 'cli.mjs'), data: dir, proj: dir, skill: 's', args: ['--provider', 'openai-compatible', '--price-in', '1', '--price-out', '1'] } }));
      const out = join(dir, 'o.jsonl');
      const r = spawnSync(process.execPath, [resolve('bench/compare/run.mjs'), '--tasks', join(dir, 'tasks.jsonl'), '--arm', 'atelier-runtime:s', '--runtimes', join(dir, 'runtimes.json'), '--out', out, '--model', 'scripted'],
        { encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: '' } });
      expect(r.status, r.stderr).toBe(0);
      expect(JSON.parse(readFileSync(out, 'utf8').trim())).toMatchObject({ response: null, filtered: kind });
    }
  });
});

describe('a blocked runtime run is a row, never a failed call', () => {
  it('exit 1 with a BLOCKED record is recorded once, with its state, and the arm goes on', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atelier-rt-blocked-'));
    const rec = { output: 'A review.', toCheck: [], costUsd: 0.01, invocationId: 'i1', model: 'scripted', maxTokens: 4096, steering: 'all', eval: { record: { state: 'BLOCKED', entries: [] }, spend: [] } };
    writeFileSync(join(dir, 'calls'), '');
    writeFileSync(join(dir, 'cli.mjs'), `import { appendFileSync } from 'node:fs'; appendFileSync(${JSON.stringify(join(dir, 'calls'))}, 'x'); process.stdout.write(${JSON.stringify(JSON.stringify(rec))}); process.exitCode = 1;\n`);
    writeFileSync(join(dir, 'tasks.jsonl'), ['a', 'b'].map((id) => JSON.stringify({ id, prompt: `Review change ${id}.` })).join('\n') + '\n');
    writeFileSync(join(dir, 'runtimes.json'), JSON.stringify({ s: { cli: join(dir, 'cli.mjs'), data: dir, proj: dir, skill: 's', args: ['--provider', 'openai-compatible', '--price-in', '1', '--price-out', '1'] } }));
    const out = join(dir, 'o.jsonl');
    const r = spawnSync(process.execPath, [resolve('bench/compare/run.mjs'), '--tasks', join(dir, 'tasks.jsonl'), '--arm', 'atelier-runtime:s', '--runtimes', join(dir, 'runtimes.json'), '--out', out, '--model', 'scripted'],
      { encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: '' } });
    expect(r.status, r.stderr).toBe(0);
    const rows = readFileSync(out, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ response: 'A review.', atelier_state: 'BLOCKED' });
    // once per task: never retried
    expect(readFileSync(join(dir, 'calls'), 'utf8')).toBe('xx');
  });
});
