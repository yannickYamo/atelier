// THE AUTHORITY CONTRACT, TRIED ADVERSARIALLY (core/state/contract.ts, core/eval/record.ts). One owner of what is
// required; pieces, counts and readings are evidence. Each test below attempts a transition the product must refuse,
// or asserts the one it must make.
import { describe, it, expect } from 'vitest';
import { runtimePermission, mayDecide, mayRaiseEvidence, readingMay, interventionFor, applies } from '../core/state/contract.js';
import { judge, stateOf, type Entry, type Observed } from '../core/eval/record.js';
import { reconcilePersona } from '../core/compiler/persona.js';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import type { StandardVersion, Requirement } from '../core/state/canonical-state.js';

describe('what a standing permits at run time', () => {
  it('a model-read hypothesis the owner never saw is monitored, whatever its frequency; adopted, it binds; rejected, it is monitored', () => {
    expect(runtimePermission({ origin: 'READ', evidence: 'observed', owner: 'not-presented' })).toBe('monitor');
    expect(runtimePermission({ origin: 'READ', evidence: 'qualified', owner: 'not-presented' })).toBe('soft');
    expect(runtimePermission({ origin: 'READ', evidence: 'qualified', owner: 'adopted' })).toBe('binding');
    expect(runtimePermission({ origin: 'DERIVED', evidence: 'qualified', owner: 'rejected' })).toBe('monitor');
    expect(runtimePermission({ origin: 'DERIVED', evidence: 'provisional', owner: 'not-presented' })).toBe('monitor');
    expect(runtimePermission({ origin: 'SHOWN_BY_EXAMPLE', evidence: 'disputed', owner: 'pending' })).toBe('monitor');
  });
  it('a stated step binds by being stated', () => {
    expect(runtimePermission({ origin: 'STATED', evidence: 'observed', owner: 'pending' })).toBe('binding');
  });
  it('a provisional band never blocks: its intervention is a record, a soft one a note, only a binding one a redraft or block', () => {
    expect(interventionFor(runtimePermission({ origin: 'DERIVED', evidence: 'provisional', owner: 'not-presented' }))).toBe('record');
    expect(interventionFor('soft')).toBe('note');
    expect(interventionFor('binding')).toBe('redraft-or-block');
  });
});

describe('who may move the owner\'s decision and the evidence', () => {
  it('a model, a reading, a count or feedback never adopts, rejects or presents; the owner does', () => {
    for (const actor of ['model', 'reading', 'count', 'feedback'] as const) {
      expect(mayDecide(actor, 'not-presented', 'adopted')).toBe(false);
      expect(mayDecide(actor, 'pending', 'rejected')).toBe(false);
      expect(mayDecide(actor, 'not-presented', 'pending')).toBe(false);
    }
    expect(mayDecide('owner', 'pending', 'adopted')).toBe(true);
    expect(mayDecide('owner', 'pending', 'rejected')).toBe(true);
  });
  it('a rejected item comes back only by being presented again, never adopted in one move', () => {
    expect(mayDecide('owner', 'rejected', 'adopted')).toBe(false);
    expect(mayDecide('owner', 'rejected', 'pending')).toBe(true);
  });
  it('a reading raises no evidence; a count reaches provisional at most; qualification is the study\'s', () => {
    expect(mayRaiseEvidence('reading', 'observed', 'qualified')).toBe(false);
    expect(mayRaiseEvidence('model', 'observed', 'provisional')).toBe(false);
    expect(mayRaiseEvidence('count', 'observed', 'provisional')).toBe(true);
    expect(mayRaiseEvidence('count', 'provisional', 'qualified')).toBe(false);
    expect(mayRaiseEvidence('owner', 'provisional', 'qualified')).toBe(true);
    expect(mayRaiseEvidence('reading', 'qualified', 'disputed')).toBe(true);
  });
});

describe('what a reading may do to a result', () => {
  it('observe reports; veto fails only a miss; nothing passes a requirement', () => {
    expect(readingMay('observe', 'FOLLOWED')).toBe('report');
    expect(readingMay('observe', 'MISSED')).toBe('report');
    expect(readingMay('veto', 'FOLLOWED')).toBe('report');
    expect(readingMay('veto', 'MISSED')).toBe('fail');
    expect(readingMay('veto', 'UNCLEAR')).toBe('report');
  });
  it('an unresolved applicability holds the step as applying', () => {
    expect(applies('unresolved')).toBe(true); expect(applies('applies')).toBe(true); expect(applies('set-aside')).toBe(false);
  });
});

