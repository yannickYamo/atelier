// The two gates standing between "we ran a study" and "we tested a carrier".
import { describe, it, expect } from 'vitest';
import { ablateCarrier, assertSemanticClosure, describeAblation, AblationRefused } from '../core/contract/carrier-ablation.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import { checkMechanismExposure, describeExposure, EXPOSURE_CONDITIONS, type ExposureFacts } from '../core/contract/mechanism-exposure.js';
import { aRequirement } from './fixtures.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

/** A discovered standard: materiality ratified, so carriers actually vary. */
const standard = (): StandardVersion => ({
  standardVersionHash: 'sv-ablate', workType: 'writing', evidenceId: 'e1',
  mintedAt: '2026-01-01T00:00:00.000Z', supersedes: null,
  requirements: [
    aRequirement({ requirementId: 'r1', statement: 'Lead with the next action', materiality: 'REQUIRED' }),
    // PREFERRED -> EXAMPLE. The named target.
    aRequirement({ requirementId: 'r2', statement: 'Open on a concrete scene', materiality: 'PREFERRED' }),
    // TOLERATED -> SELF_CHECK. Background: it must stay in BOTH arms.
    aRequirement({ requirementId: 'r3', statement: 'Occasional one-line paragraphs', materiality: 'TOLERATED' }),
  ],
  authorityState: 'RATIFIED', reason: null,
} as unknown as StandardVersion);

describe('a targeted ablation changes one carrier and nothing else', () => {
  it('replaces the named carrier and holds every other component constant', () => {
    const v = standard();
    const full = compileArchitecture(v);
    const ab = ablateCarrier(v, 'r2', 'PROSE');

    expect(ab.originalCarrier).toBe('EXAMPLE');
    expect(ab.ablatedCarrier).toBe('PROSE');
    // THE POINT: r3's SELF_CHECK survives in the ablation. A global force-prose would have removed
    // it too, and FULL - ABLATED would then test EXAMPLE and SELF_CHECK simultaneously.
    const r3full = full.components.find((c) => c.carries.includes('r3'))!;
    const r3abl = ab.architecture.components.find((c) => c.carries.includes('r3'))!;
    expect(r3abl.carrier).toBe(r3full.carrier);
    expect(r3full.carrier).not.toBe('PROSE');
    expect(ab.unchangedComponentIds).toHaveLength(full.components.length - 1);
  });

  it('the architecture hash moves, so the two arms are distinguishable on the record', () => {
    const v = standard();
    expect(ablateCarrier(v, 'r2').architecture.architectureHash)
      .not.toBe(compileArchitecture(v).architectureHash);
  });

  it('REFUSES an ablation that changes nothing — it would guarantee a null', () => {
    // Two identical arms produce Δ=0, which reads as "the mechanism does not help".
    expect(() => ablateCarrier(standard(), 'r1', 'PROSE')).toThrow(AblationRefused);
    expect(() => ablateCarrier(standard(), 'r1', 'PROSE')).toThrow(/already carried as PROSE/);
  });

  it('REFUSES a target nothing carries', () => {
    expect(() => ablateCarrier(standard(), 'r99')).toThrow(/nothing to ablate/);
  });

  it('semantic closure passes when only the mechanism differs', () => {
    const v = standard();
    expect(() => assertSemanticClosure(compileArchitecture(v), ablateCarrier(v, 'r2'))).not.toThrow();
  });

  it('and REFUSES when the arms would oblige different things', () => {
    // more-standard vs less-standard, not one realisation vs another
    const v = standard();
    const ab = ablateCarrier(v, 'r2');
    const thinner = { ...ab, architecture: { ...ab.architecture,
      components: ab.architecture.components.slice(0, 2) } };
    expect(() => assertSemanticClosure(compileArchitecture(v), thinner)).toThrow(/same requirements/);
  });

  it('and REFUSES when a second carrier moved — that is a second treatment', () => {
    const v = standard();
    const ab = ablateCarrier(v, 'r2');
    const twoChanged = { ...ab, architecture: { ...ab.architecture,
      components: ab.architecture.components.map((c) =>
        c.carries.includes('r3') ? { ...c, carrier: 'PROSE' as const } : c) } };
    expect(() => assertSemanticClosure(compileArchitecture(v), twoChanged)).toThrow(/exactly one/);
  });

  it('describes what it isolated, in the words a pre-registration needs', () => {
    expect(describeAblation(ablateCarrier(standard(), 'r2'))).toMatch(/isolates the EXAMPLE carrier/);
  });
});

