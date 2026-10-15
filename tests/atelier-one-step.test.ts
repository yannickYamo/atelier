// tests/atelier-one-step.test.ts — EVERY REPLACEMENT OF THE TEXT IS ONE STEP, ON THE ONE LEDGER, UNDER THE ONE RULE.
//
// The controller's steps, the trims and drafts written again were already held to one acceptance rule and one ledger
// (core/loop/controller.ts, rules A and B). Five places still changed the text or called the model beside them: the
// draft written again for what the request asks (--strict), the structural edits (--edits), the voice pass, the taste
// reader's rewrite, and the draft written again around a claim cut. A run took eight steps under a limit of four, a
// structural edit was kept after "the controller took its 4 steps", and records showed fewer model steps than calls.
// The fix is by construction: one helper (core/loop/repair.ts, `applyStep`) every site goes through, and one ledger the
// run makes once. These tests hold the construction:
//   1. STRUCTURAL: the real repair chain (`repairChain`: `refineDraft` and every wrapper a run applies), every wrapper
//      proposing a change, on a scripted model. Every step is on the ledger once; the steps counted stay within the
//      documented four; the calls the record shows are the calls the model answered; the text delivered is the text of
//      the last step kept, and no enforced rule is worse on it.
//   2. STATIC: no module of the chain calls the model, or makes a ledger, outside the places listed below.
//   3. Each site alone, at its own seam, and through the binary on the runs each defect was found on.
// Expected values come from the scripted model's own answers and the documented limit, never from the code under test.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, cpSync } from 'node:fs';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { InferenceClient, InferenceRequest } from '../core/inference/client.js';
import type { ControllerRecord, StandardVersion } from '../core/state/canonical-state.js';
import type { FidelityProfile } from '../core/fidelity/types.js';
import type { PairBank } from '../core/voice/pairs.js';
import type { ContextJudge } from '../core/loop/context-judge.js';
import { verifyText } from '../core/observers/verify.js';
import { stepLedger, stepsTaken, controllerRecord } from '../core/loop/controller.js';
import { enforcedNeverWorse, ruleParamsOf } from '../core/loop/repair.js';
import type * as RepairModule from '../core/loop/repair.js';
import { refineToStandard } from '../core/loop/run-repair.js';
import { refineTaste } from '../core/taste/repair.js';
import { tasteRules, type TasteReading } from '../core/taste/reader.js';
import { spendOneWithResult } from '../cli/commands/improve.js';
import { anInferenceResult, aRequirement } from './fixtures.js';
import { stepsOn, MAX_STEPS } from './one-counter.js';

// THE SPY: every call of the one step helper, with the text it proposed, whether it was kept, and how deep it ran: a step
// taken while a draft written again is refined runs inside that draft's step.
interface Spied { action: string; kind: string; kept: boolean; text: string | null; depth: number }
const steps: Spied[] = [];
let depth = 0;
vi.mock('../core/loop/repair.js', async (importOriginal) => {
  const real = await importOriginal<typeof RepairModule>();
  return { ...real, applyStep: async (...args: Parameters<typeof real.applyStep>) => {
    const at = depth; depth += 1;
    try {
      const r = await real.applyStep(...args);
      steps.push({ action: args[1].action, kind: r.kind, kept: r.kind === 'judged' && r.kept, text: r.kind === 'judged' ? r.after.text : null, depth: at });
      return r;
    } finally { depth -= 1; }
  } };
});
const invoke = await import('../cli/commands/invoke.js');

const ROOT = resolve(__dirname, '..');
const FIX = join(ROOT, 'tests', 'fixtures', 'support-replay');

