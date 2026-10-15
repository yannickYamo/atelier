// tests/atelier-separation.test.ts — ENFORCED RULES AND TASTE STEERING NEVER SHARE A GATE.
//
// The separation principle (core/loop/controller.ts, head): an enforced rule is judged by its value on the text as it is,
// the gain-per-dollar gate and learned effects steer only, the step cap is per run, a hand-off to a redraft is always
// followed by a redraft or a smaller step, and a redraft records the real change in |error|. Each case below failed on
// the code before this change. Modules are imported whole so a case that needs a new export fails on its own.
// Expected values are worked out from the measurement (FEATURE.observe), the documented thresholds (0.5, 1.5 widths,
// three targets a step, four steps a run) and the defaults ($0.05 a rewrite), never read back from the code under test.
import { stepLedger } from '../core/loop/controller.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FEATURE } from '../core/observers/features.js';
import * as features from '../core/observers/features.js';
import { acceptRepair, readAtLength, regressions } from '../core/loop/repair.js';
import { refineToStandard } from '../core/loop/run-repair.js';
import * as runRepair from '../core/loop/run-repair.js';
import { decide, controllerRecord, askedForRedraft, type ControllerInput } from '../core/loop/controller.js';
import { summariseEffects } from '../core/fidelity/estimator.js';
import * as invoke from '../cli/commands/invoke.js';
import { withRedraft, type Unmet } from '../cli/commands/invoke.js';
import { doneOf } from '../cli/commands/run.js';
import { copyLimit } from '../cli/eval-run.js';
import { spanIntegrity } from '../core/loop/integrity.js';
import { planFor } from '../core/plan/execution-plan.js';
import { verifyText, type RuleCheck, type VerifyReport } from '../core/observers/verify.js';
import { methodReading, methodLine } from '../core/eval/obligations.js';
import type { ControllerDecisionRecord, GradedRecord, Requirement, StandardVersion } from '../core/state/canonical-state.js';
import { expectOneCounter } from './one-counter.js';

const reportOf = (checked: RuleCheck[], failed = false): VerifyReport => ({ skill: 's', standardVersionHash: 'h', checked, unchecked: [], conditional: [], failed });
const input = (over: Partial<ControllerInput> = {}): ControllerInput => ({ enforced: [], claims: 0, length: null, graded: [], grammar: null,
  budget: { usdLeft: 1, callsLeft: null }, history: [], observedUsdPerCall: {}, can: { redraft: true, rewrite: true }, unreachable: new Set(), ...over });
const step = (action: ControllerDecisionRecord['action'], outcome: ControllerDecisionRecord['outcome'], movement = 0, targets = ['g']): ControllerDecisionRecord =>
  ({ action, targets, why: 'w', expectedGain: 1, expectedCostUsd: 0.05, outcome, observed: { movement, calls: 1, usd: 0.05 } });
const ok = (json: unknown) => Promise.resolve({ json, cost: { basis: 'API_METERED', billingUsd: 0.001 }, termination: 'COMPLETE', modelId: 'm' } as never);

describe('(a) an enforced FEATURE rule is judged by its value on the text as it is', () => {
  const s = (i: number): string => `The plain sentence number ${i} says something about the work we did today.`;
  const fill = (n: number): string => Array.from({ length: n }, (_, i) => s(i)).join(' ');
  const ap = ' We met the team (briefly) at noon.';
  const p = { feature: ['parenthesis'], minValue: 0, maxValue: 5 };
  const check = (r: ReturnType<typeof FEATURE.observe>, required: boolean): RuleCheck =>
    ({ requirementId: 'f', statement: 'f', materiality: required ? 'REQUIRED' : 'PREFERRED', enforced: required, observer: 'FEATURE', result: r });
  it('B1: a shorter rewrite that raises the owner\'s rate (fewer asides, more per 1,000 words) is worse, not progress', () => {
    const before = fill(46) + ap.repeat(4); const after = fill(28) + ap.repeat(3);
    const b = FEATURE.observe(before, p); const a = FEATURE.observe(after, p);
    // measured on the texts as they are, the rate went up: the miss is further out
    expect(Math.abs(a.error ?? 0)).toBeGreaterThan(Math.abs(b.error ?? 0));
    const verdict = acceptRepair(readAtLength(reportOf([check(b, true)]), before, after, () => p), reportOf([check(a, true)]));
    expect(verdict).toEqual({ ok: false, why: 'the rewrite made f worse' });
    // the same count in a shorter text is a regression on the owner's rule
    const after2 = fill(28) + ap.repeat(4);
    expect(regressions(readAtLength(reportOf([check(b, true)]), before, after2, () => p), reportOf([check(FEATURE.observe(after2, p), true)]))).toEqual(['f']);
  });
  it('a steering check is still read at the new length; an enforced one never is', () => {
    const before = fill(46) + ap.repeat(4); const after = fill(28) + ap.repeat(3);
    const b = FEATURE.observe(before, p);
    expect(readAtLength(reportOf([check(b, true)]), before, after, () => p).checked[0].result.error).toBe(b.error);
    expect(readAtLength(reportOf([check(b, false)]), before, after, () => p).checked[0].result.error).not.toBe(b.error);
  });
});

