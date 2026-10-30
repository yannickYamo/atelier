// THE DELIVERY BENCH, OFFLINE. A small claims-memo standard, scripted outputs of each kind, and what is done with each
// at each latitude (core/eval/consequence.ts). Expected values are the plan's table (PLAN_2026-10-22_auto-delivery.md),
// written here by hand, not read from the module. Then the loop: a rated rejection requalifies a written check
// (core/method/requalify.ts) and the next run of the same kind is blocked instead of sent to a person.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRecord, type RecordFacts } from '../core/eval/record-build.js';
import { verifyText } from '../core/observers/verify.js';
import { deliveryOf, tableOf, parseConsequences, findingsOf } from '../core/eval/consequence.js';
import { requalifySkill } from '../core/method/requalify.js';
import { certificateFor, recordHead } from '../core/eval/certificate.js';
import { REQUEST_LATITUDE } from '../core/observers/latitude.js';
import { EXECUTION_BRIEF, applyingSteps, type BriefStep } from '../core/loop/execution-brief.js';
import { standardHashOf, hashedBody, type LatitudeLevel, type Measurement, type Requirement, type StandardVersion } from '../core/state/canonical-state.js';
import * as store from '../core/state/store.js';
import { putRating } from '../core/state/eval-store.js';
import { aRequirement, anInvocation } from './fixtures.js';