// ── THE SCENARIO ───────────────────────────────────────────────────────────────────────────────────────────────────
// One enforced ban ("simply"), one rule only a reader checks (p14), and the support skill's own fidelity profile, which
// puts parenthetical asides far outside the author's range. Every wrapper has something to change:
//   the counted rewrite takes "simply" out; the taste rewrite rewrites the quoted close; the draft written again adds the
//   missing sign-off; the structural edits turn an aside into commas; the voice pass rewrites a paragraph; the draft
//   written again for what the request asks gives the part it left out.
const ban = aRequirement({ requirementId: 'x1', statement: 'Never use the word "simply".', materiality: 'REQUIRED', measurement: { observer: 'LEXICON', params: { terms: ['simply'] } } });
const close = aRequirement({ requirementId: 'p14', statement: 'I close with a short plain promise.', materiality: 'REQUIRED' });
const STD = { standardVersionHash: 's', requirements: [ban, close] } as unknown as StandardVersion;
const PROFILE = JSON.parse(readFileSync(join(FIX, 'skills', 'support', 'fidelity', 'profile.json'), 'utf8')) as FidelityProfile;
const CLOSE = 'We simply hope this helps you today.';
// the middle of a support reply the skill's own scenarios hold: long enough to be read against the author's bands
const MIDDLE = (JSON.parse(readFileSync(join(FIX, 'scenarios', 's1.json'), 'utf8')) as { byTool: { emit_piece: { piece: string } } }).byTool.emit_piece.piece.split('\n\n').slice(2, 5);
const FIRST = [
  'Hello Hannah,',
  'Thank you for writing to us about the blender (the one with the glass jug). I am sorry that the jug leaks at the base (again), and I know how annoying that is when you use it every morning before work.',
  ...MIDDLE,
  'We simply sent a replacement jug by tracked post this morning (no charge). It should reach you within three working days, and the courier will text you a time slot the evening before it arrives.',
  CLOSE,
].join('\n\n');
const SIGN = 'Best wishes, Marta';
const PART = 'how to return the old jug';

/** The scripted writer: every kind of call answered by what it was asked, each counted by its tool. */
function scripted(): InferenceClient & { calls: string[] } {
  const calls: string[] = [];
  const answer = (req: InferenceRequest): unknown => {
    if (req.toolName === 'emit_replacements') {
      const spans = [...req.userMessage.matchAll(/SPAN (\d+)\n"""([\s\S]*?)"""/g)];
      // the taste rewrite is told what a reader found; the counted rewrite is told the rule
      return { replacements: spans.map(([, id, t]) => ({ id: Number(id), text: req.userMessage.includes('a reader found') ? 'We will put this right for you.' : t.replace(/simply /g, '') })) };
    }
    if (req.toolName === 'emit_piece') {
      // a draft written again for what the request asks gives the part; one written again for the sign-off adds it
      const covered = req.userMessage.includes('left out parts') ? `\n\nTo return the old jug, put it in the box the new one came in.` : '';
      return { piece: `${FIRST}${covered}\n\n${SIGN}` };
    }
    if (req.toolName === 'emit_sentence') return { sentence: 'I know how annoying that is.' };
    if (req.toolName === 'emit_paragraph') {
      const p = /Rewrite this paragraph in the author's voice:\n\n([\s\S]*)$/.exec(req.userMessage)?.[1] ?? '';
      return { paragraph: p.replace('Thank you for writing to us', 'Thanks for writing to us') };
    }
    throw new Error(`unscripted call: ${req.toolName}`);
  };
  return { calls, complete: async (req: InferenceRequest) => { calls.push(req.toolName); return anInferenceResult({ json: answer(req) }); } };
}

/** The reader only a rule like p14 needs: the close is missed while it is the first one, followed once rewritten. */
const reading = (text: string): TasteReading[] => {
  const key = tasteRules(STD).find((r) => r.rule.requirementId === 'p14')?.key ?? '';
  return [text.includes(CLOSE) ? { requirementId: 'p14', key, verdict: 'MISSED', kind: 'PRESENCE', quote: CLOSE, why: 'it hedges' }
    : { requirementId: 'p14', key, verdict: 'FOLLOWED', quote: 'We will put this right for you.', why: 'plain' }];
};
const readerClient: InferenceClient = { complete: async (req: InferenceRequest) => {
  const text = req.userMessage;
  const r = reading(text)[0];
  return anInferenceResult({ json: { readings: [{ n: 1, verdict: r.verdict, kind: r.kind ?? null, quote: r.quote, why: r.why }] } });
} };

const BANK: PairBank = { version: 1, sourceHash: 's', rejected: {} as PairBank['rejected'], builtAt: 'now', hash: 'b',
  pairs: [{ neutral: 'Thank you for writing to us about the order. I am sorry it arrived late.', author: 'Thanks for writing to us about the order. Sorry it came late.' }] } as unknown as PairBank;

