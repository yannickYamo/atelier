// MATERIAL NAMING, UNQUALIFIED STEPS, NEGATED BANNED WORDS AND ACCEPTED JUDGEMENT RULES, with expected values taken from what each should do:
//   1. material is named one way at the build and at a run: as a person cites it ("notice of loss");
//   2. an owner's step whose written check did not qualify is required and reports, never a habit;
//   3. a rewrite that takes a banned judgement word out may say it with a negation where the word stood, nowhere else;
//   5. the owner may accept judgement rules at a strict level, and the unread part of a rule a check reads in part.
// (4, the hook on an event that is not JSON, is through the binary: tests/atelier-pass-lines-e2e.test.ts.)
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { materialName } from '../core/golden/case.js';
import { readCase } from '../cli/corpus.js';
import { planFor } from '../core/plan/execution-plan.js';
import { buildRecord } from '../core/eval/record-build.js';
import { certificateFor } from '../core/eval/certificate.js';
import { spanIntegrity, negationsInPlaceOfDrops } from '../core/loop/integrity.js';
import { acceptedCarried, standardHashOf, type Measurement, type Requirement, type StandardVersion } from '../core/state/canonical-state.js';
import { aRequirement } from './fixtures.js';

describe('1: one name for a document of the material, at the build and at a run', () => {
  it('the file\'s name without its folder or extension, "-" and "_" as spaces', () => {
    expect(materialName('e01.material/notice-of-loss.txt')).toBe('notice of loss');
    expect(materialName('invoice_1.txt')).toBe('invoice 1');
    expect(materialName('/tmp/case/police-report.txt')).toBe('police report');
    expect(materialName('policy')).toBe('policy');
    expect(materialName('Q3 figures.csv')).toBe('Q3 figures');
  });
  it('an example\'s material is named that way at the build', () => {
    const c = readCase(resolve('tests/fixtures/samples/claims/examples/e01.md'));
    expect(c.material.map((m) => m.name).sort()).toEqual(['invoice 1', 'invoice 2', 'notice of loss', 'police report', 'policy']);
    expect(join('x', c.material[0].name)).not.toContain('.material');
  });
});

const CHECK: Measurement = { observer: 'CHECK', params: { source: ['(t) => ({ ok: true, detail: "every fact cites the file", spans: [] })'], means: ['each fact cites a document'] } };
const step = (o: Partial<Requirement> = {}): Requirement => aRequirement({ requirementId: 'x2', statement: 'Every fact cites the document in the file it comes from.', provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED',
  materiality: null, obligation: 'DELIVERABLE', measurement: CHECK, ...o });
const facts = (reqs: Requirement[], o: Partial<Parameters<typeof buildRecord>[0]> = {}): Parameters<typeof buildRecord>[0] =>
  ({ requirements: reqs, checked: [{ id: 'x2', required: false, verdict: 'MET', detail: 'every fact cites the file' }], waived: new Map(), request: null, claims: null, copying: null, ...o });

describe('2: a stated step whose written check did not qualify is required, and reports', () => {
  it('planned as the owner\'s rule, not enforced, never a habit', () => {
    const p = planFor({ requirements: [step()] }).rules[0];
    expect([p.role, p.enforced, p.notEnforced, p.onMiss]).toEqual(['RULE', false, 'UNQUALIFIED', 'SHOW']);
  });
  it('a qualified check (the owner\'s step made required) enforces', () => {
    const p = planFor({ requirements: [step({ materiality: 'REQUIRED' })] }).rules[0];
    expect([p.role, p.enforced, p.notEnforced]).toEqual(['RULE', true, null]);
  });
  it('a check read off the examples, not the owner\'s words, stays a habit', () => {
    expect(planFor({ requirements: [step({ provenance: 'MACHINE_DISCOVERED' })] }).rules[0].role).toBe('HABIT');
  });
  it('on the record: unverified, so the run needs review; accepted by the owner, listed, and the run is verified', () => {
    const r = buildRecord(facts([step()]));
    expect(r.state).toBe('NEEDS_REVIEW');
    expect(r.entries[0]).toMatchObject({ dimension: 'STANDARD', required: true, result: 'UNVERIFIED', reason: 'OBSERVER_UNQUALIFIED' });
    expect(r.entries[0].observation.evidence).toContain('has not qualified on your examples');
    const a = buildRecord(facts([step()], { accepted: new Set(['x2']) }));
    expect(a.state).toBe('VERIFIED');
    expect(a.entries[0]).toMatchObject({ result: 'UNVERIFIED', reason: 'LISTED_FOR_YOU' });
  });
});

