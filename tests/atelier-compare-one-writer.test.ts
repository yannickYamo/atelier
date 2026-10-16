// tests/atelier-compare-one-writer.test.ts — ONE RUNNER WRITES ONE OUTPUT FILE AT A TIME.
//
// The manifest check reads the file once, at the start. Two runners started together on the same new path both found
// it empty, both passed the check, and both appended: one file, two arms' rows interleaved. The runner now claims the
// file first (`<out>.lock`, created exclusively) and holds it until it exits, by any route; a second runner exits 2
// and writes nothing. A lock left by a killed runner is never taken over: the message names the file to delete.
import { describe, it, expect } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ENV: NodeJS.ProcessEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ATELIER|ANTHROPIC|OPENAI)_/.test(k)));
const RUN = resolve('bench/compare/run.mjs');
const REC = { output: 'A review.', toCheck: [], costUsd: 0.01, model: 'claude-opus-5', maxTokens: 4096, steering: 'all', skillVersion: 'v1', thinking: 'disabled', eval: { record: { state: 'VERIFIED', entries: [] }, spend: [] } };

/** A stand-in for `atelier invoke --json` that takes `ms` to answer, so two runners overlap. */
const work = (ms: number, record: object = REC): string => {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-one-writer-'));
  writeFileSync(join(dir, 'tasks.jsonl'), ['a', 'b'].map((id) => JSON.stringify({ id, prompt: `Review change ${id}.` })).join('\n') + '\n');
  writeFileSync(join(dir, 'cli.mjs'), `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ${ms});\nprocess.stdout.write(${JSON.stringify(JSON.stringify(record))});\n`);
  writeFileSync(join(dir, 'runtimes.json'), JSON.stringify({ s: { cli: join(dir, 'cli.mjs'), data: dir, proj: dir, skill: 's', args: ['--provider', 'openai-compatible', '--price-in', '1', '--price-out', '1'] } }));
  return dir;
};
const argvFor = (dir: string, condition: string): string[] =>
  [RUN, '--tasks', join(dir, 'tasks.jsonl'), '--arm', 'atelier-runtime:s', '--runtimes', join(dir, 'runtimes.json'), '--out', join(dir, 'rt.jsonl'), '--condition', condition];
const started = (dir: string, condition: string): Promise<{ status: number | null; err: string }> => new Promise((ok) => {
  const p = spawn(process.execPath, argvFor(dir, condition), { env: ENV });
  let err = ''; p.stderr.on('data', (d: Buffer) => { err += d.toString(); });
  p.on('close', (status) => { ok({ status, err }); });
});
const rows = (file: string): Record<string, unknown>[] => readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);

describe('one runner writes one output file', () => {
  it('two runners started together on a new path: one exits 2, and no row of its arm is written; no lock is left', async () => {
    const dir = work(1500);
    const [one, two] = await Promise.all([started(dir, 'first'), started(dir, 'second')]);
    const lost = [one, two].filter((r) => r.status === 2);
    const won = [one, two].filter((r) => r.status === 0);
    expect(lost, `${one.err}\n---\n${two.err}`).toHaveLength(1);
    expect(won).toHaveLength(1);
    expect(lost[0].err).toMatch(/another runner holds this file/);
    const winner = won[0] === one ? 'first' : 'second';
    expect(rows(join(dir, 'rt.jsonl')).map((r) => r.condition)).toEqual([winner, winner]);
    expect(existsSync(join(dir, 'rt.jsonl.lock'))).toBe(false);
  }, 60_000);

  it('a lock left behind is never taken over: exit 2, the message names the file to delete, and nothing is written', () => {
    const dir = work(0);
    const lock = join(dir, 'rt.jsonl.lock');
    writeFileSync(lock, 'left by a runner that was killed\n');
    const r = spawnSync(process.execPath, argvFor(dir, 'atelier'), { env: ENV, encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/another runner holds this file/);
    expect(r.stderr).toContain(lock);
    expect(existsSync(lock)).toBe(true);
    expect(readFileSync(lock, 'utf8')).toBe('left by a runner that was killed\n');
    expect(existsSync(join(dir, 'rt.jsonl'))).toBe(false);
    expect(existsSync(join(dir, 'rt.jsonl.manifest.json'))).toBe(false);
  });

  it('the lock is gone after a run that ends normally, one that stops on a refusal, and one stopped by SIGTERM', async () => {
    const done = work(0);
    expect(spawnSync(process.execPath, argvFor(done, 'atelier'), { env: ENV }).status).toBe(0);
    expect(existsSync(join(done, 'rt.jsonl.lock'))).toBe(false);

    const refused = work(0, { ...REC, model: 'local-7b' });
    const r = spawnSync(process.execPath, argvFor(refused, 'atelier'), { env: ENV, encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/its model was "local-7b"/);
    expect(existsSync(join(refused, 'rt.jsonl.lock'))).toBe(false);

    const killed = work(5000);
    const p = spawn(process.execPath, argvFor(killed, 'atelier'), { env: ENV });
    const lock = join(killed, 'rt.jsonl.lock');
    for (let i = 0; i < 100 && !existsSync(lock); i++) await new Promise((ok) => setTimeout(ok, 50));
    expect(existsSync(lock)).toBe(true);
    const closed = new Promise<void>((ok) => { p.on('close', () => { ok(); }); });
    p.kill('SIGTERM');
    await closed;
    expect(existsSync(lock)).toBe(false);
  }, 60_000);
});