function chain(writer: InferenceClient, maxActions = MAX_STEPS, profile: FidelityProfile = PROFILE) {
  const budget = { spentUsd: 0, capUsd: 100 };
  const checks = { guardClaims: false } as const;
  const notes: string[] = [];
  const taste = { acts: true, veto: new Set([tasteRules(STD).find((r) => r.rule.requirementId === 'p14')?.key ?? '']), asked: null, notes: [] as string[], taken: null as unknown,
    client: () => readerClient, read: async (t: string) => reading(t), applies: async () => null } as unknown as Parameters<typeof invoke.refineDraft>[0]['taste'];
  const trace = { drafts: [], edits: [], variants: [] } as unknown as Parameters<typeof invoke.withEdits>[1] extends infer E ? (E extends { trace: infer T } ? T : never) : never;
  const judge: ContextJudge = { covers: async (_asked: string, output: string) => ({ parts: [{ words: PART, covered: output.includes('To return the old jug'), where: null }] }) } as unknown as ContextJudge;
  const refine = invoke.refineDraft({ client: writer, budget, name: 'd', std: STD, taste, checks });
  return invoke.repairChain(refine,
    { notes, unmet: (d) => (d.output.includes(SIGN) ? [] : [{ id: 'x9', statement: 'Sign off with your name.', detail: 'missing' }]),
      redraft: async (note, purpose) => (await spendOneWithResult(writer, budget, 'served', 'task', null, note, {}, purpose)).piece, paramsOf: ruleParamsOf(STD) },
    { client: writer, budget, name: 'd', std: STD, checks, profile, editBudget: 1, trace, taste: null },
    { client: writer, budget, name: 'd', std: STD, checks, bank: BANK, copied: null, trace, taste: null },
    { client: writer, budget, judge, asked: `reply to Hannah, and say ${PART}`, servedText: 'served', task: 'task', notes, paramsOf: ruleParamsOf(STD) },
    null, { settings: { maxActions }, budget: () => ({ usdLeft: 100, callsLeft: null }) });
}

describe('1. structural: the real chain, every wrapper proposing a change', () => {
  for (const cap of [MAX_STEPS, 12]) {
    it(`with a limit of ${cap}: every change one step on the ledger, within the limit, every call on the record, the text the last step kept`, async () => {
      steps.length = 0;
      const writer = scripted();
      const d = await chain(writer, cap)(FIRST);
      const record = d.repair?.controller;
      if (!record) throw new Error('the run left no record of its steps');
      // EVERY CHANGE ON THE LEDGER EXACTLY ONCE: each call of the one step helper is one entry (taken, refused or settled),
      // and the record holds nothing else but the hand-offs and the claim cut, which change no text.
      const entries = record.decisions.filter((x) => x.outcome !== 'handed to a redraft' && x.action !== 'cut');
      expect(entries).toHaveLength(steps.length);
      expect([...entries.map((x) => x.action)].sort()).toEqual([...steps.map((x) => x.action)].sort());
      // WITHIN THE LIMIT, the steps taken on a draft that was not kept counted all the same.
      expect(stepsOn(record.decisions)).toBeLessThanOrEqual(cap);
      expect(stepsTaken(record.decisions)).toBeLessThanOrEqual(cap);
      // MODEL STEPS = BACKEND CALLS: every call the writer answered is on a step of the record, and only those.
      expect(record.decisions.reduce((n, x) => n + x.observed.calls, 0)).toBe(writer.calls.length);
      expect(record.callsUsed).toBe(writer.calls.length);
      // NOTHING CHANGES THE TEXT BUT A STEP: what is delivered is the text of the last step kept at the run's own level (a
      // step inside a draft written again is the draft's; that draft's own step says whether any of it was kept).
      const kept = steps.filter((x) => x.kept && x.depth === 0);
      expect(d.output).toBe(kept.length ? kept[kept.length - 1].text : FIRST);
      // NO ENFORCED RULE ENDS WORSE than after the last step kept, nor than on the first draft.
      const read = (t: string) => verifyText('d', STD, t);
      const enforced = new Set(['x1']);
      expect(enforcedNeverWorse(read(FIRST), read(d.output), enforced, ruleParamsOf(STD))).toEqual([]);
      if (kept.length) expect(enforcedNeverWorse(read(kept[kept.length - 1].text ?? ''), read(d.output), enforced, ruleParamsOf(STD))).toEqual([]);
      // every wrapper did propose: each kind of step is on the ledger, taken or refused by the limit
      const actions = new Set(record.decisions.map((x) => x.action));
      if (cap > MAX_STEPS) for (const a of ['rewrite', 'taste', 'redraft', 'steer', 'voice', 'coverage']) expect(actions, a).toContain(a);
      else expect(record.decisions.some((x) => x.outcome === 'refused')).toBe(true);
    }, 60_000);
  }
});