describe('(b) learned effects and the gain gate steer; an enforced step is always taken while the cap and budget allow', () => {
  // what `atelier fidelity --set drafts=2` writes after runs whose rewrites moved nothing
  const learned = summariseEffects([1, 2, 3].map((i) => ({ at: `2026-10-0${i}`, repair: { controller: { decisions: [step('rewrite', 'not kept', 0, ['m2']), step('redraft', 'not kept', 0, ['x2'])] } } })));
  it('B3: with a learned rewrite effect of 0, a broken REQUIRED span rule is still rewritten, and an omission still written again', () => {
    expect(learned.rewrite?.movement).toBe(0);
    expect(decide(input({ enforced: [{ id: 'm2', kind: 'span' }] }), { effects: learned })).toMatchObject({ kind: 'act', action: 'rewrite', targets: ['m2'] });
    expect(decide(input({ enforced: [{ id: 'x2', kind: 'omission' }] }), { effects: learned, minGainPerUsd: 1000 })).toMatchObject({ kind: 'act', action: 'redraft', targets: ['x2'] });
    // a steering step under the same release is still gated
    expect(decide(input({ graded: [{ id: 'g', error: 1.0, operatorEffect: null }] }), { effects: { 'carrier-rewrite': { movement: 0, usdPerAction: 0.05, n: 3 } } }))
      .toMatchObject({ kind: 'stop', why: expect.stringMatching(/^it stopped paying: carrier-rewrite/) });
    // the budget still bounds an enforced step
    expect(decide(input({ enforced: [{ id: 'm2', kind: 'span' }], budget: { usdLeft: 0.01, callsLeft: null } }))).toMatchObject({ kind: 'stop', why: expect.stringMatching(/^the budget: rewrite/) });
  });
  it('a free operator step still runs when the budget holds no model call', () => {
    const d = decide(input({ graded: [{ id: 'g', error: 1.0, operatorEffect: 0.3 }], budget: { usdLeft: 1, callsLeft: 0 } }));
    expect(d).toMatchObject({ kind: 'act', action: 'operators', targets: ['g'], expectedCostUsd: 0 });
  });
});

describe('graded steps are capped: at most three targets, the furthest first, never one at or under 0.5', () => {
  it('six features out, three of them under 0.5: the redraft targets the three far ones, and its why names exactly them', () => {
    const graded = [{ id: 'c4', error: 3.1 }, { id: 'c9', error: 0.27 }, { id: 'openerSelf', error: 0.2 }, { id: 'c6', error: -1.4 }, { id: 'c8', error: 0.08 }, { id: 'c7', error: 0.9 }]
      .map((g) => ({ ...g, operatorEffect: null }));
    const d = decide(input({ graded }));
    expect(d).toMatchObject({ kind: 'act', action: 'redraft', targets: ['c4', 'c6', 'c7'] });
    expect((d as { why: string }).why).toBe('graded miss(es) on 3 features at once (c4 3.10, c6 1.40, c7 0.90): written again with each one\'s direction and distance');
  });
  it('five far features: three taken, said so', () => {
    const graded = [2, 1.9, 1.8, 1.7, 1.6].map((e, i) => ({ id: `f${i}`, error: e, operatorEffect: null }));
    const d = decide(input({ graded }));
    expect(d).toMatchObject({ action: 'redraft', targets: ['f0', 'f1', 'f2'] });
    expect((d as { why: string }).why).toMatch(/^graded miss\(es\) on 5 features at once, the furthest 3 taken \(f0 2\.00, f1 1\.90, f2 1\.80\)/);
  });
});

