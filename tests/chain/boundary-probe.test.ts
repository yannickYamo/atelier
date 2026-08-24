// PORTED test — same assertions, run against atelier/core/discovery/chain/.
// The predecessor keeps its own copy of these tests until its callers migrate.

/**
 * BOUNDARY PROBE — symmetry and blinding.
 * Load-bearing tests: the sheet must not leak which version is "right" (that would be a leading
 * question), and "no preference" must fold to INDIFFERENT rather than to disagreement.
 */
import { describe, it, expect } from 'vitest';
import {
  designProbe, blindProbe, foldProbeAnswer, interpretProbe, type WrittenVariant,
} from '../../core/discovery/chain/boundary-probe.js';
import { isFalsifiableProbe, aggregateTasteFactorEvidence } from '../../core/discovery/chain/taste-discovery.js';

const design = designProbe(
  'gates_as_schedule_not_calendar', 'fresh_ctx',
  'sequencing expressed as named conditions that must hold, never as calendar dates',
  'sequence purely by calendar (Q3 alpha, Q4 GA), no gates',
  'sequence by named evidence gates: now / next / later, each opening on a measurement',
  'gate every trivial step behind its own named threshold until the plan is unreadable',
  'written on a context the proposer never read',
);

const written: WrittenVariant[] = [
  { level: 'TOO_LITTLE', text: 'Q3: alpha. Q4: GA.' },
  { level: 'ACCEPTABLE', text: 'NOW: build. NEXT: opens when 3 of 5 pilots clear the offline gate. LATER: named, not scheduled.' },
  { level: 'TOO_MUCH', text: 'Gate 1 opens on... Gate 2 opens on... Gate 3a opens on... Gate 3b opens on... (17 more)' },
];

describe('boundary probe', () => {
  it('is symmetric — three levels, so indifference and dispreference are expressible', () => {
    expect(design.variants.map(v => v.level)).toEqual(['TOO_LITTLE', 'ACCEPTABLE', 'TOO_MUCH']);
    const { probe } = blindProbe(design, written, 7);
    expect(isFalsifiableProbe(probe)).toBe(true);
  });

  it('LEAKS NO LEVEL LABELS — an expert who can see the right answer is being led', () => {
    const { rendered } = blindProbe(design, written, 7);
    for (const leak of ['TOO_LITTLE', 'ACCEPTABLE', 'TOO_MUCH', 'correct', 'right one']) {
      expect(rendered, `leaked: ${leak}`).not.toContain(leak);
    }
  });

  it('invites indifference as a real answer rather than a failure to decide', () => {
    const { rendered } = blindProbe(design, written, 7);
    expect(rendered).toMatch(/real and useful answer, not a failure to decide/);
    expect(rendered).toMatch(/none of them/);
  });

  it('is deterministic for a seed, and order varies across seeds', () => {
    expect(blindProbe(design, written, 7).key).toEqual(blindProbe(design, written, 7).key);
    const orders = new Set([3, 11, 29, 47, 91].map(s => blindProbe(design, written, s).key.map(k => k.level).join(',')));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('folds a middle pick into real boundary support', () => {
    const b = blindProbe(design, written, 7);
    const tag = b.key.find(k => k.level === 'ACCEPTABLE')!.tag;
    const label = foldProbeAnswer(b, { shipped: tag });
    expect(label.preferredLevel).toBe('ACCEPTABLE');
    expect(interpretProbe(label)).toMatch(/discriminates here/);

    // and it reaches the channel confidenceFrom() actually reads
    const ev = aggregateTasteFactorEvidence(
      { proposedId: 'f', description: 'd', constructScope: { standardDimensions: ['x'] }, appliesWhen: [{ id: 'a', describe: 'a' }], provenance: { proposedBy: 'm', fromGoldens: [] } },
      { boundary: [label] });
    expect(ev.boundarySupport.supporting).toBe(1);
    expect(ev.confidence).toBe('EMERGING');
  });

  it('"no preference" folds to INDIFFERENT — scope information, NOT disagreement', () => {
    // The distinction that makes taste Q(y|x,S_u): a factor can bind in one context and not
    // another. Collapsing indifference into counter-evidence would erase that.
    const b = blindProbe(design, written, 7);
    const label = foldProbeAnswer(b, { noPreference: [b.key[0].tag, b.key[1].tag] });
    expect(label.preferredLevel).toBe('INDIFFERENT');
    expect(interpretProbe(label)).toMatch(/narrows its scope rather than refuting it/);

    const ev = aggregateTasteFactorEvidence(
      { proposedId: 'f', description: 'd', constructScope: { standardDimensions: ['x'] }, appliesWhen: [{ id: 'a', describe: 'a' }], provenance: { proposedBy: 'm', fromGoldens: [] } },
      { boundary: [label] });
    expect(ev.counterEvidence.supporting).toBe(0);   // never counted as disagreement
    expect(ev.contextsIndifferent).toBe(1);          // recorded as scope
  });

  it('"none of them" also folds to INDIFFERENT, not to a preferred level', () => {
    const b = blindProbe(design, written, 7);
    expect(foldProbeAnswer(b, { none: true }).preferredLevel).toBe('INDIFFERENT');
  });

  it('throws on an answer naming no known variant', () => {
    const b = blindProbe(design, written, 7);
    expect(() => foldProbeAnswer(b, { shipped: 'Z' })).toThrow(/names no known variant/);
  });

  it('reports a low pick as a possible habit rather than a standard', () => {
    const b = blindProbe(design, written, 7);
    const tag = b.key.find(k => k.level === 'TOO_LITTLE')!.tag;
    expect(interpretProbe(foldProbeAnswer(b, { shipped: tag }))).toMatch(/habit rather than a standard/);
  });
});
