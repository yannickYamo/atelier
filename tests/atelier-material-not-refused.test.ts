// tests/atelier-material-not-refused.test.ts — A RUN IS NEVER REFUSED FOR MATERIAL IT WAS NOT GIVEN.
//
// A REQUIRED rule that needs material the person did not bind stopped the run before any draft ("nothing was
// generated"). Material not given is the ordinary state of someone's notes, not an error: the run proceeds, the rule is
// not attempted, and the evaluation says it was not checked, so the work can never read as VERIFIED on its account.
import { describe, it, expect } from 'vitest';
import { checkSatisfiable, describeSatisfiability } from '../core/state/prerequisite.js';
import { buildRecord, MATERIAL_NOT_BOUND, type RecordFacts } from '../core/eval/record-build.js';
import { standingOf } from '../core/eval/record.js';
import type { Requirement } from '../core/state/canonical-state.js';

const need = [{ kind: 'MATERIAL' as const, name: 'actual-figures', why: 'the figures for the period' }];

describe('the run proceeds, and says what it could not do', () => {
  it('the message names the rule and the --with, and says the run goes on with the rule not checked', () => {
    const v = checkSatisfiable([{ requirementId: 'p9', statement: 'Cite one counted observation from our records.', materiality: 'REQUIRED', appliesWhen: 'GENERAL', prerequisites: need as never }], new Set());
    expect(v.kind).toBe('MISSING_REQUIRED_EVIDENCE');
    const said = describeSatisfiability(v)!;
    expect(said).toContain('--with actual-figures=<file>');
    expect(said).toMatch(/The run goes on/);
    expect(said).toMatch(/not checked/);
    expect(said).not.toMatch(/nothing was generated/);
  });
  it('every rule short of material is held back from the draft, the REQUIRED ones too', async () => {
    const { waitingForMaterial } = await import('../cli/commands/invoke.js');
    const v = checkSatisfiable([{ requirementId: 'p9', statement: 'x', materiality: 'REQUIRED', appliesWhen: 'GENERAL', prerequisites: need as never }], new Set());
    expect([...waitingForMaterial(v)]).toEqual(['p9']);
  });
});

describe('the evaluation: a REQUIRED rule waiting for material is not checked, never set aside', () => {
  const rule: Requirement = { requirementId: 'p9', statement: 'Cite one counted observation from our records.', materiality: 'REQUIRED', authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_STATED',
    obligation: 'DELIVERABLE', measurement: { observer: 'PRESENCE', params: { sections: ['Evidence'], body: 1 } } } as never;
  const facts = (o: Partial<RecordFacts>): RecordFacts => ({ requirements: [rule], checked: [], waived: new Map(), request: null, claims: null, copying: null, ...o });
  it('it is UNVERIFIED and unfinished: the work needs review and is not deliverable under strict delivery', () => {
    const r = buildRecord(facts({ waived: new Map([['p9', MATERIAL_NOT_BOUND]]) }));
    const e = r.entries.find((x) => x.id === 'p9')!;
    expect(e.result).toBe('UNVERIFIED');
    expect(e.observation.incomplete).toMatch(/needs material this run was not given/);
    expect(r.state).toBe('NEEDS_REVIEW');
    expect(standingOf(r).deliverable).toBe(false);
  });
  it('a rule set aside for another reason is still set aside', () => {
    const r = buildRecord(facts({ waived: new Map([['p9', 'the request states its own length (300 words)']]) }));
    expect(r.entries.find((x) => x.id === 'p9')!.result).toBe('NOT_APPLICABLE');
  });
});

describe('review: a rule held back under a condition is not an unfinished evaluation', () => {
  it('a conditional REQUIRED rule withheld for material keeps its old reading: set aside, the work deliverable', async () => {
    const { buildRecord, CONDITIONAL_NOT_BOUND } = await import('../core/eval/record-build.js');
    const rule = { requirementId: 'r1', statement: 'Name the exact file and line, when pointing at a change.', materiality: 'REQUIRED', authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_STATED',
      obligation: 'DELIVERABLE', appliesWhen: 'when pointing at a change', measurement: { observer: 'PRESENCE', params: { sections: ['Evidence'], body: 1 } } } as never;
    const r = buildRecord({ requirements: [rule], checked: [], waived: new Map([['r1', CONDITIONAL_NOT_BOUND]]), request: null, claims: null, copying: null });
    expect(r.entries.find((x) => x.id === 'r1')!.result).toBe('NOT_APPLICABLE');
    const { standingOf } = await import('../core/eval/record.js');
    expect(standingOf(r).deliverable).toBe(true);
  });
  it('the run gives each held-back rule the reason that fits it', async () => {
    const { heldBackReasons } = await import('../cli/commands/invoke.js');
    const { MATERIAL_NOT_BOUND, CONDITIONAL_NOT_BOUND } = await import('../core/eval/record-build.js');
    const v = { kind: 'DEGRADED', missing: [{ requirementId: 'a', materiality: 'REQUIRED', conditional: true }, { requirementId: 'b', materiality: 'PREFERRED' }] } as never;
    expect([...heldBackReasons(v)]).toEqual([['a', CONDITIONAL_NOT_BOUND], ['b', CONDITIONAL_NOT_BOUND]]);
    const w = { kind: 'MISSING_REQUIRED_EVIDENCE', missing: [{ requirementId: 'c', materiality: 'REQUIRED', unfinished: true }, { requirementId: 'a', materiality: 'REQUIRED', conditional: true }] } as never;
    expect(heldBackReasons(w).get('c')).toBe(MATERIAL_NOT_BOUND);
    expect(heldBackReasons(w).get('a')).toBe(CONDITIONAL_NOT_BOUND);
  });
});