describe('3: a negation the rewrite needs where a banned judgement word stood', () => {
  const banned = new Set(['suspicious', 'scam']);
  it('allowed in place of the banned word', () => {
    const before = "The insured's account is suspicious.";
    const after = "The insured's account is not contradicted by the documents in the file.";
    expect(negationsInPlaceOfDrops(before, after, [...banned])).toBe(1);
    expect(spanIntegrity(before, after, banned, false)).toEqual({ ok: true, lost: [] });
  });
  it('refused anywhere else in the sentence', () => {
    const before = 'The roof was damaged, and the account is suspicious.';
    const after = 'The roof was not damaged, and the account is consistent.';
    expect(negationsInPlaceOfDrops(before, after, [...banned])).toBe(0);
    expect(spanIntegrity(before, after, banned, false).lost).toContain('added a negation (0 → 1)');
  });
  it('refused where no banned word was taken out', () => {
    const before = 'The account is plausible.'; const after = 'The account is not plausible.';
    expect(spanIntegrity(before, after, new Set(), false).lost).toContain('added a negation (0 → 1)');
    expect(spanIntegrity(before, after, banned, false).lost).toContain('added a negation (0 → 1)');
  });
});

const judged = aRequirement({ requirementId: 'x4', statement: 'Then a Decision section: covered or not covered.', provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', materiality: null, obligation: 'JUDGEMENT' });
const summary = aRequirement({ requirementId: 'x1', statement: 'Open with a Summary section: one paragraph on who, what, where, and the decision.', provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED',
  materiality: 'REQUIRED', obligation: 'DELIVERABLE', measurement: { observer: 'PRESENCE', params: { sections: ['summary'], body: 1, opens: 1 } } });

describe('5: at strict, the owner accepts named rules, and the unread part of a rule read in part', () => {
  const reqs = [summary, judged];
  const met = [{ id: 'x1', required: true, verdict: 'MET' as const, detail: 'a Summary section opens the work' }];
  it('nothing accepted: the part no check reads holds the run', () => {
    const r = buildRecord({ requirements: reqs, checked: met, waived: new Map(), request: null, claims: null, copying: null, latitude: 'STRICT' });
    expect(r.state).toBe('NEEDS_REVIEW');
    expect(r.entries.find((e) => e.id === 'x1')?.reason).toBe('PARTLY_CHECKED');
  });
  it('accepted: VERIFIED, the partly read rule listed with the part accepted and what its check read', () => {
    const r = buildRecord({ requirements: reqs, checked: met, waived: new Map(), request: null, claims: null, copying: null, latitude: 'STRICT', accepted: new Set(['x1', 'x4']) });
    expect(r.state).toBe('VERIFIED');
    const x1 = r.entries.find((e) => e.id === 'x1')!;
    expect(x1.reason).toBe('LISTED_FOR_YOU');
    expect(x1.observation.evidence).toBe('a Summary section opens the work; accepted by you as unmeasured for one paragraph on who, what, where, and the decision');
  });
  it('a failure a check may block on is never accepted away', () => {
    const r = buildRecord({ requirements: reqs, checked: [{ id: 'x1', required: true, verdict: 'VIOLATED', detail: 'no Summary section' }], waived: new Map(), request: null, claims: null, copying: null, accepted: new Set(['x1', 'x4']) });
    expect(r.state).toBe('BLOCKED');
  });
  it('kept across a rebuild by its words while the rule keeps its check; "review" clears it; a strict default accepts nothing', () => {
    const prior = { requirements: reqs, acceptedUnmeasured: ['x1', 'x4'], latitude: { level: 'STRICT' as const, evidence: [], by: 'owner' as const } };
    const again = [{ ...summary, requirementId: 'x11' }, { ...judged, requirementId: 'x14' }];
    expect(acceptedCarried('STRICT', again, undefined, prior).sort()).toEqual(['x11', 'x14']);
    expect(acceptedCarried('STRICT', again, 'review', prior)).toEqual([]);
    // "accept" accepts every rule no check reads, and keeps the partly read one the owner named before
    expect(acceptedCarried('STRICT', again, 'accept', prior).sort()).toEqual(['x11', 'x14']);
    expect(acceptedCarried('STRICT', again, undefined, null)).toEqual([]);
    expect(acceptedCarried('STRICT', again, undefined, null, ['x11'])).toEqual(['x11']);
    // a judgement step that gains a check leaves the list
    const measured = [{ ...judged, requirementId: 'x14', measurement: { observer: 'LEXICON' as const, params: { words: ['fraud'] } } }];
    expect(acceptedCarried('STRICT', measured, undefined, prior)).toEqual([]);
  });
  it('the certificate lists every accepted rule, the partly read one with its unread part', () => {
    const body = { evidenceId: null, workType: 'memo', requirements: reqs, latitude: { level: 'STRICT' as const, evidence: [], by: 'owner' as const }, acceptedUnmeasured: ['x1', 'x4'] };
    const v = { standardVersionHash: standardHashOf(body), ...body, authorityState: 'AUTHORED', mintedAt: '2026-10-22T00:00:00Z', supersedes: null, reason: null } as unknown as StandardVersion;
    expect(certificateFor(v, null, null).acceptedUnmeasured).toEqual([
      { id: 'x1', statement: summary.statement, part: 'one paragraph on who, what, where, and the decision' },
      { id: 'x4', statement: judged.statement },
    ]);
  });
});
