// tests/atelier-compare-fair-harness.test.ts — THE COMPARISON RUNNER CANNOT MIX ARMS, OVERSPEND, OR HIDE THINKING.
//
// A published comparison is only as good as the file it is read from. These hold the runner to four promises:
// one output file is one arm with one set of settings (a manifest beside it, checked on every rerun); a runtime arm
// answers with the harness's model and limit and is handed the cap still left; every row says how steering and
// grammar ran; and the preflight stops a run whose answers carried thinking.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// No developer key or ATELIER_* setting decides what the runner does here.
const ENV: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ATELIER|ANTHROPIC|OPENAI)_/.test(k)));
const RUN = resolve('bench/compare/run.mjs');
let backend: ChildProcess; let port = 0;
const url = (): string => `http://127.0.0.1:${port}`;
const set = async (body: object): Promise<void> => { await fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify(body) }); };

beforeAll(async () => {
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok) => { backend.stdout!.on('data', (b: Buffer) => { const m = /PORT (\d+)/.exec(String(b)); if (m) ok(Number(m[1])); }); });
  await set({ byTool: { emit_answer: { answer: 'A short review.' } } });
});
afterAll(() => { backend.kill(); });

interface Ran { status: number | null; out: string; err: string }
const runner = (argv: string[], env: NodeJS.ProcessEnv = {}): Ran => {
  const r = spawnSync(process.execPath, [RUN, ...argv], { encoding: 'utf8', env: { ...ENV, ...env } });
  return { status: r.status, out: r.stdout, err: r.stderr };
};
const scripted = ['--provider', 'openai-compatible', '--base-url', '', '--model', 'scripted', '--price-in', '1', '--price-out', '1'];
const backendArgs = (): string[] => scripted.map((x) => (x === '' ? url() : x));
const work = (name: string): string => {
  const dir = mkdtempSync(join(tmpdir(), `atelier-fair-${name}-`));
  writeFileSync(join(dir, 'tasks.jsonl'), ['a', 'b'].map((id) => JSON.stringify({ id, prompt: `Review change ${id}.` })).join('\n') + '\n');
  writeFileSync(join(dir, 'skill.md'), 'Method: name the one risk.');
  writeFileSync(join(dir, 'other.md'), 'Method: a different skill.');
  return dir;
};
const rows = (file: string): Record<string, unknown>[] => readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);

