// PORTED test — same assertions, run against atelier/core/discovery/chain/.
// The predecessor keeps its own copy of these tests until its callers migrate.

/**
 * DISCRIMINATION PROBE — the one question that can move a candidate off ADVISORY.
 *
 * Load-bearing tests: ONE pick reaches CONTEXTUAL (which boundary labels never do at any count),
 * "no difference" must be neither support nor disagreement, and — added at Phase 0 — the side
 * assignment must be BALANCED across a factor's contexts (F3), the independent unit must be the
 * context FAMILY rather than the probe (F4), and a null must not count as scope until the
 * manipulation is verified (F6).
 */
import { describe, it, expect } from 'vitest';
import {
  designPair, blindPair, foldPairAnswer, interpretPair,
  planProbeSides, sideImbalance, manipulationVerified, buildManipulationCheckPrompt,
  observationsFrom, invalidProbes,
  type ProbeOutcome,
} from '../../core/discovery/chain/discrimination-probe.js';
import { aggregateTasteFactorEvidence, type DiscriminationObservation } from '../../core/discovery/chain/taste-discovery.js';
import { assignPriority } from '../../core/discovery/chain/taste-factor-evidence.js';

const H = {
  proposedId: 'f', description: 'd',
  constructScope: { standardDimensions: ['x'] },
  appliesWhen: [{ id: 'a', describe: 'a' }],
  provenance: { proposedBy: 'm', fromGoldens: [] },
};
const design = designPair('f', 'probe-1', 'names the contradiction before introducing the position', 'fixture-pricing-A');
const written = { withFactor: 'names it, then positions', withoutFactor: 'positions directly, equally well argued' };
const obs = (o: ProbeOutcome): DiscriminationObservation => {
  if (o.kind === 'INVALID_PROBE') throw new Error('expected an observation');
  return o.observation;
};

describe('discrimination probe', () => {
  it('ONE pick reaches CONTEXTUAL — what boundary labels never do at any count', () => {
    const p = blindPair(design, written, true);
    const chosen = p.key.find((k) => k.carriesFactor)!.tag;
    const ev = aggregateTasteFactorEvidence(H, {
      discrimination: [obs(foldPairAnswer(p, { chose: chosen }))],
      boundary: [{ contextId: 'probe-1', preferredLevel: 'ACCEPTABLE' }],
    }, true);
    expect(assignPriority(ev).priority).toBe('CONTEXTUAL');
  });

  it('a VERIFIED "no difference" is neither support nor disagreement', () => {
    const p = blindPair(design, written, true);
    const o = foldPairAnswer(p, { noDifference: true }, true);
    expect(o.kind).toBe('SCOPE');
    expect(obs(o).preferenceMovedWithFactor).toBeNull();
    const ev = aggregateTasteFactorEvidence(H, { discrimination: [obs(o)] }, true);
    expect(ev.expertPreferenceDiscrimination.supporting).toBe(0);
    expect(ev.counterEvidence.supporting).toBe(0);           // NOT damaging
    expect(assignPriority(ev).priority).toBe('ADVISORY');    // and NOT promoting
    expect(interpretPair(obs(o))).toMatch(/pattern in your work rather than something you would insist on/);
  });

  it('choosing the version WITHOUT the property is genuine counter-evidence', () => {
    const p = blindPair(design, written, true);
    const other = p.key.find((k) => !k.carriesFactor)!.tag;
    const o = obs(foldPairAnswer(p, { chose: other }));
    expect(o.preferenceMovedWithFactor).toBe(false);
    const ev = aggregateTasteFactorEvidence(H, { discrimination: [o] }, true);
    expect(ev.counterEvidence.supporting).toBe(1);
    expect(assignPriority(ev).rationale.join(' ')).toMatch(/contested/);
  });

  it('the without-side instruction forbids a strawman', () => {
    expect(design.withoutInstruction).toMatch(/equally strong/);
    expect(design.withoutInstruction).toMatch(/ONLY difference/);
    expect(design.withoutInstruction).toMatch(/wrong reason/);
  });

  it('the sheet offers "no difference" and leaks no side identity', () => {
    const { rendered } = blindPair(design, written, true);
    expect(rendered).toMatch(/no difference. is a\n> real answer/);
    for (const leak of ['carriesFactor', 'withFactor', 'withoutFactor', 'PROPOSAL']) {
      expect(rendered, `leaked: ${leak}`).not.toContain(leak);
    }
  });

  it('throws on an answer naming no known side', () => {
    const p = blindPair(design, written, true);
    expect(() => foldPairAnswer(p, { chose: 'Z' as 'A' })).toThrow(/names no known side/);
  });
});

