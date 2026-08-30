// tests/atelier-host-record.test.ts — A /SKILL USE IN THE HOST BECOMES THE SAME RECORD `invoke` WRITES.
//
// The product's primary surface produced no evidence at all: `InvocationSurface` had one value and
// the improvement loop was a CLI demonstration. These tests drive the real binary with the hook
// payloads Claude Code actually sends (captured live in tests/fixtures/hooks/), and pin the record
// to the same shape the CLI path writes — evidence that differs by surface cannot be pooled.

import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');

beforeAll(() => {
  if (!existsSync(CLI)) execFileSync('npm', ['run', 'build'], { stdio: 'ignore' });
}, 120_000);

const run = (dataRoot: string, projectDir: string, args: string[], stdin?: string): string => {
  try {
    return execFileSync('node', [CLI, ...args], {
      encoding: 'utf8', cwd: projectDir, input: stdin,
      env: { ...process.env, ATELIER_DATA: dataRoot, ATELIER_PROJECT_DIR: projectDir },
    });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`;
  }
};

/** A project with a built skill named `focus`, exactly as the no-key path builds one. */
const seeded = () => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-host-data-'));
  const proj = mkdtempSync(join(tmpdir(), 'atelier-host-proj-'));
  run(data, proj, ['add', '--statement', 'Lead with the action.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL']);
  run(data, proj, ['ratify-close', '--work-type', 'writing']);
  run(data, proj, ['build', '--name', 'focus']);
  return { data, proj };
};

const transcript = (proj: string, model: string | null): string => {
  const p = join(proj, 'transcript.jsonl');
  writeFileSync(p, `${JSON.stringify({ type: 'user', message: { role: 'user' } })}\n`);
  if (model) {
    appendFileSync(p, `${JSON.stringify({ type: 'assistant', attributionSkill: 'focus', message: { model, role: 'assistant' } })}\n`);
  }
  return p;
};

const promptPayload = (proj: string, prompt: string, t: string) => JSON.stringify({
  session_id: 's1', transcript_path: t, cwd: proj, prompt_id: 'pid-1',
  permission_mode: 'default', hook_event_name: 'UserPromptSubmit', prompt,
});
const stopPayload = (proj: string, t: string, message: string, promptId = 'pid-1') => JSON.stringify({
  session_id: 's1', transcript_path: t, cwd: proj, prompt_id: promptId,
  permission_mode: 'default', hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: message,
});

const runsDirOf = (data: string): string => join(data, 'runs', readdirSync(join(data, 'runs'))[0]);

describe('the happy path: /focus in the host becomes a canonical InvocationRecord', () => {
  const { data, proj } = seeded();
  const t = transcript(proj, 'claude-haiku-4-5-20251001');
  run(data, proj, ['record', '--from-hook', 'prompt'], promptPayload(proj, '/focus write a two line note about deploys', t));
  run(data, proj, ['record', '--from-hook', 'stop'], stopPayload(proj, t, 'A deploy is a handoff. Watch it closely.'));
  const L: store.StoreLayout = { root: data, skillName: 'focus' };
  const recs = store.listInvocations(L);

  it('one record, on the HOST_PLUGIN surface, with the real input and output', () => {
    expect(recs).toHaveLength(1);
    expect(recs[0].invocationSurface).toBe('HOST_PLUGIN');
    expect(recs[0].runtimeBinding.providerAdapter, 'WHICH host lives in the binding, not in core').toBe('claude-code');
    expect(recs[0].input).toBe('write a two line note about deploys');
    expect(recs[0].output).toBe('A deploy is a handoff. Watch it closely.');
    expect(recs[0].request.source).toBe('HOST_PROMPT');
  });

  it('delivery is proven, not assumed: the installed bytes matched the stored package', () => {
    expect(recs[0].delivery.matched).toBe(true);
    expect(recs[0].delivery.expectedPackageHash).toBe(recs[0].delivery.servedPackageHash);
  });

  it('the model is read from the transcript, never guessed', () => {
    expect(recs[0].observedRuntime?.resolvedModel).toBe('claude-haiku-4-5-20251001');
    expect(recs[0].runtimeBinding.providerAdapter).toBe('claude-code');
  });

  it('the same field set the CLI path writes — evidence that can be pooled', () => {
    for (const k of ['invocationId', 'skillName', 'standardVersionHash', 'skillVersionHash', 'architectureHash',
      'servedPackageHash', 'runtimeBinding', 'observedRuntime', 'invocationSurface', 'provenance', 'inputHash',
      'request', 'outputHash', 'at', 'delivery', 'input', 'output']) {
      expect(recs[0], `host record is missing ${k}`).toHaveProperty(k);
    }
  });

  it('the per-requirement delivery observations land, same grain as invoke', () => {
    expect(store.listObservations(L).filter((o) => o.domain === 'DELIVERY').length
      + store.readEvents(L).filter((e) => e.kind === 'APPLICABILITY_UNRESOLVED').length).toBeGreaterThan(0);
  });

  it('last-invocation.json points a later fix at this run, so nobody copies an id', () => {
    const last = JSON.parse(readFileSync(join(runsDirOf(data), 'last-invocation.json'), 'utf8')) as { invocationId: string };
    expect(last.invocationId).toBe(recs[0].invocationId);
  });

  it('and the pending file is consumed — a second stop records nothing', () => {
    run(data, proj, ['record', '--from-hook', 'stop'], stopPayload(proj, t, 'a second answer'));
    expect(store.listInvocations(L)).toHaveLength(1);
  });
});

describe('what is NOT recorded', () => {
  it('a slash command that is not an Atelier skill leaves nothing behind', () => {
    const { data, proj } = seeded();
    const t = transcript(proj, 'm');
    run(data, proj, ['record', '--from-hook', 'prompt'], promptPayload(proj, '/compact everything', t));
    expect(existsSync(join(runsDirOf(data), 'pending-invocation.json'))).toBe(false);
  });

  it('a plain prompt leaves nothing behind', () => {
    const { data, proj } = seeded();
    run(data, proj, ['record', '--from-hook', 'prompt'], promptPayload(proj, 'just a question', transcript(proj, 'm')));
    expect(existsSync(join(runsDirOf(data), 'pending-invocation.json'))).toBe(false);
  });

  it('a stop from a DIFFERENT turn does not adopt the pending invocation', () => {
    const { data, proj } = seeded();
    const t = transcript(proj, 'm');
    run(data, proj, ['record', '--from-hook', 'prompt'], promptPayload(proj, '/focus a task', t));
    run(data, proj, ['record', '--from-hook', 'stop'], stopPayload(proj, t, 'answer', 'pid-OTHER'));
    expect(store.listInvocations({ root: data, skillName: 'focus' })).toHaveLength(0);
  });

  it('malformed hook JSON records nothing and exits clean — a hook must never break the host', () => {
    const { data, proj } = seeded();
    const out = run(data, proj, ['record', '--from-hook', 'prompt'], 'not json at all');
    expect(out).not.toContain('EXIT:');
  });
});

describe('honesty at the edges', () => {
  it('a hand-edited installed skill records matched: false — drift is witnessed at the moment of use', () => {
    const { data, proj } = seeded();
    const f = join(proj, '.claude', 'skills', 'focus', 'SKILL.md');
    writeFileSync(f, `${readFileSync(f, 'utf8')}\nAlways open with a joke.\n`);
    const t = transcript(proj, 'm');
    run(data, proj, ['record', '--from-hook', 'prompt'], promptPayload(proj, '/focus a task', t));
    run(data, proj, ['record', '--from-hook', 'stop'], stopPayload(proj, t, 'answer'));
    const rec = store.listInvocations({ root: data, skillName: 'focus' })[0];
    expect(rec.delivery.matched).toBe(false);
    expect(rec.delivery.servedPackageHash).not.toBe(rec.delivery.expectedPackageHash);
  });

  it('a transcript with no model line yields UNREPORTED, never a guess', () => {
    const { data, proj } = seeded();
    const t = transcript(proj, null);
    run(data, proj, ['record', '--from-hook', 'prompt'], promptPayload(proj, '/focus a task', t));
    run(data, proj, ['record', '--from-hook', 'stop'], stopPayload(proj, t, 'answer'));
    const rec = store.listInvocations({ root: data, skillName: 'focus' })[0];
    expect(rec.observedRuntime?.modelIdentityKind).toBe('UNREPORTED');
    expect(rec.observedRuntime?.resolvedModel).toBeNull();
  });
});

describe('the captured payloads this was built against', () => {
  it('the live Claude Code fixtures carry the fields record parses', () => {
    const prompt = JSON.parse(readFileSync('tests/fixtures/hooks/user-prompt-submit.json', 'utf8')) as Record<string, unknown>;
    const stop = JSON.parse(readFileSync('tests/fixtures/hooks/stop.json', 'utf8')) as Record<string, unknown>;
    for (const k of ['prompt', 'cwd', 'prompt_id', 'transcript_path']) expect(prompt).toHaveProperty(k);
    for (const k of ['prompt_id', 'cwd', 'transcript_path', 'last_assistant_message']) expect(stop).toHaveProperty(k);
  });
});