describe('F8: one output file is one arm, with a manifest checked on every rerun', () => {
  it('the first write puts the manifest beside the file, with every setting that makes it one arm', () => {
    const dir = work('manifest'); const out = join(dir, 'o.jsonl');
    const r = runner(['--tasks', join(dir, 'tasks.jsonl'), '--arm', `skill:${join(dir, 'skill.md')}`, '--out', out, '--condition', 'plain', '--max-tokens', '2048', ...backendArgs()]);
    expect(r.status, r.err).toBe(0);
    const m = JSON.parse(readFileSync(`${out}.manifest.json`, 'utf8')) as Record<string, unknown>;
    const row = rows(out)[0];
    expect(m).toMatchObject({ runner: 'atelier-compare', condition: 'plain', arm: `skill:${join(dir, 'skill.md')}`, model: 'scripted', max_tokens: 2048, placement: 'system',
      split: 'unsealed', graded: null, grammar: 'default', provider: { provider: 'openai-compatible', base_url: url(), price_in: 1, price_out: 1 } });
    expect(m.tasks_sha256).toBe(row.tasks_sha256);
    expect(m.skill_sha256).toBe(row.skill_sha256);
    expect(typeof m.skill_sha256).toBe('string');
  });
  it('a rerun with another skill into the same file exits 2 and writes nothing', () => {
    const dir = work('other-skill'); const out = join(dir, 'o.jsonl');
    expect(runner(['--tasks', join(dir, 'tasks.jsonl'), '--arm', `skill:${join(dir, 'skill.md')}`, '--out', out, ...backendArgs()]).status).toBe(0);
    const before = readFileSync(out, 'utf8'); const mBefore = readFileSync(`${out}.manifest.json`, 'utf8');
    writeFileSync(join(dir, 'tasks.jsonl'), `${readFileSync(join(dir, 'tasks.jsonl'), 'utf8')}${JSON.stringify({ id: 'c', prompt: 'Review change c.' })}\n`);
    const r = runner(['--tasks', join(dir, 'tasks.jsonl'), '--arm', `skill:${join(dir, 'other.md')}`, '--out', out, ...backendArgs()]);
    expect(r.status).toBe(2);
    expect(r.err).toMatch(/was written by another arm or with other settings/);
    expect(r.err).toMatch(/skill_sha256/);
    expect(readFileSync(out, 'utf8')).toBe(before);
    expect(readFileSync(`${out}.manifest.json`, 'utf8')).toBe(mBefore);
  });
  it('a rerun with the same settings resumes; another model, limit, label or price exits 2 and writes nothing', () => {
    const dir = work('resume'); const out = join(dir, 'o.jsonl');
    const base = ['--tasks', join(dir, 'tasks.jsonl'), '--arm', 'none', '--out', out];
    expect(runner([...base, ...backendArgs()]).status).toBe(0);
    const before = readFileSync(out, 'utf8');
    const again = runner([...base, ...backendArgs()]);
    expect(again.status, again.err).toBe(0);
    expect(again.err).toMatch(/skip a trial 1 \(done\)/);
    for (const change of [['--max-tokens', '1024'], ['--condition', 'other']]) {
      const r = runner([...base, ...change, ...backendArgs()]);
      expect(r.status, change.join(' ')).toBe(2);
    }
    const otherModel = runner([...base, ...backendArgs().map((x) => (x === 'scripted' ? 'scripted-2' : x))]);
    expect(otherModel.status).toBe(2);
    expect(otherModel.err).toMatch(/model/);
    const otherPrice = runner([...base, ...backendArgs().map((x, i, a) => (a[i - 1] === '--price-out' ? '2' : x))]);
    expect(otherPrice.status).toBe(2);
    expect(otherPrice.err).toMatch(/provider/);
    expect(readFileSync(out, 'utf8')).toBe(before);
  });
  it('a row changed by hand, or rows with no manifest, are refused', () => {
    const dir = work('tampered'); const out = join(dir, 'o.jsonl');
    const base = ['--tasks', join(dir, 'tasks.jsonl'), '--arm', 'none', '--out', out];
    expect(runner([...base, ...backendArgs()]).status).toBe(0);
    const good = readFileSync(out, 'utf8');
    writeFileSync(out, good.replace(/"tasks_sha256":"[0-9a-f]+"/, '"tasks_sha256":"0000"'));
    const tampered = runner([...base, ...backendArgs()]);
    expect(tampered.status).toBe(2);
    expect(tampered.err).toMatch(/row 1 \(a\): tasks_sha256/);
    writeFileSync(out, good);
    const noManifest = join(dir, 'copy.jsonl'); writeFileSync(noManifest, good);
    const r = runner(['--tasks', join(dir, 'tasks.jsonl'), '--arm', 'none', '--out', noManifest, ...backendArgs()]);
    expect(r.status).toBe(2);
    expect(r.err).toMatch(/no .*manifest\.json, so what they were written with cannot be checked/);
    expect(readFileSync(noManifest, 'utf8')).toBe(good);
    expect(existsSync(`${noManifest}.manifest.json`)).toBe(false);
  });
});

/** A stand-in for `atelier invoke --json`: records its argv and prints the record given (exit 0). */
const fakeRuntime = (dir: string, record: object, args: string[] = ['--provider', 'openai-compatible', '--price-in', '1', '--price-out', '1']): string => {
  writeFileSync(join(dir, 'cli.mjs'), `import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(join(dir, 'argv.jsonl'))}, JSON.stringify(process.argv.slice(2)) + '\\n');
process.stdout.write(${JSON.stringify(JSON.stringify(record))});\n`);
  writeFileSync(join(dir, 'runtimes.json'), JSON.stringify({ s: { cli: join(dir, 'cli.mjs'), data: dir, proj: dir, skill: 's', args } }));
  return join(dir, 'runtimes.json');
};
const argvSeen = (dir: string): string[][] => (existsSync(join(dir, 'argv.jsonl')) ? rows(join(dir, 'argv.jsonl')) as unknown as string[][] : []);
const REC = { output: 'A review.', toCheck: [], costUsd: 0.01, model: 'claude-opus-5', maxTokens: 4096, steering: 'all', thinking: 'disabled', eval: { record: { state: 'VERIFIED', entries: [] }, spend: [] } };
const runtime = (dir: string, extra: string[] = [], env: NodeJS.ProcessEnv = {}): Ran =>
  runner(['--tasks', join(dir, 'tasks.jsonl'), '--arm', 'atelier-runtime:s', '--runtimes', join(dir, 'runtimes.json'), '--out', join(dir, 'rt.jsonl'), '--condition', 'atelier', ...extra], env);