describe('(c) (d) (e) one cap per run, no hand-off without a redraft, the real movement recorded', () => {
  const noRepair = (output: string) => ({ output, repair: null, report: reportOf([]) });
  const far = (off: number): Unmet => ({ id: 'x1', statement: 'Few asides.', detail: `asides ${off}`, off, graded: true });
  const handed = (output: string) => ({ output, report: reportOf([]), repair: { passes: 0, violatedBefore: [], violatedAfter: [], originalOutputHash: 'h', why: 'w',
    controller: controllerRecord([step('carrier-rewrite', 'kept', 0.4, ['x1']), { ...step('redraft', 'handed to a redraft', 0, ['x1']), observed: { movement: 0, calls: 0, usd: 0 } }], 'handed to a redraft', true) } });
  it('the second draft is refined with the first draft\'s steps and the redraft as its history; the redraft records 14 → 4.78 as 9.22', async () => {
    const histories: (readonly ControllerDecisionRecord[])[] = []; let drafts = 0;
    const go = withRedraft(async (t) => (t === 'first' ? handed(t) : noRepair(t)), { notes: [], redraft: async () => { drafts += 1; return 'second'; },
      unmet: (d) => (d.output === 'first' ? [far(14)] : [far(4.78)]),
      check: () => reportOf([]),
      resume: async (t, h) => { histories.push([...h.entries]); return noRepair(t); } });
    const d = await go('first', stepLedger());
    // the scripted first draft's own carrier rewrite, and the draft written here
    expectOneCounter(d.repair?.controller, 1 + drafts);
    expect(histories).toHaveLength(1);
    expect(histories[0].map((x) => `${x.action}|${x.outcome}`)).toEqual(['carrier-rewrite|kept', 'redraft|handed to a redraft', 'redraft|kept']);
    expect(histories[0][2].observed.movement).toBe(9.22);
    const kept = d.repair?.controller?.decisions.find((x) => x.action === 'redraft' && x.outcome === 'kept');
    expect(kept?.observed.movement).toBe(9.22);
    expect(d.repair?.controller?.handedToRedraft).not.toBe(true);
    // with that history the controller on the new draft steps down to a carrier rewrite, and counts the redraft as one step
    const history = histories[0];
    expect(decide(input({ graded: [{ id: 'x1', error: 4.78, operatorEffect: 0.2 }], history }))).toMatchObject({ kind: 'act', action: 'carrier-rewrite', targets: ['x1'] });
    // two steps taken; two more allowed, then the cap, across both drafts
    const four = [...history, step('carrier-rewrite', 'kept', 1, ['x1']), step('carrier-rewrite', 'kept', 1, ['x1'])];
    expect(decide(input({ graded: [{ id: 'x1', error: 2.5, operatorEffect: 0.2 }], history: four }))).toEqual({ kind: 'stop', why: 'the controller took its 4 steps' });
  });
  it('B2: a hand-off with nothing written after it is impossible: the next smaller step follows, or the record says none could', async () => {
    let resumed = 0;
    const withResume = withRedraft(async (t) => handed(t), { notes: [], redraft: async () => 'x', unmet: () => [], resume: async (t) => { resumed += 1; return noRepair(t); } });
    const a = await withResume('first', stepLedger());
    expect(resumed).toBe(1);
    expectOneCounter(a.repair?.controller, 1);
    expect(askedForRedraft(a.repair?.controller)).toBe(false);
    expect(a.repair?.controller?.handedToRedraft).not.toBe(true);
    const bare = await withRedraft(async (t) => handed(t), { notes: [], redraft: async () => 'x', unmet: () => [] })('first', stepLedger());
    expect(askedForRedraft(bare.repair?.controller)).toBe(false);
    expectOneCounter(bare.repair?.controller, 1);
    expect(bare.repair?.controller?.stoppedBecause).toMatch(/no draft could be written again$/);
  });
  it('a redraft no nearer as written is not refined; the smaller steps go on the first draft and the line says what they left', async () => {
    const notes: string[] = []; const refined: string[] = []; let drafts = 0;
    const go = withRedraft(async (t) => { refined.push(t); return t === 'first' ? handed(t) : noRepair(t); }, { notes, redraft: async () => { drafts += 1; return 'second'; },
      unmet: (d) => (d.output === 'resumed' ? [] : [far(3)]), check: () => reportOf([]),
      // the smaller step that follows on the first draft: one carrier rewrite, kept, on the same ledger
      resume: async (_t, ledger) => { ledger.settle(ledger.begin({ action: 'carrier-rewrite', targets: ['x1'], why: 'w', expectedGain: 1, expectedCostUsd: 0.05 }), 'kept', { movement: 3, calls: 1, usd: 0 }); return noRepair('resumed'); } });
    const d = await go('first', stepLedger());
    expectOneCounter(d.repair?.controller, 1 + drafts + 1);
    expect(refined).toEqual(['first']);
    expect(d.output).toBe('resumed');
    expect(notes.join(' ')).toMatch(/one more draft did not do better, so the first is kept\. After the smaller steps that followed, none of them is left\.$/);
  });
  it('a length beside a habit: the habit is still only what the pieces usually do', async () => {
    const notes: string[] = [];
    const length: Unmet = { id: 'length', statement: 'Write it at the length my pieces run: 369 to 437 words', detail: '179 words, 122 too few', off: 122, whole: true };
    let drafts = 0;
    const d = await withRedraft(async (t) => noRepair(t), { notes, redraft: async () => { drafts += 1; return 'second'; }, unmet: () => [length, far(2)] })('first', stepLedger());
    expectOneCounter(d.repair?.controller, drafts);
    expect(notes.join(' ')).toMatch(/2 thing\(s\) the work requires or your pieces usually do/);
  });
});