describe('mechanism exposure: may this study claim to test a carrier at all', () => {
  const facts = (o: Partial<ExposureFacts> = {}): ExposureFacts => ({
    targetRequirementId: 'r2', targetCarrier: 'EXAMPLE', targetAuthority: 'EXPERT_RATIFIED',
    applicabilityBasis: 'GENERAL', contextsExercisingTarget: 16, observationMode: 'STRUCTURAL',
    controlCarrier: 'PROSE', deliveredAtRuntime: true, normativeSetsMatch: true,
    expertSelfConsistency: 0.9, observerKappa: 0.7, scoring: 'AUTOMATIC', ...o,
  });

  it('passes only when all eight hold', () => {
    const v = checkMechanismExposure(facts());
    expect(v.pass).toBe(true);
    expect(v.checks).toHaveLength(EXPOSURE_CONDITIONS.length);
    expect(describeExposure(v)).toMatch(/MECHANISM_EXPOSURE = PASS/);
  });

  it('FAILS the direct-authored case, where every requirement compiles to PROSE', () => {
    // The near miss: a study fired on a standard whose carrier machinery could not run.
    const v = checkMechanismExposure(facts({ targetCarrier: 'PROSE' }));
    expect(v.failed).toContain('NAMED_MECHANISM_PRESENT');
    expect(describeExposure(v)).toMatch(/do not permit a valid test/);
  });

  it('FAILS carrier diversity that no context exercises', () => {
    // Diversity on paper, experimental diversity of zero.
    expect(checkMechanismExposure(facts({ contextsExercisingTarget: 0 })).failed)
      .toContain('CONTEXTS_EXERCISE_TARGET');
  });

  it('FAILS when a model decides whether the rule applies', () => {
    const v = checkMechanismExposure(facts({ applicabilityBasis: 'MODEL_JUDGED' }));
    expect(v.failed).toContain('APPLICABILITY_INDEPENDENT');
    expect(v.checks.find((c) => c.id === 'APPLICABILITY_INDEPENDENT')!.detail)
      .toMatch(/judge disagreeing with itself/);
  });

  it('FAILS when the carrier was materialised but never delivered', () => {
    // Atelier withholds an example whose condition does not hold, so a conditional target can be
    // absent from the served bytes while the package still contains its file.
    const v = checkMechanismExposure(facts({ deliveredAtRuntime: false }));
    expect(v.failed).toContain('CARRIER_DELIVERED');
    expect(v.checks.find((c) => c.id === 'CARRIER_DELIVERED')!.detail).toMatch(/materialised is not delivered/);
  });

  it('FAILS when control and target serve the same carrier — there is no contrast', () => {
    expect(checkMechanismExposure(facts({ controlCarrier: 'EXAMPLE' })).failed)
      .toContain('CONTROL_LACKS_CARRIER');
  });

  it('FAILS an unratified target, and a human-only endpoint', () => {
    expect(checkMechanismExposure(facts({ targetAuthority: 'MACHINE_PROPOSED' })).failed)
      .toContain('TARGET_AUTHORITATIVE');
    expect(checkMechanismExposure(facts({ observationMode: 'HUMAN' })).failed).toContain('OUTCOME_OBSERVABLE');
  });

  it('FAILS when the expert has never been shown held-out cases', () => {
    // Ratifying a WORDING is not agreeing on its EXTENSION. An author approved a rule and then
    // judged cases the wording did not predict; nothing before this condition could see that.
    const v = checkMechanismExposure(facts({ expertSelfConsistency: null }));
    expect(v.failed).toContain('EXPERT_EXTENSION_STABLE');
    expect(v.checks.find((c) => c.id === 'EXPERT_EXTENSION_STABLE')!.detail).toMatch(/never measured/);
  });

  it('FAILS an observer that cannot recover the boundary', () => {
    // kappa 0.257 was the measured figure on p6 — "fair", and not an instrument.
    expect(checkMechanismExposure(facts({ observerKappa: 0.26 })).failed).toContain('OBSERVER_QUALIFIED');
  });

  it('but a BAD OBSERVER does not sink a GOOD TARGET — the expert can score it blind', () => {
    // The two conditions are about different things. A target only a person can see is still a
    // target; it costs the expert's time, not the study's validity.
    const v = checkMechanismExposure(facts({ observerKappa: 0.26, scoring: 'BLIND_EXPERT' }));
    expect(v.failed).not.toContain('OBSERVER_QUALIFIED');
    expect(v.pass).toBe(true);
  });

  it('and a GOOD OBSERVER does not rescue an UNSTABLE TARGET', () => {
    // High agreement against labels the expert cannot reproduce means the observer learned noise.
    const v = checkMechanismExposure(facts({ observerKappa: 0.95, expertSelfConsistency: 0.5 }));
    expect(v.failed).toContain('EXPERT_EXTENSION_STABLE');
    expect(v.pass).toBe(false);
  });

  it('reports every failure at once rather than the first', () => {
    // A gate that stops at the first failure makes eligibility look one fix away when it is four.
    const v = checkMechanismExposure(facts({ targetCarrier: 'PROSE', deliveredAtRuntime: false,
      contextsExercisingTarget: 0, applicabilityBasis: 'MODEL_JUDGED' }));
    // Five, not four: a PROSE target also collapses CONTROL_LACKS_CARRIER, because the control
    // serves PROSE too and there is then no contrast to measure.
    expect(v.failed).toHaveLength(5);
    expect(v.failed).toContain('CONTROL_LACKS_CARRIER');
  });
});
