// tests/atelier-shortform-steering.test.ts — A LEARNED SHAPE BAND STEERS A SHORT PIECE, AND NEVER BLOCKS IT.
//
// A skill built from five tweets learned thirteen shape bands, all PREFERRED. They neither blocked nor steered: asked
// for a tweet, a writer that returned a 384-character corporate paragraph had it delivered unchanged, against pieces
// that run 117 to 155 characters. A learned band is now a graded target, routed as a counted feature's miss is: a
// length out of its band is written again toward it, a hashtag, link or emoji the pieces never carry is removed in code.
// Never blocking, never making an enforced rule worse, off with --graded none. Sentence counts, the longest sentence and
// what a piece opens or closes on stay listed preferences: rhythm is never steered by count.
//
// Every expected value below is read off the scenario (the five tweets of tests/fixtures/shortform.ts and what the
// scripted writer returns), never off the code under test.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { GOOD } from './fixtures/shortform.js';
import { gradedRules, refineToStandard } from '../core/loop/run-repair.js';
import type { InferenceClient } from '../core/inference/client.js';
import { removeShapeExtras } from '../core/loop/shape-steer.js';
import { decide, type ControllerInput } from '../core/loop/controller.js';
import type { Requirement, StandardVersion } from '../core/state/canonical-state.js';

/** 384 characters: the corporate paragraph the scripted writer returns for "write a tweet". */
const CORPORATE = 'We are thrilled to announce that our platform now offers a comprehensive suite of next-generation capabilities designed to empower teams. By integrating best-in-class infrastructure with an intuitive experience, we enable organizations of every size to unlock new levels of productivity and excellence. We remain committed to delivering solutions that drive outcomes for our partners.';
/** one of the author's own tweets, held back from the five the skill is built from: what the scripted writer returns when told the miss */
const HELD = GOOD[15];

