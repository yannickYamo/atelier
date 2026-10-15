// tests/atelier-one-counter.test.ts — ONE STEP COUNTER FOR EVERY REPAIR ACTION OF A RUN.
//
// The controller counted its own steps, while the trims and drafts written again in `withRedraft` ran beside it: a run
// on a method skill took five steps and its record said "the controller took its 4 steps". Here every model-calling or
// text-changing repair action passes through the one counter, recorded as 'trim' or 'redraft', priced from the ledger,
// and stopped, with the stop saying which, when the step limit (four a run by default) or the budget is reached. The
// shape rounds of --until-typical are the documented exception: a round is a draft attempt with a limit of its own.
//
// Expected values come from the documented contract (four steps a run, three graded targets a step, 0.5 band widths,
// the stop wordings in docs/MEASURED-RULES.md) and from the scenario's own counts, never read back from the code.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync, cpSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as invoke from '../cli/commands/invoke.js';
import { withRedraft, type Unmet } from '../cli/commands/invoke.js';
import { controllerRecord, decide, type ControllerInput } from '../core/loop/controller.js';
import { gradedRules } from '../core/loop/run-repair.js';
import { methodReading, methodLine } from '../core/eval/obligations.js';
import { renderSkillCard, type SkillCard } from '../core/eval/skill-card.js';
import { doneOf } from '../cli/commands/run.js';
import type { RuleCheck, VerifyReport } from '../core/observers/verify.js';
import type { ControllerDecisionRecord, ControllerRecord, Requirement, StandardVersion } from '../core/state/canonical-state.js';
import { expectOneCounter, stepsOn } from './one-counter.js';

const reportOf = (checked: RuleCheck[] = []): VerifyReport => ({ skill: 's', standardVersionHash: 'h', checked, unchecked: [], conditional: [], failed: false });
const step = (action: ControllerDecisionRecord['action'], outcome: ControllerDecisionRecord['outcome'], targets: string[], calls = 1): ControllerDecisionRecord =>
  ({ action, targets, why: 'w', expectedGain: 1, expectedCostUsd: 0.05, outcome, observed: { movement: outcome === 'kept' ? 1 : 0, calls, usd: 0 } });
const noRepair = (output: string) => ({ output, report: reportOf(), repair: null });
const words = (n: number): string => Array.from({ length: n }, () => 'word').join(' ');
const count = (t: string): number => t.split(/\s+/).filter(Boolean).length;
/** "Write between 120 and 300 words": the draft runs long, which a trim mends. */
const tooLong = (d: { output: string }): Unmet[] => {
  const n = count(d.output);
  return n > 300 ? [{ id: 'x2', statement: 'Write between 120 and 300 words.', detail: `${n} words`, off: n - 300, aim: 'aim for 270 words or fewer', whole: true }] : [];
};