describe('a method\'s ban is a span rule: rewritten in place, never "left out"', () => {
  const ban = { requirementId: 'x1', statement: 'Never use the words "simply" or "just".', materiality: 'REQUIRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', obligation: 'DELIVERABLE',
    measurement: { observer: 'LEXICON', params: { terms: ['simply', 'just'] } } } as unknown as Requirement;
  const v = { standardVersionHash: 's', requirements: [ban] } as unknown as StandardVersion;
  it('the plan rewrites its sentence; the redraft reader does not list it', () => {
    expect(planFor(v).rules[0].onMiss).toBe('REWRITE');
    const text = 'The harbour opens at nine. We simply walk down to the pier and wait for the ferry to come in.';
    const unmet = invoke.unmetReader(v, null);
    expect(unmet === null || unmet({ output: text, report: verifyText('s', v, text) }).length === 0).toBe(true);
  });
  it('through the loop: the first step is a rewrite of its span, and the ban holds', async () => {
    const plain = 'The harbour opens at nine and the ferry crosses the bay at ten on most days of the year.';
    const text = `${Array.from({ length: 6 }, () => plain).join(' ')} We simply walk down to the pier.`;
    const client = { calls: 0, complete: () => { client.calls += 1; return ok({ replacements: [{ id: 1, text: 'We walk down to the pier.' }] }); } };
    const r = await refineToStandard(client, { spentUsd: 0, capUsd: 1 }, 'd', v, text, 2, { guardClaims: false });
    expectOneCounter(r.repair?.controller, client.calls);
    expect(r.repair?.controller?.decisions[0]).toMatchObject({ action: 'rewrite', targets: ['x1'], outcome: 'kept' });
    expect(r.report.failed).toBe(false);
  });
});