const rule = (id: string, measurement: Requirement['measurement'], extra: Partial<Requirement> = {}): Requirement => ({ requirementId: id, statement: id, materiality: 'PREFERRED',
  authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', provenance: 'MACHINE_DISCOVERED', measurement, ...extra } as unknown as Requirement);
const shape = (s: string, p: Record<string, unknown>): Requirement['measurement'] => ({ observer: 'SHAPE', params: { shape: [s], ...p } });

describe('which learned shape bands a run steers', () => {
  const v = { standardVersionHash: 's', requirements: [
    rule('chars', shape('characters', { min: 79, max: 193 })), rule('words', shape('words', { min: 14, max: 35 })),
    rule('tags', shape('hashtags', { max: 0 })), rule('links', shape('links', { max: 0 })), rule('emoji', shape('emoji', { max: 0 })),
    rule('sent', shape('sentences', { min: 2, max: 4 })), rule('longest', shape('longestSentence', { min: 7, max: 13 })),
    rule('open', shape('opening', { kinds: ['claim'] })), rule('close', shape('closing', { kinds: ['statement', 'shortest'] })),
    rule('mine', shape('characters', { max: 150 }), { provenance: 'EXPERT_ADDED' }),
    rule('req', shape('hashtags', { max: 2 }), { materiality: 'REQUIRED' }),
  ] } as unknown as StandardVersion;
  it('length and the counts of hashtags, links and emoji: steered; sentence counts, the longest sentence, openings and closings: listed only', () => {
    expect([...gradedRules(v, 'all').keys()].sort()).toEqual(['chars', 'emoji', 'links', 'tags', 'words']);
  });
  it('a band the owner stated or required is theirs, never steered as a habit; --graded none steers nothing', () => {
    const ids = [...gradedRules(v, 'all').keys()];
    expect(ids).not.toContain('mine');
    expect(ids).not.toContain('req');
    expect(gradedRules(v, undefined).size).toBe(0);
  });
  it('a request that names a length sets it: the learned length bands are not steered against it, the counts still are', () => {
    expect([...gradedRules(v, 'all', null, 'Write a 300-word post about the release.').keys()].sort()).toEqual(['emoji', 'links', 'tags']);
    expect([...gradedRules(v, 'all', null, 'write a tweet').keys()].sort()).toEqual(['chars', 'emoji', 'links', 'tags', 'words']);
  });
});

describe('a length out of its learned band is written again, whatever the size of the miss', () => {
  // 296 characters against a band of 79 to 193 is (296 - 193) / 114 = 0.9 band widths: a size that sends a counted
  // feature to its carrier sentences. A length has no carrier sentence: it is written again toward its band. (Its
  // expected 0.9 widths for a $0.40 draft pays the release's two widths per dollar; a smaller miss stops for paying.)
  const input = (history: ControllerInput['history'] = []): ControllerInput => ({ enforced: [], claims: 0, length: null, grammar: null,
    graded: [{ id: 'chars', error: 0.904, operatorEffect: null, length: true }], budget: { usdLeft: 1, callsLeft: null }, history,
    observedUsdPerCall: {}, can: { redraft: true, rewrite: true }, unreachable: new Set() });
  it('the step is a draft written again toward the band', () => {
    expect(decide(input())).toMatchObject({ kind: 'act', action: 'redraft', targets: ['chars'] });
  });
  it('once that draft did no better, nothing else is tried on it, and the stop says so', () => {
    const d = decide(input([{ action: 'redraft', targets: ['chars'], why: 'w', expectedGain: 1, expectedCostUsd: 0.4, outcome: 'not kept', observed: { movement: 0, calls: 1, usd: 0.01 } }]));
    expect(d.kind).toBe('stop');
  });
});

describe('a draft short of the learned band is not steered up toward it', () => {
  // 48 characters against a band of 100 to 120 is 2.6 band widths short: making it longer asks for words the request
  // did not ask for. 384 characters is 13.2 widths long.
  const v = { standardVersionHash: 's', requirements: [rule('chars', shape('characters', { min: 100, max: 120 }))] } as unknown as StandardVersion;
  const client = (): InferenceClient & { calls: number } => { const c = { calls: 0, complete: () => { c.calls += 1; return Promise.resolve({ json: { replacements: [] }, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never); } }; return c; };
  it('no step is taken for it and no call made; one past the ceiling is handed to a draft written again', async () => {
    const short = 'He is late to the meeting. The plan still holds.';
    expect(short.length).toBe(48);
    const c = client();
    const r = await refineToStandard(c, { spentUsd: 0, capUsd: 1 }, 'd', v, short, 2, { graded: 'all', guardClaims: false, controller: { redraft: true } });
    expect(r.output).toBe(short);
    expect(c.calls).toBe(0);
    expect(r.repair?.controller?.decisions ?? []).toEqual([]);
    const long = await refineToStandard(client(), { spentUsd: 0, capUsd: 1 }, 'd', v, CORPORATE, 2, { graded: 'all', guardClaims: false, controller: { redraft: true } });
    expect(long.repair?.controller?.decisions[0]).toMatchObject({ action: 'redraft', targets: ['chars'], outcome: 'handed to a redraft' });
  });
});

describe('a hashtag, link or emoji the pieces never carry is removed in code', () => {
  it('a trailing run of hashtags goes whole; one inside a sentence keeps its word', () => {
    expect(removeShapeExtras('Shipped the index rebuild tonight. #devops #database #startup', 'hashtags', 0)).toBe('Shipped the index rebuild tonight.');
    expect(removeShapeExtras('We moved the #approval earlier in the pipeline.', 'hashtags', 0)).toBe('We moved the approval earlier in the pipeline.');
  });
  it('emoji and links go; what a piece is allowed to keep stays', () => {
    expect(removeShapeExtras('🚀 Shipped the rebuild. Nobody noticed 🎉', 'emoji', 0)).toBe('Shipped the rebuild. Nobody noticed');
    expect(removeShapeExtras('Wrote it up. https://example.com/post', 'links', 0)).toBe('Wrote it up.');
    expect(removeShapeExtras('Shipped it. #one #two #three', 'hashtags', 1)).toBe('Shipped it. #one');
  });
});

const ROOT = resolve(__dirname, '..');
const CLI = join(ROOT, 'dist', 'cli', 'atelier.mjs');
describe.skipIf(!existsSync(CLI))('five tweets, through the binary, on the scripted backend', () => {
  let backend: ChildProcess; let port = 0;
  let proj = ''; let env: NodeJS.ProcessEnv = {};
  beforeAll(async () => {
    backend = spawn(process.execPath, [join(ROOT, 'tests', 'fixtures', 'scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => backend.stdout?.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }));
    const data = mkdtempSync(join(tmpdir(), 'atelier-shape-data-')); proj = mkdtempSync(join(tmpdir(), 'atelier-shape-proj-'));
    env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CLAIMS: 'pattern' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    mkdirSync(join(proj, 'tweets'));
    GOOD.slice(0, 5).forEach((t, i) => { writeFileSync(join(proj, 'tweets', `t${i}.md`), `${t}\n`); });
    expect(run('new', 'tweets', '--class', 'x-post', '--name', 'tw').code).toBe(0);
  }, 120_000);
  afterAll(() => { backend.kill(); });
  const run = (...args: string[]): { code: number; out: string } => {
    try { return { code: 0, out: execFileSync('node', [CLI, ...args], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { const x = e as { status?: number; stdout?: string }; return { code: x.status ?? 1, out: x.stdout ?? '' }; }
  };
  const model = (): string[] => ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'];
  const script = async (first: string): Promise<void> => {
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ when: [{ contains: 'did not do what your pieces usually do', answer: { piece: HELD } }],
      byTool: { emit_piece: { piece: first }, emit_replacements: { replacements: [] } } }) });
  };
  interface Invoked { output: string; eval: { record: { state: string } }; graded?: { features: string[]; redrafts: number; values: Record<string, { before: number | null; after: number | null }> };
    controller?: { decisions: { action: string; outcome: string; targets: string[] }[] } }
  const invoke = (...extra: string[]): { code: number; j: Invoked } => { const r = run('invoke', '--skill', 'tw', 'write a tweet', '--json', '--allow-unsourced', ...extra, ...model()); return { code: r.code, j: JSON.parse(r.out) as Invoked }; };

  it('the 384-character paragraph is written again into the author\'s range, and the run never reads BLOCKED for it', async () => {
    expect(CORPORATE.length).toBe(384);
    // the five pieces run 117 to 155 characters: the paragraph is more than twice the longest of them
    expect(Math.max(...GOOD.slice(0, 5).map((t) => t.length))).toBe(155);
    await script(CORPORATE);
    const { code, j } = invoke();
    expect(j.output).toBe(HELD);
    expect(j.output.length).toBeLessThanOrEqual(155);
    expect(j.eval.record.state).not.toBe('BLOCKED');
    expect(code).toBe(0);
    // on the one ledger, under the flag's own purpose: one draft written again for a graded miss alone
    expect(j.graded?.redrafts).toBe(1);
    expect(j.graded?.values.characters).toMatchObject({ before: 384, after: HELD.length });
    expect(j.controller?.decisions.some((d) => d.action === 'redraft' && d.outcome === 'kept')).toBe(true);
  }, 120_000);

  it('with --graded none the paragraph is delivered as written, and nothing is graded', async () => {
    await script(CORPORATE);
    const { j } = invoke('--graded', 'none');
    expect(j.output).toBe(CORPORATE);
    expect(j.graded).toBeUndefined();
    expect(j.eval.record.state).not.toBe('BLOCKED');
  }, 120_000);

  it('hashtags the pieces never carry are removed without a model call', async () => {
    const tagged = `${GOOD[16]} #devops #database #startup`;
    const count = async (): Promise<number> => (await (await fetch(`http://127.0.0.1:${port}/__count`)).json() as { count: number }).count;
    // what writing the piece costs with nothing steered: the calls the run makes with --graded none
    await script(tagged);
    const c0 = await count(); const plain = invoke('--graded', 'none').j; const unsteered = (await count()) - c0;
    expect(plain.output).toBe(tagged);
    await script(tagged);
    const c1 = await count(); const { j } = invoke(); const steered = (await count()) - c1;
    expect(j.output).toBe(GOOD[16]);
    // the removal is code: not one call more than the piece cost unsteered
    expect(steered).toBe(unsteered);
    expect(j.controller?.decisions.some((d) => d.action === 'mechanical' && d.outcome === 'kept')).toBe(true);
    expect(j.graded?.values.hashtags).toMatchObject({ before: 3, after: 0 });
  }, 120_000);

  it('the author\'s held-back tweets still pass, and a staccato tweet still fails', () => {
    GOOD.slice(5).forEach((t, i) => { writeFileSync(join(proj, `held${i}.md`), `${t}\n`); });
    const failed = GOOD.slice(5).map((_, i) => run('verify', '--skill', 'tw', `held${i}.md`, '--claims', 'pattern').code).filter((c) => c !== 0);
    expect(failed).toEqual([]);
    writeFileSync(join(proj, 'staccato.md'), 'Shipped it. Fast. Clean. Done. Nobody noticed, which was the point.\n');
    expect(run('verify', '--skill', 'tw', 'staccato.md', '--claims', 'pattern').code).toBe(1);
  }, 120_000);
});
