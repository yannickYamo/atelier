// tests/atelier-judgement-pass.test.ts — THE JUDGEMENT-STEP REPAIR PASS, AND WHAT IT MAY NEVER DO.
//
// A method's judgement steps were shown to the writer and nothing acted on them. Behind `--judgement-pass` one call
// reads the draft against only those steps and proposes FIND/REPLACE pairs; code applies each one under guards.
// Pinned here: the guards (once, emphasis set aside; no heading or table row; no new figure; never worse), that the
// pass changes the text and never the evaluation (the step stays UNVERIFIED, the state stays NEEDS_REVIEW), and that
// with the flag off nothing about a run changes: no field, no call.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { stripEmphasis, locateOnce, inHeadingOrTable, newFigure, applyPairs, judgementSteps, judgementPass } from '../core/loop/judgement-pass.js';
import { planFor } from '../core/plan/execution-plan.js';
import type { InferenceClient, Budget } from '../core/inference/client.js';
import type { VerifyReport, RuleCheck } from '../core/observers/verify.js';
import { anInferenceResult, aRequirement } from './fixtures.js';

const DRAFT = '## Summary\n\nThe change adds a *cache* to the runner and keeps its tests.\n\n| Part | State |\n|---|---|\n| cache | new |\n\nThe retry loop has no limit. The retry loop has no limit.\n\n## Verdict\n\nApprove\n';

describe('matching with markdown emphasis set aside', () => {
  it('strips *, backticks and emphasis underscores, and keeps every kept character\'s place', () => {
    const s = stripEmphasis('a **b** `c` _d_ snake_case');
    expect(s.text).toBe('a b c d snake_case');
    expect(s.map[2]).toBe(4); // the b sits after "a **"
  });
  it('finds a passage once through emphasis the find does not carry', () => {
    const at = locateOnce(DRAFT, 'adds a cache to the runner');
    expect('refused' in at).toBe(false);
    if (!('refused' in at)) expect(DRAFT.slice(at.start, at.end)).toBe('adds a *cache* to the runner');
  });
  it('refuses a find that is not there, and one that is there twice', () => {
    expect(locateOnce(DRAFT, 'a sentence nobody wrote')).toEqual({ refused: 'the find is not in the draft' });
    expect(locateOnce(DRAFT, 'The retry loop has no limit.')).toEqual({ refused: 'the find is in the draft 2 times' });
    expect(locateOnce(DRAFT, '**')).toEqual({ refused: 'the find is empty' });
  });
});

describe('the code guards', () => {
  it('a heading line and a table row are refused', () => {
    const h = locateOnce(DRAFT, 'Summary'); const t = locateOnce(DRAFT, '| cache | new |');
    if ('refused' in h || 'refused' in t) throw new Error('both should be found once');
    expect(inHeadingOrTable(DRAFT, h.start, h.end)).toBe(true);
    expect(inHeadingOrTable(DRAFT, t.start, t.end)).toBe(true);
    const body = locateOnce(DRAFT, 'keeps its tests');
    if ('refused' in body) throw new Error('found once');
    expect(inHeadingOrTable(DRAFT, body.start, body.end)).toBe(false);
    expect(inHeadingOrTable('Title\n-----\nbody', 0, 5)).toBe(true);
  });
  it('a replacement may carry only the figures its find carries, sign included', () => {
    expect(newFigure('keeps its tests', 'keeps its 12 tests')).toBe('12');
    expect(newFigure('up 5 points', 'up 5% in a quarter')).toBe('5%');
    expect(newFigure('costs 1,200', 'costs $1,200')).toBe('$1200');
    expect(newFigure('12 tests in 2 files', 'the 2 files hold 12 tests')).toBeNull();
    expect(newFigure('no figure', 'still no figure, two words more')).toBeNull();
  });
  it('applyPairs applies what every guard lets through and names why the rest were refused', () => {
    const r = applyPairs(DRAFT, [
      { step: 's', find: 'adds a cache to the runner and keeps its tests.', replace: 'adds a cache to the runner and keeps its tests. Known: the tests pass. Assumed: the cache is bounded.', why: '' },
      { step: 's', find: 'Summary', replace: 'Summary of the risk', why: '' },
      { step: 's', find: '| cache | new |', replace: '| cache | new, unbounded |', why: '' },
      { step: 's', find: 'Approve', replace: 'Approve: 12 tests pass.', why: '' },
      { step: 's', find: 'The retry loop has no limit.', replace: 'The retry loop has no limit, which is the risk.', why: '' },
      { step: 's', find: 'Approve', replace: 'Approve', why: '' },
    ]);
    expect(r.applied.map((a) => a.find)).toEqual(['adds a cache to the runner and keeps its tests.']);
    expect(r.text).toContain('adds a cache to the runner and keeps its tests. Known: the tests pass.');
    expect(r.text).not.toContain('*cache*');
    expect(r.refused.map((x) => x.reason)).toEqual([
      'the find is in a heading or a table row', 'the find is in a heading or a table row',
      'the replacement adds a figure the find lacks: 12', 'the find is in the draft 2 times', 'the replacement is the find']);
  });
  it('a find that cuts through emphasis is refused rather than leaving a stray marker', () => {
    const r = applyPairs('**Risk:** none today.', [{ step: 's', find: 'Risk: none', replace: 'Risk: the cache', why: '' }]);
    expect(r.applied).toEqual([]);
    expect(r.refused[0].reason).toBe('the find cuts through markdown emphasis');
  });
});

