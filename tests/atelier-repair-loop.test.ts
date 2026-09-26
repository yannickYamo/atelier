// tests/atelier-repair-loop.test.ts — CHECK THE DRAFT, REWRITE ONLY WHAT BROKE A RULE, NEVER MAKE IT WORSE.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { planRepair, applyRepair, acceptRepair } from '../core/loop/repair.js';
import { verifyText } from '../core/observers/verify.js';
import * as store from '../core/state/store.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const v = { standardVersionHash: 's', requirements: [
  { requirementId: 'x1', statement: 'Never say leverage.', appliesWhen: 'GENERAL', kind: 'BOUNDARY', materiality: 'REQUIRED',
    authority: 'EXPERT_AUTHORED', measurement: { observer: 'LEXICON', params: { terms: ['leverage=>use'] } } },
  { requirementId: 'x2', statement: 'Never say synergy.', appliesWhen: 'GENERAL', kind: 'BOUNDARY', materiality: 'REQUIRED',
    authority: 'EXPERT_AUTHORED', measurement: { observer: 'LEXICON', params: { terms: ['synergy'] } } },
] } as unknown as StandardVersion;

const draft = 'We shipped on Monday. We leverage the data to decide. The team met twice.';

describe('the plan targets whole sentences, and the splice touches nothing else', () => {
  const report = verifyText('d', v, draft);
  const targets = planRepair(draft, report);
  it('one target, grown to the sentence that broke the rule, carrying why', () => {
    expect(targets).toHaveLength(1);
    expect(targets[0].text).toBe('We leverage the data to decide.');
    expect(targets[0].reasons[0]).toMatch(/write "use"/);
  });
  it('everything outside the span is byte-identical after the splice', () => {
    const out = applyRepair(draft, targets, [{ id: 1, text: 'We use the data to decide.' }]);
    expect(out).toBe('We shipped on Monday. We use the data to decide. The team met twice.');
  });
  it('a missing replacement keeps the original span', () => {
    expect(applyRepair(draft, targets, [])).toBe(draft);
  });
});

describe('a rewrite is kept only if it breaks nothing that held and fixes something that did not', () => {
  const before = verifyText('d', v, draft);
  it('fixing the broken rule is accepted', () => {
    expect(acceptRepair(before, verifyText('d', v, draft.replace('leverage', 'use'))).ok).toBe(true);
  });
  it('fixing one rule by breaking another is discarded', () => {
    const after = verifyText('d', v, draft.replace('leverage', 'use').replace('met twice', 'found synergy'));
    expect(acceptRepair(before, after)).toMatchObject({ ok: false });
  });
  it('a rewrite that changes nothing measurable is discarded', () => {
    expect(acceptRepair(before, verifyText('d', v, draft.replace('Monday', 'Tuesday'))).ok).toBe(false);
  });
});

describe('through the binary: invoke delivers the checked draft and records what it fixed', () => {
  const CLI = resolve('dist/cli/atelier.mjs');
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error('build first');
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }); });
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: {
      emit_piece: { piece: draft },
      emit_replacements: { replacements: [{ id: 1, text: 'We use the data to decide.' }] },
    } }) });
  });
  afterAll(() => { backend.kill(); });

  it('the delivered output meets the rule; the record keeps what the model first wrote', () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-loop-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-loop-proj-'));
    const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    const run = (...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env });
    run('add', '--statement', 'Never say leverage.', '--kind', 'BOUNDARY', '--applies-when', 'GENERAL', '--materiality', 'REQUIRED', '--measure', 'LEXICON:leverage=>use');
    run('ratify-close', '--work-type', 'writing');
    run('build', '--name', 'house');
    const out = run('invoke', '--skill', 'house', 'write a note', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted');
    expect(out).toContain('We use the data to decide.');
    expect(out).toMatch(/1 REQUIRED rule\(s\) broken in the draft \(x1\); 1 rewrite pass\(es\).*all now hold/);
    const [rec] = store.listInvocations({ root: data, skillName: 'house' });
    expect(rec.output).not.toContain('leverage');
    expect(rec.repair?.violatedBefore).toEqual(['x1']);
    expect(rec.repair?.violatedAfter).toEqual([]);
  });
});

// ── The same loop in the host, the checker as a tool, and the exemplar ─────────────────────────
import { writeFileSync, readFileSync as readF, mkdirSync as mkdirS } from 'node:fs';

const CLIP = resolve('dist/cli/atelier.mjs');
const seedSkill = (): { data: string; proj: string; env: NodeJS.ProcessEnv } => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-p3-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-p3-proj-'));
  const env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
  const run = (...a: string[]): string => execFileSync('node', [CLIP, ...a], { encoding: 'utf8', cwd: proj, env });
  run('add', '--statement', 'Never use the word tea.', '--kind', 'BOUNDARY', '--applies-when', 'GENERAL', '--materiality', 'REQUIRED', '--measure', 'LEXICON:tea=>the drink');
  run('ratify-close', '--work-type', 'writing');
  run('build', '--name', 'nodrink');
  return { data, proj, env };
};
const hook = (env: NodeJS.ProcessEnv, proj: string, mode: string, payload: object): string =>
  execFileSync('node', [CLIP, 'record', '--from-hook', mode], { encoding: 'utf8', cwd: proj, env, input: JSON.stringify(payload) });

