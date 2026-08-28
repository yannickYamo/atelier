// tests/atelier-contract-arms.test.ts — THE CONTROL, AND THE THINGS IT MAY NOT TOUCH.
//
// Three properties, each protecting a different way the loop could quietly stop meaning anything.
//
// BARE MUST STAY A CONTROL. Defined as "don't send the stableBlock" it is correct today and becomes
// wrong the moment Atelier compiles a second artifact. So the arms are built from one shape and a
// test reads the actual difference between two requests, which is the check that fails on the day
// somebody threads a new carrier through a second field.
//
// BARE MUST NOT ENTER THE REPAIR. What to fix is a function of the standard and of what the
// implementation did. A rule the runtime already satisfies is still a rule the implementation owes,
// because the next binding may not satisfy it.
//
// THE REPAIR MUST NOT MOVE THE TARGET. The optimizer is the most dangerous writer in the system: it
// changes served bytes with nobody reading the result first.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { requestFor, requestDiff, ArmMisconfigured, CONTRACT_ARMS, MAY_INFORM_REPAIR,
  type ArmContext } from '../core/contract/arm.js';
import { tallyOf, deltaBetween, describeArmComparison } from '../core/contract/compare-arms.js';
import { admitsRepair, assertSameTarget, normativeHash, proposeRepair } from '../core/contract/repair.js';
import { authorityStateOf, type Requirement, type StandardVersion } from '../core/state/canonical-state.js';
import type { ContractResult } from '../core/contract/suite.js';

const ctx: ArmContext = {
  task: 'write the recommendation', maxTokens: 1200,
  toolName: 'emit_output', toolDescription: 'Produce the requested work.',
  schema: { type: 'object', properties: { output: { type: 'string' } } },
};

const req = (id: string, over: Partial<Requirement> = {}): Requirement => ({
  requirementId: id, statement: `rule ${id}`, appliesWhen: 'GENERAL',
  kind: 'GENERATIVE', authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_ADDED',
  evidence: null, evidenceItemId: null, wouldBeAbsentIf: null,
  materiality: null, realizationTolerance: null, outputShape: null, ...over,
});

const standard = (rs: Requirement[], hash = 'sv1'): StandardVersion => ({
  standardVersionHash: hash, evidenceId: null, workType: 'writing', requirements: rs,
  authorityState: authorityStateOf(rs), mintedAt: '2026-01-01T00:00:00.000Z',
  supersedes: null, reason: null,
});

