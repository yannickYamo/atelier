// tests/atelier-enforced-progress.test.ts — STEERING NEVER UNDOES ENFORCED WORK, AND EACH STEP IS SAID AS WHAT IT WAS.
//
// The defect: a draft written again for graded misses alone was kept when it took a rule the owner requires further
// from holding, because the comparison read only WHICH required rules were broken, never how far. An owner's "at most
// 5 asides per 1,000 words", brought nearer by two kept span rewrites, was undone by a redraft for a graded miss and
// delivered further out. Here such a redraft is not kept, and the record says why. Beside it, four wordings: a trim is
// said as a cut, a budget stop names the step it refused, a fix without a model is credited to what it did, and a
// shape round the budget skipped is said on screen. Each case failed on the code before the fix.
//
// Expected values are worked out from the scenario's own counts and the documented threshold (GRADED_STEP, 0.1 band
// widths), never read back from the code.
import { stepLedger } from '../core/loop/controller.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FEATURE } from '../core/observers/features.js';
import { refineToStandard } from '../core/loop/run-repair.js';
import { controllerRecord } from '../core/loop/controller.js';
import { BudgetExceeded } from '../core/inference/client.js';
import * as invoke from '../cli/commands/invoke.js';
import { withRedraft, type Unmet } from '../cli/commands/invoke.js';
import { doneOf } from '../cli/commands/run.js';
import type { ControllerDecisionRecord } from '../core/state/canonical-state.js';
import type { RuleCheck, VerifyReport } from '../core/observers/verify.js';

const reportOf = (checked: RuleCheck[] = [], failed = false): VerifyReport => ({ skill: 's', standardVersionHash: 'h', checked, unchecked: [], conditional: [], failed });
const ASIDES = { feature: ['parenthesis'], minValue: 0, maxValue: 5 };
const x1Check = (text: string): RuleCheck => ({ requirementId: 'x1', statement: 'Use at most 5 asides in parentheses per 1,000 words.', materiality: 'REQUIRED', enforced: true, observer: 'FEATURE', result: FEATURE.observe(text, ASIDES) });

