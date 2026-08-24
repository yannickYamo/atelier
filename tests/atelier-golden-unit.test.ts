// tests/atelier-golden-unit.test.ts — decision-centric goldens, and the reserve that must survive.

import { describe, it, expect } from 'vitest';
import { claimUnitCount, clusteringUnaccounted, independentUnitFor, describeEvidence,
  evidenceStateOf, isContaminated, usableAsReference, REGISTERED_UNIT_KINDS, isRegisteredKind, clusterAssignment, clusterCertainty,
  type GoldenUnit, type UnitKind } from '../core/golden/golden-unit.js';
import { reserve, markConsumed, reserveFromUse, PROSPECTIVE_SCOPE_CAVEAT } from '../core/golden/reservation.js';
import type { Consumption } from '../core/reference/holdout-integrity.js';

const unit = (id: string, clusterId: string, contextId = id, consumedBy: Consumption[] = [],
  kind: UnitKind = 'CODE_CHANGE'): GoldenUnit => ({
  unitId: id, kind, context: 'ctx', task: 'task', expertAction: 'did the thing', artifact: 'the patch',
  provenance: { sourceRef: `/repo/${id}`, clusterId, contextId, clusterBasis: 'USER_DECLARED', consumedBy },
});

describe('the claimed scope determines the independent unit', () => {
  // 10 PRs, one repository. The evidence is identical; only the claim changes.
  const prs = Array.from({ length: 10 }, (_, i) => unit(`pr${i}`, 'repo-a'));

  it('within-cluster counts episodes; across-cluster counts clusters', () => {
    expect(independentUnitFor('WITHIN_CLUSTER')).toBe('contextId');
    expect(independentUnitFor('ACROSS_CLUSTERS')).toBe('clusterId');
    expect(claimUnitCount(prs, 'WITHIN_CLUSTER')).toBe(10);
    expect(claimUnitCount(prs, 'ACROSS_CLUSTERS')).toBe(1);   // ten PRs from one repo are ONE cluster
  });

  it('says out loud when the two numbers differ — the case that misleads', () => {
    const d = describeEvidence(prs, 'ACROSS_CLUSTERS');
    expect(d).toMatch(/10 decision\(s\) across 1 artifact/);
    expect(d).toMatch(/\*\*1 claim unit\(s\)\*\*, not 10/);
    expect(d).toMatch(/remain fully usable for discovery/);   // correlated != worthless
    // and stays quiet when they agree
    expect(describeEvidence([unit('a', 'r1'), unit('b', 'r2')], 'ACROSS_CLUSTERS')).toBe('2 claim unit(s).');
  });

  it('a claim-scope mapping must NOT manufacture independence', () => {
    // 10 within-repo claim units are the right DENOMINATOR and are still dependent. The flag is what
    // stops a caller putting 10 into a binomial and reporting a precision the evidence has not got.
    expect(clusteringUnaccounted(prs, 'WITHIN_CLUSTER')).toBe(true);
    expect(describeEvidence(prs, 'WITHIN_CLUSTER')).toMatch(/never by putting 10 into a binomial/);
    // an across-cluster claim already counts one per cluster, so nothing is left unmodelled
    expect(clusteringUnaccounted(prs, 'ACROSS_CLUSTERS')).toBe(false);
    // and genuinely unclustered evidence raises no flag
    expect(clusteringUnaccounted([unit('a', 'r1'), unit('b', 'r2')], 'WITHIN_CLUSTER')).toBe(false);
  });

  it('kinds are registered adapters, not a permanent closed ontology', () => {
    // The core concept is context -> expert decision -> artifact -> provenance. A closed union would
    // make every new domain a core-ontology change instead of a registration.
    expect(REGISTERED_UNIT_KINDS).toHaveLength(6);
    for (const k of REGISTERED_UNIT_KINDS) expect(isRegisteredKind(k)).toBe(true);
    // an unregistered kind is still a valid unit — the type does not refuse it
    const custom: GoldenUnit = unit('u', 'c', 'u', [], 'RADIOLOGY_READ');
    expect(isContaminated(custom)).toBe(false);
    expect(isRegisteredKind('RADIOLOGY_READ')).toBe(false);
  });
});