describe('a trim and a draft written again are steps on the one counter', () => {
  // The record of the run the defect was found on: two span rewrites, then the draft handed over for its length.
  const first = words(400);
  const handed = (output: string) => ({ output, report: reportOf(), repair: { passes: 0, violatedBefore: [], violatedAfter: [], originalOutputHash: 'h', why: 'w',
    controller: controllerRecord([step('rewrite', 'kept', ['x1']), step('rewrite', 'kept', ['x1']), step('redraft', 'handed to a redraft', ['x2'], 0)], 'handed to a redraft', true) } });
  /** the writer: names nothing to cut, and each time it writes the piece shorter, ten words fewer */
  const writer = () => {
    const w = { calls: 0, n: 400, redraft: async (note: string): Promise<string> => { w.calls += 1; if (note.includes('Choose what to delete')) return ''; w.n -= 10; return words(w.n); } };
    return w;
  };

  it('the run that took five steps under a limit of four: the third trim is not taken, and the stop says the limit stopped it', async () => {
    const w = writer(); const notes: string[] = [];
    const d = await withRedraft(async (t) => (t === first ? handed(t) : noRepair(t)), { notes, unmet: tooLong, redraft: w.redraft, check: () => reportOf(), resume: async (t) => noRepair(t) })(first);
    const ctl = d.repair?.controller;
    // two rewrites were the scripted draft's own; every other call was a trim here
    expectOneCounter(ctl, 2 + w.calls);
    expect(stepsOn(ctl?.decisions ?? [])).toBe(4);
    expect(w.calls).toBe(2);
    expect(ctl?.decisions.filter((x) => x.outcome !== 'handed to a redraft').map((x) => x.action)).toEqual(['rewrite', 'rewrite', 'trim', 'trim']);
    expect(ctl?.stoppedBecause).toBe('the controller took its 4 steps; the trim was not taken');
    expect(notes.join('\n')).toContain('no further cut was made: the controller took its 4 steps');
  });
  it('a lower limit from the release holds the same way, for a draft written again for what the work requires', async () => {
    const section: Unmet = { id: 'x3', statement: 'End with the one thing to check.', detail: 'missing' };
    const two = (output: string) => ({ output, report: reportOf(), repair: { passes: 0, violatedBefore: [], violatedAfter: [], originalOutputHash: 'h', why: 'w',
      controller: controllerRecord([step('rewrite', 'kept', ['x1']), step('rewrite', 'kept', ['x1'])], 'every action tried failed on what is left') } });
    let drafts = 0;
    const d = await withRedraft(async (t) => (t === 'first' ? two(t) : noRepair(t)), { notes: [], unmet: (x) => (x.output === 'first' ? [section] : []),
      redraft: async () => { drafts += 1; return 'second'; }, steps: { settings: { maxActions: 2 }, budget: () => ({ usdLeft: 1, callsLeft: null }) } })('first');
    expect(drafts).toBe(0);
    expect(d.output).toBe('first');
    expectOneCounter(d.repair?.controller, 2, [], 2);
    expect(d.repair?.controller?.stoppedBecause).toBe('the controller took its 2 steps; the redraft was not taken');
  });
  it('the budget: with no call left, no trim is taken, the stop says the budget, and the run says so', async () => {
    const w = writer(); const notes: string[] = [];
    const d = await withRedraft(async (t) => noRepair(t), { notes, unmet: tooLong, redraft: w.redraft, steps: { settings: null, budget: () => ({ usdLeft: 1, callsLeft: 0 }) } })(first);
    expect(w.calls).toBe(0);
    expectOneCounter(d.repair?.controller, 0);
    expect(d.repair?.controller?.stoppedBecause).toBe('the budget: trim needs a model call, and no call is left; the trim was not taken');
    expect(invoke.budgetStopLine(d.repair?.controller)).toBe('Repair stopped by the budget: trim needs a model call, and no call is left; the trim was not taken. Allow more with --cap <usd> or --max-calls <n>.');
  });
  it('a trim is priced from the ledger when the run has paid for a draft, and from the documented $0.40 otherwise', async () => {
    const w = writer();
    const d = await withRedraft(async (t) => noRepair(t), { notes: [], unmet: tooLong, redraft: w.redraft, steps: { settings: null, budget: () => ({ usdLeft: 0.3, callsLeft: null }) } })(first);
    expect(w.calls).toBe(0);
    expect(d.repair?.controller?.stoppedBecause).toBe('the budget: trim would cost about $0.40, and $0.30 are left; the trim was not taken');
    const paid = writer();
    const e = await withRedraft(async (t) => noRepair(t), { notes: [], unmet: tooLong, redraft: paid.redraft, steps: { settings: null, budget: () => ({ usdLeft: 0.3, callsLeft: null }), usdPerCall: () => 0.02 } })(first);
    const trims = e.repair?.controller?.decisions.filter((x) => x.action === 'trim') ?? [];
    expect(trims.length).toBe(paid.calls);
    expect(trims.every((x) => x.expectedCostUsd === 0.02)).toBe(true);
    expectOneCounter(e.repair?.controller, paid.calls);
  });
});