describe('what the run says', () => {
  const values = (before: number, after: number, lo: number | null, hi: number | null) => ({ before, after, lo, hi, source: 'standard' as const });
  it('S2: an enforced feature is never said as steered, and the way said is the way it moved', () => {
    const g = { steered: ['parenthesis', 'negation'], values: { parenthesis: values(9, 4, 0, 3), negation: values(0.377, 0.366, 0.4, 0.6) } } as unknown as GradedRecord;
    // the range is above both values: the needed move was "more"; what happened was fewer
    expect(invoke.steeredLine(g, new Set(['parenthesis']))).toBe('negations (not, never, no, and the n\'t forms) fewer (0.377 → 0.366 per 1,000 words)');
    // a feature a redraft moved nearer is said too, though no rewrite targeted it
    const r = { steered: [], values: { parenthesis: values(29.34, 0, 0, 3) } } as unknown as GradedRecord;
    expect(invoke.steeredLine(r)).toBe('parenthetical asides fewer (29.34 → 0 per 1,000 words)');
    expect(invoke.nearerRange(r)).toEqual(['parenthesis']);
  });
  it('no "about 0": a miss that rounds to nothing says it is under 0.1', () => {
    expect(features.featureMove({ feature: ['parenthesis'], maxValue: 10 }, 10.03)).toBe('under 0.1 fewer parenthetical asides per 1,000 words');
  });
  it('"written again" never says it now holds what was missing while some is still missed', () => {
    const run = { cut: [], report: ['Written again: the first draft missed 3 thing(s) your pieces usually do (a; b; c); it now misses 2 (a; b).'] };
    expect(doneOf(run as never)[0]).toBe('written again once for what was missing; 2 things are still missing');
  });
  it('a figure a rewrite added and one it lost are said the same way: the figure 3', () => {
    expect(spanIntegrity('We had boats.', 'We had 3 boats.', new Set(), false).lost).toContain('the figure 3, added');
    expect(spanIntegrity('We had 3 boats.', 'We had boats.', new Set(), false).lost).toContain('the figure 3');
  });
  it('one copying limit: 15 shared words under a limit of 16 is not copying on the run either', () => {
    const limit = copyLimit({ sharedAmong: 15 });
    expect(invoke.liftedLine(15, limit)).toBeNull();
    expect(invoke.liftedLine(16, limit)).toBe('(a passage is lifted from one of your examples: a run of 16 words is shared with one of them (15 at most). Rewrite that sentence.)');
  });
  it('a budget stop is said on the run, and in what `run` prints', () => {
    const line = invoke.budgetStopLine(controllerRecord([], 'the budget: redraft needs a model call, and no call is left'));
    expect(line).toBe('Repair stopped by the budget: redraft needs a model call, and no call is left. Allow more with --cap <usd> or --max-calls <n>.');
    expect(doneOf({ cut: [], report: [line] } as never)).toContain('repair stopped by the budget: redraft needs a model call, and no call is left. Allow more with --cap <usd> or --max-calls <n>');
    expect(invoke.budgetStopLine(controllerRecord([], 'every enforced rule holds and nothing graded is off'))).toBeNull();
  });
  it('a short form from longer pieces is not measured against their length', () => {
    const none = { stated: false, asked: false, shape: false, contract: false, answers: false, outOfRegister: false, sections: false };
    expect(invoke.ownLengthApplies(none)).toBe(true);
    expect(invoke.ownLengthApplies({ ...none, shortForm: true })).toBe(false);
  });
  it('a method step that does not apply to the format is neither counted nor missing', () => {
    const reqs = [{ requirementId: 'x1', statement: 'Ask the reader a question.', materiality: 'REQUIRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', obligation: 'DELIVERABLE', measurement: { observer: 'LEXICON', params: { terms: ['zzz'] } } },
      { requirementId: 'x2', statement: 'Write between 300 and 450 words.', materiality: 'REQUIRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', obligation: 'DELIVERABLE', measurement: { observer: 'LENGTH', params: { unit: ['words'], min: 300, max: 450 } } }] as unknown as Requirement[];
    const v = { standardVersionHash: 's', requirements: reqs } as unknown as StandardVersion;
    const read = runRepair.withWaivers(verifyText('s', v, 'A short post about the harbour.'), { doesNotApply: new Map([['x2', 'it cannot fit 280 characters']]) });
    expect(methodLine(methodReading(reqs, read) ?? (null as never))).toBe('Method: contains 1 of 1 thing(s) it must.');
  });
});