describe('CONTAMINATION and CORRELATION are different properties', () => {
  // discovery read PRs 1-2 of repo R; PRs 3-4 were reserved and never read
  const corpus = [
    unit('pr1', 'repo-R', 'pr1', ['DISCOVERY']), unit('pr2', 'repo-R', 'pr2', ['DISCOVERY']),
    unit('pr3', 'repo-R'), unit('pr4', 'repo-R'), unit('pr5', 'repo-S'),
  ];

  it('an untouched reference sharing a cluster with consumed evidence is CLEAN_BUT_CORRELATED', () => {
    expect(evidenceStateOf(corpus[0], corpus)).toBe('CONTAMINATED');
    expect(evidenceStateOf(corpus[2], corpus)).toBe('CLEAN_BUT_CORRELATED');   // usable, not discarded
    expect(evidenceStateOf(corpus[4], corpus)).toBe('CLEAN');                   // different repo
  });

  it('correlation does NOT remove a unit from the reservable set', () => {
    expect(usableAsReference(corpus).map((u) => u.unitId)).toEqual(['pr3', 'pr4', 'pr5']);
  });
});

describe('reservation happens BEFORE anything reads', () => {
  const clean = [unit('a1', 'repo-a'), unit('a2', 'repo-a'), unit('b1', 'repo-b'), unit('c1', 'repo-c')];

  it('REFUSES to reserve a unit whose OWN reference was consumed — the actual leak', () => {
    const r = reserve([...clean, unit('d1', 'repo-d', 'd1', ['DISCOVERY'])], ['d1'], 'ACROSS_CLUSTERS', 0.15);
    expect('refused' in r && r.reason).toBe('ALREADY_CONSUMED');
    expect('refused' in r && r.offendingUnitIds).toEqual(['d1']);
    expect('refused' in r && r.why).toMatch(/cannot test whether the standard generalises/);
  });

  it('ALLOWS reserving clean units from a cluster discovery has read — and says they are correlated', () => {
    // THE CASE CLUSTER-WIDE RESERVATION DESTROYED. PRs 1-2 read, PRs 3-4 reserved and untouched.
    const corpus = [
      unit('pr1', 'repo-R', 'pr1', ['DISCOVERY']), unit('pr2', 'repo-R', 'pr2', ['DISCOVERY']),
      unit('pr3', 'repo-R'), unit('pr4', 'repo-R'),
    ];
    const r = reserve(corpus, ['pr3', 'pr4'], 'WITHIN_CLUSTER', 0.15);
    if ('refused' in r) throw new Error('valid held-out decisions must not be refused for correlation');
    expect(r.reserved.map((u) => u.unitId)).toEqual(['pr3', 'pr4']);
    expect(r.reservedStates.every((x) => x.state === 'CLEAN_BUT_CORRELATED')).toBe(true);
    expect(r.why).toMatch(/CLEAN_BUT_CORRELATED/);
    expect(r.why).toMatch(/belongs in the uncertainty rather than in a refusal/);
  });

  it('flags when the reserve is clustered, so nobody puts the denominator into a binomial', () => {
    const corpus = Array.from({ length: 6 }, (_, i) => unit(`pr${i}`, 'repo-R'));
    const r = reserve(corpus, ['pr3', 'pr4', 'pr5'], 'WITHIN_CLUSTER', 0.15);
    if ('refused' in r) throw new Error('should not refuse');
    expect(r.reservedClaimUnits).toBe(3);
    expect(r.clusteringUnaccounted).toBe(true);
    expect(r.why).toMatch(/NOT independent trials/);
  });

  it('a thin corpus reserves successfully and says the CLAIM is not available — it does not block', () => {
    const r = reserve(clean, ['c1'], 'ACROSS_CLUSTERS', 0.15);
    if ('refused' in r) throw new Error('should not refuse');
    expect(r.sufficientForClaim).toBe(false);
    expect(r.reservedClaimUnits).toBe(1);
    expect(r.requiredN).toBe(19);
    expect(r.why).toMatch(/not a blocker/);
    expect(r.why).toMatch(/can be built, ratified and used/);
  });

  it('sizes the reserve by the claim, not by a fraction', () => {
    const many = Array.from({ length: 25 }, (_, i) => unit(`u${i}`, `repo-${i}`));
    const r = reserve(many, many.slice(0, 19).map((u) => u.unitId), 'ACROSS_CLUSTERS', 0.15);
    if ('refused' in r) throw new Error('should not refuse');
    expect(r.sufficientForClaim).toBe(true);
    expect(r.attainableBound).toBeLessThanOrEqual(0.15);
    expect(r.clusteringUnaccounted).toBe(false);
  });
});