describe('--until-typical: each round has its own steps, all of them on the record, and is told what the controller would act on', () => {
  const feature = (id: string): Requirement => ({ requirementId: id, statement: `${id} in range.`, materiality: 'PREFERRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL',
    measurement: { observer: 'FEATURE', params: { feature: ['parenthesis'], minValue: 0, maxValue: 5 } } }) as unknown as Requirement;
  const ban = { requirementId: 'b1', statement: 'Never say leverage.', materiality: 'REQUIRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', measurement: { observer: 'LEXICON', params: { terms: ['leverage'] } } } as unknown as Requirement;
  const std = { standardVersionHash: 's', requirements: [...['g1', 'g2', 'g3', 'g4', 'g5'].map(feature), ban] } as unknown as StandardVersion;
  const off = (id: string, error: number): RuleCheck => ({ requirementId: id, statement: id, materiality: 'PREFERRED', enforced: false, observer: 'FEATURE',
    result: { verdict: 'VIOLATED', value: 5 + error * 5, error, detail: `${id} off`, spans: [] } } as unknown as RuleCheck);
  const broken: RuleCheck = { requirementId: 'b1', statement: 'Never say leverage.', materiality: 'REQUIRED', enforced: true, observer: 'LEXICON',
    result: { verdict: 'VIOLATED', value: 1, detail: '1 use(s): leverage', spans: [{ start: 0, end: 8, text: 'leverage', why: '' }] } } as unknown as RuleCheck;
  it('a round is told every rule required, and of the graded misses only those over 0.5 widths, at most three, the furthest first', () => {
    const report = reportOf([off('g1', 0.3), off('g2', 2), off('g3', 1), off('g4', 0.8), off('g5', 3), broken]);
    const misses = invoke.roundMisses(std, { output: 'text', report }, 'all');
    expect(misses.filter((u) => u.graded).map((u) => u.id)).toEqual(['g5', 'g2', 'g3']);
    expect(misses.filter((u) => !u.graded).map((u) => u.id)).toEqual(['b1']);
  });
  it('every round\'s steps are on the record, the round not kept among them; the kept round\'s are its decisions', () => {
    const round = (decisions: ControllerDecisionRecord[], stop: string) => ({ output: 'x', report: reportOf(), repair: { passes: 0, violatedBefore: [], violatedAfter: [], originalOutputHash: 'h', why: 'w', controller: controllerRecord(decisions, stop) } });
    const r0 = round([step('carrier-rewrite', 'not kept', ['g2']), step('operators', 'kept', ['g2'], 0)], 'every action tried failed on what is left');
    const r1 = round([step('rewrite', 'kept', ['b1'])], 'every enforced rule holds and nothing graded is off');
    const d = invoke.withRounds(r1, [{ d: r0, kept: false }, { d: r1, kept: true }]);
    const ctl = d.repair!.controller!;
    expect(ctl.decisions.map((x) => x.action)).toEqual(['rewrite']);
    expect(ctl.rounds?.map((x) => [x.round, x.kept, x.decisions.map((y) => y.action), x.callsUsed])).toEqual([[0, false, ['carrier-rewrite', 'operators'], 1], [1, true, ['rewrite'], 1]]);
    // each round within its own limit
    for (const x of ctl.rounds ?? []) expect(stepsOn(x.decisions)).toBeLessThanOrEqual(4);
  });
  it('the help and the measured rules say the limit is per round under --until-typical', () => {
    expect(readFileSync(resolve(__dirname, '..', 'cli', 'help.ts'), 'utf8')).toMatch(/Each round is a draft attempt of its own, repaired with a step limit of its own \(per round/);
    expect(readFileSync(resolve(__dirname, '..', 'docs', 'MEASURED-RULES.md'), 'utf8')).toMatch(/each shape round is a draft attempt of its own with a step limit of its\s+own \(per round\)/);
  });
});

describe('an owner\'s REQUIRED feature rule is enforced, never graded', () => {
  const required = { requirementId: 'q1', statement: 'At most 5 asides per 1,000 words.', materiality: 'REQUIRED', authority: 'EXPERT_AUTHORED', appliesWhen: 'GENERAL',
    measurement: { observer: 'FEATURE', params: { feature: ['parenthesis'], minValue: 0, maxValue: 5 } } } as unknown as Requirement;
  const std = { standardVersionHash: 's', requirements: [required] } as unknown as StandardVersion;
  const miss = { requirementId: 'q1', statement: required.statement, materiality: 'REQUIRED', enforced: true, observer: 'FEATURE',
    result: { verdict: 'VIOLATED', value: 16, error: 2.2, detail: 'parenthetical asides 16 per 1,000 words', spans: [{ start: 0, end: 5, text: 'aside', why: '' }] } } as unknown as RuleCheck;
  it('not among the graded rules, so never a redraft item said as "leaves out … the method requires"', () => {
    expect(gradedRules(std, 'all').size).toBe(0);
    expect(invoke.unmetReader(std, null, null, 'all')?.({ output: 'x', report: reportOf([miss]) }) ?? []).toEqual([]);
  });
  it('the controller rewrites its carriers as an enforced span rule', () => {
    const input: ControllerInput = { enforced: [{ id: 'q1', kind: 'span' }], claims: 0, length: null, graded: [], grammar: null, budget: { usdLeft: 1, callsLeft: null }, history: [],
      observedUsdPerCall: {}, can: { redraft: true, rewrite: true }, unreachable: new Set() };
    expect(decide(input)).toMatchObject({ kind: 'act', action: 'rewrite', targets: ['q1'] });
  });
});

describe('what the run says', () => {
  it('a budget that refused an enforced rule\'s rewrite is said even when free operator steps then ran', () => {
    const base: ControllerInput = { enforced: [{ id: 'c1', kind: 'span' }], claims: 0, length: null, graded: [{ id: 'c10', error: 23.12, operatorEffect: 0.2 }], grammar: null,
      budget: { usdLeft: 1, callsLeft: 0 }, history: [], observedUsdPerCall: {}, can: { redraft: true, rewrite: true }, unreachable: new Set() };
    const d = decide(base);
    expect(d).toMatchObject({ kind: 'act', action: 'operators' });
    if (d.kind !== 'act') throw new Error('expected a step');
    const rec = controllerRecord([{ action: d.action, targets: [...d.targets], why: d.why, expectedGain: d.expectedGain, expectedCostUsd: d.expectedCostUsd, outcome: 'kept', observed: { movement: 2.89, calls: 0, usd: 0 } }], 'the controller took its 4 steps');
    const line = invoke.budgetStopLine(rec);
    expect(line).toBe('Repair stopped by the budget: rewrite needs a model call, and no call is left (only re-punctuation, which needs no model, ran after it). Allow more with --cap <usd> or --max-calls <n>.');
    expect(doneOf({ cut: [], report: [line] } as never).join('\n')).toContain('repair stopped by the budget: rewrite needs a model call');
  });
  it('the method line says a broken ban is broken, and only what is left out is missing', () => {
    const banned = { requirementId: 'x1', statement: 'Never use the words "simply" or "just".', materiality: 'REQUIRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', obligation: 'DELIVERABLE',
      measurement: { observer: 'LEXICON', params: { terms: ['simply', 'just'] } } } as unknown as Requirement;
    const section = { requirementId: 'x5', statement: 'End with the one thing to check.', materiality: 'REQUIRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', obligation: 'DELIVERABLE',
      measurement: { observer: 'PRESENCE', params: { sections: ['Before the oven'] } } } as unknown as Requirement;
    const violated = (id: string): RuleCheck => ({ requirementId: id, statement: id, materiality: 'REQUIRED', enforced: true, observer: 'X', result: { verdict: 'VIOLATED', value: null, detail: '', spans: [] } } as unknown as RuleCheck);
    expect(methodLine(methodReading([banned], reportOf([violated('x1')]))!)).toBe('Method: contains 0 of 1 thing(s) it must (broken: x1).');
    expect(methodLine(methodReading([banned, section], reportOf([violated('x1'), violated('x5')]))!)).toBe('Method: contains 0 of 2 thing(s) it must (missing: x5; broken: x1).');
  });
  it('a switch after a kept redraft that moved nothing says it moved nothing', () => {
    const input: ControllerInput = { enforced: [], claims: 0, length: null, graded: [{ id: 'c4', error: 2, operatorEffect: null }], grammar: null, budget: { usdLeft: 1, callsLeft: null },
      history: [step('redraft', 'handed to a redraft', ['c4'], 0), { ...step('redraft', 'kept', ['c4']), observed: { movement: 0, calls: 1, usd: 0 } }],
      observedUsdPerCall: {}, can: { redraft: true, rewrite: true }, unreachable: new Set() };
    const why = (decide(input) as { why: string }).why;
    expect(why).toContain('switched to it because redraft on c4 moved nothing');
    expect(why).not.toContain('redraft on c4 kept');
  });
  it('the skill card says the copying limit the run uses', () => {
    const card = { schema: 1, skill: 'x', skillVersion: 'a'.repeat(16), standardVersion: 'b'.repeat(16), builtAt: null, corpus: null, copying: true, copyLimit: 16,
      rules: { total: 1, required: 1, counted: 1, read: 0, conditional: 0, needsMaterial: 0 }, claims: { instrument: 'pattern check', qualified: false, measured: null, answers: false },
      fidelity: null, release: null, taste: null, notMeasured: ['voice'], next: ['atelier invoke'] } satisfies SkillCard;
    expect(renderSkillCard(card)).toContain('a run of 16 or more words shared with your pieces fails');
  });
  it('a bench item keeps the state its run ended in', async () => {
    const { itemMeta } = await import('../bench/b6/invoke-json.mjs');
    expect(itemMeta({ output: 'x', eval: { record: { state: 'BLOCKED' } } }).state).toBe('BLOCKED');
    expect(readFileSync(resolve(__dirname, '..', 'bench', 'b6', 'run.mjs'), 'utf8')).toMatch(/meta = itemMeta\(j\)/);
  });
});

// ── THROUGH THE BINARY: the method skill and the draft the defect was found on ──────────────────────────────────────
const ROOT = resolve(__dirname, '..');
const CLI = join(ROOT, 'dist', 'cli', 'atelier.mjs');
const BAKE = join(ROOT, 'tests', 'fixtures', 'methods', 'bake');
describe.skipIf(!existsSync(CLI))('end to end: a draft that runs long after two rewrites takes four steps, not five', () => {
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    backend = spawn(process.execPath, [join(ROOT, 'tests', 'fixtures', 'scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((done) => backend.stdout?.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) done(Number(m[1])); }));
  });
  afterAll(() => { backend.kill(); });
  it('every model-calling step is recorded, the trims as trims, and the limit of four stops the run with the stop saying so', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-one-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-one-proj-'));
    cpSync(join(BAKE, 'goldens'), join(proj, 'goldens'), { recursive: true }); cpSync(join(BAKE, 'method.md'), join(proj, 'method.md'));
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...args: string[]): string => { try { return execFileSync('node', [CLI, ...args], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return (e as { stdout?: string }).stdout ?? ''; } };
    run('new', 'goldens', '--method', 'method.md', '--name', 'bake', '--yes');
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: readFileSync(join(BAKE, 'runs-long.json'), 'utf8') });
    const log = async (): Promise<string[]> => ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies;
    const before = (await log()).length;
    const out = JSON.parse(run('invoke', '--skill', 'bake', 'a bake note on brioche', '--json', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted')) as
      { controller: ControllerRecord; report: string[] };
    // the repair calls the backend answered: span rewrites, cuts named, and drafts written shorter
    const sent = (await log()).slice(before).filter((b) => b.includes('emit_replacements') || b.includes('<earlier-draft>')).length;
    expectOneCounter(out.controller, sent);
    expect(stepsOn(out.controller.decisions)).toBe(4);
    expect(out.controller.decisions.filter((d) => d.outcome !== 'handed to a redraft').map((d) => d.action)).toEqual(['rewrite', 'rewrite', 'trim', 'trim']);
    expect(out.controller.stoppedBecause).toBe('the controller took its 4 steps; the trim was not taken');
    expect(out.report.join('\n')).toContain('no further cut was made: the controller took its 4 steps');
  }, 120_000);
});