describe('the record decides a result from the observation alone', () => {
  const o = (over: Partial<Observed>): Observed => ({ applies: true, verdict: 'MET', coverage: 'FULL', qualification: 'DETERMINISTIC', ...over });
  it('an unqualified observer that says MET verifies nothing; one that says VIOLATED fails nothing either', () => {
    expect(judge(o({ qualification: 'UNQUALIFIED' }))).toEqual({ result: 'UNVERIFIED', reason: 'OBSERVER_UNQUALIFIED' });
    expect(judge(o({ qualification: 'UNQUALIFIED', verdict: 'VIOLATED' }))).toEqual({ result: 'UNVERIFIED', reason: 'OBSERVER_UNQUALIFIED' });
    expect(judge(o({ qualification: 'UNAVAILABLE' }))).toEqual({ result: 'UNVERIFIED', reason: 'OBSERVER_UNQUALIFIED' });
  });
  it('a requirement nothing reads is unverified, and a required one keeps the run at NEEDS REVIEW, never VERIFIED', () => {
    expect(judge(o({ verdict: null, coverage: 'NONE' }))).toEqual({ result: 'UNVERIFIED', reason: 'NOT_MACHINE_CHECKABLE' });
    const entry = (id: string, required: boolean, obs: Observed): Entry => {
      const { result, reason } = judge(obs);
      return { id, dimension: 'STANDARD', source: 'OWNER', statement: id, required, observation: { proposition: null, coverage: obs.coverage, qualification: obs.qualification, evidence: null }, result, reason } as Entry;
    };
    const held = entry('m1', true, o({}));
    const unread = entry('j1', true, o({ verdict: null, coverage: 'NONE', qualification: 'UNAVAILABLE' }));
    const readByModel = entry('j2', true, o({ qualification: 'UNQUALIFIED' }));
    expect(stateOf([held])).toBe('VERIFIED');
    expect(stateOf([held, unread])).toBe('NEEDS_REVIEW');
    expect(stateOf([held, readByModel])).toBe('NEEDS_REVIEW');
    // a habit from the examples that was not adopted moves nothing
    expect(stateOf([held, entry('h1', false, o({ verdict: null, coverage: 'NONE' }))])).toBe('VERIFIED');
  });
});

describe('the persona can only lose points to the standard, never add a rule to it', () => {
  it('reconcilePersona drops what a boundary forbids and adds nothing', () => {
    const p = { points: [
      { aspect: 'a', description: 'Asks the reader a question.', frequency: 'OFTEN' as const, quote: 'Why not?' },
      { aspect: 'b', description: 'Closes short.', frequency: 'ALWAYS' as const, quote: 'Done.' }], dropped: 0 };
    const r = reconcilePersona(p, (t) => t.includes('question'));
    expect(r.points.map((x) => x.aspect)).toEqual(['b']);
    expect(r.conflicting).toBe(1);
  });
});

describe('a rule no count checks says so in the skill', () => {
  const req = (over: Partial<Requirement>): Requirement => ({ requirementId: 'r1', statement: 'Frame each initiative as a bet with its rationale.', appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'EXPERT_RATIFIED', provenance: 'EXPERT_STATED',
    evidence: null, evidenceItemId: null, wouldBeAbsentIf: null, materiality: 'REQUIRED', realizationTolerance: null, outputShape: null, ...over });
  const std = (rs: Requirement[]): StandardVersion => ({ standardVersionHash: 's', evidenceId: 'e', workType: 'strategy', requirements: rs, authorityState: 'RATIFIED', mintedAt: '2026-10-18T00:00:00Z' } as unknown as StandardVersion);
  it('"Read, not counted" beside a judgement step; "Checked" beside a measured one', () => {
    const v = std([req({}), req({ requirementId: 'r2', statement: 'Between 220 and 420 words.', measurement: { observer: 'LENGTH', params: { unit: ['words'], min: 220, max: 420 } } })]);
    const md = renderAgentSkill(v, compileArchitecture(v), 'strategy', 'd', null, [], null).files['SKILL.md'];
    expect(md).toContain(['1. Frame each initiative as a bet with its rationale.', '   Read, not counted: no check measures this; whether the work does it is reported, never counted as held.', '   <!-- r1'].join('\n'));
    expect(md).toContain('2. Between 220 and 420 words.\n' + '   Checked: ');
    expect(md).not.toContain('2. Between 220 and 420 words.\n' + '   Read, not counted');
  });
});