describe('the reserve survives every later pass', () => {
  const units = [unit('a1', 'repo-a'), unit('c1', 'repo-c')];
  const res = reserve(units, ['c1'], 'ACROSS_CLUSTERS', 0.15);
  if ('refused' in res) throw new Error('setup');

  it('THROWS if the optimizer reaches for reserved evidence', () => {
    expect(() => markConsumed(units, res, ['c1'], 'DISCOVERY'))
      .toThrow(/permanently forfeits the ability to show it works/);
  });

  it('marks unreserved units, append-only and idempotent', () => {
    const once = markConsumed(units, res, ['a1'], 'DISCOVERY');
    expect(once.find((u) => u.unitId === 'a1')!.provenance.consumedBy).toEqual(['DISCOVERY']);
    const twice = markConsumed(once, res, ['a1'], 'DISCOVERY');
    expect(twice.find((u) => u.unitId === 'a1')!.provenance.consumedBy).toEqual(['DISCOVERY']);
    const more = markConsumed(once, res, ['a1'], 'C0');
    expect(more.find((u) => u.unitId === 'a1')!.provenance.consumedBy).toEqual(['DISCOVERY', 'C0']);
  });
});

describe('evidence reserved from real use carries its own scope caveat', () => {
  it('freezes at creation, with the caveat in the type rather than a footnote', () => {
    const p = reserveFromUse(unit('live1', 'session-7'));
    expect(p.reservedFromUse).toBe(true);
    expect(p.scopeCaveat).toBe(PROSPECTIVE_SCOPE_CAVEAT);
    expect(p.scopeCaveat).toMatch(/NOT "on their work in general"/);
  });

  it('refuses to launder an already-read unit into validation evidence', () => {
    expect(() => reserveFromUse(unit('x', 'c', 'x', ['REPAIR_DEVELOPMENT'])))
      .toThrow(/cannot become validation evidence now/);
  });
});

describe('a cluster is claimed only where a boundary is OBSERVABLE', () => {
  it('a flat folder is ONE cluster — adjacency is not evidence of separate projects', () => {
    const a = clusterAssignment(['x.md', 'y.md', 'z.md']);
    expect(a.basis).toBe('SINGLE_CLUSTER_FALLBACK');
    expect(new Set(['x.md', 'y.md', 'z.md'].map(a.clusterOf)).size).toBe(1);
    expect(a.why).toMatch(/UNDERSTATES independence rather than inventing it/);
  });

  it('a directory IS an observable boundary', () => {
    const a = clusterAssignment(['repo-a/src/x.ts', 'repo-a/src/y.ts', 'repo-b/main.ts']);
    expect(a.basis).toBe('OBSERVED_DIRECTORY_BOUNDARY');
    expect(a.clusterOf('repo-a/src/x.ts')).toBe('repo-a');
    expect(a.clusterOf('repo-b/main.ts')).toBe('repo-b');
    expect(new Set(['repo-a/src/x.ts', 'repo-a/src/y.ts', 'repo-b/main.ts'].map(a.clusterOf)).size).toBe(2);
  });

  it('THE REGRESSION: a repository is ONE project, not one per file', () => {
    // file-as-cluster turned 200 source files into 200 independent projects, and the guard written
    // to catch that returns false because nothing looks nested.
    const files = Array.from({ length: 200 }, (_, i) => `repo-a/src/f${i}.ts`);
    const a = clusterAssignment(files);
    const units = files.map((f, i) => unit(`u${i}`, a.clusterOf(f), f));
    expect(claimUnitCount(units, 'ACROSS_CLUSTERS')).toBe(1);        // was 200
    expect(claimUnitCount(units, 'WITHIN_CLUSTER')).toBe(200);
    expect(clusteringUnaccounted(units, 'WITHIN_CLUSTER')).toBe(true);  // and the guard now fires
  });

  it('per-file independence must be ASSERTED, never defaulted', () => {
    const a = clusterAssignment(['x.md', 'y.md'], true);
    expect(a.basis).toBe('USER_DECLARED');
    expect(a.clusterOf('x.md')).toBe('x.md');
    expect(a.why).toMatch(/correct only if they really are/);
    // and it is not what you get by default on the same input
    expect(clusterAssignment(['x.md', 'y.md']).basis).toBe('SINGLE_CLUSTER_FALLBACK');
  });

  it('a cluster carries WHY it exists, so a bound can be discounted for it', () => {
    expect(clusterCertainty('USER_DECLARED')).toMatch(/author declared/);
    expect(clusterCertainty('OBSERVED_DIRECTORY_BOUNDARY')).toMatch(/INFERRED from directory structure/);
    expect(clusterCertainty('OBSERVED_DIRECTORY_BOUNDARY')).toMatch(/monorepo may look like several projects and be one/);
    expect(clusterCertainty('SINGLE_CLUSTER_FALLBACK')).toMatch(/understated by construction, never inflated/);
  });

  it('loose files beside directories land in (root), not in a directory they are not in', () => {
    const a = clusterAssignment(['repo-a/x.ts', 'notes.md']);
    expect(a.clusterOf('notes.md')).toBe('(root)');
    expect(a.clusterOf('repo-a/x.ts')).toBe('repo-a');
  });
});