describe('SIGNAL ids never reach a record the person may read', () => {
  it('a controller step on a signal band is recorded under the plain feature name', async () => {
    const plain = 'The rule holds in this case and it holds elsewhere as well today, whatever the reader brings to it.';
    const aside = 'The rule holds here (as it did last year) and it holds there too, most of the time at least.';
    const text = Array.from({ length: 6 }, (_, p) => Array.from({ length: 4 }, (_, i) => (i === 0 || (p < 3 && i === 2) ? aside : plain)).join(' ')).join('\n\n');
    const v = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
    const profile = { version: 1, corpusHash: 'c', detector: null, hash: 'h', bands: [{ id: 'parenthesis', cls: 'all', band: [0, 8], median: 4, spread: 2, n: 8, role: 'SIGNAL', auc: 0.9 }] } as never;
    const client = { calls: 0, complete: () => { client.calls += 1; return ok({ replacements: [1, 2, 3].map((id) => ({ id, text: 'The rule holds here and it holds there too, most of the time at least.' })) }); } };
    const r = await refineToStandard(client, { spentUsd: 0, capUsd: 1 }, 'd', v, text, 2, { graded: 'all', gradedProfile: profile, guardClaims: false });
    expectOneCounter(r.repair?.controller, client.calls);
    const targets = (r.repair?.controller?.decisions ?? []).flatMap((d) => d.targets);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((t) => !t.startsWith('signal'))).toBe(true);
    expect(targets).toContain('parenthesis');
  });
});

describe('bench/b6: a BLOCKED invoke --json is a result, not a crash', () => {
  it('the record is read from stdout on exit 1 when it is BLOCKED; anything else is thrown', async () => {
    const { invokeRecord } = await import('../bench/b6/invoke-json.mjs');
    const fail = (status: number, stdout: string) => () => { throw Object.assign(new Error('Command failed'), { status, stdout }); };
    const blocked = JSON.stringify({ output: 'the work', eval: { record: { state: 'BLOCKED' } } });
    expect(invokeRecord(fail(1, blocked)).output).toBe('the work');
    expect(() => invokeRecord(fail(2, blocked))).toThrow('Command failed');
    expect(() => invokeRecord(fail(1, JSON.stringify({ output: 'x', eval: { record: { state: 'VERIFIED' } } })))).toThrow('Command failed');
    expect(invokeRecord(() => JSON.stringify({ output: 'fine' })).output).toBe('fine');
  });
});

