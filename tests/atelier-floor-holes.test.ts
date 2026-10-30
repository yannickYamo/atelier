// tests/atelier-floor-holes.test.ts — THE TWO PASSES THAT BYPASSED THE FLOOR, NOW ONE STEP EACH ON THE RECORD.
//
// Every replacement of the working text is one step through `applyStep` (core/loop/repair.ts): held to the shared
// floor (no enforced rule newly broken or further from holding by its value; no figure added that neither the text
// before it, the request nor the material holds; never under a quarter of the words; no work lost; no rule left too
// short to read), then to the pass's own criterion, and settled on the run's ledger as a `controller.decisions` row.
// Two passes replaced the text on a gate of their own and wrote no row: a later shape round (cli/commands/invoke.ts,
// `withShape`: no enforced rule newly broken, then the fewest broken and the most author-like) and the grounding of an
// example's fact (`withGrounding`: no enforced rule newly broken). Each could keep a text that added a figure, that
// left a quarter of the piece, or that took a broken rule further out. Here each goes through the floor and keeps its
// own criterion on top, and the row says what it did. Expected values are worked out from the floor's documented terms
// (docs/MEASURED-RULES.md, core/loop/controller.ts rules A and B), never read back from the code.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';
import { withGrounding, withShape } from '../cli/commands/invoke.js';
import { stepWords } from '../core/loop/controller.js';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import type { RuleCheck, VerifyReport } from '../core/observers/verify.js';