// One sentence of each kind, 18 words or so each: an aside, a colon, and neither.
const plain = 'The ferry leaves the pier at eleven and the crossing is calm on most nights of the year.';
const aside = 'The ferry leaves the pier (as it always has) at eleven and the crossing is calm on most nights.';
const colon = 'The ferry has one rule: it leaves the pier at eleven, and the crossing is calm on most nights.';
const piece = (asides: number, colons: number): string => {
  const s = Array.from({ length: 30 }, (_, i) => (i < asides ? aside : i < asides + colons ? colon : plain));
  return Array.from({ length: 10 }, (_, k) => s.slice(k * 3, k * 3 + 3).join(' ')).join('\n\n');
};
const parens = (t: string): number => (t.match(/\(/g) ?? []).length;

describe('a redraft for graded misses alone never undoes what a rule the owner requires holds', () => {
  // the first draft holds 4 asides (x1 broken, nearer than it was); the draft written again fixes the graded miss and holds 9
  const first = piece(4, 10); const second = piece(9, 0);
  const colons: Unmet = { id: 'g1', statement: 'Few colons.', detail: 'colons 18.5 per 1,000 words', off: 5.2, graded: true };
  const delivered = (t: string) => ({ output: t, report: reportOf([x1Check(t)], true), repair: null });
  it('the distance is what is read: x1 broken on both texts, further out on the second', () => {
    const a = x1Check(first).result; const b = x1Check(second).result;
    expect([a.verdict, b.verdict]).toEqual(['VIOLATED', 'VIOLATED']);
    expect(Math.abs(b.error ?? 0) - Math.abs(a.error ?? 0)).toBeGreaterThan(0.1);
  });
  it('not kept, the earlier draft delivered, and the record and the note say which rule it would have undone', async () => {
    const notes: string[] = [];
    const d = await withRedraft(async (t) => delivered(t), { notes, unmet: (x) => (x.output === first ? [colons] : []), redraft: async () => second })(first, stepLedger());
    expect(d.output).toBe(first);
    const step = d.repair?.controller?.decisions.find((x) => x.action === 'redraft');
    expect(step?.outcome).toBe('not kept');
    expect(step?.observed.note).toMatch(/further from holding \(x1: "Use at most 5 asides in parentheses per 1,000 words\."\)/);
    expect(notes.join(' ')).not.toMatch(/^Written again/);
  });
  it('a redraft for what the work requires is held to the same rule: one that moves x1 further out is not kept, whatever it was for', async () => {
    const section: Unmet = { id: 'x2', statement: 'End with the timetable.', detail: 'missing' };
    const d = await withRedraft(async (t) => delivered(t), { notes: [], unmet: (x) => (x.output === first ? [section] : []), redraft: async () => second })(first, stepLedger());
    expect(d.output).toBe(first);
    expect(d.repair?.controller?.decisions.find((x) => x.action === 'redraft')?.observed.note).toMatch(/further from holding \(x1: /);
  });
});

describe('a trim is said as a cut, never as a draft written again', () => {
  const words = (n: number): string => Array.from({ length: n }, () => 'word').join(' ');
  const tooLong = (d: { output: string }): Unmet[] => {
    const n = d.output.split(/\s+/).filter(Boolean).length;
    return n > 300 ? [{ id: 'x2', statement: 'Write between 120 and 300 words.', detail: `${n} words`, off: n - 300, aim: 'aim for 270 words or fewer', whole: true }] : [];
  };
  const noRepair = (output: string) => ({ output, report: reportOf(), repair: null });
  // the writer names nothing to cut; then writes the piece at the length given
  const writer = (n: number) => async (note: string): Promise<string> => (note.includes('Choose what to delete') ? '' : words(n));
  it('a cut that did no better: the note and the stop say "the cut"', async () => {
    const notes: string[] = [];
    const d = await withRedraft(async (t) => noRepair(t), { notes, unmet: tooLong, redraft: writer(420) })(words(400), stepLedger());
    expect(d.output).toBe(words(400));
    const said = notes.at(-1) ?? '';
    expect(said).toBe('The draft runs long (x2: "Write between 120 and 300 words."); the cut did not do better, so the draft before it is kept.');
    expect(d.repair?.controller?.stoppedBecause).toMatch(/^the cut did not do better: /);
    expect([...notes, d.repair?.controller?.stoppedBecause].join(' ')).not.toMatch(/written again|one more draft/i);
    expect(d.repair?.controller?.decisions.map((x) => `${x.action}|${x.outcome}`)).toEqual(['trim|no change', 'trim|not kept']);
    expect(doneOf({ report: notes, cut: [] })).toEqual(['a cut for length was tried and was no better, so the draft before it was kept']);
  });
  it('a cut that holds: "Cut for length", and the run card says a cut', async () => {
    const notes: string[] = [];
    const d = await withRedraft(async (t) => noRepair(t), { notes, unmet: tooLong, redraft: writer(280) })(words(400), stepLedger());
    expect(d.output).toBe(words(280));
    expect(notes.at(-1)).toBe('Cut for length: the draft ran long (x2: "Write between 120 and 300 words."); it now holds.');
    expect(doneOf({ report: notes, cut: [] })).toEqual(['cut to its length']);
  });
});

describe('a budget stop names the step the budget refused', () => {
  it('a redraft the budget cannot hold is said as the redraft, not the rewrite', async () => {
    const plainLine = 'The ferry leaves the pier at eleven and the crossing is calm on most nights of the year.';
    const colonLine = 'The ferry has one rule: it leaves the pier at eleven, and the crossing is calm on most nights.';
    const text = Array.from({ length: 24 }, (_, i) => (i % 2 ? colonLine : plainLine)).join(' ');
    const v = { standardVersionHash: 's', requirements: [{ requirementId: 'g1', statement: 'Few colons.', materiality: 'PREFERRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', measurement: { observer: 'FEATURE', params: { feature: ['colon'], minValue: 0, maxValue: 3 } } }] } as never;
    const client = { complete: () => Promise.reject(new Error('no call may be made')) } as never;
    const r = await refineToStandard(client, { spentUsd: 0, capUsd: 1, maxCalls: 0, calls: 0 }, 's', v, text, 2,
      { graded: 'all', guardClaims: false, controller: { settings: null, redraft: true } });
    const stop = r.repair?.controller?.stoppedBecause ?? '';
    expect(stop).toMatch(/^the budget: redraft /);
    expect(r.repair?.why).toMatch(/the redraft could not run \(the budget: redraft /);
    expect(r.repair?.why).not.toMatch(/the rewrite could not run/);
  });
});

describe('a fix without a model is credited to what it did', () => {
  const step = (action: ControllerDecisionRecord['action'], outcome: ControllerDecisionRecord['outcome'], targets: string[], why = 'w'): ControllerDecisionRecord =>
    ({ action, targets, why, expectedGain: 0, expectedCostUsd: 0, outcome, observed: { movement: 0, calls: action === 'mechanical' ? 0 : 1, usd: 0 } });
  it('long paragraphs split, beside a graded rewrite pass that kept nothing: never "by rewriting only the spans"', () => {
    // the record of the run it was found on: the split kept, a carrier rewrite pass taken and not kept
    const r = { violatedBefore: ['m2'], passes: 1, controller: controllerRecord([step('mechanical', 'kept', ['m2'], 'fixed without a model: m2: long paragraphs split'),
      step('carrier-rewrite', 'not kept', ['c4'])], 'the controller took its 4 steps') };
    expect(invoke.howHeld(r)).toBe('m2 fixed without a model: long paragraphs split');
  });
  it('each rule by its own step: a split, a span rewrite, a draft corrected', () => {
    const r = { violatedBefore: ['x1', 'x3', 'x4'], passes: 1, controller: controllerRecord([step('mechanical', 'kept', ['x1', 'x3', 'x4'], 'fixed without a model: x3: long paragraphs split'),
      step('rewrite', 'kept', ['x1'])], 'every enforced rule holds') };
    expect(invoke.howHeld(r)).toBe('x3 fixed without a model: long paragraphs split; x1 fixed by rewriting only the spans that broke them; x4 held once the draft was corrected');
  });
});

describe('a shape round the budget skipped is said on screen', () => {
  it('one line, naming the round and why', async () => {
    const notes: string[] = [];
    const broken: RuleCheck = { requirementId: 'x1', statement: 'Never say leverage.', materiality: 'REQUIRED', enforced: true, observer: 'LEXICON', result: { verdict: 'VIOLATED', detail: 'leverage', spans: [] } } as never;
    const std = { standardVersionHash: 's', requirements: [{ requirementId: 'x1', statement: 'Never say leverage.', materiality: 'REQUIRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL', measurement: { observer: 'LEXICON', params: { terms: ['leverage'] } } }] } as never;
    const trace = { drafts: [], edits: [], variants: [] };
    const shaped = invoke.withShape(async (t) => ({ output: t, report: reportOf([broken], true), repair: null }), { client: {} as never, budget: { spentUsd: 1, capUsd: 1 }, std,
      calibration: null, detector: null, target: null, authorTarget: null, rounds: 2, servedText: '', task: 't', trace, taste: null, notes,
      fresh: async () => { throw new BudgetExceeded(1.3, 1); } });
    const d = await shaped('We leverage the harbour.');
    expect(d.output).toBe('We leverage the harbour.');
    expect(notes).toEqual(['Shape round 1 of 2 was not written (budget exhausted: $1.3000 of $1.00); the best output so far was delivered.']);
  });
});

const ROOT = resolve(import.meta.dirname, '..');
const CLI = join(ROOT, 'dist', 'cli', 'atelier.mjs');
describe.skipIf(!existsSync(CLI))('end to end: the owner-added ceiling, brought nearer by span rewrites, is not undone by a redraft for a graded miss', () => {
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    backend = spawn(process.execPath, [join(ROOT, 'tests', 'fixtures', 'scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok) => backend.stdout?.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); }));
  });
  afterAll(() => { backend.kill(); });

  it('x1 is delivered no further out than the rewrites left it, and the redraft is recorded as not kept with the reason', async () => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-enf-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-enf-proj-'));
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CLAIMS: 'pattern' };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...args: string[]): { out: string; err: string } => {
      try { return { out: execFileSync('node', [join(ROOT, 'dist', 'cli', 'atelier.mjs'), ...args], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }), err: '' }; } catch (e) { const x = e as { stdout?: string; stderr?: string }; return { out: x.stdout ?? '', err: x.stderr ?? '' }; }
    };
    // The first draft: 6 asides in about 540 words (x1, at most 5 per 1,000, broken) and 10 colons (the graded miss, far out).
    // Each span rewrite turns the first aside it is shown into a plain sentence. The draft written again holds no colon and 9 asides.
    const first = piece(6, 10); const second = piece(9, 0);
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ when: [{ containsAll: ['emit_piece', 'earlier-draft'], answer: { piece: second } }],
      byTool: { emit_piece: { piece: first }, emit_replacements: { replacements: [{ id: 1, text: plain }] } } }) });
    const add = (statement: string, materiality: string, measure: string) => run('add', '--statement', statement, '--kind', 'BOUNDARY', '--applies-when', 'GENERAL', '--materiality', materiality, '--measure', measure);
    add('Use at most 5 asides in parentheses per 1,000 words.', 'REQUIRED', 'FEATURE:feature=parenthesis,minValue=0,maxValue=5');
    add('Few colons.', 'PREFERRED', 'FEATURE:feature=colon,minValue=0,maxValue=3');
    run('ratify-close', '--work-type', 'writing'); run('build', '--name', 'ferry');
    const r = run('invoke', '--skill', 'ferry', 'write a note about the ferry', '--json', '--allow-unsourced', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted');
    const j = JSON.parse(r.out) as { output: string; controller: { decisions: { action: string; targets: string[]; outcome: string; observed: { note?: string } }[] } };
    const steps = j.controller.decisions.map((d) => `${d.action}|${d.outcome}`);
    // two span rewrites kept (6 asides to 4), then the hand-off, then the redraft: not kept
    expect(steps.slice(0, 4)).toEqual(['rewrite|kept', 'rewrite|kept', 'redraft|handed to a redraft', 'redraft|not kept']);
    expect(j.controller.decisions[3].observed.note).toMatch(/further from holding \(x1: "Use at most 5 asides/);
    // the enforced progress stands: no more than the 4 asides the rewrites left, and never the redraft's 9
    expect(j.output).not.toBe(second);
    expect(parens(j.output)).toBeLessThanOrEqual(4);
    expect(r.err).not.toMatch(/^Written again/m);
  }, 180_000);
});