// ── THROUGH THE BINARY, ON THE SCRIPTED BACKEND ─────────────────────────────────────────────────────────────────────
const ROOT = resolve(__dirname, '..');
const CLI = join(ROOT, 'dist', 'cli', 'atelier.mjs');
describe.skipIf(!existsSync(CLI))('end to end: the separation held on a real run', () => {
  let backend: ChildProcess; let port = 0; let proj = ''; let env: NodeJS.ProcessEnv = {};
  const fresh = (): void => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-sep-data-')); proj = mkdtempSync(join(tmpdir(), 'atelier-sep-proj-'));
    env = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CLAIMS: 'pattern' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
  };
  const run = (...args: string[]): string => {
    try { return execFileSync('node', [CLI, ...args], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return (e as { stdout?: string }).stdout ?? ''; }
  };
  const model = (): string[] => ['--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'];
  const script = (body: unknown) => fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify(body) });
  // the repair calls the backend answered: each span or carrier rewrite, and each draft written again or trimmed
  const repairCalls = async (): Promise<number> => ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies
    .filter((b) => b.includes('emit_replacements') || b.includes('<earlier-draft>')).length;
  const add = (statement: string, materiality: string, measure: string) => run('add', '--statement', statement, '--kind', 'BOUNDARY', '--applies-when', 'GENERAL', '--materiality', materiality, '--measure', measure);
  interface Out { output: string; controller: { decisions: ControllerDecisionRecord[]; stoppedBecause: string; handedToRedraft?: boolean } }
  beforeAll(async () => {
    backend = spawn(process.execPath, [join(ROOT, 'tests', 'fixtures', 'scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((done) => backend.stdout?.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) done(Number(m[1])); }));
  });
  afterAll(() => { backend.kill(); });

  it('B1: the owner\'s "at most 5 asides per 1,000 words" is never delivered further out than the draft', async () => {
    const plain = 'The rule holds in this case and it holds elsewhere as well today, whatever the reader brings to it.';
    const longAside = 'We met the whole team at the old office (briefly, as it happened) and we talked about the plan for the coming months, the budget lines that worried the board, the hiring that had stalled, the customers who had gone quiet, and the long list of small things that the staff meant to fix properly in time.';
    const piece = [Array.from({ length: 4 }, () => plain).join(' '), [longAside, longAside, longAside, longAside].join(' '), Array.from({ length: 2 }, () => plain).join(' ')].join('\n\n');
    fresh();
    await script({ byTool: { emit_piece: { piece }, emit_replacements: { replacements: [1, 2, 3].map((id, i) => ({ id, text: i === 0 ? 'We met the team at the office.' : 'We met the team (briefly).' })) } } });
    add('At most 5 parenthetical asides per 1,000 words.', 'REQUIRED', 'FEATURE:feature=parenthesis,minValue=0,maxValue=5');
    run('ratify-close', '--work-type', 'writing'); run('build', '--name', 'asides');
    const before = await repairCalls();
    const out = JSON.parse(run('invoke', '--skill', 'asides', 'write a note', '--json', '--allow-unsourced', ...model())) as Out;
    expectOneCounter(out.controller as never, await repairCalls() - before);
    const p = { feature: ['parenthesis'], minValue: 0, maxValue: 5 };
    expect(Math.abs(FEATURE.observe(out.output, p).error ?? 0)).toBeLessThanOrEqual(Math.abs(FEATURE.observe(piece, p).error ?? 0));
    expect(out.controller.decisions.find((d) => d.action === 'rewrite')).toMatchObject({ outcome: 'not kept', observed: { note: 'the rewrite made x1 worse' } });
  }, 120_000);

  it('B2, S1, S3: a redraft kept and still far steps down on the new draft; never ends handed; the real movement; four steps at most', async () => {
    const plain = 'The rule holds in this case and it holds elsewhere as well today, whatever the reader brings to it.';
    const aside = 'The rule holds here (as it did last year) and it holds there too, most of the time at least.';
    const mk = (n: number, k: number): string => Array.from({ length: 6 }, (_, p) => Array.from({ length: n }, (_, i) => ((p * n + i) < k ? aside : plain)).join(' ')).join('\n\n');
    const d1 = mk(3, 12); const d2 = mk(3, 4);
    fresh();
    await script({ when: [{ contains: '<earlier-draft>', answer: { piece: d2 } }], byTool: { emit_piece: { piece: d1 }, emit_replacements: { replacements: [] } } });
    add('Few asides in parentheses.', 'PREFERRED', 'FEATURE:feature=parenthesis,minValue=0,maxValue=2');
    run('ratify-close', '--work-type', 'writing'); run('build', '--name', 'asides');
    const before = await repairCalls();
    const out = JSON.parse(run('invoke', '--skill', 'asides', 'write a note', '--json', '--allow-unsourced', ...model())) as Out;
    expectOneCounter(out.controller as never, await repairCalls() - before);
    const c = out.controller;
    expect(c.handedToRedraft).not.toBe(true);
    expect(c.stoppedBecause).not.toMatch(/^handed to a redraft/);
    const steps = c.decisions.map((d) => `${d.action}|${d.outcome}`);
    // every hand-off has the redraft after it
    steps.forEach((s, i) => { if (s === 'redraft|handed to a redraft') expect(steps[i + 1]).toMatch(/^redraft\|(?:kept|not kept)$/); });
    const kept = c.decisions.find((d) => d.action === 'redraft' && d.outcome === 'kept');
    const p = { feature: ['parenthesis'], minValue: 0, maxValue: 2 };
    const real = Math.round((Math.abs(FEATURE.observe(d1, p).error ?? 0) - Math.abs(FEATURE.observe(d2, p).error ?? 0)) * 1000) / 1000;
    expect(real).toBeGreaterThan(1);
    expect(kept?.observed.movement).toBeCloseTo(real, 2);
    // the step after the kept redraft is a smaller step on the new draft, never another hand-off
    expect(steps[steps.indexOf('redraft|kept') + 1]).toMatch(/^(?:carrier-rewrite|operators)\|/);
    const counted = c.decisions.filter((d) => d.outcome !== 'handed to a redraft' && d.action !== 'cut' && d.action !== 'mechanical').length;
    expect(counted).toBeLessThanOrEqual(4);
  }, 120_000);
});