const report = (lines: readonly Partial<RuleCheck>[]): VerifyReport => ({ skill: 's', standardVersionHash: 'h', unchecked: [], conditional: [], failed: false,
  checked: lines.map((l) => ({ requirementId: 'p1', statement: 'Open with a Summary section.', materiality: 'REQUIRED', enforced: true, result: { verdict: 'MET', spans: [], value: null, detail: '' }, ...l })) });
const budget = (): Budget => ({ spentUsd: 0, capUsd: 1, calls: 0, maxCalls: 10 });
const clientWith = (pairs: unknown): InferenceClient => ({ complete: async (r) => { expect(r.toolName).toBe('emit_judgement_edits'); expect(r.temperature).toBe(0); return anInferenceResult({ json: { pairs } }); } });

describe('judgementPass: the call, the steps it serves, and the never-worse guard', () => {
  const judged = aRequirement({ requirementId: 'p2', statement: 'Weigh the risk of the change before the style of it.', materiality: 'REQUIRED', obligation: 'JUDGEMENT', provenance: 'EXPERT_STATED' });
  const counted = aRequirement({ requirementId: 'p1', statement: 'Paragraphs of at most 4 sentences.', materiality: 'REQUIRED', provenance: 'EXPERT_STATED', measurement: { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 4 } } });
  it('serves only judgement steps in the owner\'s words', () => {
    const habit = aRequirement({ requirementId: 'p3', statement: 'A habit read off the examples.', materiality: 'PREFERRED' });
    expect(judgementSteps(planFor({ requirements: [counted, judged, habit] }))).toEqual(['Weigh the risk of the change before the style of it.']);
  });
  it('is skipped, and says why, when the method states no judgement step', async () => {
    const client: InferenceClient = { complete: async () => { throw new Error('must not be called'); } };
    const r = await judgementPass(client, budget(), { plan: planFor({ requirements: [counted] }), draft: DRAFT, material: '', before: report([{}]), check: async () => report([{}]) });
    expect(r.text).toBe(DRAFT);
    expect(r.record).toEqual({ applied: 0, refused: 0, reasons: [], costUsd: 0, skipped: 'the method has no judgement step stated in the owner\'s words' });
  });
  it('applies a pair the guards pass and the check reads as no worse, and refuses the one that adds a figure', async () => {
    const pairs = [{ step: 'p2', find: 'keeps its tests.', replace: 'keeps its tests. The risk that matters most: the cache is never cleared.', why: 'the step' },
      { step: 'p2', find: 'Approve', replace: 'Approve: 12 tests pass.', why: 'x' }];
    const checked: string[] = [];
    const r = await judgementPass(clientWith(pairs), budget(), { plan: planFor({ requirements: [counted, judged] }), draft: DRAFT, material: '', before: report([{}]),
      check: async (t) => { checked.push(t); return report([{}]); } });
    expect(r.text).toContain('The risk that matters most: the cache is never cleared.');
    expect(checked).toHaveLength(1);
    expect(r.record.applied).toBe(1); expect(r.record.refused).toBe(1);
    expect(r.record.reasons).toEqual(['"Approve" refused: the replacement adds a figure the find lacks: 12']);
    expect(r.record.skipped).toBeUndefined();
  });
  it('a set of pairs that breaks a rule that held is retried one at a time, and what breaks it is refused', async () => {
    const pairs = [{ step: 'p2', find: 'keeps its tests.', replace: 'keeps its tests. The risk: a stale entry.', why: '' },
      { step: 'p2', find: 'Approve', replace: 'Approve, with the risk named above.', why: '' }];
    const broken = report([{ result: { verdict: 'VIOLATED', spans: [{ start: 0, end: 1, text: 'x', why: 'the verdict line' }], value: null, detail: 'broken' } }]);
    const check = async (t: string): Promise<VerifyReport> => (t.includes('Approve, with') ? broken : report([{}]));
    const r = await judgementPass(clientWith(pairs), budget(), { plan: planFor({ requirements: [counted, judged] }), draft: DRAFT, material: '', before: report([{}]), check });
    expect(r.text).toContain('The risk: a stale entry.');
    expect(r.text).toContain('\nApprove\n');
    expect(r.record.applied).toBe(1); expect(r.record.refused).toBe(1);
    expect(r.record.reasons[0]).toContain('"Approve" refused: it made p1 worse');
    expect(r.report).toEqual(report([{}]));
  });
  it('a call that fails leaves the draft as it stands and records the failure as the reason it did not run', async () => {
    const client: InferenceClient = { complete: async () => { throw new Error('scripted failure\nmore'); } };
    const r = await judgementPass(client, budget(), { plan: planFor({ requirements: [counted, judged] }), draft: DRAFT, material: '', before: report([{}]), check: async () => report([{}]) });
    expect(r.text).toBe(DRAFT);
    expect(r.record.skipped).toBe('the pass could not run (scripted failure)');
  });
});