const scripted = (...jsons: unknown[]): InferenceClient & { seen: InferenceRequest[] } => {
  const seen: InferenceRequest[] = [];
  return { seen, complete: (req: InferenceRequest) => {
    const json = jsons[Math.min(seen.length, jsons.length - 1)];
    seen.push(req);
    return json instanceof Error ? Promise.reject(json) : Promise.resolve({ json, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never);
  } };
};
const budget = () => ({ spentUsd: 0, capUsd: 5 });
const reportOf = (checked: RuleCheck[] = [], failed = false): VerifyReport => ({ skill: 's', standardVersionHash: 'h', checked, unchecked: [], conditional: [], failed });
const ok = reportOf();

describe('the grounding of an example\'s fact goes through the floor, as one step on the record', () => {
  const EXAMPLES = 'The request it answered: blocked by CORS policy.\n\nWhat I wrote:\n\nAllow the origin in the CORS config.';
  const REQ = 'Thanks, that solved it.';
  const TEXT = 'Glad it works. CORS is fixed.';
  const ground = (rewrite: string, before: VerifyReport, after: VerifyReport, notes: string[] = []) =>
    withGrounding(() => Promise.resolve({ output: TEXT, repair: null, report: before }), { client: scripted({ rewrites: [{ id: 1, text: rewrite }] }), budget: budget(),
      request: REQ, evidence: '', examples: EXAMPLES, notes, recheck: () => Promise.resolve(after) })('x');
  const rowOf = (d: Awaited<ReturnType<ReturnType<typeof withGrounding>>>) => d.repair?.controller?.decisions.find((x) => x.action === 'ground');

  it('a rewrite that adds a figure neither the text, the request nor the material holds is not kept, and the row says so', async () => {
    const notes: string[] = [];
    const d = await ground('Good to hear; 3 of 4 users see it fixed.', ok, ok, notes);
    expect(d.output).toBe(TEXT);
    expect(d.report).toBe(ok);
    const row = rowOf(d);
    expect(row?.outcome).toBe('not kept');
    expect(row?.observed.note).toMatch(/figure/);
    expect(row?.observed.calls).toBe(1);
    // said where the person reads the run, and on the record: the sentence stays listed, unresolved
    expect(notes[0]).toMatch(/^Grounded: 1 sentence\(s\).*unresolved/);
    expect(d.repair?.notes?.[0]).toBe(notes[0]);
  });
  it('a rewrite that takes a required rule already broken further from holding by its value is not kept', async () => {
    const rate = (error: number): RuleCheck => ({ requirementId: 'p1', statement: 'Few asides.', materiality: 'REQUIRED', enforced: true, observer: 'FEATURE',
      result: { verdict: 'VIOLATED', value: 5 + error * 5, error, detail: 'p1 off', spans: [] } } as unknown as RuleCheck);
    const before = reportOf([rate(1)], true);
    const d = await ground('Good to hear.', before, reportOf([rate(2)], true));
    expect(d.output).toBe(TEXT);
    expect(d.report).toBe(before);
    const row = rowOf(d);
    expect(row?.outcome).toBe('not kept');
    expect(row?.observed.note).toMatch(/p1/);
  });
  it('a rewrite that newly breaks a required rule is refused by the pass\'s own criterion, as before, and the row says not kept', async () => {
    const broken = reportOf([{ requirementId: 'p1', materiality: 'REQUIRED', result: { verdict: 'VIOLATED', spans: [] } } as unknown as RuleCheck], true);
    const d = await ground('Good to hear.', ok, broken);
    expect(d.output).toBe(TEXT);
    expect(rowOf(d)?.outcome).toBe('not kept');
    expect(d.repair?.notes?.[0]).toMatch(/unresolved/);
  });
  it('a rewrite the floor and the pass accept is kept, with its row, and the record as before', async () => {
    const notes: string[] = [];
    const d = await ground('Good to hear.', ok, ok, notes);
    expect(d.output).toBe('Glad it works. Good to hear.');
    const row = rowOf(d);
    expect(row?.outcome).toBe('kept');
    expect(row?.observed.calls).toBe(1);
    expect(notes[0]).toMatch(/^Grounded: 1 sentence\(s\).*; 1 rewritten/);
    // the model's own text stays on record
    expect(d.repair?.draft).toBe(TEXT);
  });
  it('the step continues the run\'s ledger: the chain\'s steps come first, the grounding after them', async () => {
    const step = { action: 'rewrite' as const, targets: ['x1'], why: 'w', expectedGain: 1, expectedCostUsd: 0.05, outcome: 'kept' as const, observed: { movement: 1, calls: 1, usd: 0.01 } };
    const before = { output: TEXT, report: ok, repair: { passes: 1, violatedBefore: ['x1'], violatedAfter: [], originalOutputHash: 'h', why: 'w',
      controller: { policy: 'bounded-v1' as const, decisions: [step], stoppedBecause: 'every enforced rule holds', callsUsed: 1, usdUsed: 0.01 } } };
    const d = await withGrounding(() => Promise.resolve(before), { client: scripted({ rewrites: [{ id: 1, text: 'Good to hear.' }] }), budget: budget(),
      request: REQ, evidence: '', examples: EXAMPLES, recheck: () => Promise.resolve(ok) })('x');
    expect(d.repair?.controller?.decisions.map((x) => [x.action, x.outcome])).toEqual([['rewrite', 'kept'], ['ground', 'kept']]);
    expect(d.repair?.controller?.callsUsed).toBe(2);
    expect(d.repair?.controller?.stoppedBecause).toBe('every enforced rule holds');
  });
  it('the budget refuses the step: no call is made, the row says refused with why, and the chain\'s stop stays as the chain said it', async () => {
    const step = { action: 'rewrite' as const, targets: ['x1'], why: 'w', expectedGain: 1, expectedCostUsd: 0.05, outcome: 'kept' as const, observed: { movement: 1, calls: 1, usd: 0.01 } };
    const before = { output: TEXT, report: ok, repair: { passes: 1, violatedBefore: ['x1'], violatedAfter: [], originalOutputHash: 'h', why: 'w',
      controller: { policy: 'bounded-v1' as const, decisions: [step], stoppedBecause: 'every enforced rule holds', callsUsed: 1, usdUsed: 0.01 } } };
    const client = scripted({ rewrites: [{ id: 1, text: 'Good to hear.' }] });
    const notes: string[] = [];
    const d = await withGrounding(() => Promise.resolve(before), { client, budget: budget(), request: REQ, evidence: '', examples: EXAMPLES, notes, recheck: () => Promise.resolve(ok),
      steps: { settings: null, budget: () => ({ usdLeft: 0.01, callsLeft: null }) } })('x');
    expect(client.seen).toHaveLength(0);
    expect(d.output).toBe(TEXT);
    expect(d.repair?.controller?.decisions.map((x) => [x.action, x.outcome])).toEqual([['rewrite', 'kept'], ['ground', 'refused']]);
    expect(d.repair?.controller?.stoppedBecause).toBe('every enforced rule holds');
    expect(d.repair?.controller?.callsUsed).toBe(1);
    expect(notes[0]).toMatch(new RegExp(`^Grounded: 1 sentence\\(s\\).*unresolved \\(the ${stepWords('ground')} was not taken: the budget: ground would cost about \\$0\\.02`));
    expect(d.repair?.notes?.[0]).toBe(notes[0]);
  });
  it('nothing to ground: no step is entered, and the record is as it was', async () => {
    const d = await withGrounding(() => Promise.resolve({ output: 'Glad it works.', repair: null, report: ok }), { client: scripted({ rewrites: [] }), budget: budget(),
      request: REQ, evidence: '', examples: EXAMPLES, recheck: () => Promise.resolve(ok) })('x');
    expect(d.repair).toBeNull();
  });
});

describe('a later shape round goes through the floor, as one step on the record', () => {
  const std = { standardVersionHash: 's', requirements: [{ requirementId: 'x1', statement: 'Never say leverage.', materiality: 'REQUIRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL',
    measurement: { observer: 'LEXICON', params: { terms: ['leverage'] } } }] } as never;
  const broken: RuleCheck = { requirementId: 'x1', statement: 'Never say leverage.', materiality: 'REQUIRED', enforced: true, observer: 'LEXICON',
    result: { verdict: 'VIOLATED', value: 1, detail: '1 use(s): leverage', spans: [] } } as unknown as RuleCheck;
  const held: RuleCheck = { ...broken, result: { verdict: 'HELD', value: 0, detail: '', spans: [] } } as unknown as RuleCheck;
  const refine = (t: string) => Promise.resolve({ output: t, report: reportOf(t.includes('leverage') ? [broken] : [held], t.includes('leverage')), repair: null });
  type Trace = NonNullable<Parameters<typeof withShape>[1]>['trace'];
  /** one later round, written by `fresh`; a typicality target makes a round 0 that holds every rule still unmet; a budget on the run's ledger gates the round */
  const shape = (fresh: string, o: { target?: number; usdLeft?: number } = {}) => {
    const trace: Trace = { drafts: [], edits: [], variants: [] };
    const notes: string[] = []; let written = 0;
    const run = withShape(refine, { client: {} as never, budget: budget(), std, calibration: null, detector: null, target: o.target ?? null, authorTarget: null, rounds: 1,
      servedText: '', task: 't', trace, taste: null, notes, fresh: () => { written += 1; return Promise.resolve(fresh); } },
    o.usdLeft === undefined ? null : { settings: null, budget: () => ({ usdLeft: o.usdLeft ?? 0, callsLeft: null }) });
    return { trace, notes, run, written: () => written };
  };
  const rowOf = (d: Awaited<ReturnType<ReturnType<typeof withShape>>>) => d.repair?.controller?.decisions.find((x) => x.action === 'shape');
  // 17 prose words, one of them the banned term
  const FIRST = 'We leverage the harbour every morning before the boats go out, and the tide sets the hour.';

  it('a round that holds the ban but adds a figure the request does not hold is not kept, and the row says so', async () => {
    const { trace, run } = shape('We use the harbour every morning; 3 boats go out at 6, and the tide sets the hour.');
    const d = await run(FIRST);
    expect(d.output).toBe(FIRST);
    const row = rowOf(d);
    expect(row?.outcome).toBe('not kept');
    expect(row?.observed.note).toMatch(/figure/);
    expect(trace.shape?.rounds.map((r) => r.kept)).toEqual([true, false]);
  });
  it('a round that holds the ban but leaves under a quarter of the words is not kept', async () => {
    const { trace, run } = shape('We use the harbour.');
    const d = await run(FIRST);
    expect(d.output).toBe(FIRST);
    const row = rowOf(d);
    expect(row?.outcome).toBe('not kept');
    expect(row?.observed.note).toBe('it would leave 4 of 17 words');
    expect(trace.shape?.rounds.map((r) => r.kept)).toEqual([true, false]);
  });
  it('a round that holds the ban and loses nothing is kept, with its row', async () => {
    const SECOND = 'We use the harbour every morning before the boats go out, and the tide sets the hour.';
    const { trace, run } = shape(SECOND);
    const d = await run(FIRST);
    expect(d.output).toBe(SECOND);
    const row = rowOf(d);
    expect(row?.outcome).toBe('kept');
    expect(row?.targets).toEqual(['x1']);
    expect(trace.shape?.rounds.map((r) => r.kept)).toEqual([false, true]);
    expect(d.repair?.why).toMatch(/^shape round 1 of 1/);
  });
  it('a round no better than the best so far is refused by the round\'s own criterion', async () => {
    const { trace, run } = shape('We leverage the harbour every morning before the boats go out, and the tide sets the hour, and we leverage it again.');
    const d = await run(FIRST);
    expect(d.output).toBe(FIRST);
    const row = rowOf(d);
    expect(row?.outcome).toBe('not kept');
    expect(row?.observed.note).toBe('it broke no fewer rules than round 0 and read no more like you');
    expect(trace.shape?.rounds.map((r) => r.kept)).toEqual([true, false]);
  });
  it('a round that newly breaks a required rule the best round held is refused by the floor', async () => {
    const HOLDS = 'We use the harbour every morning before the boats go out, and the tide sets the hour.';
    const { trace, run } = shape(FIRST, { target: 0.5 });
    const d = await run(HOLDS);
    expect(d.output).toBe(HOLDS);
    const row = rowOf(d);
    expect(row?.outcome).toBe('not kept');
    expect(row?.observed.note).toBe('it made x1 worse');
    expect(trace.shape?.rounds.map((r) => r.kept)).toEqual([true, false]);
  });
  it('with $0.30 left the round is written, as before: the step reserves what the draft call does ($0.20)', async () => {
    const SECOND = 'We use the harbour every morning before the boats go out, and the tide sets the hour.';
    const { run, written, notes } = shape(SECOND, { usdLeft: 0.3 });
    const d = await run(FIRST);
    expect(written()).toBe(1);
    expect(d.output).toBe(SECOND);
    expect(rowOf(d)?.outcome).toBe('kept');
    expect(notes).toEqual([]);
  });
  it('with less than the reserve left the round is refused unwritten, said on screen and on the record', async () => {
    const { trace, run, written, notes } = shape('We use the harbour every morning before the boats go out, and the tide sets the hour.', { usdLeft: 0.1 });
    const d = await run(FIRST);
    expect(written()).toBe(0);
    expect(d.output).toBe(FIRST);
    expect(rowOf(d)?.outcome).toBe('refused');
    expect(notes).toEqual(['Shape round 1 of 1 was not written (the budget: shape would cost about $0.20, and $0.10 are left); the best output so far was delivered.']);
    expect(trace.shape?.note).toMatch(/^round 1 could not run \(the budget: shape would cost about \$0\.20/);
  });
});

// ── through the binary ────────────────────────────────────────────────────────────────────────────────────────────

const CLI = resolve('dist/cli/atelier.mjs');
describe.skipIf(!existsSync(CLI))('through the binary: the two rows on the record, and the route that composed the passes', () => {
  let backend: ChildProcess; let port = 0;
  const url = (): string => `http://127.0.0.1:${port}`;
  const BE = (): string[] => ['--provider', 'openai-compatible', '--base-url', url(), '--model', 'scripted', '--claims', 'pattern'];
  const set = (payload: unknown): Promise<Response> => fetch(`${url()}/__set`, { method: 'POST', body: JSON.stringify(payload) });
  beforeAll(async () => {
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((done) => { backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) done(Number(m[1])); }); });
  }, 60_000);
  afterAll(() => { backend.kill(); });
  const seed = (files: Readonly<Record<string, string>> = {}) => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-fh-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-fh-proj-'));
    for (const [name, text] of Object.entries(files)) { mkdirSync(join(proj, name, '..'), { recursive: true }); writeFileSync(join(proj, name), text); }
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CONTEXT_READER: 'scripted' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...a: string[]): { code: number; out: string } => {
      try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
    };
    return { data, run };
  };
  const FIRST = 'We leverage the harbour every morning before the boats go out, and the tide sets the hour.';
  /** a one-rule skill (a banned term, counted), so round 0 breaks it; under --strict a draft that still breaks a rule is written again once */
  const quay = (second: string) => {
    const { data, run } = seed();
    run('add', '--statement', 'Never say leverage.', '--kind', 'BOUNDARY', '--applies-when', 'GENERAL', '--materiality', 'REQUIRED', '--measure', 'LEXICON:leverage');
    run('ratify-close', '--work-type', 'writing'); run('build', '--name', 'quay');
    return set({ byTool: { emit_piece: { piece: `<work>${FIRST}</work>` }, emit_replacements: { replacements: [] } },
      when: [{ containsAll: ['emit_piece', 'Write the piece so that each of them holds'], answer: { piece: `<work>${second}</work>` } }] }).then(() => ({ data, run }));
  };
  const recordOf = (data: string, skill: string) => store.listInvocations({ root: data, skillName: skill })[0];

  it('a later shape round kept on the floor is a `shape` step on the record, after the kept round\'s own steps; the route says shape ran', async () => {
    const SECOND = 'We use the harbour every morning before the boats go out, and the tide sets the hour.';
    const { data, run } = await quay(SECOND);
    const r = run('invoke', '--skill', 'quay', 'Write a note about the harbour.', '--json', '--strict', '--redraws', '1', ...BE());
    expect(r.code, r.out).toBe(0);
    const rec = recordOf(data, 'quay');
    expect(rec.output).toBe(SECOND);
    const ctl = rec.repair?.controller;
    expect(ctl?.decisions.at(-1)).toMatchObject({ action: 'shape', targets: ['x1'], outcome: 'kept' });
    expect(ctl?.rounds?.map((x) => [x.round, x.kept])).toEqual([[0, false], [1, true]]);
    expect(rec.settings?.route?.passes.find((p) => p.name === 'shape')?.on).toBe(true);
  });
  it('a later round the floor refuses is a `shape` step not kept, with why, and the first round is delivered', async () => {
    const { data, run } = await quay('We use the harbour.');
    run('invoke', '--skill', 'quay', 'Write a note about the harbour.', '--json', '--strict', '--redraws', '1', ...BE());
    const rec = recordOf(data, 'quay');
    expect(rec.output).toBe(FIRST);
    const ctl = rec.repair?.controller;
    expect(ctl?.decisions.at(-1)).toMatchObject({ action: 'shape', outcome: 'not kept', observed: expect.objectContaining({ note: 'it would leave 4 of 17 words' }) });
    expect(ctl?.rounds?.map((x) => [x.round, x.kept])).toEqual([[0, true], [1, false]]);
  });
  it('the grounding of an example\'s fact is a `ground` step on the record; the route says grounding ran', async () => {
    const RA = 'run the import once more'; const RB = 'That is all it needs.';
    const golden = (n: number): string => `---\nrequest: The PDF import stalls at ${n}0% on a scanned file. What do I do?\n---\nThat stall is the OCR pass on the scanned PDF: it reads every page before the import can move. ${'The bigger the scan, the longer that pass takes. '.repeat(n - 1)}Leave it for a minute, then ${RA} from the same screen; the second pass skips what it has read. ${RB}\n`;
    const REPLY = 'That stall is the OCR pass reading every page of the scan before the import can move. Leave it for a minute, then run the import once more from the same screen. That is all it needs.';
    await set({ byTool: { emit_persona: { points: [{ aspect: 'open', description: 'Names the cause before the fix.', frequency: 'ALWAYS', quote: RA }] },
      emit_scope: { examples: [1, 2, 3].map((n) => ({ example: n, asked: 'NEITHER', kind: 'how-to', beyond: [] })) }, emit_holds_back: { ids: [] }, emit_piece: { piece: REPLY },
      emit_rewrites: { rewrites: [{ id: 1, text: 'That stall is the first pass reading every page of the scan before the import can move.' }] } },
      when: [{ contains: 'The work is described as', answer: { examples: [1, 2, 3].map((n) => ({ example: n, answers: 'PERSON_WHO_ASKED', quote: RA })), form: 'REPLY' } }] });
    const { data, run } = seed({ 'examples/r1.md': golden(1), 'examples/r2.md': golden(2), 'examples/r3.md': golden(3) });
    const built = run('new', 'examples', 'answer support questions about the importer', '--name', 'support', ...BE().slice(0, 6));
    expect(built.code, built.out).toBe(0);
    const r = run('invoke', '--skill', 'support', 'The import stalls on a scan. Why?', '--json', ...BE().slice(0, 6));
    expect(r.code, r.out).toBe(0);
    const rec = recordOf(data, 'support');
    expect(rec.output).not.toMatch(/OCR/);
    const ctl = rec.repair?.controller;
    expect(ctl?.decisions.at(-1)).toMatchObject({ action: 'ground', targets: ['grounding'], outcome: 'kept', observed: expect.objectContaining({ calls: 1 }) });
    expect(rec.repair?.notes?.some((n) => n.startsWith('Grounded: 1 sentence'))).toBe(true);
    expect(rec.settings?.route?.passes.find((p) => p.name === 'grounding')?.on).toBe(true);
  }, 180_000);
}, 240_000);