describe('F8: a runtime arm answers with the harness\'s model and limit, within the cap left', () => {
  it('a runtime build that names --model, --target-model or --max-tokens is refused before anything is spawned', () => {
    for (const bad of [['--model', 'cheap-7b'], ['--target-model', 'cheap-7b'], ['--max-tokens', '99999'], ['--model=cheap-7b']]) {
      const dir = work('override'); fakeRuntime(dir, REC, ['--provider', 'openai-compatible', '--price-in', '1', '--price-out', '1', ...bad]);
      const r = runtime(dir);
      expect(r.status, bad.join(' ')).toBe(2);
      expect(r.err).toMatch(/The harness gives every arm its model/);
      expect(argvSeen(dir)).toHaveLength(0);
      expect(existsSync(join(dir, 'rt.jsonl'))).toBe(false);
    }
  });
  it('a run whose record names another model, or another limit, stops the arm and writes no row', () => {
    for (const [rec, said] of [[{ ...REC, model: 'local-7b' }, /its model was "local-7b", not "claude-opus-5"/], [{ ...REC, maxTokens: 12000 }, /its token limit was 12000, not 4096/],
      [{ ...REC, model: undefined }, /its model was not recorded/]] as const) {
      const dir = work('mismatch'); fakeRuntime(dir, rec);
      const r = runtime(dir);
      expect(r.status).toBe(2);
      expect(r.err).toMatch(said);
      expect(existsSync(join(dir, 'rt.jsonl'))).toBe(false);
    }
  });
  it('a dated snapshot of the harness\'s model is the same model', () => {
    const dir = work('snapshot'); fakeRuntime(dir, { ...REC, model: 'claude-opus-5-20261001' });
    const r = runtime(dir);
    expect(r.status, r.err).toBe(0);
    expect(rows(join(dir, 'rt.jsonl'))[0].model).toBe('claude-opus-5-20261001');
  });
  it('an openai-compatible runtime arm with no price is refused before anything is spawned', () => {
    const dir = work('unpriced'); fakeRuntime(dir, REC, ['--provider', 'openai-compatible', '--base-url', 'http://127.0.0.1:1']);
    const r = runtime(dir);
    expect(r.status).toBe(2);
    expect(r.err).toMatch(/calls openai-compatible with no price, so the cap could not hold/);
    expect(argvSeen(dir)).toHaveLength(0);
    // priced on the runner instead, the prices are handed on to the run
    const ok = runtime(dir, ['--price-in', '3', '--price-out', '15']);
    expect(ok.status, ok.err).toBe(0);
    const argv = argvSeen(dir)[0];
    expect(argv.slice(argv.indexOf('--price-in'), argv.indexOf('--price-in') + 4)).toEqual(['--price-in', '3', '--price-out', '15']);
  });
  it('an openai-compatible runtime arm with a cap below one cell refuses before spawning', () => {
    const dir = work('small-cap'); fakeRuntime(dir, REC);
    const r = runtime(dir, ['--cap', '0.1']);
    expect(r.status).toBe(3);
    expect(r.err).toMatch(/would pass the --cap of \$0\.1/);
    expect(argvSeen(dir)).toHaveLength(0);
    expect(existsSync(join(dir, 'rt.jsonl'))).toBe(false);
  });
  it('each run is handed the harness\'s model and limit, and the cap still left as its own --cap', () => {
    const dir = work('cap-left'); fakeRuntime(dir, { ...REC, costUsd: 0.4 });
    const r = runtime(dir, ['--cap', '2', '--per-call', '0.5']);
    expect(r.status, r.err).toBe(0);
    const [first, second] = argvSeen(dir);
    const after = (a: string[], f: string): string => a[a.indexOf(f) + 1];
    expect(after(first, '--target-model')).toBe('claude-opus-5');
    expect(after(first, '--max-tokens')).toBe('4096');
    expect(Number(after(first, '--cap'))).toBe(2);
    // 2 - 0.4 spent on the first task
    expect(Number(after(second, '--cap'))).toBeCloseTo(1.6, 6);
  });
});

