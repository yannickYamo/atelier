// tests/atelier-steering-subordinate.test.ts — STEERING IS SUBORDINATE TO THE OWNER'S RULES, AND A HAND-OFF IS HONOURED.
//
// Each case below was first reproduced against the code before the fix (it failed there): a SIGNAL band that blocked a
// REQUIRED fix and leaked its id, fewer carriers counted as progress while the distance grew, one redraft charged as two
// steps, a hand-off to a redraft lost behind a later mechanical step, a one-sided band read across a width of a
// billion, a redraft that added a figure, and the printed lines that said two contradictory things. Expected values are
// worked out from the documented thresholds (GRADED_STEP 0.1 width, SETTLED_ERROR 0.5, four steps), not read back.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FEATURE } from '../core/observers/features.js';
import { acceptRepair, readAtLength } from '../core/loop/repair.js';
import { refineToStandard } from '../core/loop/run-repair.js';
import { decide, controllerRecord, joinRecords, askedForRedraft, redraftHandOff, describeController, type ControllerInput } from '../core/loop/controller.js';
import { ownerWords } from '../core/loop/graded.js';
import { distanceFromBand, bandWords } from '../core/observers/selection.js';
import { shortFormTransfer } from '../core/observers/short-form.js';
import { spanIntegrity } from '../core/loop/integrity.js';
import { withMeasuredEffects } from '../cli/fidelity.js';
import { describeControllerSettings } from '../cli/commands/fidelity.js';
import { withRedraft, addedFigures, stillBrokenWhy, steeredLine, unmetReader, type Unmet } from '../cli/commands/invoke.js';
import { DEFAULT_SETTINGS } from '../core/fidelity/types.js';
import type { ControllerDecisionRecord, GradedRecord, InvocationRecord, Requirement } from '../core/state/canonical-state.js';
import type { RuleCheck, VerifyReport } from '../core/observers/verify.js';

const reportOf = (checked: RuleCheck[], failed = false): VerifyReport => ({ skill: 's', standardVersionHash: 'h', checked, unchecked: [], conditional: [], failed });
const featureCheck = (id: string, r: ReturnType<typeof FEATURE.observe>): RuleCheck => ({ requirementId: id, statement: id, materiality: 'REQUIRED', enforced: true, observer: 'FEATURE', result: r });
const step = (action: ControllerDecisionRecord['action'], outcome: ControllerDecisionRecord['outcome'], movement = 0, targets = ['g']): ControllerDecisionRecord =>
  ({ action, targets, why: 'w', expectedGain: 1, expectedCostUsd: 0.05, outcome, observed: { movement, calls: 1, usd: 0.01 } });

describe('BLOCKER 2: a FEATURE rule is judged by its distance, never by its count of carriers', () => {
  const filler = (n: number): string => Array.from({ length: n }, (_, i) => `The plain sentence number ${i} says something about the work we did today.`).join(' ');
  const before = `${filler(15)} We met the team (briefly) at noon today. We saw the plan (again) and agreed today. We wrote the notes (twice) for the record today.`;
  const after = `${filler(15)} We met the team (briefly) (again) (twice) (once) (later) at noon and wrote the notes for the record today.`;
  const p = { feature: ['parenthesis'], minValue: 0, maxValue: 5 };
  it('three carriers at 1.727 widths becoming one at 3.673 is refused as worse, not accepted as fewer places', () => {
    const b = FEATURE.observe(before, p); const a = FEATURE.observe(after, p);
    expect([b.error, b.spans.length, a.error, a.spans.length]).toEqual([1.727, 3, 3.673, 1]);
    expect(acceptRepair(reportOf([featureCheck('f', b)]), reportOf([featureCheck('f', a)]))).toEqual({ ok: false, why: 'the rewrite made f worse' });
    // and the other way round it is progress, read by the distance it closed
    expect(acceptRepair(reportOf([featureCheck('f', a)]), reportOf([featureCheck('f', b)]))).toEqual({ ok: true, why: 'feature rule(s) nearer the band: f 3.7 → 1.7' });
  });
  it('a shorter text with the count unchanged is read at its new length: no drift is read as a regression', () => {
    const colon = { feature: ['colon'], minValue: 0, maxValue: 2 };
    const sentence = 'The harbour office keeps the timetable: it opens at nine and shuts at five on weekdays.';
    const long = Array.from({ length: 30 }, () => sentence).join(' ');
    const short = Array.from({ length: 29 }, () => sentence).join(' ').replace(/: it opens/g, ', it opens').replace(', it opens', ': it opens');
    // the count of colons fell from 30 to 1 and the text shortened: read at length, nothing got worse
    const b = FEATURE.observe(long, colon); const a = FEATURE.observe(short, colon);
    const atLength = readAtLength(reportOf([featureCheck('c', b)]), long, short, () => colon);
    expect(acceptRepair(atLength, reportOf([featureCheck('c', a)])).ok).toBe(true);
  });
});