// ── THROUGH THE BINARY, AGAINST THE SCRIPTED BACKEND ─────────────────────────────────────────────
const CLI = resolve('dist/cli/atelier.mjs');
const PIECE = '## Summary\n\nThe change adds a *cache* to the runner and keeps its tests.\n\n## Verdict\n\nApprove\n';
const VALID = { step: 'Weigh the risk of the change before the style of it.', find: 'The change adds a cache to the runner and keeps its tests.',
  replace: 'The change adds a cache to the runner and keeps its tests. The risk that matters most: the cache is never cleared, so a stale entry outlives the run.', why: 'the step asks for the risk' };
const FIGURE = { step: 'Weigh the risk of the change before the style of it.', find: 'Approve', replace: 'Approve: 12 tests pass.', why: 'x' };

describe('invoke --judgement-pass', () => {
  let backend: ChildProcess; let port = 0;
  let data = ''; let proj = '';
  const env = (): NodeJS.ProcessEnv => ({ ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ATELIER|ANTHROPIC|OPENAI)_/.test(k))),
    ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CLAIMS: 'pattern' });
  const atelier = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: proj, env: env(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const invoke = (...extra: string[]) => atelier('invoke', '--skill', 'rev', '--task', 'Review this change.', '--json', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted', ...extra);
  const count = async (): Promise<number> => ((await (await fetch(`http://127.0.0.1:${port}/__count`)).json()) as { count: number }).count;
  interface Out { output: string; invocationId: string; judgementPass?: { applied: number; refused: number; reasons: string[]; costUsd: number; skipped?: string };
    report: string[]; eval: { record: { state: string; entries: { id: string; statement: string; result: string; reason: string }[] }; spend: { purpose: string; calls: number; usd: number }[] } }
  const stored = (id: string): Record<string, unknown> => JSON.parse(readFileSync(join(data, 'skills', 'rev', 'invocations', `${id}.json`), 'utf8')) as Record<string, unknown>;

  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => { backend.stdout!.on('data', (b: Buffer) => { const m = /PORT (\d+)/.exec(String(b)); if (m) ok(Number(m[1])); }); });
    const root = mkdtempSync(join(tmpdir(), 'atelier-jp-')); data = join(root, 'data'); proj = join(root, 'proj');
    mkdirSync(data); mkdirSync(proj);
    writeFileSync(join(proj, 'example.md'), '---\nrequest: Review this change.\n---\n## Summary\n\nThe change adds a cache to the runner and keeps its tests.\n\n## Verdict\n\nApprove\n');
    writeFileSync(join(proj, 'method.md'), '1. Open with a Summary section.\n2. Weigh the risk of the change before the style of it.\n3. End with a Verdict section that holds one of: Approve, Request changes.\n');
    const built = atelier('new', 'example.md', '--method', 'method.md', '--name', 'rev', '--yes');
    expect(built.status, built.stdout + built.stderr).toBe(0);
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: PIECE }, emit_judgement_edits: { pairs: [VALID, FIGURE] } } }) });
  }, 120_000);
  afterAll(() => { backend.kill(); });

  it('applies the valid pair, refuses the one with a new figure, records both, and leaves the evaluation as it was', async () => {
    const before = await count();
    const r = invoke('--judgement-pass');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const out = JSON.parse(r.stdout) as Out;
    expect(out.output).toContain('The risk that matters most: the cache is never cleared');
    expect(out.output).not.toContain('*cache*');
    expect(out.output).toMatch(/\nApprove\s*$/);
    expect(out.judgementPass).toMatchObject({ applied: 1, refused: 1, reasons: ['"Approve" refused: the replacement adds a figure the find lacks: 12'] });
    expect(out.judgementPass?.skipped).toBeUndefined();
    // the call is on the run's ledger under its own purpose, and the record's cost is the ledger's
    const line = out.eval.spend.find((s) => s.purpose === 'judgement pass');
    expect(line?.calls).toBe(1);
    expect(out.judgementPass?.costUsd).toBeCloseTo(line?.usd ?? -1, 6);
    expect(out.report.some((l) => l.startsWith('Judgement pass: 1 edit(s) applied'))).toBe(true);
    // A REPAIR, NEVER AN OBSERVATION: the judgement step is as unverified as it was, and the run still needs review.
    expect(out.eval.record.state).toBe('NEEDS_REVIEW');
    const step = out.eval.record.entries.find((e) => e.statement.includes('Weigh the risk'));
    expect(step?.result).toBe('UNVERIFIED'); expect(step?.reason).toBe('NOT_MACHINE_CHECKABLE');
    expect(out.eval.record.entries.some((e) => e.result === 'FAIL')).toBe(false);
    expect(stored(out.invocationId).judgementPass).toMatchObject({ applied: 1, refused: 1 });
    expect(await count() - before).toBeGreaterThanOrEqual(2);
    // the same run without the flag: no field anywhere, and one call fewer
    const plain = invoke();
    expect(plain.status, plain.stdout + plain.stderr).toBe(0);
    const p = JSON.parse(plain.stdout) as Out;
    expect(p.output).toBe(PIECE.trim());
    expect('judgementPass' in p).toBe(false);
    expect('judgementPass' in stored(p.invocationId)).toBe(false);
    expect(p.eval.spend.some((s) => s.purpose === 'judgement pass')).toBe(false);
    expect(p.report.some((l) => l.startsWith('Judgement pass'))).toBe(false);
    expect(p.eval.record.state).toBe('NEEDS_REVIEW');
    expect(p.eval.record.entries.map((e) => [e.id, e.result])).toEqual(out.eval.record.entries.map((e) => [e.id, e.result]));
  }, 120_000);

  it('with --no-repair the flag is refused before anything is spent', async () => {
    const before = await count();
    const r = invoke('--judgement-pass', '--no-repair');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/--judgement-pass reads the draft after the checks, and --no-repair turns the checks off/);
    expect(await count()).toBe(before);
  }, 60_000);
});
