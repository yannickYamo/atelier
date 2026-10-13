// tests/atelier-one-authority.test.ts — ONE RECORD DECIDES, AND EVERYTHING THAT ACTS ON A RUN READS IT.
//
// A run's yes/no ("conformant") was once worked out beside the record, from its own list of reasons. The two could
// part: an unqualified reading refused delivery that the record said blocks nothing, and a run with half a rule read
// counted the same as one read in full wherever only the yes/no was kept. Here the yes/no is the record's, and what
// counts runs counts the ones read in full apart from the ones with nothing seen to fail.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRunEval, type RunEvalInput } from '../cli/eval-run.js';
import { buildRecord, type RecordFacts } from '../core/eval/record-build.js';
import { standingOf } from '../core/eval/record.js';
import { renderPanel } from '../core/eval/summary.js';
import { heldOf, readRun, scoreOf } from '../core/evolve/loop.js';
import { countsOf, renderReproduction, type CaseOutcome, type ReproductionRecord } from '../core/eval/reproduce.js';
import type { VerifyReport } from '../core/observers/verify.js';
import type { InvocationRecord, Requirement } from '../core/state/canonical-state.js';
import { aRequirement } from './fixtures.js';

const stated = (id: string, statement: string, measurement: Requirement['measurement']): Requirement =>
  aRequirement({ requirementId: id, statement, provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', materiality: 'REQUIRED', obligation: 'DELIVERABLE', ...(measurement ? { measurement } : {}) });
const PARTIES = stated('x1', 'Open with a Parties section that names both parties exactly as in the term sheet.', { observer: 'PRESENCE', params: { sections: ['Parties'], body: 1, opens: 1 } });
const LENGTH = stated('x2', 'Between 150 and 230 words.', { observer: 'LENGTH', params: { unit: ['words'], min: 150, max: 230 } });

const L = { root: mkdtempSync(join(tmpdir(), 'atelier-one-')), skillName: 'contracts' };
const rec = { invocationId: 'i0000000009', skillVersionHash: 'sv1', at: '2026-10-13T00:00:00Z', output: '## Parties\n\nAcme Ltd and Bolt GmbH.\n',
  observedRuntime: { resolvedModel: 'm' }, runtimeBinding: { requestedModel: 'm' } } as unknown as InvocationRecord;
const line = (id: string, verdict: 'MET' | 'VIOLATED', spans = 0, materiality = 'REQUIRED') => ({ requirementId: id, statement: id, materiality,
  result: { verdict, value: spans, detail: `${id} detail`, spans: Array.from({ length: spans }, (_, i) => ({ start: i, end: i + 1, text: `s${i}`, why: '' })) } });
const report = (...checked: ReturnType<typeof line>[]): VerifyReport => ({ skill: 'contracts', standardVersionHash: 'h', checked, unchecked: [], conditional: [], failed: false });
const std = (...requirements: Requirement[]) => ({ standardVersionHash: 'h', requirements }) as never;
const sensor = { instrument: 'claim reader (claude-haiku-4-5, prompt a173339d)', version: 'a173339d', qualified: true, gate: 'reader', degraded: false, reading: () => undefined } as never;
const input = (over: Partial<RunEvalInput>): RunEvalInput => ({ L, rec, std: std(PARTIES, LENGTH), sensor, claimsOff: false, answers: false, profile: null,
  format: { words: null, shape: null, withheld: 0 }, taste: null, costUsd: 0.1, durationMs: 1000, drafts: 1, applicability: [], contract: false,
  report: report(line('x1', 'MET'), line('x2', 'MET'), line('UNSOURCED', 'MET')), ...over });
const facts = (o: Partial<RecordFacts>): RecordFacts => ({ requirements: [], checked: [], waived: new Map(), request: null, claims: null, copying: null, ...o });

describe('a rule a check read half of, through the path a run takes', () => {
  const e = buildRunEval(input({}));
  it('the half that was read held; the rule is not verified; the run needs review', () => {
    const parties = e.record?.entries.find((x) => x.id === 'x1');
    expect(parties).toMatchObject({ result: 'UNVERIFIED', reason: 'PARTLY_CHECKED', required: true });
    expect(parties?.observation.unchecked).toMatch(/names both parties exactly as in the term sheet/);
    expect(e.record?.state).toBe('NEEDS_REVIEW');
  });
  it('nothing that reads the run calls it verified: not its standing, not its panel', () => {
    const s = standingOf(e.record!);
    expect(s).toMatchObject({ state: 'NEEDS_REVIEW', verified: false, deliverable: true, reasons: [] });
    const panel = renderPanel(e);
    expect(panel).toContain('RESULT  NEEDS REVIEW');
    expect(panel).not.toMatch(/RESULT {2}(?:VERIFIED|CONFORMANT)/);
  });
  it('the yes/no kept with the run is the record\'s, and says only that nothing was seen to fail', () => {
    expect(e.result).toEqual({ conformant: true, reasons: [] });
    expect(e.result.conformant).toBe(standingOf(e.record!).deliverable);
  });
});

describe('the yes/no is never decided apart from the record', () => {
  const cases: Record<string, Partial<RunEvalInput>> = {
    'all held': {},
    'a required rule broken': { report: report(line('x1', 'MET'), line('x2', 'VIOLATED'), line('UNSOURCED', 'MET')) },
    'an invented specific delivered': { report: report(line('x1', 'MET'), line('x2', 'MET'), line('UNSOURCED', 'VIOLATED', 2)) },
    'specifics the reader could not decide': { report: report(line('x1', 'MET'), line('x2', 'MET'), line('UNSOURCED', 'MET'), line('UNSOURCED·inconclusive', 'VIOLATED', 3)) },
    'the claim check turned off': { claimsOff: true },
    'the check could not run': { report: null },
    'the reader could not run': { report: report(line('x1', 'MET'), line('x2', 'MET'), line('UNSOURCED', 'MET'), line('UNSOURCED·unread', 'VIOLATED')) },
    'the request\'s length missed': { request: { asked: '400 words', met: false, detail: '187 words written, short of it' } },
    'a rule set aside for the run': { applicability: [{ requirementId: 'x2', status: 'WAIVED', why: 'the request states its own length' }], report: report(line('x1', 'MET'), line('x2', 'VIOLATED'), line('UNSOURCED', 'MET')) },
  };
  for (const [name, over] of Object.entries(cases)) {
    it(name, () => {
      const e = buildRunEval(input(over));
      const s = standingOf(e.record!);
      expect(e.result).toEqual({ conformant: s.deliverable, reasons: s.reasons });
      expect(s.state).toBe(e.record!.state);
      // a run that is not deliverable says why, and a run seen to fail is never deliverable
      expect(s.reasons.length === 0).toBe(s.deliverable);
      if (e.record!.state === 'BLOCKED') expect(s.deliverable).toBe(false);
    });
  }
  it('what each of them comes to', () => {
    const of = (k: string) => { const e = buildRunEval(input(cases[k])); return `${e.record!.state} ${e.result.conformant ? 'deliverable' : 'refused'}`; };
    expect(Object.fromEntries(Object.keys(cases).map((k) => [k, of(k)]))).toEqual({
      'all held': 'NEEDS_REVIEW deliverable',
      'a required rule broken': 'BLOCKED refused',
      'an invented specific delivered': 'BLOCKED refused',
      // AN EVALUATION THAT DID NOT FINISH IS NOT A PASS: nothing was seen to fail, and strict delivery still refuses.
      'specifics the reader could not decide': 'NEEDS_REVIEW refused',
      'the claim check turned off': 'NEEDS_REVIEW refused',
      'the check could not run': 'NEEDS_REVIEW refused',
      'the reader could not run': 'NEEDS_REVIEW refused',
      'the request\'s length missed': 'BLOCKED refused',
      'a rule set aside for the run': 'NEEDS_REVIEW deliverable',
    });
  });
  it('a refusal says what the record says, in the record\'s words', () => {
    expect(buildRunEval(input(cases['a required rule broken'])).result.reasons).toEqual(['1 required rule broken (x2 "Between 150 and 230 words")']);
    expect(buildRunEval(input(cases['the claim check turned off'])).result.reasons.join()).toMatch(/invented claims not checked: turned off for this run/);
    expect(buildRunEval(input(cases['the reader could not run'])).result.reasons.join()).toMatch(/invented claims not checked: the claim reader could not run/);
    expect(buildRunEval(input(cases['specifics the reader could not decide'])).result.reasons.join()).toMatch(/3 specifics unconfirmed/);
  });
});

describe('what an observer that has not earned belief found refuses nothing', () => {
  const copying = (tellable: boolean) => buildRecord(facts({ copying: { longest: 19, limit: 12, tellable } }));
  it('a long shared run among too few examples to tell standard wording: shown, and delivered', () => {
    expect(standingOf(copying(false))).toMatchObject({ state: 'NEEDS_REVIEW', deliverable: true, verified: false });
  });
  it('the same run where standard wording can be told: blocked, and refused', () => {
    const s = standingOf(copying(true));
    expect(s).toMatchObject({ state: 'BLOCKED', deliverable: false });
    expect(s.reasons.join()).toMatch(/a run of 19 words is shared with one of them/);
  });
  it('no check at all is not an evaluation that failed: a judgement rule is the owner\'s, and is delivered', () => {
    const judged = aRequirement({ requirementId: 'x8', statement: 'Say when the leader wins only because the comparison is distorted.', obligation: 'JUDGEMENT', provenance: 'EXPERT_STATED' });
    expect(standingOf(buildRecord(facts({ requirements: [judged] })))).toMatchObject({ state: 'NEEDS_REVIEW', deliverable: true, verified: false });
  });
  it('verified is every required thing read in full and held, and nothing less', () => {
    const r = buildRecord(facts({ requirements: [LENGTH], checked: [{ id: 'x2', required: true, verdict: 'MET', detail: '200 words' }] }));
    expect(standingOf(r)).toEqual({ state: 'VERIFIED', verified: true, deliverable: true, reasons: [] });
  });
});

describe('a search that counts runs counts the ones read in full apart', () => {
  const printed = (over: Partial<RunEvalInput>): string => JSON.stringify({ costUsd: 0.1, invocationId: 'i1', eval: buildRunEval(input(over)) });
  const run = (id: string, over: Partial<RunEvalInput>) => readRun(id, printed(over), '', false, new Set(['x2']), 5).result!;
  it('a run that needs review is not a run verified', () => {
    expect(run('a', {})).toMatchObject({ ok: true, verified: false });
    expect(run('b', { std: std(LENGTH) })).toMatchObject({ ok: true, verified: true });
    expect(run('c', { report: report(line('x1', 'MET'), line('x2', 'VIOLATED'), line('UNSOURCED', 'MET')) })).toMatchObject({ ok: false, verified: false, missing: ['x2'] });
  });
  it('and the score carries both counts', () => {
    const s = scoreOf([run('a', {}), run('b', { std: std(LENGTH) }), run('c', { report: report(line('x1', 'MET'), line('x2', 'VIOLATED'), line('UNSOURCED', 'MET')) })]);
    expect(s).toMatchObject({ ok: 2, n: 3, verified: 1 });
  });
  it('a run recorded before the record existed has no count of verified to give', () => {
    const old = JSON.stringify({ costUsd: 0.1, invocationId: 'i0', eval: { result: { conformant: true, reasons: [] }, gates: { required: { broken: [] } } } });
    const r = readRun('o', old, '', false, new Set(), 5).result!;
    expect(r).toMatchObject({ ok: true });
    expect(r.verified).toBeUndefined();
    expect(scoreOf([r]).verified).toBeUndefined();
  });
});

describe('a count of cases reproduced says how many of them were verified in full', () => {
  const one = (over: Partial<CaseOutcome>): CaseOutcome => ({ id: 'a.md', state: 'ran', conformant: true, required: { held: 5, applicable: 5 }, claims: { qualified: true, instrument: 'reader', unsupported: 0 }, reference: { met: 5, applicable: 5 }, words: { output: 900, reference: 1000 }, costUsd: 0.2, ...over });
  const rec = (cases: CaseOutcome[]): ReproductionRecord => ({ schema: 1, skill: 'x', skillVersion: 'a', standardVersion: 'b', at: '', heldBack: { full: cases.length, taskOnly: 0, referenceOnly: 0 }, cases, notCheckable: 0, timesRun: 1, costUsd: 0 });
  it('three reproduced, one of them read in full: the two are different numbers on the screen', () => {
    const r = rec([one({ verified: true }), one({ id: 'b.md', verified: false }), one({ id: 'c.md', verified: false }), one({ id: 'd.md', conformant: false, verified: false })]);
    expect(countsOf(r)).toMatchObject({ ran: 4, reproduced: 3, verified: 1 });
    expect(renderReproduction(r)).toMatch(/3 of 4 {3}reproduced: nothing required was seen to fail on the run\n {2}1 of 4 {3}verified in full: every required rule read whole by a check, and held\./);
  });
  it('a case that was verified and carried the reference\'s wording is not counted verified', () => {
    expect(countsOf(rec([one({ conformant: false, verified: true })])).verified).toBe(0);
  });
  it('runs from before the record say nothing about it, and the line is left out', () => {
    const r = rec([one({}), one({ id: 'b.md' })]);
    expect(countsOf(r).verified).toBeNull();
    expect(renderReproduction(r)).not.toMatch(/verified in full/);
  });
  it('a search\'s score reads the same way', () => {
    expect(heldOf({ ok: 5, n: 6, verified: 2, costUsd: 0, missing: {} })).toBe('5 of 6 with nothing seen to fail (2 verified in full)');
    expect(heldOf({ ok: 5, n: 6, costUsd: 0, missing: {} })).toBe('5 of 6 with nothing seen to fail');
  });
});

describe('where the evaluation and the owner part, counted over rated runs', () => {
  it('said verified and the owner would not use it; blocked and the owner would: each over the rated runs that stood there', async () => {
    const { disagreement } = await import('../cli/commands/eval.js');
    const run = (id: string, state: string | null) => ({ invocationId: id, ...(state ? { record: { state } } : {}) }) as never;
    const evals = [run('a', 'VERIFIED'), run('b', 'VERIFIED'), run('c', 'VERIFIED'), run('d', 'NEEDS_REVIEW'), run('e', 'BLOCKED'), run('f', 'BLOCKED'), run('g', null)];
    const rated = new Map([['a', true], ['b', false], ['d', false], ['e', true], ['f', false], ['g', false]]);
    expect(disagreement(evals, (id) => rated.get(id))).toEqual({ verified: { rated: 2, wouldNotUse: 1 }, blocked: { rated: 2, wouldUse: 1 } });
  });
  it('with nothing rated there is nothing to say', async () => {
    const { disagreement } = await import('../cli/commands/eval.js');
    expect(disagreement([{ invocationId: 'a', record: { state: 'VERIFIED' } } as never], () => undefined)).toEqual({ verified: { rated: 0, wouldNotUse: 0 }, blocked: { rated: 0, wouldUse: 0 } });
  });
});

describe('a rule that was not checked because it does not apply everywhere is not an evaluation that failed', () => {
  // A measured rule under a condition ("when the piece is a rebuttal") is listed by the check and never run: whether
  // its condition holds is a judgement. That is a rule left to the owner. It is not a check that broke, and a skill
  // that has one must still be deliverable under --strict.
  const conditional = { ...LENGTH, requirementId: 'x3', appliesWhen: 'the piece is a rebuttal' } as Requirement;
  it('through a run: delivered, needs review, and the rule is the owner\'s to read', () => {
    const e = buildRunEval(input({ std: std(LENGTH, conditional), report: report(line('x2', 'MET'), line('UNSOURCED', 'MET')) }));
    expect(e.record?.entries.find((x) => x.id === 'x3')).toMatchObject({ result: 'UNVERIFIED' });
    expect(e.record?.entries.find((x) => x.id === 'x3')?.observation.incomplete).toBeUndefined();
    expect(e.result).toEqual({ conformant: true, reasons: [] });
    expect(e.record?.state).toBe('NEEDS_REVIEW');
  });
  it('where the whole check could not run, every rule with a check is unfinished, and it is refused', () => {
    const r = buildRecord(facts({ requirements: [LENGTH], checked: null }));
    expect(standingOf(r)).toMatchObject({ deliverable: false, reasons: ['not checked: x2 (the check did not run)'] });
  });
  it('a refusal for something found names what it is about', () => {
    const e = buildRunEval(input({ report: report(line('x1', 'MET'), line('x2', 'MET'), line('UNSOURCED', 'VIOLATED', 2)) }));
    expect(e.result.reasons).toEqual(['Every specific in the work is found in what you supplied: 2 not found in it, and still in the text']);
  });
});
