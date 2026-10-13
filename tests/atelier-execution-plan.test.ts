// tests/atelier-execution-plan.test.ts — WHAT A SKILL DOES WITH EACH RULE IS DECIDED ONCE, AND READ EVERYWHERE.
import { describe, it, expect } from 'vitest';
import { planFor, describePlan } from '../core/plan/execution-plan.js';
import { buildRecord } from '../core/eval/record-build.js';
import type { Requirement, StandardVersion } from '../core/state/canonical-state.js';
import { aRequirement } from './fixtures.js';

const stated = (id: string, statement: string, measurement: Requirement['measurement'] | null, o: Partial<Requirement> = {}): Requirement =>
  aRequirement({ requirementId: id, statement, provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', materiality: 'REQUIRED', obligation: 'DELIVERABLE', ...(measurement ? { measurement } : {}), ...o });
const SECTION = stated('x1', 'Open with a Verdict section.', { observer: 'PRESENCE', params: { sections: ['Verdict'], body: 1, opens: 1 } });
const LENGTH = stated('x2', 'Between 220 and 420 words.', { observer: 'LENGTH', params: { unit: ['words'], min: 220, max: 420 } });
const CITES = stated('x3', 'Cite each item as path:line.', { observer: 'LINES', params: { min: 0 } }, { obligation: 'EXECUTION' });
const BANNED = stated('x4', 'Never use the word "excited".', { observer: 'LEXICON', params: { terms: ['excited'] } }, { obligation: undefined });
const JUDGED = stated('x5', 'Weigh the risk before the style.', null, { obligation: 'JUDGEMENT', materiality: null });
const DISPUTED = stated('x6', 'Include a table with the columns Type and Rationale.', { observer: 'TABLE', params: { columns: ['type', 'rationale'], minRows: 1 } }, { materiality: null, contested: 'your example does not do this' });
const HABIT = aRequirement({ requirementId: 'h1', statement: 'Paragraphs of at most 4 sentences.', materiality: 'PREFERRED', wordedFromCheck: true, measurement: { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 4 } } });
const SHOWN = aRequirement({ requirementId: 'h2', statement: 'I tend to open on a scene.', materiality: 'PREFERRED' });
const REJECTED = stated('x9', 'Never write lists.', { observer: 'LEXICON', params: { terms: ['-'] } }, { authority: 'EXPERT_REJECTED' });
const std = { requirements: [SECTION, LENGTH, CITES, BANNED, JUDGED, DISPUTED, HABIT, SHOWN, REJECTED] } as unknown as StandardVersion;
const plan = planFor(std); const of = (id: string) => plan.rules.find((p) => p.id === id)!;

describe('the plan of a standard', () => {
  it('says of each rule what it is, whether its check may block, and what a run does on a miss', () => {
    expect(plan.rules.map((p) => [p.id, p.role, p.enforced, p.onMiss])).toEqual([
      ['x1', 'RULE', true, 'REDRAFT'], ['x2', 'RULE', true, 'REDRAFT'], ['x3', 'RULE', true, 'REDRAFT'], ['x4', 'RULE', true, 'REWRITE'],
      ['x5', 'JUDGEMENT', false, 'NONE'], ['x6', 'RULE', false, 'SHOW'], ['h1', 'HABIT', false, 'SHOW'], ['h2', 'HABIT', false, 'NONE']]);
  });
  it('a rule the owner rejected is in no plan', () => { expect(plan.rules.some((p) => p.id === 'x9')).toBe(false); });
  it('why a rule with a check does not block is said, and is one of two things', () => {
    expect(of('x6').notEnforced).toBe('DISPUTED_BY_EXAMPLES');
    expect(of('h1').notEnforced).toBe('NOT_REQUIRED');
    expect(of('x1').notEnforced).toBeNull();
    expect(of('x5').notEnforced).toBeNull();
  });
  it('carries what each check reads and how much of the rule that is', () => {
    expect(of('x1').check).toMatchObject({ observer: 'PRESENCE', reads: 'OUTPUT', coverage: 'FULL' });
    expect(of('x3').check).toMatchObject({ observer: 'LINES', reads: 'BOUND_MATERIAL', coverage: 'PARTIAL' });
    expect(of('x5').check).toBeNull();
  });
  it('knows whether the skill reads material, and whether the owner rules the length', () => {
    expect(plan).toMatchObject({ readsMaterial: true, rulesLength: true });
    // a length the owner stated is the length even while their examples dispute it: the examples add no second one
    expect(planFor({ requirements: [SECTION, { ...LENGTH, contested: 'your examples run longer', materiality: null }] })).toMatchObject({ readsMaterial: false, rulesLength: true });
    expect(planFor({ requirements: [SECTION, HABIT] }).rulesLength).toBe(false);
  });
  it('is said in plain words for a build\'s whole account', () => {
    const lines = describePlan(plan).join('\n');
    expect(lines).toContain('x1    rule       checked · blocks when it fails · on a miss: written again');
    expect(lines).toContain('x3    rule       checked in part against your material · blocks when it fails · on a miss: written again');
    expect(lines).toContain('x6    rule       checked · does not block: your examples dispute it · on a miss: shown, nothing done');
    expect(lines).toContain('x5    judgement  no check · does not block · on a miss: yours to judge');
  });
});

describe('enforced means one thing', () => {
  const state = (r: Requirement, required: boolean): string => buildRecord({ requirements: [r], checked: [{ id: r.requirementId, required, verdict: 'VIOLATED', detail: 'found' }], waived: new Map(), request: null, claims: null, copying: null }).state;
  it('a check on the owner\'s rule that they never made required is shown and blocks nothing, in the plan and in the record', () => {
    const judgedWithCheck = stated('j2', 'Sound calm and never breathless.', { observer: 'SENTENCE_LENGTH', params: { medianMax: 5, p90Max: 6 } }, { obligation: 'JUDGEMENT', materiality: null });
    expect(planFor({ requirements: [judgedWithCheck] }).rules[0]).toMatchObject({ role: 'RULE', enforced: false, notEnforced: 'NOT_REQUIRED', onMiss: 'SHOW' });
    expect(state(judgedWithCheck, false)).toBe('NEEDS_REVIEW');
  });
  it('a disputed rule the owner then makes required is enforced: making it required settles the dispute', () => {
    const settled = { ...DISPUTED, materiality: 'REQUIRED' as const };
    expect(planFor({ requirements: [settled] }).rules[0]).toMatchObject({ enforced: true, notEnforced: null });
    expect(state(settled, true)).toBe('BLOCKED');
    expect(state(DISPUTED, false)).toBe('NEEDS_REVIEW');
  });
  it('what was read off examples is said to be from the examples, whatever it is', () => {
    const likeThese = aRequirement({ requirementId: 'e1', statement: 'New work reads like the 3 examples given.', obligation: 'JUDGEMENT', materiality: 'PREFERRED', provenance: 'MACHINE_DISCOVERED' });
    const r = buildRecord({ requirements: [likeThese, JUDGED], checked: [], waived: new Map(), request: null, claims: null, copying: null });
    expect(r.entries.map((e) => [e.id, e.source, e.required])).toEqual([['e1', 'EXAMPLE', true], ['x5', 'METHOD', true]]);
  });
});

describe('the runtime and the evaluation read the plan, and so agree', () => {
  it('a draft is written again for exactly the rules the plan says, and a disputed rule is not one of them', async () => {
    const { unmetReader } = await import('../cli/commands/invoke.js');
    const violated = (id: string) => ({ requirementId: id, materiality: 'REQUIRED', result: { verdict: 'VIOLATED', detail: 'd', spans: [], value: null } });
    const report = { failed: true, unchecked: [], checked: ['x1', 'x2', 'x3', 'x4', 'x6', 'h1'].map(violated) } as never;
    expect(unmetReader(std, null)?.({ output: 'x', report }).map((u) => u.id)).toEqual(plan.rules.filter((p) => p.onMiss === 'REDRAFT').map((p) => p.id));
  });
  it('what blocks in the record is exactly what the plan enforces', () => {
    const checked = plan.rules.filter((p) => p.check).map((p) => ({ id: p.id, required: p.enforced, verdict: 'VIOLATED' as const, detail: 'found' }));
    const record = buildRecord({ requirements: std.requirements, checked, waived: new Map(), request: null, claims: null, copying: null });
    expect(record.entries.filter((e) => e.required && e.result === 'FAIL').map((e) => e.id)).toEqual(plan.rules.filter((p) => p.enforced).map((p) => p.id));
    // every rule and judgement is in the record as the owner's; a habit is there only where a check read it
    expect(record.entries.filter((e) => e.dimension === 'STANDARD').map((e) => e.id)).toEqual(plan.rules.filter((p) => p.role !== 'HABIT').map((p) => p.id));
    expect(record.entries.filter((e) => e.dimension === 'HABIT').map((e) => e.id)).toEqual(['h1']);
  });
});