describe('BLOCKER 1: a SIGNAL band never blocks a fix to a REQUIRED rule, and its id never reaches the owner', () => {
  const ok = (json: unknown) => Promise.resolve({ json, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never);
  const plain = 'The rule holds in this case and it holds elsewhere as well today, whatever the reader brings to it.';
  const text = `${Array.from({ length: 24 }, () => plain).join(' ')} We leverage our scale to move and win against rivals.`;
  const v = { standardVersionHash: 's', requirements: [{ requirementId: 'r1', statement: 'Never say leverage.', materiality: 'REQUIRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', measurement: { observer: 'LEXICON', params: { terms: ['leverage'] } } }] } as never;
  const profile = { version: 1, corpusHash: 'c', detector: null, hash: 'h', bands: [{ id: 'parenthesis', cls: 'all', band: [0, 2], median: 1, spread: 1, n: 8, role: 'SIGNAL', auc: 0.9 }] } as never;
  // the rewrite that removes "leverage" adds four parenthetical asides: a SIGNAL band moves far out
  const client = { complete: () => ok({ replacements: [{ id: 1, text: 'We use it (often) to move (quickly) and win (sometimes) against (some) rivals.' }] }) };
  it('the REQUIRED fix is kept, the draft is delivered holding every rule, and what it displaced is recorded as observed', async () => {
    const r = await refineToStandard(client, { spentUsd: 0, capUsd: 1 }, 'd', v, text, 2, { graded: 'all', gradedProfile: profile, guardClaims: false });
    expect(r.report.failed).toBe(false);
    expect(r.output).not.toMatch(/leverage/);
    const first = r.repair?.controller?.decisions[0];
    expect(first).toMatchObject({ action: 'rewrite', targets: ['r1'], outcome: 'kept' });
    expect(first?.observed.note).toMatch(/^displacement observed: /);
    expect(r.repair?.why).toBe('every REQUIRED measured rule now holds');
  });
  it('no signal id is in any string the run records or prints', async () => {
    const r = await refineToStandard(client, { spentUsd: 0, capUsd: 1 }, 'd', v, text, 2, { graded: 'all', gradedProfile: profile, guardClaims: false });
    const strings = JSON.stringify({ why: r.repair?.why, notes: r.repair?.notes, edits: r.repair?.edits, graded: r.repair?.graded?.edits,
      decisions: r.repair?.controller?.decisions.map((d) => [d.why, d.observed.note]), stopped: r.repair?.controller?.stoppedBecause, report: r.report });
    expect(strings).not.toMatch(/signal·/);
    expect(describeController(r.repair?.controller ?? controllerRecord([], 'x')).join('\n')).not.toMatch(/signal·/);
    expect(ownerWords('the rewrite made signal·parenthesis worse')).toBe('the rewrite made parenthetical asides (as your pieces hold them) worse');
  });
  it('a step for a graded or signal target is still weighed by them: a steering rewrite is refused for displacing another feature', () => {
    const b = reportOf([{ requirementId: 'signal·colon', statement: 's', materiality: null, enforced: false, observer: 'FEATURE', result: { verdict: 'MET', spans: [], value: 1, error: 0, detail: '' } }]);
    const a = reportOf([{ requirementId: 'signal·colon', statement: 's', materiality: null, enforced: false, observer: 'FEATURE', result: { verdict: 'VIOLATED', spans: [], value: 9, error: 3, detail: '' } }]);
    expect(acceptRepair(b, a).why).toBe('the rewrite made signal·colon worse');
    expect(acceptRepair(b, a, { ignore: new Set(['signal·colon']) }).why).toBe('the rewrite fixed no REQUIRED rule');
  });
});

describe('the controller: one redraft is one step, the pass cap says so, a step-down says its real distance', () => {
  const input = (over: Partial<ControllerInput> = {}): ControllerInput => ({ enforced: [], claims: 0, length: null, graded: [], grammar: null,
    budget: { usdLeft: 1, callsLeft: null }, history: [], observedUsdPerCall: {}, can: { redraft: true, rewrite: true }, unreachable: new Set(), ...over });
  it('a hand-off and its redraft count once against the four steps', () => {
    const history = [step('redraft', 'handed to a redraft'), step('redraft', 'not kept'), step('carrier-rewrite', 'kept', 1.8), step('carrier-rewrite', 'kept', 1.2)];
    // three steps taken: a fourth may be
    expect(decide(input({ graded: [{ id: 'g', error: 0.9, operatorEffect: null }], history }))).toMatchObject({ kind: 'act', action: 'carrier-rewrite' });
    expect(decide(input({ graded: [{ id: 'g', error: 0.9, operatorEffect: null }], history: [...history, step('operators', 'kept', 0.2)] }))).toEqual({ kind: 'stop', why: 'the controller took its 4 steps' });
  });
  it('with the rewrite passes used, the stop says so', () => {
    expect(decide(input({ graded: [{ id: 'g', error: 1.0, operatorEffect: null }], can: { redraft: false, rewrite: false } }))).toEqual({ kind: 'stop', why: 'the rewrite passes allowed were used, with g left' });
    expect(decide(input({ enforced: [{ id: 'e', kind: 'span' }], can: { redraft: false, rewrite: false } }))).toEqual({ kind: 'stop', why: 'the rewrite passes allowed were used, with e left' });
  });
  it('after a redraft did no better, the carrier rewrite is said at the real distance, not as 0.5 to 1.5', () => {
    const d = decide(input({ graded: [{ id: 'g', error: 2, operatorEffect: 0.2 }], history: [step('redraft', 'handed to a redraft'), step('redraft', 'not kept')] }));
    expect(d).toMatchObject({ kind: 'act', action: 'carrier-rewrite' });
    expect((d as { why: string }).why).toMatch(/^graded miss\(es\) at g 2\.00 band widths: up to 2 carrier sentence\(s\) each rewritten; switched to it because redraft on g not kept/);
    expect((d as { why: string }).why).not.toMatch(/0\.5 to 1\.5/);
  });
  it('a step the calls cannot hold says the calls ran out, not "$0.00"', () => {
    const d = decide(input({ graded: [{ id: 'g', error: 1.0, operatorEffect: null }], budget: { usdLeft: 1, callsLeft: 0 }, observedUsdPerCall: { 'carrier-rewrite': 0.0004 } }));
    expect(d).toEqual({ kind: 'stop', why: 'the budget: carrier-rewrite needs a model call, and no call is left' });
  });
});

describe('B1: a hand-off to a redraft is a flag on the record, honoured whatever bookkeeping follows it', () => {
  it('the flag survives a later mechanical step; joining with the redraft clears it; an old record reads by its last step', () => {
    const handed = controllerRecord([step('redraft', 'handed to a redraft'), step('mechanical', 'not kept', 0, ['x1'])], 'handed', true);
    expect(askedForRedraft(handed)).toBe(true);
    expect(redraftHandOff(handed)?.outcome).toBe('handed to a redraft');
    expect(askedForRedraft(controllerRecord(handed.decisions, 'handed'))).toBe(false);
    expect(askedForRedraft(joinRecords(handed, step('redraft', 'kept'), undefined))).toBe(false);
    expect(askedForRedraft(controllerRecord([step('redraft', 'handed to a redraft')], 'handed'))).toBe(true);
  });
});

describe('withRedraft: the owner first, figures guarded, notes only what is far', () => {
  const noRepair = (output: string) => ({ output, repair: null, report: reportOf([]) });
  const enforced: Unmet = { id: 'x1', statement: 'Include a section on costs.', detail: 'missing' };
  const near: Unmet = { id: 'g1', statement: 'Few colons.', detail: 'colons 3', off: 0.3, graded: true };
  const far: Unmet = { id: 'g2', statement: 'Few asides.', detail: 'asides 9', off: 0.8, graded: true };
  const run = async (o: { second: string; displaced?: readonly string[]; misses: (out: string) => Unmet[]; figures?: boolean }) => {
    const notes: string[] = []; const sent: string[] = [];
    const go = withRedraft(async (t) => noRepair(t), { unmet: (d) => o.misses(d.output), notes, redraft: async (note) => { sent.push(note); return o.second; },
      displaced: () => o.displaced ?? [], ...(o.figures ? { addedFigures: (a: string, b: string) => addedFigures(a, b, 'the request') } : {}) });
    const d = await go('first draft');
    return { d, notes, sent };
  };
  it('a redraft for an enforced miss tells only the graded misses over 0.5 widths', async () => {
    const { sent } = await run({ second: 'second', misses: (out) => (out === 'first draft' ? [enforced, near, far] : []) });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('Few asides.'); expect(sent[0]).not.toContain('Few colons.');
  });
  it('a redraft for an enforced miss is kept although it displaced a feature: said as observed', async () => {
    const { d, notes } = await run({ second: 'second', displaced: ['colons moved from inside your range to 2 widths outside it'], misses: (out) => (out === 'first draft' ? [enforced] : []) });
    expect(d.output).toBe('second');
    expect(notes.join(' ')).toMatch(/Displacement observed: colons moved/);
  });
  it('a redraft for graded misses alone is refused for the same displacement', async () => {
    const { d, notes } = await run({ second: 'second', displaced: ['colons moved'], misses: (out) => (out === 'first draft' ? [far] : []) });
    expect(d.output).toBe('first draft');
    expect(notes.join(' ')).toMatch(/It displaced what your pieces hold/);
    // a graded miss is missed, never "left out"
    expect(notes.join(' ')).toMatch(/^The draft misses 1 thing\(s\) your pieces usually do/);
  });
  it('S3: a redraft that adds a figure no draft, request or material holds is not kept', async () => {
    const { d, notes } = await run({ second: 'second, with 37 percent of rescues', figures: true, misses: (out) => (out === 'first draft' ? [enforced] : []) });
    expect(d.output).toBe('first draft');
    expect(notes.join(' ')).toMatch(/It added a figure that neither the earlier draft, the request nor your material holds \(37\)/);
    expect(addedFigures('We had 3 boats.', '1. We had 3 boats.\n2. And 12 crew.', 'the request')).toEqual(['12']);
    expect(addedFigures('We had 3 boats.', 'We had 3 boats and 12 crew.', 'we had 12 crew')).toEqual([]);
  });
});

describe('S1: a one-sided band is read from its edge, in the feature\'s own unit', () => {
  it('distanceFromBand, the FEATURE check and the printed range', () => {
    expect(distanceFromBand(22.333, [-1e9, 0.001])).toBe(22.332);
    expect(distanceFromBand(22.333, [-Infinity, 0.001])).toBe(22.332);
    expect(distanceFromBand(1, [3, 1e9])).toBe(2);
    expect(distanceFromBand(5, [2, 4])).toBe(0.5);
    expect(bandWords([-1e9, 0.001])).toBe('at most 0.001');
    expect(bandWords([3, Infinity])).toBe('at least 3');
    const text = Array.from({ length: 20 }, () => 'The ferry (as ever) leaves at eleven and the crossing is calm.').join(' ');
    const r = FEATURE.observe(text, { feature: ['parenthesis'], minValue: -1e9, maxValue: 0.001 });
    expect(r.verdict).toBe('VIOLATED');
    expect(r.error).toBeGreaterThan(50);
    expect(r.detail).toMatch(/your range is at most 0\.001 per 1,000 words/);
  });
});

describe('S5: an owner\'s length the format cannot hold does not apply to it, said once', () => {
  const req = (id: string, measurement: Requirement['measurement'], statement: string): Requirement =>
    ({ requirementId: id, statement, materiality: 'REQUIRED', authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_ADDED', appliesWhen: 'GENERAL', measurement } as unknown as Requirement);
  it('300 to 450 words in 280 characters is set down as not applying; a ban still holds; a reachable length is kept', () => {
    const t = shortFormTransfer([req('x1', { observer: 'LEXICON', params: { terms: ['delve'] } } as never, 'Never use delve.'),
      req('x2', { observer: 'LENGTH', params: { unit: ['words'], min: 300, max: 450 } } as never, 'Write between 300 and 450 words.')], { chars: 280, from: 'a post on X' });
    expect([...t?.doesNotApply.keys() ?? []]).toEqual(['x2']);
    expect(t?.said).toMatch(/Your stated length \("Write between 300 and 450 words\."\) cannot fit at most 280 characters, so it does not apply to this format\.$/);
    expect(t?.said.match(/cannot fit/g)).toHaveLength(1);
    const kept = shortFormTransfer([req('x3', { observer: 'LENGTH', params: { unit: ['words'], max: 40 } } as never, 'At most 40 words.')], { chars: 280, from: 'a post on X' });
    expect(kept?.doesNotApply.size).toBe(0);
  });
});

describe('what the run prints says one thing at a time', () => {
  it('"still broken" is never followed by "every REQUIRED measured rule now holds"', () => {
    expect(stillBrokenWhy('every REQUIRED measured rule now holds; fixed without a model: x8: 1 mechanical error(s) corrected')).toBe(' fixed without a model: x8: 1 mechanical error(s) corrected');
    expect(stillBrokenWhy('every REQUIRED measured rule now holds (invented claims cut)')).toBe(' invented claims cut');
    expect(stillBrokenWhy('every REQUIRED measured rule now holds')).toBe('');
    expect(stillBrokenWhy('a rewrite was discarded: the rewrite made x2 worse')).toBe(' a rewrite was discarded: the rewrite made x2 worse');
  });
  it('a feature that did not move is not said as steered', () => {
    const g = { steered: ['negation', 'parenthesis'], values: { negation: { before: 0.392, after: 0.392, lo: 0.1, hi: 0.2, source: 'standard' }, parenthesis: { before: 9, after: 4, lo: 0, hi: 3, source: 'standard' } } } as unknown as GradedRecord;
    expect(steeredLine(g)).toBe('parenthetical asides fewer (9 → 4 per 1,000 words)');
  });
  it('an added negation is said as added, never as lost', () => {
    const r = spanIntegrity('The ferry runs at night.', 'The ferry does not run at night.', new Set(), false);
    expect(r.ok).toBe(false);
    expect(r.lost.join('; ')).toMatch(/^added a negation \(0 → 1\)/);
  });
  it('a feature miss told with its move does not state the move twice', () => {
    const plain = 'The rule holds in this case and it holds elsewhere as well today, whatever the reader brings to it.';
    const aside = 'The rule holds here (as it did last year) and it holds there too (most of the time, at least).';
    const text = Array.from({ length: 8 }, (_, i) => Array.from({ length: 3 }, (_, k) => ((i * 3 + k) % 3 === 0 ? aside : plain)).join(' ')).join('\n\n');
    const params = { feature: ['parenthesis'], minValue: 1, maxValue: 3 };
    const std = { requirements: [{ requirementId: 'p1', statement: 'Few asides.', materiality: 'PREFERRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', measurement: { observer: 'FEATURE', params } }] } as never;
    const report = reportOf([{ requirementId: 'p1', statement: 'Few asides.', materiality: 'PREFERRED', enforced: false, observer: 'FEATURE', result: FEATURE.observe(text, params) }]);
    const [miss] = unmetReader(std, null, null, ['parenthesis'])?.({ output: text, report }) ?? [];
    expect(miss.move).toMatch(/^about [\d.]+ fewer parenthetical asides per 1,000 words$/);
    expect(miss.detail).not.toMatch(/to remove/);
  });
});

describe('SHOULD-FIX 4: a release records what the controller has measured, and the report shows the settings in force', () => {
  const rec = (at: string, decisions: ControllerDecisionRecord[], standardVersionHash = 's1') => ({ at, standardVersionHash, repair: { controller: { decisions } } }) as unknown as InvocationRecord;
  it('a new release carries the effects of this standard\'s runs; with none on record the settings are as they were', () => {
    const runs = [rec('2026-01-01', [step('carrier-rewrite', 'kept', 0.5)]), rec('2026-01-02', [step('carrier-rewrite', 'not kept')]), rec('2026-01-03', [step('rewrite', 'kept', 2)], 's0')];
    const s = withMeasuredEffects(DEFAULT_SETTINGS, runs, 's1');
    // EWMA λ = 0.2 over 0.5 then 0: 0.8 × 0.5 + 0.2 × 0 = 0.4; dollars 0.01 each
    expect(s.controller?.effects).toEqual({ 'carrier-rewrite': { movement: 0.4, usdPerAction: 0.01, n: 2 } });
    expect(withMeasuredEffects(DEFAULT_SETTINGS, [], 's1')).toBe(DEFAULT_SETTINGS);
    expect(describeControllerSettings(s.controller)).toEqual([
      'repair controller: at least 2 band width(s) expected per dollar, at most 4 step(s) a run, no extra draft',
      '  measured effects: carrier-rewrite 0.4 a target for $0.0100 (n=2)']);
    expect(describeControllerSettings(undefined)[0]).toMatch(/\(the defaults\)$/);
  });
});

// ── THROUGH THE BINARY, ON THE SCRIPTED BACKEND ─────────────────────────────────────────────────────────────────────
const ROOT = resolve(__dirname, '..');
const CLI = join(ROOT, 'dist', 'cli', 'atelier.mjs');
describe.skipIf(!existsSync(CLI))('end to end: the hand-off honoured, one exit code, the controller record as it happened', () => {
  let backend: ChildProcess; let port = 0;
  // A folder of its own for each skill: rules added in one project are that project's standard.
  let proj = ''; let env: NodeJS.ProcessEnv = {};
  const fresh = (): void => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-steer-data-')); proj = mkdtempSync(join(tmpdir(), 'atelier-steer-proj-'));
    env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CLAIMS: 'pattern' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
  };
  const run = (...args: string[]): { code: number; out: string } => {
    try { return { code: 0, out: execFileSync('node', [CLI, ...args], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { const x = e as { status?: number; stdout?: string }; return { code: x.status ?? 1, out: x.stdout ?? '' }; }
  };
  const model = (): string[] => ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'];
  const script = (body: unknown) => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify(body) });
  const add = (statement: string, materiality: string, measure: string) => run('add', '--statement', statement, '--kind', 'BOUNDARY', '--applies-when', 'GENERAL', '--materiality', materiality, '--measure', measure);
  beforeAll(async () => {
    backend = spawn(process.execPath, [join(ROOT, 'tests', 'fixtures', 'scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => backend.stdout?.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }));
  });
  afterAll(() => { backend.kill(); });

  it('B1 (the wall-of-text case): a hand-off followed by a mechanical fix still writes the redraft, and the feature moves', async () => {
    const plain = 'The ferry leaves the pier at eleven and the crossing is calm on most nights of the year.';
    const aside = 'The ferry leaves (as it always has) and the crossing (on most nights) is calm and quiet.';
    const wall = `${Array.from({ length: 12 }, (_, i) => (i % 2 ? plain : aside)).join(' ')} We walked to the ramp, seperate from the crowd.`;
    const calm = `${Array.from({ length: 12 }, () => plain).join(' ')} We walked to the ramp, seperate from the crowd.`;
    fresh();
    await script({ when: [{ contains: 'did not do what your pieces usually do', answer: { piece: calm } }], byTool: { emit_piece: { piece: wall }, emit_replacements: { replacements: [] } } });
    add('No spelling mistakes.', 'REQUIRED', 'GRAMMAR:dialect=american');
    add('Few asides in parentheses.', 'PREFERRED', 'FEATURE:feature=parenthesis,minValue=0,maxValue=2');
    run('ratify-close', '--work-type', 'writing'); run('build', '--name', 'ferry');
    const r = run('invoke', '--skill', 'ferry', 'write a note about the ferry', '--json', '--allow-unsourced', ...model());
    const j = JSON.parse(r.out) as { output: string; controller: { decisions: { action: string; outcome: string }[] }; graded: { redrafts: number; values: Record<string, { before: number; after: number }> } };
    const steps = j.controller.decisions.map((d) => `${d.action}|${d.outcome}`);
    // the hand-off, then the mechanical fix after it, then the redraft it asked for
    expect(steps.slice(0, 3)).toEqual(['redraft|handed to a redraft', 'mechanical|kept', 'redraft|kept']);
    expect(j.graded.redrafts).toBe(1);
    expect(j.graded.values.parenthesis.after).toBeLessThan(j.graded.values.parenthesis.before);
    expect(j.output).not.toContain('(');
  }, 120_000);

  it('the same run twice records the same controller steps; three counted steps never read as four; a note says its move once', async () => {
    const plain = 'The rule holds in this case and it holds elsewhere as well today, whatever the reader brings to it.';
    const aside = 'The rule holds here (as it did last year) and it holds there too (most of the time, at least).';
    const far = Array.from({ length: 8 }, (_, i) => Array.from({ length: 3 }, (_, k) => ((i * 3 + k) % 3 === 0 ? aside : plain)).join(' ')).join('\n\n');
    fresh();
    await script({ byTool: { emit_piece: { piece: far }, emit_replacements: { replacements: [1, 2, 3].map((id) => ({ id, text: aside.replace(/[()]/g, '') })) } } });
    add('Few asides here.', 'PREFERRED', 'FEATURE:feature=parenthesis,minValue=2,maxValue=9');
    run('ratify-close', '--work-type', 'writing'); run('build', '--name', 'asides');
    const once = (): { controller: { decisions: { action: string; outcome: string }[]; stoppedBecause: string }; graded: { notes: string[] } } =>
      JSON.parse(run('invoke', '--skill', 'asides', 'write a note', '--json', '--allow-unsourced', ...model()).out) as { controller: { decisions: { action: string; outcome: string }[]; stoppedBecause: string }; graded: { notes: string[] } };
    const a = once(); const b = once();
    expect(JSON.stringify(a.controller)).toBe(JSON.stringify(b.controller));
    const counted = a.controller.decisions.filter((d) => d.outcome !== 'handed to a redraft' && d.action !== 'cut' && d.action !== 'mechanical').length;
    if (counted < 4) expect(a.controller.stoppedBecause).not.toBe('the controller took its 4 steps');
    for (const n of a.graded.notes) expect(n.match(/about [\d.]+ (?:to remove|fewer)/g) ?? []).toHaveLength(1);
  }, 180_000);

  it('S2: invoke --json exits 1 on a BLOCKED run, as run --json does', async () => {
    const plain = 'We leverage the harbour to move freight at night, and the ferry runs on time.';
    fresh();
    await script({ byTool: { emit_piece: { piece: Array.from({ length: 6 }, () => plain).join(' ') }, emit_replacements: { replacements: [] } } });
    add('Never say leverage.', 'REQUIRED', 'LEXICON:leverage');
    run('ratify-close', '--work-type', 'writing'); run('build', '--name', 'freight');
    const inv = run('invoke', '--skill', 'freight', 'write a note about freight', '--json', '--allow-unsourced', ...model());
    expect((JSON.parse(inv.out) as { eval: { record: { state: string } } }).eval.record.state).toBe('BLOCKED');
    expect(inv.code).toBe(1);
    expect(run('run', '--skill', 'freight', 'write a note about freight', '--json', '--allow-unsourced', ...model()).code).toBe(1);
  }, 120_000);
});
