// tests/atelier-contract-holdout.test.ts — THE FINAL READ IS OF ARTIFACTS, NOT OF INTENTIONS.
//
// A holdout is spent once, and everything that makes it meaningful is easy to lose quietly:
//
//   * rebuilding the initial skill instead of loading it — the comparison is then between whatever
//     today's compiler emits and a candidate, neither of which is what the search half measured;
//   * repairing during the read — the holdout has been spent on a version that did not exist when it
//     was sealed;
//   * running the arms on different cases, or in separate events with the suite changing between.
//
// None of those throw. They produce a table that looks exactly like a correct one, which is why they
// are asserted here rather than trusted to the shape of the code.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { obligationsForStandard } from '../core/contract/obligation.js';
import { sealSuite, roleOf, SuiteRefused, type ContractTestCase, type ContractTestSuite }
  from '../core/contract/suite.js';
import { authorityStateOf, type Requirement, type StandardVersion } from '../core/state/canonical-state.js';
import type { ComparisonIdentity } from '../core/contract/arm.js';

const req = (id: string, over: Partial<Requirement> = {}): Requirement => ({
  requirementId: id, statement: `rule ${id}`, appliesWhen: 'GENERAL',
  kind: 'GENERATIVE', authority: 'EXPERT_AUTHORED', provenance: 'EXPERT_ADDED',
  evidence: null, evidenceItemId: null, wouldBeAbsentIf: null,
  materiality: null, realizationTolerance: null, outputShape: null, ...over,
});

const standard = (rs: Requirement[]): StandardVersion => ({
  standardVersionHash: 'sv1', evidenceId: null, workType: 'writing', requirements: rs,
  authorityState: authorityStateOf(rs), mintedAt: '2026-01-01T00:00:00.000Z',
  supersedes: null, reason: null,
});

const sealedFor = (rs: Requirement[]): ContractTestSuite => {
  const v = standard(rs);
  const cases: ContractTestCase[] = obligationsForStandard(v).map((o, i) => ({
    caseId: `c${i}`, obligationId: o.obligationId, obligationKind: o.kind,
    requirementIds: o.requirementIds,
    task: `task ${i}`, expectation: o.expectation, observation: o.observation,
    provenance: 'MODEL_GENERATED',
  }));
  const s = sealSuite(v, cases);
  if (s instanceof SuiteRefused) throw new Error(s.message);
  return s;
};

describe('the holdout is fixed before anything is optimized against it', () => {
  const suite = sealedFor([req('x1'), req('x2'), req('x3'), req('x4')]);

  it('holds cases the search half never contains', () => {
    expect(suite.holdoutCaseIds.length).toBeGreaterThan(0);
    for (const id of suite.holdoutCaseIds) expect(suite.searchCaseIds).not.toContain(id);
  });

  it('does not move when the same standard is sealed again', () => {
    // A holdout that is re-drawn per run lets a candidate failing on one draw be re-run until it
    // meets an easier one, which is the same defect as regenerating after seeing failures.
    const again = sealedFor([req('x1'), req('x2'), req('x3'), req('x4')]);
    expect(again.holdoutCaseIds).toEqual(suite.holdoutCaseIds);
    expect(again.suiteHash).toBe(suite.suiteHash);
  });

  it('every holdout case is reachable only through the holdout role', () => {
    for (const id of suite.holdoutCaseIds) expect(roleOf(suite, id)).toBe('HOLDOUT');
  });
});

describe('what the final read records, so the comparison can be reconstructed', () => {
  it('carries the suite, standard, binding and both skill identities', () => {
    const identity: ComparisonIdentity = {
      suiteHash: 'sh', standardVersionHash: 'sv1', bindingHash: 'bh',
      initialSkillVersionHash: 'initial', candidateSkillVersionHash: 'candidate',
    };
    // A table without these is a claim about two artifacts nobody can identify afterwards.
    for (const k of ['suiteHash', 'standardVersionHash', 'bindingHash',
      'initialSkillVersionHash', 'candidateSkillVersionHash']) {
      expect(Object.keys(identity)).toContain(k);
    }
  });

  it('allows no candidate, because a run with nothing to compare is still a run', () => {
    const identity: ComparisonIdentity = {
      suiteHash: 'sh', standardVersionHash: 'sv1', bindingHash: 'bh',
      initialSkillVersionHash: 'initial', candidateSkillVersionHash: null,
    };
    expect(identity.candidateSkillVersionHash).toBeNull();
  });
});

describe('the command loads frozen artifacts and refuses to repair while reading', () => {
  // Source-level, because these are properties of the ORDER of operations, and a behavioural test
  // would need a provider. Comments are stripped: prose describing the rule is not the rule.
  const code = readFileSync('cli/commands/contract.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('reads the initial package from the store rather than rebuilding it', () => {
    // `renderAgentSkill` appears once, in the repair path. If the holdout branch ever calls it, the
    // comparison is against whatever today's compiler emits instead of what was measured.
    expect(code).toMatch(/store\.getPackage\(L, initialSv\.materializedHash\)/);
    const holdoutBranch = code.slice(code.indexOf('if (onHoldout)'), code.indexOf('const outcomes = await runArm'));
    expect(holdoutBranch, 'the holdout branch rebuilds a package instead of loading it')
      .not.toMatch(/renderAgentSkill/);
  });

  it('refuses --repair during a holdout read', () => {
    expect(code).toMatch(/--repair cannot run on the holdout/);
  });

  it('runs every arm on the same set of cases', () => {
    // One `toRun`, used by every arm. An arm computing its own case list is how two columns end up
    // describing different work.
    expect(code).toMatch(/for \(const \{ arm, bytes \} of arms\)/);
    expect(code).not.toMatch(/arms\.map\([^)]*searchCases/);
  });

  it('stores the candidate without promoting it', () => {
    expect(code).toMatch(/store\.putSkillVersion\(L, candidateSkill\)/);
    expect(code, 'the contract command promotes a candidate').not.toMatch(/setActive/);
  });
});
