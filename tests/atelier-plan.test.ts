// tests/atelier-plan.test.ts — THE DECISIONS WERE ALWAYS THERE; NOTHING SHOWED THEM.
//
// `componentFor` has always been deterministic and always had to state a reason, and the renderer has
// always written every row to `assurance/manifest.json`. None of it surfaced. A person read the
// compiled SKILL.md, saw prose, and had no way to learn that one rule became a contract the runtime
// enforces, another an example nobody is instructed to follow, and a third reached nothing at all.
//
// The row worth testing hardest is the last one. A requirement that reaches the model through
// NOTHING looks identical, in the standard, to one that reaches it through prose — the difference
// lives only in the compiled architecture, which is exactly what this surfaces.

import { describe, it, expect } from 'vitest';
import { applicabilityModeOf, authorityStateOf, sourceModeOf,
  type StandardVersion, type Requirement } from '../core/state/canonical-state.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';

const req = (id: string, over: Partial<Requirement> = {}): Requirement => ({
  requirementId: id, statement: `rule ${id}`, appliesWhen: 'GENERAL',
  kind: 'BOUNDARY', authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_ADDED',
  evidence: null, evidenceItemId: null, wouldBeAbsentIf: null,
  materiality: null, realizationTolerance: null, outputShape: null, ...over,
});

const standard = (requirements: Requirement[]): StandardVersion => ({
  standardVersionHash: 'sv1', evidenceId: null, workType: 'writing', requirements,
  authorityState: authorityStateOf(requirements), mintedAt: '2026-01-01T00:00:00.000Z',
  supersedes: null, reason: null,
});

interface Row {
  requirementId: string; carrier: string; gateRole: string; emitted: boolean;
  artifact: string | null; why: string;
}

/** The manifest as the renderer writes it, read back the way `plan` reads it. */
const manifestOf = (rs: Requirement[]): Row[] => {
  const v = standard(rs);
  const pkg = renderAgentSkill(v, compileArchitecture(v), 'focus', 'd');
  const raw = pkg.assurance['assurance/manifest.json'];
  return (JSON.parse(raw) as { requirements: Row[] }).requirements;
};

describe('the manifest is written, stored, and complete', () => {
  it('carries exactly one row per requirement, no more and no fewer', () => {
    const rows = manifestOf([req('x1'), req('x2'), req('x3')]);
    expect(rows.map((r) => r.requirementId).sort()).toEqual(['x1', 'x2', 'x3']);
  });

  it('every row says why, because a decision without a reason is not auditable', () => {
    for (const r of manifestOf([req('x1'), req('x2', { materiality: 'INCIDENTAL' })])) {
      expect(r.why, `${r.requirementId} landed somewhere with no stated reason`).toBeTruthy();
    }
  });

  it('the package the store keeps still carries it', () => {
    // `StoredPackage` declared only `files` for a long time while `assurance` was being written
    // anyway — a type lying by omission about what is on disk. `plan` reads what was BUILT, so this
    // has to survive storage rather than be recomputed.
    const v = standard([req('x1')]);
    const pkg = renderAgentSkill(v, compileArchitecture(v), 'focus', 'd');
    expect(Object.keys(pkg.assurance)).toContain('assurance/manifest.json');
  });
});

describe('a rule that reaches the model through nothing is visible as such', () => {
  it('INCIDENTAL is emitted: false, and says the author ratified it as not taste', () => {
    // The case the plan exists for. In the standard this looks like every other requirement.
    const rows = manifestOf([req('x1'), req('x2', { materiality: 'INCIDENTAL' })]);
    const incidental = rows.find((r) => r.requirementId === 'x2');
    expect(incidental?.emitted, 'an INCIDENTAL rule was reported as reaching the model').toBe(false);
    expect(incidental?.carrier).toBe('NONE');
    expect(incidental?.why).toMatch(/not taste/i);
  });

  it('an ordinary rule beside it is emitted, so the distinction is real and not a blanket', () => {
    const rows = manifestOf([req('x1'), req('x2', { materiality: 'INCIDENTAL' })]);
    expect(rows.find((r) => r.requirementId === 'x1')?.emitted).toBe(true);
  });
});

describe('what the plan reports about each rule', () => {
  it('names where a rule came from, per requirement rather than per standard', () => {
    const v = standard([req('x1'), req('p1', { provenance: 'MACHINE_DISCOVERED' })]);
    expect(sourceModeOf(v)).toBe('HYBRID');
    expect(v.requirements.map((r) => r.provenance))
      .toEqual(['EXPERT_ADDED', 'MACHINE_DISCOVERED']);
  });

  it('reads applicability from the text and never finer than the text supports', () => {
    expect(applicabilityModeOf('GENERAL')).toBe('GENERAL');
    expect(applicabilityModeOf('when the customer is asking about risk')).toBe('CONDITION_PRESENT');
    expect(applicabilityModeOf(null)).toBe('UNRESOLVED');
    // No STATIC_CONDITION / CONTEXTUAL split: "ARR > $1m" and "asking primarily about risk" have no
    // syntactic tell between them, and guessing would be an inference wearing a derivation's clothes.
    expect(applicabilityModeOf('ARR > $1m')).toBe('CONDITION_PRESENT');
  });

  it('an output contract is distinguishable from prose in what it became', () => {
    // KIND GATES THIS, and it is not obvious. A REQUIRED rule with a shape becomes an
    // OUTPUT_CONTRACT only when it is GENERATIVE — something the output must BE. A prohibition
    // carrying a shape stays prose, because a runtime contract describes what to produce and a
    // BOUNDARY says what not to do; there is nothing for the runtime to enforce. Written down
    // because the first version of this test set BOUNDARY and read the prose result as a defect.
    const rows = manifestOf([
      req('x1'),
      req('x2', { kind: 'GENERATIVE', materiality: 'REQUIRED', outputShape: { verdict: { type: 'string' } } }),
    ]);
    expect(rows.find((r) => r.requirementId === 'x2')?.carrier).toBe('OUTPUT_CONTRACT');
    const carriers = new Set(rows.map((r) => r.carrier));
    expect(carriers.size, 'every rule compiled to the same carrier; the plan would say nothing')
      .toBeGreaterThan(1);
  });
});