describe('F3 — side assignment is BALANCED across a factor\'s contexts, not merely randomised', () => {
  it('an even context set splits exactly evenly — the old hash could put all four on one side', () => {
    const plan = planProbeSides('f', ['c1', 'c2', 'c3', 'c4'], 20260817);
    expect(sideImbalance(plan)).toBe(0);
    expect(new Set(plan.values()).size).toBe(2);
  });

  it('an odd context set is off by exactly one, never more', () => {
    for (const n of [1, 3, 5, 7, 9]) {
      const ctx = Array.from({ length: n }, (_, i) => `c${i}`);
      expect(sideImbalance(planProbeSides('f', ctx, 20260817)), `n=${n}`).toBe(1);
    }
  });

  it('the odd-count tie-break is UNBIASED across factors — no side is systematically favoured', () => {
    // Without a seeded flip, every odd-sized factor would give side A the extra probe.
    let aHeavy = 0;
    const FACTORS = 60;
    for (let i = 0; i < FACTORS; i++) {
      const plan = planProbeSides(`factor-${i}`, ['c1', 'c2', 'c3'], 20260817);
      const a = [...plan.values()].filter(Boolean).length;
      if (a > 1) aHeavy++;
    }
    expect(aHeavy).toBeGreaterThan(FACTORS * 0.25);
    expect(aHeavy).toBeLessThan(FACTORS * 0.75);
  });

  it('is fully reproducible, and independent of the caller\'s context ordering', () => {
    const a = planProbeSides('f', ['c1', 'c2', 'c3', 'c4'], 7);
    const b = planProbeSides('f', ['c4', 'c3', 'c2', 'c1'], 7);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  it('the SAME factor does not sit on one side across contexts — the defect this replaces', () => {
    const ctx = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
    const plan = planProbeSides('f', ctx, 20260817);
    const sides = ctx.map((c) => blindPair(designPair('f', c, 'p', c), written, plan.get(c)!)
      .key.find((k) => k.carriesFactor)!.tag);
    expect(new Set(sides).size, `all probes landed on ${sides[0]}`).toBe(2);
  });
});

describe('F4 — the independent unit is the context FAMILY, not the probe', () => {
  it('N rewordings of ONE case count as ONE discriminating context', () => {
    // The pseudo-replication an optimizer discovers: mint three variants of one case, claim three
    // contexts, carry the factor to SUPPORTED. Counting families closes it.
    const sameFamily = ['probe-a', 'probe-b', 'probe-c'].map((probe) =>
      obs(foldPairAnswer(blindPair(designPair('f', probe, 'p', 'fixture-pricing-A'), written, true), { chose: 'A' })));
    const ev = aggregateTasteFactorEvidence(H, {
      discrimination: sameFamily,
      boundary: [{ contextId: 'b1', preferredLevel: 'ACCEPTABLE' }],
    }, true);
    expect(ev.contextsDiscriminative).toBe(1);
    expect(ev.confidence).not.toBe('SUPPORTED');   // needs >=2 FAMILIES
    expect(assignPriority(ev).priority).toBe('CONTEXTUAL');
  });

  it('two genuinely distinct families DO reach SUPPORTED, and CORE becomes reachable', () => {
    const twoFamilies = [['probe-1', 'fixture-pricing-A'], ['probe-2', 'fixture-gtm-B']].map(([probe, fam]) =>
      obs(foldPairAnswer(blindPair(designPair('f', probe, 'p', fam), written, true), { chose: 'A' })));
    const ev = aggregateTasteFactorEvidence(H, {
      discrimination: twoFamilies,
      boundary: [{ contextId: 'b1', preferredLevel: 'ACCEPTABLE' }],
    }, true);
    expect(ev.contextsDiscriminative).toBe(2);
    expect(ev.confidence).toBe('SUPPORTED');
    expect(assignPriority(ev).priority).toBe('CORE');
  });

  it('designPair refuses to build a probe with no family — the id is never optional', () => {
    expect(() => designPair('f', 'probe-1', 'p', '')).toThrow(/contextFamilyId is required/);
  });
});

describe('F6 — a null is scope evidence only once the manipulation is verified', () => {
  const p = blindPair(design, written, true);

  it('an UNVERIFIED no-difference is a void probe, not scope information', () => {
    const o = foldPairAnswer(p, { noDifference: true }, false);
    expect(o.kind).toBe('INVALID_PROBE');
    expect(observationsFrom([o])).toEqual([]);              // reaches NO channel
    expect(invalidProbes([o])[0].reason).toMatch(/did not vary the property/);
  });

  it('a void probe never reaches contextsIndifferent', () => {
    const voided = foldPairAnswer(p, { noDifference: true }, false);
    const ev = aggregateTasteFactorEvidence(H, { discrimination: observationsFrom([voided]) }, true);
    expect(ev.contextsIndifferent).toBe(0);
  });

  it('a VERIFIED no-difference DOES reach contextsIndifferent — it used to reach nothing at all', () => {
    const scoped = foldPairAnswer(p, { noDifference: true }, true);
    const ev = aggregateTasteFactorEvidence(H, { discrimination: observationsFrom([scoped]) }, true);
    expect(ev.contextsIndifferent).toBe(1);
  });

  it('preferred in one family + verified-indifferent in another reads as SCOPE-LIMITED', () => {
    // Before F6 this landed on the generic "discriminative under specific conditions" branch,
    // because a discrimination null could not reach the scope channel at all.
    const preferred = obs(foldPairAnswer(blindPair(designPair('f', 'p1', 'p', 'fam-A'), written, true), { chose: 'A' }));
    const indifferent = obs(foldPairAnswer(blindPair(designPair('f', 'p2', 'p', 'fam-B'), written, true), { noDifference: true }, true));
    const ev = aggregateTasteFactorEvidence(H, { discrimination: [preferred, indifferent] }, true);
    expect(ev.contextsIndifferent).toBe(1);
    expect(assignPriority(ev).rationale.join(' ')).toMatch(/scope-limited/);
  });

  it('a DIRECTIONAL pick survives without a manipulation check — the pick itself proves the sides differed', () => {
    expect(foldPairAnswer(p, { chose: 'A' }).kind).toBe('DISCRIMINATION');
    expect(foldPairAnswer(p, { chose: 'A' }, false).kind).toBe('DISCRIMINATION');
  });

  it('the check is an IDENTIFICATION, and never asks which is better', () => {
    const prompt = buildManipulationCheckPrompt(design, p);
    expect(prompt).toMatch(/which one exhibits it/i);
    expect(prompt).toMatch(/Do NOT judge which response is better/);
    expect(prompt).toMatch(/INDISTINGUISHABLE/);
  });

  it('verification requires naming the side that actually carries the factor', () => {
    const carrier = p.key.find((k) => k.carriesFactor)!.tag;
    const other = p.key.find((k) => !k.carriesFactor)!.tag;
    expect(manipulationVerified(p, carrier)).toBe(true);
    expect(manipulationVerified(p, other)).toBe(false);            // wrong side = manipulation failed
    expect(manipulationVerified(p, 'INDISTINGUISHABLE')).toBe(false);
  });
});
