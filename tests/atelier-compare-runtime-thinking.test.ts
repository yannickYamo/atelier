// tests/atelier-compare-runtime-thinking.test.ts — A RUNTIME ROW CARRIES ITS THINKING SETTING, LIKE EVERY OTHER ROW.
//
// The benchmark runner wrote `thinking` on the model arms' rows and left it off the atelier-runtime arm's, so a study
// could not tell "no thinking" from "not recorded". A runtime row now carries it: from the run's own record where it
// says, else null with the reason.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const rowFrom = (record: object): Record<string, unknown> => {
  const dir = mkdtempSync(join(tmpdir(), 'atelier-rt-thinking-'));
  // A stand-in for `atelier invoke --json`: prints a run record and exits 0.
  const cli = join(dir, 'fake-atelier.mjs');
  writeFileSync(cli, `process.stdout.write(${JSON.stringify(JSON.stringify(record))});\n`);
  writeFileSync(join(dir, 'tasks.jsonl'), `${JSON.stringify({ id: 't1', prompt: 'Review this.' })}\n`);
  writeFileSync(join(dir, 'runtimes.json'), JSON.stringify({ b: { cli, data: dir, proj: dir, skill: 's', args: ['--provider', 'openai-compatible', '--base-url', 'http://127.0.0.1:1', '--model', 'm'] } }));
  const out = join(dir, 'out.jsonl');
  const r = spawnSync(process.execPath, [resolve('bench/compare/run.mjs'), '--tasks', join(dir, 'tasks.jsonl'), '--arm', 'atelier-runtime:b', '--runtimes', join(dir, 'runtimes.json'), '--out', out],
    { encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: '' } });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(readFileSync(out, 'utf8').trim().split('\n')[0]) as Record<string, unknown>;
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
  it('carry the model the run says answered, not the harness\'s --model', () => {
    expect(rowFrom({ output: 'Looks fine.', toCheck: [], costUsd: 0, model: 'local-7b' }).model).toBe('local-7b');
    const unsaid = rowFrom({ output: 'Looks fine.', toCheck: [], costUsd: 0 });
    expect(unsaid.model).toBeNull();
    expect(unsaid.model_reason).toBe('the run record does not say which model answered');
  });
});