describe('the Stop hook sends a broken answer back once, with only the spans to rewrite', () => {
  it('first stop blocks with the spans; the continuation is recorded as the use, with what changed', () => {
    const { data, proj, env } = seedSkill();
    const t = join(proj, 't.jsonl'); writeFileSync(t, '');
    hook(env, proj, 'prompt', { cwd: proj, prompt_id: 'p1', transcript_path: t, prompt: '/nodrink say it' });
    const first = hook(env, proj, 'stop', { cwd: proj, prompt_id: 'p1', transcript_path: t, stop_hook_active: false, last_assistant_message: 'I drink tea daily.' });
    const block = JSON.parse(first) as { decision: string; reason: string };
    expect(block.decision).toBe('block');
    expect(block.reason).toMatch(/Rewrite ONLY these spans/);
    expect(block.reason).toMatch(/"I drink tea daily\."/);
    expect(store.listInvocations({ root: data, skillName: 'nodrink' })).toHaveLength(0);
    const second = hook(env, proj, 'stop', { cwd: proj, prompt_id: 'p1', transcript_path: t, stop_hook_active: true, last_assistant_message: 'I drink the drink daily.' });
    expect(second).toBe('');
    const [rec] = store.listInvocations({ root: data, skillName: 'nodrink' });
    expect(rec.output).toBe('I drink the drink daily.');
    expect(rec.repair).toMatchObject({ passes: 1, violatedBefore: ['x1'], violatedAfter: [] });
  });
  it('an answer that already holds is recorded at once, never blocked', () => {
    const { data, proj, env } = seedSkill();
    const t = join(proj, 't.jsonl'); writeFileSync(t, '');
    hook(env, proj, 'prompt', { cwd: proj, prompt_id: 'p2', transcript_path: t, prompt: '/nodrink say it' });
    expect(hook(env, proj, 'stop', { cwd: proj, prompt_id: 'p2', transcript_path: t, last_assistant_message: 'Coffee, black.' })).toBe('');
    expect(store.listInvocations({ root: data, skillName: 'nodrink' })[0].repair).toBeUndefined();
  });
});

describe('atelier mcp: the checker as a tool any agent can call', () => {
  it('initialize, list the tools, verify a text — over newline-delimited JSON-RPC', () => {
    const { env, proj } = seedSkill();
    const input = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'atelier_verify', arguments: { skill: 'nodrink', text: 'We had tea.' } } },
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'atelier_verify', arguments: { skill: '../etc', text: 'x' } } },
    ].map((m) => JSON.stringify(m)).join('\n');
    const out = execFileSync('node', [CLIP, 'mcp'], { encoding: 'utf8', cwd: proj, env, input }).trim().split('\n').map((l) => JSON.parse(l) as { id: number; result: { tools?: { name: string }[]; content?: { text: string }[]; isError?: boolean } });
    expect(out.map((o) => o.id)).toEqual([1, 2, 3, 4]);
    expect(out[1].result.tools?.map((t) => t.name)).toEqual(['atelier_list_skills', 'atelier_rules', 'atelier_verify']);
    expect(out[2].result.content?.[0].text).toMatch(/"failed":true/);
    expect(out[3].result.isError).toBe(true);
  });
});

describe('the exemplar: one complete piece of the owner\'s, read first, carried through every rebuild', () => {
  it('build --exemplar ships it and says what to take from it; amend keeps it', () => {
    const { proj, env } = seedSkill();
    const run = (...a: string[]): string => execFileSync('node', [CLIP, ...a], { encoding: 'utf8', cwd: proj, env });
    mkdirS(join(proj, 'mine'), { recursive: true });
    writeFileSync(join(proj, 'mine', 'best.md'), 'My best piece, whole.');
    run('add', '--statement', 'Short sentences.', '--kind', 'GENERATIVE', '--applies-when', 'GENERAL', '--materiality', 'REQUIRED');
    run('ratify-close', '--reason', 'one more rule');
    run('build', '--name', 'nodrink', '--exemplar', join(proj, 'mine', 'best.md'));
    const dir = join(proj, '.claude', 'skills', 'nodrink');
    expect(readF(join(dir, 'examples', 'exemplar.md'), 'utf8')).toBe('My best piece, whole.');
    expect(readF(join(dir, 'SKILL.md'), 'utf8')).toMatch(/Never take its topic, facts, names, figures or sentences/);
    run('amend', '--skill', 'nodrink', '--rule', 'x2', '--statement', 'Very short sentences.', '--reason', 'tighter');
    expect(existsSync(join(dir, 'examples', 'exemplar.md'))).toBe(true);
  });
});