// ── 2. STATIC ───────────────────────────────────────────────────────────────────────────────────────────────────────
// The modules of the repair chain. A model call (`complete(`, `spendOne…(`, and the helpers that make one) or a new
// ledger (`stepLedger(`) anywhere in them must be one of the places listed, each with why it is allowed. A new call
// site fails here until it is routed through `applyStep` and listed.
const CHAIN = ['cli/commands/invoke.ts', 'core/loop/run-repair.ts', 'core/loop/repair.ts', 'core/loop/controller.ts', 'core/taste/repair.ts'];
const ALLOWED: Readonly<Record<string, readonly { readonly line: RegExp; readonly why: string }[]>> = {
  'cli/commands/invoke.ts': [
    { line: /^import \{ spendOneWithResult/, why: 'the import' },
    { line: /redraft: async \(note, purpose\) => \(await spendOneWithResult\(/, why: 'the call `withRedraft` makes inside its `applyStep` proposal (`c.redraft`)' },
    { line: /const piece = \(await spendOneWithResult\(c\.client, c\.budget, c\.servedText, c\.task, null, note, \{\}\)\)\.piece;/, why: 'the coverage draft, inside its `applyStep` proposal' },
    { line: /const piece = s\.fresh \? await s\.fresh\(round\) : \(await spendOneWithResult\(/, why: 'a shape round\'s own first draft: the start of that round\'s ledger, never a replacement within it' },
    { line: /const w = await spendOneWithResult\(c\.client, c\.budget, c\.servedText, c\.task, null, skeletonBlock/, why: 'a first draft written against a plan, before any repair' },
    { line: /const w = await spendOneWithResult\(client, budget, servedText, task, null, skeletonBlock/, why: 'a shape round\'s first draft written against a plan' },
    { line: /if \(!p\) return spendOneWithResult\(/, why: 'a first draft, written whole' },
    { line: /parts\.push\(await spendOneWithResult\(/, why: 'a first draft, written section by section' },
    { line: /const edited = await steerTowardRange\(/, why: 'the structural edits, inside their `applyStep` proposal' },
    { line: /const passed = await voicePass\(/, why: 'the voice pass, inside its `applyStep` proposal' },
    { line: /t = await refineTaste\(/, why: 'the taste rewrite, which takes the run\'s ledger and is a step through `applyStep`' },
    { line: /const ledger = stepLedger\(steps\?\.settings \?\? null, steps\?\.budget \?\? null, \[\], steps\?\.source \?\? ''\);/, why: 'THE one ledger a run (or a shape round) makes, in `withShape`, with the request and the material a step may not add a figure beyond' },
  ],
  'core/loop/run-repair.ts': [
    { line: /const x = await client\.complete\(\{ stableBlock: REDRAFT_SYSTEM/, why: 'the draft written again around a claim cut, called only from its `applyStep` proposal' },
    { line: /const x = await client\.complete\(\{$/, why: 'the span rewrite, inside the `applyStep` proposal of `rewriteStep`' },
    { line: /const ledger = opts\.controller\?\.ledger \?\? stepLedger\(/, why: 'a caller outside the chain (verify --repair, fix) that hands no ledger: this refinement is then the run' },
  ],
  'core/loop/repair.ts': [],
  'core/loop/controller.ts': [],
  'core/taste/repair.ts': [{ line: /const x = await client\.complete\(\{ stableBlock: checks\.placeholders/, why: 'the taste rewrite, inside its `applyStep` proposal' }],
};
const CALL = /\bcomplete\(|\bspendOne\w*\(|\bsteerTowardRange\(|\bvoicePass\(|\brefineTaste\(|\bstepLedger\(|\bspendOneWithResult\b/;

// THE BRANCHES THE RUN ABOVE DOES NOT TAKE run here, every client of the chain carrying the step guard
// (core/inference/step-guard.ts): a model call any of them makes outside a step, in whatever module it is written, throws.
describe('1b. the runtime guard on branches the structural run does not take', () => {
  it('a profile that predates the operators: the structural edits\' own branch for it', async () => {
    const writer = scripted();
    const d = await chain(writer, 12, { ...PROFILE, effects: undefined })(FIRST);
    expect(d.repair?.controller?.callsUsed).toBe(writer.calls.length);
  }, 60_000);
});

describe('2. static: no model call and no ledger in the chain outside the listed places', () => {
  for (const file of CHAIN) {
    it(file, () => {
      const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
      // a call, never the definition of the function called, nor a comment
      const found = lines.map((l, i) => ({ l: l.trim(), at: i + 1 })).filter((x) => CALL.test(x.l) && !/^(export )?(async )?function /.test(x.l)
        && !x.l.startsWith('//') && !x.l.startsWith('*') && !x.l.startsWith('/*'));
      const stray = found.filter((x) => !(ALLOWED[file] ?? []).some((a) => a.line.test(x.l)));
      expect(stray.map((x) => `${file}:${x.at}: ${x.l.slice(0, 120)}`)).toEqual([]);
      // and every listed place still exists, so the list cannot go stale
      for (const a of ALLOWED[file] ?? []) expect(found.some((x) => a.line.test(x.l)), a.why).toBe(true);
    });
  }
  it('no wrapper of the chain makes a ledger: `withShape` alone does', () => {
    const src = readFileSync(join(ROOT, 'cli/commands/invoke.ts'), 'utf8');
    expect(src.match(/stepLedger\(/g)?.length).toBe(1);
    // and only the one step helper begins or settles a step outside the ledger's own module and the claim cut's record
    for (const file of ['cli/commands/invoke.ts', 'core/taste/repair.ts']) expect(readFileSync(join(ROOT, file), 'utf8')).not.toMatch(/ledger\.(begin|settle)\(/);
  });
});

// ── 3. EACH SITE ALONE ──────────────────────────────────────────────────────────────────────────────────────────────
describe('3. each site goes through the one step', () => {
  const atCap = () => {
    const l = stepLedger({ maxActions: 1 }, null);
    l.settle(l.begin({ action: 'rewrite', targets: ['x1'], why: 'w', expectedGain: 1, expectedCostUsd: 0.05 }), 'not kept', { movement: 0, calls: 1, usd: 0 });
    return l;
  };
  it('the taste rewrite is refused at the limit, and no call is made', async () => {
    const writer = scripted();
    const l = atCap();
    const key = tasteRules(STD).find((r) => r.rule.requirementId === 'p14')?.key ?? '';
    const r = await refineTaste(writer, readerClient, { spentUsd: 0, capUsd: 1 }, 'd', STD, FIRST, reading(FIRST), new Set([key]), null, {}, null, { ledger: l });
    expect(writer.calls).toEqual([]);
    expect(r.output).toBe(FIRST);
    expect(l.entries.map((x) => [x.action, x.outcome])).toEqual([['rewrite', 'not kept'], ['taste', 'refused']]);
  });
  it('the taste rewrite is a counted step, its call on it', async () => {
    const writer = scripted();
    const l = stepLedger(null, null);
    const key = tasteRules(STD).find((r) => r.rule.requirementId === 'p14')?.key ?? '';
    const r = await refineTaste(writer, readerClient, { spentUsd: 0, capUsd: 1 }, 'd', STD, FIRST, reading(FIRST), new Set([key]), null, {}, null, { ledger: l });
    expect(r.output).toContain('We will put this right for you.');
    expect(l.entries.map((x) => [x.action, x.outcome, x.observed.calls])).toEqual([['taste', 'kept', 1]]);
    expect(stepsTaken(l.entries)).toBe(1);
  });

  // THE DRAFT WRITTEN AGAIN AROUND A CLAIM CUT: a cut that leaves a fragment is redrafted once; the redraft is held to the
  // one acceptance rule (here it uses a banned word the draft did not) and its call is its own step, never the cut's.
  const draft = 'Last year I shipped the retry loop and it broke production for a day.\n\nFix it:\n\n1. Last month we saw retries double the load.\n2. Add a budget.';
  const thenBan = aRequirement({ requirementId: 'x1', statement: 'Never use the word "then".', materiality: 'REQUIRED', measurement: { observer: 'LEXICON', params: { terms: ['then'] } } });
  const v = { standardVersionHash: 's', requirements: [thenBan] } as unknown as StandardVersion;
  it('a claim-cut redraft that breaks an enforced rule is not kept, and its call is booked on its own step', async () => {
    const seen: string[] = [];
    const w: InferenceClient = { complete: async (r: InferenceRequest) => { seen.push(r.toolName);
      return anInferenceResult({ json: r.toolName === 'emit_draft' ? { text: 'Fix it:\n\n1. Add a budget, then rerun it.' } : { replacements: [] } }); } };
    expect(verifyText('d', v, 'Fix it:\n\n1. Add a budget, then rerun it.').checked.find((c) => c.requirementId === 'x1')?.result.verdict).toBe('VIOLATED');
    const out = await refineToStandard(w, { spentUsd: 0, capUsd: 1 }, 'd', v, draft, 2, { material: '' });
    expect(seen.filter((t) => t === 'emit_draft')).toHaveLength(1);
    expect(out.output).not.toMatch(/\bthen\b/);
    const ctl = out.repair?.controller;
    const redraft = ctl?.decisions.find((x) => x.action === 'claim-redraft');
    expect(redraft).toMatchObject({ outcome: 'not kept', observed: { calls: 1 } });
    expect(redraft?.observed.note).toMatch(/x1/);
    for (const c of ctl?.decisions.filter((x) => x.action === 'cut') ?? []) expect(c.observed.calls).toBe(0);
    expect(ctl?.callsUsed).toBe(seen.filter((t) => t === 'emit_draft' || t === 'emit_replacements').length);
  });
  it('a step taken on a draft that was then not kept is marked as that draft\'s; the line about smaller steps is said only when some followed', async () => {
    const l = stepLedger({ maxActions: 2 }, null);
    const notes: string[] = [];
    const handed = (output: string) => ({ output, report: verifyText('d', STD, output), repair: { passes: 0, violatedBefore: [], violatedAfter: [], originalOutputHash: 'h', why: 'w',
      controller: controllerRecord([{ action: 'redraft' as const, targets: ['c10'], why: 'w', expectedGain: 1, expectedCostUsd: 0.4, outcome: 'handed to a redraft' as const, observed: { movement: 0, calls: 0, usd: 0 } }], 'handed', true) } });
    const d = await invoke.withRedraft(async (t) => (t === 'first' ? handed(t) : { output: t, report: verifyText('d', STD, t), repair: null }),
      { notes, unmet: (x) => [{ id: 'c10', statement: 'Few asides.', detail: 'asides', off: x.output === 'first' ? 3 : 9, graded: true }],
        redraft: async () => 'second',
        // the draft written again is refined: one carrier rewrite on it, which reaches the limit of two
        resume: async (t, ledger) => {
          const n = ledger.entries.length;
          if (t === 'second') ledger.settle(ledger.begin({ action: 'carrier-rewrite', targets: ['c10'], why: 'w', expectedGain: 1, expectedCostUsd: 0.05 }), 'not kept', { movement: 0, calls: 1, usd: 0 });
          // a refinement's record holds the steps it took itself, as the repair loop's does
          return { output: t, report: verifyText('d', STD, t), repair: { passes: 0, violatedBefore: [], violatedAfter: [], originalOutputHash: 'h', why: 'w', controller: controllerRecord(ledger.entries.slice(n), 'the controller took its 2 steps') } };
        } })('first', l);
    const ctl = d.repair?.controller;
    const at = ctl?.decisions.findIndex((x) => x.action === 'redraft' && x.outcome === 'not kept') ?? -1;
    expect(at).toBeGreaterThan(-1);
    expect(ctl?.decisions.find((x) => x.action === 'carrier-rewrite')?.onDraftNotKept).toBe(at + 1);
    // the cap was reached on the draft not kept: no smaller step followed on the first draft, and none is said
    expect(notes.join(' ')).toMatch(/one more draft did not do better, so the first is kept\.$/);
    expect(notes.join(' ')).not.toMatch(/After the smaller steps/);
  });
});

// ── THROUGH THE BINARY: the runs each defect was found on ───────────────────────────────────────────────────────────
const CLI = join(ROOT, 'dist', 'cli', 'atelier.mjs');
const ASK = 'reply to Hannah, whose blender jug leaks at the base';
const MODEL = new Set(['emit_replacements', 'emit_draft', 'emit_sentence', 'emit_paragraph']);
describe.skipIf(!existsSync(CLI))('end to end', () => {
  let backend: ChildProcess; let port = 0;
  beforeAll(async () => {
    backend = spawn(process.execPath, [join(ROOT, 'tests', 'fixtures', 'scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((done) => backend.stdout?.on('data', (b: Buffer) => { const m = /PORT (\d+)/.exec(b.toString()); if (m) done(Number(m[1])); }));
  });
  afterAll(() => { backend.kill(); });
  const log = async (): Promise<string[]> => ((await (await fetch(`http://127.0.0.1:${port}/__log`)).json()) as { bodies: string[] }).bodies;
  const replay = async (name: string, ...flags: string[]) => {
    const data = mkdtempSync(join(tmpdir(), 'atelier-step-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-step-proj-'));
    cpSync(join(FIX, 'skills'), join(data, 'skills'), { recursive: true });
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: readFileSync(join(FIX, 'scenarios', `${name}.json`), 'utf8') });
    // the suite runs the claim check by pattern; a run that names a claims model reads with it (the context judge included)
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ...(flags.includes('--claims-model') ? { ATELIER_CLAIMS: 'model' } : {}) };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const before = (await log()).length;
    let out: string; let err = '';
    try { out = execFileSync('node', [CLI, 'invoke', '--skill', 'support', ASK, '--json', '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted',
      '--drafts', '1', '--accept-new-binding', ...flags], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { out = (e as { stdout?: string }).stdout ?? ''; err = (e as { stderr?: string }).stderr ?? ''; }
    const bodies = (await log()).slice(before).map((b) => JSON.parse(b) as { tools?: { function?: { name?: string } }[]; messages: unknown });
    const tools = bodies.map((b) => b.tools?.[0]?.function?.name ?? '');
    // the repair calls: span rewrites, sentence and paragraph rewrites, and every draft after the first
    const pieces = tools.filter((t) => t === 'emit_piece').length;
    const repairCalls = tools.filter((t) => MODEL.has(t)).length + Math.max(0, pieces - 1);
    return { out: JSON.parse(out) as { output: string | null; controller: ControllerRecord; fidelity?: { edits: { kept: boolean }[] } }, err, repairCalls, tools };
  };
  it('--strict: the draft written again for what the request asks is a step on the run\'s one ledger: four steps, every call on the record', async () => {
    const r = await replay('cov', '--strict', '--redraws', '0', '--claims-model', 'scripted');
    // the draft written again for the part left out was asked for (the judge read the reply), and is on the record
    expect(r.tools).toContain('emit_coverage');
    expect(r.out.controller.decisions.some((x) => x.action === 'coverage')).toBe(true);
    expect(r.out.controller.callsUsed).toBe(r.repairCalls);
    expect(stepsOn(r.out.controller.decisions)).toBeLessThanOrEqual(MAX_STEPS);
    // the first draft's own steps are on the record, the first of them the rewrite of the first draft
    expect(r.out.controller.decisions[0].action).toBe('rewrite');
  }, 120_000);
  it('--edits: no structural edit after the limit is reached; the record says the edits were refused, and no false line about smaller steps', async () => {
    const r = await replay('ed', '--edits', '2');
    expect(stepsOn(r.out.controller.decisions)).toBe(MAX_STEPS);
    expect(r.out.controller.callsUsed).toBe(r.repairCalls);
    expect(r.out.fidelity?.edits.filter((x) => x.kept) ?? []).toEqual([]);
    expect(r.out.controller.decisions.find((x) => x.action === 'steer')?.outcome).toBe('refused');
    // the steps taken on the redraft that was not kept are marked as that draft's
    const notKept = r.out.controller.decisions.findIndex((x) => x.action === 'redraft' && x.outcome === 'not kept');
    expect(r.out.controller.decisions.slice(notKept + 1).filter((x) => x.onDraftNotKept === notKept + 1).length).toBeGreaterThan(0);
    expect(r.err).not.toMatch(/After the smaller steps that followed/);
  }, 120_000);
});