const owner = (o: Partial<Requirement> & { requirementId: string }): Requirement => aRequirement({ provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', ...o });
// x1: a counted check, required: trusted. x2: a written check not yet qualified. x3: judgement, no check.
const X1 = owner({ requirementId: 'x1', statement: 'Never use the words "fraud" or "scam".', materiality: 'REQUIRED', measurement: { observer: 'LEXICON', params: { terms: ['fraud', 'scam'] } } });
const CITES: Measurement = { observer: 'CHECK', params: { means: ['Each decision cites a clause.'],
  source: ['(t) => { const i = t.toLowerCase().indexOf("clause"); return { ok: i >= 0, detail: i >= 0 ? "a clause is cited" : "no clause cited", spans: [] }; }'] } };
const X2 = owner({ requirementId: 'x2', statement: 'Each decision cites a clause.', materiality: null, obligation: 'DELIVERABLE', measurement: CITES });
const X3 = owner({ requirementId: 'x3', statement: "Never speculate about the insured's intent.", materiality: null, obligation: 'JUDGEMENT' });
const UNQUALIFIED = { examples: { passed: 2, read: 2, of: 2 }, own: { caught: 0, of: 0 }, cross: { fired: 0, of: 0 }, qualified: false, why: 'no edit of your examples that breaks only this step could be written' };
const std = (requirements: Requirement[], extra: Partial<StandardVersion> = {}): StandardVersion => {
  const body = { evidenceId: null, workType: 'claims memo', requirements, ...extra };
  return { standardVersionHash: standardHashOf(body), ...body, authorityState: 'RATIFIED', mintedAt: '2026-10-01T00:00:00.000Z', supersedes: null, reason: null,
    qualifications: { x2: UNQUALIFIED } } as unknown as StandardVersion;
};
const facts = (v: StandardVersion, text: string, more: Partial<RecordFacts> = {}): RecordFacts => ({
  requirements: v.requirements, ...(v.qualifications ? { qualifications: v.qualifications } : {}), waived: new Map(), request: null, claims: null, copying: null,
  checked: verifyText('claims', v, text).checked.map((c) => ({ id: c.requirementId, statement: c.statement, required: c.enforced ?? c.materiality === 'REQUIRED', verdict: c.result.verdict, detail: c.result.detail })), ...more });
const decide = (v: StandardVersion, text: string, level: LatitudeLevel, more: Partial<RecordFacts> = {}) => deliveryOf(buildRecord(facts(v, text, more)), tableOf(v, level), { latitude: level, owned: new Set(Object.keys(v.consequences ?? {})) });

const CLEAN = 'Covered under clause 4.2: the water damage was sudden.';
const NO_CLAUSE = 'Covered: the water damage was sudden.';
const BANNED = 'Covered under clause 4.2, though the account smells of fraud.';
const claimsFlagged: Partial<RecordFacts> = { claims: { state: 'checked', bound: true, qualified: false, why: 'the claim reader is not measured on this kind', delivered: 1, open: 0, cut: 0 } };
const claimsDecided: Partial<RecordFacts> = { claims: { state: 'checked', bound: true, qualified: true, why: null, delivered: 1, open: 0, cut: 0 } };

// the scripted outputs, each with the decision the plan's table gives at STRICT, GROUNDED, CREATIVE
const BENCH: { name: string; v: StandardVersion; text: string; more?: Partial<RecordFacts>; want: [string, string, string] }[] = [
  { name: 'clean', v: std([X1]), text: CLEAN, want: ['SHIP', 'SHIP', 'SHIP'] },
  { name: 'untrusted check passes', v: std([X1, X2]), text: CLEAN, want: ['SHIP_LABELLED', 'SHIP_LABELLED', 'SHIP_LABELLED'] },
  { name: 'untrusted check fails', v: std([X1, X2]), text: NO_CLAUSE, want: ['SHIP_LABELLED', 'SHIP_LABELLED', 'SHIP_LABELLED'] },
  { name: 'trusted check fails', v: std([X1]), text: BANNED, want: ['BLOCK', 'BLOCK', 'SHIP_LABELLED'] },
  { name: 'reader flagged a specific', v: std([X1]), text: CLEAN, more: claimsFlagged, want: ['SHIP_LABELLED', 'SHIP_LABELLED', 'SHIP_LABELLED'] },
  { name: 'specific decided absent from the material', v: std([X1]), text: CLEAN, more: claimsDecided, want: ['BLOCK', 'PERSON', 'SHIP_LABELLED'] },
  { name: 'judgement unread', v: std([X1, X3]), text: CLEAN, want: ['SHIP_LABELLED', 'SHIP_LABELLED', 'SHIP_LABELLED'] },
  { name: 'judgement read as missed by a qualified taste reader', v: std([X1, X3]), text: CLEAN,
    more: { read: new Map([['x3', { verdict: 'MISSED', why: 'speculates', acts: true }]]) }, want: ['PERSON', 'PERSON', 'SHIP_LABELLED'] },
  { name: 'a check could not run', v: std([X1]), text: CLEAN, more: { checked: null }, want: ['SHIP_LABELLED', 'SHIP_LABELLED', 'SHIP_LABELLED'] },
  { name: 'no material bound for the specifics', v: std([X1]), text: CLEAN, more: { claims: { state: 'checked', bound: false, qualified: false, why: null, delivered: 0, open: 2, cut: 0 } }, want: ['SHIP_LABELLED', 'SHIP_LABELLED', 'SHIP_LABELLED'] },
];

describe('the delivery bench: each scripted output, each latitude, the plan\'s table', () => {
  for (const b of BENCH) {
    it(b.name, () => {
      expect((['STRICT', 'GROUNDED', 'CREATIVE'] as const).map((l) => decide(b.v, b.text, l, b.more).decision)).toEqual(b.want);
    });
  }
  it('the record keeps its state: a trusted failure on a creative skill is BLOCKED on the record and ships labelled', () => {
    const r = buildRecord(facts(std([X1]), BANNED));
    expect(r.state).toBe('BLOCKED');
    expect(deliveryOf(r, tableOf(null, 'CREATIVE'))).toMatchObject({ decision: 'SHIP_LABELLED', why: [{ finding: 'trusted-fail', action: 'label', entries: ['x1'] }] });
  });
  it('a rule a check reads only in part fires its check\'s row and the judgement row', () => {
    const partly = owner({ requirementId: 'x4', statement: "Never speculate about the insured's intent or honesty.", materiality: null, obligation: 'DELIVERABLE',
      measurement: { observer: 'CHECK', params: { means: ["No words about the insured's intent or honesty appear."], source: ['(t) => ({ ok: true, detail: "none", spans: [] })'] } } });
    const e = buildRecord(facts(std([partly]), CLEAN)).entries.find((x) => x.id === 'x4');
    expect(e && findingsOf(e)).toEqual(['untrusted-pass', 'judgement-unread']);
  });
  it('a step set aside for this request never holds delivery', () => {
    expect(decide(std([X1, X3]), CLEAN, 'STRICT', { waived: new Map([['x3', 'set aside for this request: the request says "no intent here"']]) }).decision).toBe('SHIP');
  });
  it('a standard with no latitude is held by the grounded table', () => {
    expect(tableOf(std([X1]))).toEqual(tableOf(null, 'GROUNDED'));
  });
});

describe('the owner\'s rows of the table: in the standard, inside its hash', () => {
  it('an override decides, and only the overrides are kept', () => {
    const said: string[] = [];
    const rows = parseConsequences('untrusted-fail=block, judgement-unread=person, nonsense=ship, clean=maybe', undefined, (l) => said.push(l));
    expect(rows).toEqual({ 'untrusted-fail': 'block', 'judgement-unread': 'person' });
    expect(said).toHaveLength(2);
    const v = std([X1, X2], { consequences: rows });
    expect(decide(v, NO_CLAUSE, 'GROUNDED').decision).toBe('BLOCK');
    expect(parseConsequences('untrusted-fail=default', rows, () => undefined)).toEqual({ 'judgement-unread': 'person' });
  });
  it('the table is in the hash; a standard with none hashes as before', () => {
    const body = { evidenceId: null, workType: 'w', requirements: [X1] };
    expect(hashedBody(body)).toBe(JSON.stringify({ evidenceId: null, workType: 'w', requirements: [X1] }));
    expect(standardHashOf({ ...body, consequences: { clean: 'person' } })).not.toBe(standardHashOf(body));
  });
  it('the record head and certificate carry the decision', () => {
    const v = std([X1]); const record = { ...buildRecord(facts(v, BANNED)), delivery: deliveryOf(buildRecord(facts(v, BANNED)), tableOf(v)) };
    const head = recordHead({ state: record.state, standardVersionHash: v.standardVersionHash, skillVersion: null, certificate: certificateFor(v, null, null), record });
    expect([head.delivery?.decision, head.certificate?.delivery]).toEqual(['BLOCK', 'BLOCK']);
  });
});

describe('per-input readings: closed choices with NONE, NONE to the safe side', () => {
  it('request latitude: NONE, a looser answer, an unquoted tightening and the floor all hold the skill\'s own level', () => {
    const input = { level: 'GROUNDED' as const, request: 'Write the memo for claim 22.' };
    expect(REQUEST_LATITUDE.ground({ level: 'NONE', quote: null }, input)).toEqual({ level: 'GROUNDED', quote: null });
    expect(REQUEST_LATITUDE.ground({ level: 'CREATIVE', quote: null }, input)).toEqual({ level: 'GROUNDED', quote: null });
    expect(REQUEST_LATITUDE.ground({ level: 'STRICT', quote: 'not in the request' }, input)).toBeNull();
    expect(REQUEST_LATITUDE.floor(input)).toEqual({ level: 'GROUNDED', quote: null });
    expect((REQUEST_LATITUDE.schema as { properties: { level: { enum: string[] } } }).properties.level.enum).toContain('NONE');
  });
  it('steps that apply: NONE, an unquoted DOES_NOT_HOLD and the floor all leave the step applying', () => {
    const steps: BriefStep[] = [{ id: 'x3', n: 1, statement: 'When the claim is over $10k, name the adjuster.', required: true, unit: { decision: null, condition: 'when the claim is over $10k', exception: null } as never }];
    const input = { request: 'Write the memo for claim 22.', material: [], steps };
    const none = EXECUTION_BRIEF.ground({ placed: [{ n: 1, holds: 'NONE', quote: null }], unsupported: [], contradicted: [] }, input);
    expect(none && applyingSteps(none, steps).map((s) => s.id)).toEqual(['x3']);
    const unquoted = EXECUTION_BRIEF.ground({ placed: [{ n: 1, holds: 'DOES_NOT_HOLD', quote: 'over $50k' }], unsupported: [], contradicted: [] }, input);
    expect(unquoted && applyingSteps(unquoted, steps).map((s) => s.id)).toEqual(['x3']);
    expect(applyingSteps(EXECUTION_BRIEF.floor(input), steps).map((s) => s.id)).toEqual(['x3']);
    expect((EXECUTION_BRIEF.schema as { properties: { placed: { items: { properties: { holds: { enum: string[] } } } } } }).properties.placed.items.properties.holds.enum).toContain('NONE');
  });
});

describe('the loop: a rated rejection requalifies the check, and the next run is decided differently', () => {
  let L: store.StoreLayout;
  beforeEach(() => { L = { root: mkdtempSync(join(tmpdir(), 'atelier-delivery-')), skillName: 'claims' }; store.initStore(L); });
  const install = (v: StandardVersion): void => {
    store.putStandard(L, v);
    store.putSkillVersion(L, { skillVersionHash: 'k1', skillName: 'claims', standardVersionHash: v.standardVersionHash, architectureHash: 'a1', materializedHash: 'm1', builtAt: v.mintedAt });
    store.setActive(L, 'k1');
  };
  const active = (): StandardVersion => store.getStandard(L, store.getSkillVersion(L, store.getActive(L) ?? '')?.standardVersionHash ?? '')!;

  it('before: a memo with no clause goes to a person; after one rejection naming the step: repaired, then blocked', () => {
    install(std([X1, X2]));
    expect(decide(active(), NO_CLAUSE, 'GROUNDED').decision).toBe('SHIP_LABELLED');
    store.putInvocation(L, anInvocation({ invocationId: 'i1', skillName: 'claims', skillVersionHash: 'k1', output: NO_CLAUSE, at: '2026-10-21T00:00:00.000Z' }));
    putRating(L, { invocationId: 'i1', ship: false, why: 'no clause', at: '2026-10-21T01:00:00.000Z', release: null, rule: 'x2', ruleStatement: X2.statement });
    const r = requalifySkill(L, '2026-10-21T02:00:00.000Z');
    expect(r.moved.map((m) => [m.id, m.was, m.now])).toEqual([['x2', false, true]]);
    const after = active();
    expect(after.qualifications?.x2).toMatchObject({ qualified: true, own: { caught: 1, of: 1 } });
    expect(decide(after, NO_CLAUSE, 'GROUNDED')).toMatchObject({ decision: 'BLOCK', why: [{ finding: 'trusted-fail', action: 'block', entries: ['x2'] }] });
    expect(certificateFor(after, null, null).requalified).toEqual([{ id: 'x2', statement: X2.statement, was: false, now: true, accepted: 0, rejected: 1, cross: 0, at: '2026-10-21T02:00:00.000Z' }]);
    // held again with nothing new: the same answer, nothing counted twice
    expect(requalifySkill(L).moved).toEqual([]);
    expect(active().qualifications?.x2.own).toEqual({ caught: 1, of: 1 });
  });
  it('a rejection rated before the standing was set was the build\'s to count, and is not counted again', () => {
    install(std([X1, X2]));
    store.putInvocation(L, anInvocation({ invocationId: 'i0', skillName: 'claims', skillVersionHash: 'k1', output: NO_CLAUSE }));
    putRating(L, { invocationId: 'i0', ship: false, why: null, at: '2026-09-01T00:00:00.000Z', release: null, rule: 'x2', ruleStatement: X2.statement });
    expect(requalifySkill(L).moved).toEqual([]);
    expect(active().qualifications?.x2.qualified).toBe(false);
  });
  it('an accepted run the check fails takes back what it earned', () => {
    install(std([X1, X2]));
    store.putInvocation(L, anInvocation({ invocationId: 'i1', skillName: 'claims', skillVersionHash: 'k1', output: NO_CLAUSE }));
    putRating(L, { invocationId: 'i1', ship: false, why: null, at: '2026-10-21T01:00:00.000Z', release: null, rule: 'x2', ruleStatement: X2.statement });
    store.putInvocation(L, anInvocation({ invocationId: 'i2', skillName: 'claims', skillVersionHash: 'k1', output: 'Covered: sudden damage, as the policy says.' }));
    putRating(L, { invocationId: 'i2', ship: true, why: null, at: '2026-10-21T01:00:00.000Z', release: null });
    expect(requalifySkill(L).moved).toEqual([]);
    expect(active().qualifications?.x2).toMatchObject({ qualified: false, examples: { passed: 2, read: 3 } });
    expect(decide(active(), NO_CLAUSE, 'GROUNDED').decision).toBe('SHIP_LABELLED');
  });
});