describe('bare is a condition, not a missing field', () => {
  it('differs from a skill arm in exactly one field', () => {
    // THE CHECK THAT SURVIVES ATELIER GROWING. When a second carrier is threaded through a new
    // field, this returns two names and the control has stopped being one.
    const bare = requestFor('BARE', null, ctx);
    const initial = requestFor('INITIAL', 'COMPILED SKILL BYTES', ctx);
    expect(requestDiff(bare, initial)).toEqual(['stableBlock']);
  });

  it('every arm gets the identical task, tools, schema and token budget', () => {
    const rs = CONTRACT_ARMS.map((a) => requestFor(a, a === 'BARE' ? null : 'BYTES', ctx));
    for (const r of rs) {
      expect(r.userMessage).toBe(ctx.task);
      expect(r.maxTokens).toBe(ctx.maxTokens);
      expect(r.toolName).toBe(ctx.toolName);
      expect(r.schema).toEqual(ctx.schema);
    }
  });

  it('refuses to serve compiled bytes to the control', () => {
    // A control that silently accepted a treatment produces a comparison where both sides are the
    // same and nothing says so.
    expect(() => requestFor('BARE', 'SOME COMPILED SKILL', ctx)).toThrow(ArmMisconfigured);
    expect(() => requestFor('BARE', 'SOME COMPILED SKILL', ctx)).toThrow(/wearing a control's name/);
  });

  it('refuses a skill arm with nothing to serve', () => {
    // Indistinguishable from BARE, and would report as though the skill had been tested.
    expect(() => requestFor('INITIAL', null, ctx)).toThrow(ArmMisconfigured);
    expect(() => requestFor('CANDIDATE', '', ctx)).toThrow(/indistinguishable from BARE/);
  });
});

describe('bare informs the report and never the repair', () => {
  it('is not among the arms that may inform a repair', () => {
    expect(MAY_INFORM_REPAIR).not.toContain('BARE');
    expect(MAY_INFORM_REPAIR).toEqual(['INITIAL', 'CANDIDATE']);
  });

  it('the repair path cannot see a control arm at all', () => {
    // Structural rather than conventional: if `repair.ts` ever imports the arm vocabulary, a bare
    // result has become reachable from the decision about what to fix.
    const code = readFileSync('core/contract/repair.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // No word boundary: `BARE_HINT` would slip past /\bBARE\b/ because `_` is a word character,
    // and a leak is at least as likely to arrive as a helpfully-named constant as a bare literal.
    expect(code, 'the repair path names the control arm').not.toMatch(/BARE/);
    expect(code, 'the repair path imports the arm vocabulary').not.toMatch(/['"]\.\/arm\.js['"]/);
    expect(code, 'the repair path imports the arm comparison').not.toMatch(/compare-arms/);
    expect(code, 'the repair path names a contract arm type').not.toMatch(/ContractArm|ArmTally/);
  });
});

describe('only an implementation miss may change an implementation', () => {
  it('admits IMPLEMENTATION_MISS', () => {
    expect(admitsRepair('IMPLEMENTATION_MISS').refused).toBe(false);
  });

  it('refuses a standard gap, because repairing it would author a rule', () => {
    const r = admitsRepair('STANDARD_GAP');
    expect(r.refused).toBe(true);
    expect((r as { reason: string }).reason).toMatch(/nobody authorised/);
  });

  it('refuses a delivery failure, because the output came from another artefact', () => {
    expect(admitsRepair('DELIVERY_FAILURE').refused).toBe(true);
  });

  it('refuses an unresolved diagnosis', () => {
    expect(admitsRepair('UNCERTAIN').refused).toBe(true);
  });

  it('checks the route before it looks at the architecture', () => {
    // Asking "can this be escalated" first would produce a well-formed operation for a diagnosis
    // with no standing, and a well-formed operation is the kind of thing a caller applies.
    const r = proposeRepair('STANDARD_GAP', 'SHOULD_FIRE',
      { requirementId: 'x1', carrierAtServe: 'PROSE', invocationId: 'i1' } as never,
      { architectureHash: 'a', standardVersionHash: 'sv1', components: [] });
    expect('refused' in r && r.refused).toBe(true);
    expect((r as { reason: string }).reason).toMatch(/nobody authorised/);
  });
});

describe('a repair may move bytes and may not move the target', () => {
  const incumbent = standard([req('x1'), req('x2', { kind: 'BOUNDARY' })]);

  it('accepts a candidate built from the identical standard', () => {
    expect(() => { assertSameTarget(incumbent, incumbent); }).not.toThrow();
  });

  it('refuses a candidate built from a different standard', () => {
    expect(() => { assertSameTarget(incumbent, standard([req('x1')], 'sv2')); })
      .toThrow(/may never change what it is/);
  });

  it('refuses a hand-built standard that copied the hash but changed a rule', () => {
    // The field check is what survives somebody constructing a StandardVersion and carrying a hash
    // across, which is how an immutability guarantee gets bypassed without anyone lying.
    const forged = standard([req('x1', { kind: 'BOUNDARY' }), req('x2', { kind: 'BOUNDARY' })], 'sv1');
    expect(() => { assertSameTarget(incumbent, forged); }).toThrow(/share a hash but not their requirements/);
  });

  it('notices a moved polarity, condition, authority, materiality or tolerance', () => {
    const base = normativeHash(incumbent);
    const moved: Partial<Requirement>[] = [
      { kind: 'BOUNDARY' }, { appliesWhen: 'only on Tuesdays' },
      { authority: 'DERIVED_UNRATIFIED' }, { materiality: 'INCIDENTAL' },
      { realizationTolerance: 'STRICT' }, { statement: 'something else entirely' },
    ];
    for (const over of moved) {
      const other = standard([req('x1', over), req('x2', { kind: 'BOUNDARY' })], 'sv1');
      expect(normativeHash(other), JSON.stringify(over)).not.toBe(base);
    }
  });

  it('ignores fields that are implementation, not target', () => {
    // An output shape is a carrier decision. Moving it must not read as moving the standard.
    const withShape = standard([req('x1', { outputShape: { v: { type: 'string' } } }),
      req('x2', { kind: 'BOUNDARY' })], 'sv1');
    expect(normativeHash(withShape)).toBe(normativeHash(incumbent));
  });
});

describe('three arms, three denominators, and no number across them', () => {
  const result = (over: Partial<ContractResult> = {}): ContractResult => ({
    suiteHash: 'h', skillVersionHash: 'sv', role: 'HOLDOUT',
    passed: [], failed: [], apparentPass: [], apparentFail: [], unobservable: [],
    obligationsCovered: 1, obligationsTotal: 1, ...over,
  });

  const bare = tallyOf('BARE', result({ apparentPass: ['a', 'b'], apparentFail: ['c', 'd', 'e', 'f'] }));
  const initial = tallyOf('INITIAL', result({ apparentPass: ['a', 'b', 'c', 'd', 'e'], apparentFail: ['f'] }));
  const candidate = tallyOf('CANDIDATE', result({ apparentPass: ['a', 'b', 'c', 'd', 'e', 'f'] }));

  it('separates what the standard added from what optimization added', () => {
    expect(deltaBetween(bare, initial).apparent).toBe(3);
    expect(deltaBetween(initial, candidate).apparent).toBe(1);
  });

  it('reports a channel with no cases as n/a rather than as zero', () => {
    // A movement from nothing to nothing is not an improvement, and a rendered 0 invites reading a
    // flat line as a measured result.
    expect(deltaBetween(bare, initial).decided).toBeNull();
  });

  it('the table keeps the channels apart and prints no total', () => {
    const s = describeArmComparison([bare, initial, candidate]);
    expect(s).toMatch(/decided — passed/);
    expect(s).toMatch(/unqualified read — appears ok/);
    expect(s).toMatch(/nothing looked/);
    expect(s).not.toMatch(/\btotal\b/i);
    expect(s).not.toMatch(/\badherence\b/i);
    expect(s).not.toMatch(/\d+%/);
  });

  it('says plainly that only one row is a verdict', () => {
    const s = describeArmComparison([bare, initial]);
    expect(s).toMatch(/Only the "decided" rows are verdicts/);
    expect(s).toMatch(/certify nothing/);
    expect(s).toMatch(/constructed challenges/);
  });

  it('says so when the bare runtime already satisfies the standard', () => {
    // The answer an artifact vendor never gives, and the one worth more than a skill nobody needed.
    const strongBare = tallyOf('BARE', result({ apparentPass: ['a', 'b', 'c'] }));
    const weakInitial = tallyOf('INITIAL', result({ apparentPass: ['a'], apparentFail: ['b', 'c'] }));
    expect(describeArmComparison([strongBare, weakInitial]))
      .toMatch(/already satisfies the standard/);
  });

  const walk = (dir: string): string[] => readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return e === 'node_modules' ? [] : walk(p);
    return /\.m?ts$/.test(p) ? [p] : [];
  });

  it('no tally or delta field could hold a rate', () => {
    const keys = [...Object.keys(bare), ...Object.keys(deltaBetween(bare, initial))];
    for (const bad of ['rate', 'percent', 'score', 'adherence', 'overall', 'total']) {
      expect(keys.some((k) => k.toLowerCase().includes(bad)), `a field named for "${bad}"`).toBe(false);
    }
  });

  it('the contract modules still do not reach for the holdout arithmetic', () => {
    const offenders = walk('core/contract').filter((f) => {
      const code = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      return /upperBound95|nForBar|holdout-integrity/.test(code);
    });
    expect(offenders, `constructed cases are not independent samples:\n${offenders.join('\n')}`).toEqual([]);
  });
});
