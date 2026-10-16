// tests/atelier-compare-runtime-thinking.test.ts — A RUNTIME ROW CARRIES ITS THINKING SETTING, LIKE EVERY OTHER ROW.
//
// The benchmark runner wrote `thinking` on the model arms' rows and left it off the atelier-runtime arm's, so a study
// could not tell "no thinking" from "not recorded". A runtime row now carries it: from the run's own record where it
// says, else null with the reason.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// What every runtime record carries for the harness to hold it to: the model and limit it was given, its steering, and the
// version of the skill that answered.
const HELD = { model: 'claude-opus-5', maxTokens: 4096, steering: 'all', skillVersion: 'v1' };
const ran = (record: object): { status: number | null; stderr: string; out: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-rt-thinking-'));
  // A stand-in for `atelier invoke --json`: prints a run record and exits 0.
  const cli = join(dir, 'fake-atelier.mjs');
  writeFileSync(cli, `const REC = ${JSON.stringify(record)};\nif (process.argv[2] === 'inspect') { process.stdout.write('active SkillVersion ' + (REC.skillVersion ?? 'v1') + '\\n'); process.exit(0); }\nprocess.stdout.write(${JSON.stringify(JSON.stringify(record))});\n`);
  writeFileSync(join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 't1', prompt: 'Review this.' })}\n`);
  writeFileSync(join(dir, 'runtimes.json'), JSON.stringify({ b: { cli, data: dir, proj: dir, skill: 's', args: ['--provider', 'openai-compatible', '--base-url', 'http://127.0.0.1:1', '--price-in', '1', '--price-out', '1'] } }));
  const out = join(dir, 'out.jsonl');
  const r = spawnSync(process.execPath, [resolve('bench/compare/run.mjs'), '--tasks', join(dir, 'tasks.jsonl'), '--arm', 'atelier-runtime:b', '--runtimes', join(dir, 'runtimes.json'), '--out', out],
    { encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: '' } });
  return { status: r.status, stderr: r.stderr, out };
};
const rowFrom = (record: object): Record<string, unknown> => {
  const r = ran({ ...HELD, ...record });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(readFileSync(r.out, 'utf8').trim().split('\n')[0]) as Record<string, unknown>;
};

describe('the atelier-runtime arm\'s rows', () => {
  it('carry null and the reason when the record does not say', () => {
    const row = rowFrom({ output: 'Looks fine.', toCheck: [], costUsd: 0 });
    expect(row.thinking).toBeNull();
    expect(row.thinking_reason).toBe('the run record does not say what thinking setting its calls were sent with');
  });
  it('carry the setting when the record says it', () => {
    const row = rowFrom({ output: 'Looks fine.', toCheck: [], costUsd: 0, thinking: 'disabled' });
    expect(row.thinking).toBe('disabled');
    expect(row).not.toHaveProperty('thinking_reason');
  });
  it('carry the provider\'s reason when the record says no setting was reported', () => {
    const row = rowFrom({ output: 'Looks fine.', toCheck: [], costUsd: 0, thinking: null });
    expect(row.thinking).toBeNull();
    expect(row.thinking_reason).toBe('the provider did not report sending a thinking setting on every call of the run');
  });
  it('carry the model the run says answered, and refuse a run that names another model or none', () => {
    expect(rowFrom({ output: 'Looks fine.', toCheck: [], costUsd: 0 }).model).toBe('claude-opus-5');
    const other = ran({ ...HELD, output: 'Looks fine.', toCheck: [], costUsd: 0, model: 'local-7b' });
    expect(other.status).toBe(2);
    expect(other.stderr).toMatch(/its model was "local-7b", not "claude-opus-5"\. No row was written/);
    const unsaid = ran({ ...HELD, output: 'Looks fine.', toCheck: [], costUsd: 0, model: undefined });
    expect(unsaid.status).toBe(2);
    expect(unsaid.stderr).toMatch(/its model was not recorded/);
  });
  it('refuse a run whose record does not say which version of the skill answered, writing nothing', () => {
    const r = ran({ ...HELD, output: 'Looks fine.', toCheck: [], costUsd: 0, skillVersion: undefined });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/does not say which version of the skill answered \(skillVersion\)/);
    expect(existsSync(r.out)).toBe(false);
  });
});