describe('F9: every row says how steering and grammar ran', () => {
  it('a runtime row carries the steering its record says, and the grammar setting', () => {
    const dir = work('pinned'); fakeRuntime(dir, REC);
    const r = runtime(dir, [], { ATELIER_GRAMMAR: 'stub' });
    expect(r.status, r.err).toBe(0);
    expect(rows(join(dir, 'rt.jsonl'))[0]).toMatchObject({ graded: 'all', grammar: 'stub' });
    // grammar run another way is another setting: the file is not resumed with it
    const other = runtime(dir, [], { ATELIER_GRAMMAR: 'off' });
    expect(other.status).toBe(2);
    expect(other.err).toMatch(/grammar: "stub" -> "off"/);
  });
  it('--graded none is a declared arm setting, passed to the run and held against its record', () => {
    const dir = work('graded-none'); fakeRuntime(dir, { ...REC, steering: 'none' });
    const r = runtime(dir, ['--graded', 'none']);
    expect(r.status, r.err).toBe(0);
    expect(argvSeen(dir)[0]).toEqual(expect.arrayContaining(['--graded', 'none']));
    expect(rows(join(dir, 'rt.jsonl'))[0].graded).toBe('none');
    expect(JSON.parse(readFileSync(join(dir, 'rt.jsonl.manifest.json'), 'utf8')).graded).toBe('none');
    // declared without steering, a record that steered is another arm
    const dir2 = work('graded-mismatch'); fakeRuntime(dir2, REC);
    const bad = runtime(dir2, ['--graded', 'none']);
    expect(bad.status).toBe(2);
    expect(bad.err).toMatch(/its steering was "all", not "none"/);
    expect(existsSync(join(dir2, 'rt.jsonl'))).toBe(false);
  });
  it('a model arm row says it had no steering; --graded on a model arm is refused', () => {
    const dir = work('model-arm'); const out = join(dir, 'o.jsonl');
    expect(runner(['--tasks', join(dir, 'tasks.jsonl'), '--arm', 'none', '--out', out, ...backendArgs()]).status).toBe(0);
    expect(rows(out)[0]).toMatchObject({ graded: null, grammar: 'default' });
    const r = runner(['--tasks', join(dir, 'tasks.jsonl'), '--arm', 'none', '--out', join(dir, 'x.jsonl'), '--graded', 'none', ...backendArgs()]);
    expect(r.status).toBe(2);
    expect(r.err).toMatch(/a model arm has no steering/);
  });
  it('a real atelier invoke records its model, limit and steering, and the runner reads them', async () => {
    const dir = work('real'); const data = join(dir, 'data'); const proj = join(dir, 'proj');
    mkdirSync(data); mkdirSync(proj);
    writeFileSync(join(proj, 'example.md'), '# Review\n\nThe change is correct. One risk: the retry loop has no limit.\n');
    writeFileSync(join(proj, 'method.md'), '1. Name the one risk that matters most.\n2. Say whether the change is correct.\n');
    const env = { ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    const built = spawnSync(process.execPath, [resolve('dist/cli/atelier.mjs'), 'new', join(proj, 'example.md'), '--method', join(proj, 'method.md'), '--name', 'rev', '--yes'], { cwd: proj, env: { ...ENV, ...env }, encoding: 'utf8' });
    expect(built.status, built.stdout + built.stderr).toBe(0);
    writeFileSync(join(dir, 'runtimes.json'), JSON.stringify({ s: { cli: resolve('dist/cli/atelier.mjs'), data, proj, skill: 'rev',
      args: ['--provider', 'openai-compatible', '--base-url', url(), '--claims', 'pattern'] } }));
    await set({ byTool: { emit_piece: { piece: 'The change is correct. One risk: the cache is never cleared.' }, emit_observation: { applicable: true, present: true, why: 'seen' } } });
    {
      const on = runtime(dir, ['--model', 'scripted', '--max-tokens', '3000'], env);
      expect(on.status, on.err).toBe(0);
      expect(rows(join(dir, 'rt.jsonl'))[0]).toMatchObject({ model: 'scripted', max_tokens: 3000, graded: 'all' });
      const off = runner(['--tasks', join(dir, 'tasks.jsonl'), '--arm', 'atelier-runtime:s', '--runtimes', join(dir, 'runtimes.json'), '--out', join(dir, 'off.jsonl'),
        '--condition', 'atelier-unsteered', '--graded', 'none', '--model', 'scripted', '--max-tokens', '3000'], env);
      expect(off.status, off.err).toBe(0);
      expect(rows(join(dir, 'off.jsonl'))[0]).toMatchObject({ graded: 'none' });
    }
  }, 120_000);
});

describe('F10: the preflight stops a run whose answers carried thinking', () => {
  const preflight = (dir: string): Ran => runner(['--tasks', join(dir, 'tasks.jsonl'), '--arm', `skill:${join(dir, 'skill.md')}`, '--out', join(dir, 'p.jsonl'), '--preflight', ...backendArgs()]);
  it('a response that held reasoning beside its answer exits 2, recording nothing', async () => {
    const dir = work('pf-thinking');
    await set({ byTool: { emit_answer: { answer: 'A short review.' } }, when: [{ contains: 'Review change a', answer: { answer: 'A short review.' }, reasoning: 'Let me think about the change first.' }] });
    const r = preflight(dir);
    expect(r.status).toBe(2);
    expect(r.out).toMatch(/the response held 1 thinking block\(s\)/);
    expect(existsSync(join(dir, 'p.jsonl'))).toBe(false);
    expect(existsSync(join(dir, 'p.jsonl.manifest.json'))).toBe(false);
  });
  it('output tokens far above what the answer accounts for exit 2', async () => {
    const dir = work('pf-tokens');
    await set({ byTool: { emit_answer: { answer: 'A short review.' } }, when: [{ contains: 'Review change a', answer: { answer: 'A short review.' }, usage: { prompt_tokens: 10, completion_tokens: 2000 } }] });
    const r = preflight(dir);
    expect(r.status).toBe(2);
    expect(r.out).toMatch(/billed 2000 output token\(s\) for an answer of about \d+/);
  });
  it('a clean answer passes', async () => {
    const dir = work('pf-clean');
    await set({ byTool: { emit_answer: { answer: 'A short review.' } }, when: [{ contains: 'Review change a', answer: { answer: 'A short review.' }, usage: { prompt_tokens: 10, completion_tokens: 12 } }] });
    const r = preflight(dir);
    expect(r.status, r.out + r.err).toBe(0);
    await set({ byTool: { emit_answer: { answer: 'A short review.' } } });
  });
});

describe('F10: the Anthropic provider counts the thinking blocks of a response', () => {
  let server: Server; let base = ''; let thinking = true;
  beforeAll(async () => {
    server = createServer((req, res) => {
      req.resume(); req.on('end', () => {
        res.setHeader('content-type', 'application/json'); res.setHeader('connection', 'close');
        res.end(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'tool_use', stop_sequence: null,
          content: [...(thinking ? [{ type: 'thinking', thinking: 'First, the change.', signature: 's' }, { type: 'redacted_thinking', data: 'x' }] : []),
            { type: 'tool_use', id: 't', name: 'emit_answer', input: { answer: 'A short review.' } }], usage: { input_tokens: 10, output_tokens: 12 } }));
      });
    });
    await new Promise<void>((ok) => { server.listen(0, '127.0.0.1', () => { ok(); }); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => { server.closeAllConnections(); server.close(); });
  const pf = (dir: string): Promise<{ status: number | null; out: string }> => new Promise((ok) => {
    const p = spawn(process.execPath, [RUN, '--tasks', join(dir, 'tasks.jsonl'), '--arm', 'none', '--out', join(dir, 'p.jsonl'), '--preflight', '--model', 'claude-opus-5'],
      { env: { ...ENV, ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: base } });
    let out = ''; p.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    p.on('close', (status) => { ok({ status, out }); });
  });
  it('two thinking blocks stop the preflight; none passes it', async () => {
    const dir = work('pf-anthropic');
    thinking = true;
    const r = await pf(dir);
    expect(r.status, r.out).toBe(2);
    expect(r.out).toMatch(/the response held 2 thinking block\(s\)/);
    thinking = false;
    const ok = await pf(dir);
    expect(ok.status, ok.out).toBe(0);
  });
});
