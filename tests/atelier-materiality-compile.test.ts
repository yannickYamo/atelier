// tests/atelier-materiality-compile.test.ts — THE AUTHOR'S TWO JUDGMENTS REACH THE MODEL.
//
// Both axes were elicited, recorded, and read by nothing. Five of one expert's seven Part-3 answers
// produced no effect on any compiled skill, and the realization axis produced none at all — STRICT
// and FLEXIBLE compiled identically. Asking a person to judge and then discarding the judgment is
// worse than not asking: it spends their authority and returns nothing.

import { describe, it, expect } from 'vitest';
import { componentFor } from '../core/architecture/compile.js';
import type { Requirement, Materiality, RealizationTolerance } from '../core/state/canonical-state.js';

const req = (o: Partial<Requirement> = {}): Requirement => ({
  requirementId: 'g1', statement: 'I compress the close rather than re-explaining.',
  appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'EXPERT_RATIFIED',
  provenance: 'MACHINE_DISCOVERED', evidence: null, evidenceItemId: null,
  wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null, ...o });

describe('materiality decides whether the model is obliged', () => {
  it('REQUIRED instructs', () => {
    const c = componentFor(req({ materiality: 'REQUIRED' }));
    expect(c.gateRole).toBe('ENFORCE');
    expect(c.id).toMatch(/^do:/);
  });

  it('THE TYPO CASE — TOLERATED watches for POLISHING, never instructs generation', () => {
    const c = componentFor(req({ materiality: 'TOLERATED' }));
    expect(c.id).toMatch(/^protect:/);
    expect(c.gateRole).toBe('OBSERVE');            // it may never shape the draft
    expect(c.sensor).toBe('SELF_REPORT');
    expect(c.rationale).toMatch(/never as an instruction to produce it/);
    // the failure this exists to prevent: TOLERATED must not become an ENFORCE instruction
    expect(c.gateRole).not.toBe('ENFORCE');
  });

  it('PREFERRED and EXEMPLAR_ONLY are SHOWN, not instructed', () => {
    for (const m of ['PREFERRED', 'EXEMPLAR_ONLY'] as Materiality[]) {
      const c = componentFor(req({ materiality: m }));
      expect(c.id).toMatch(/^show:/);
      expect(c.carrier).toBe('EXAMPLE');           // "here is how they do it", not "do this"
      expect(c.gateRole).toBe('OBSERVE');
      expect(c.rationale).toMatch(/is not wrong/);
    }
  });

  it('INCIDENTAL asks the model for nothing', () => {
    const c = componentFor(req({ materiality: 'INCIDENTAL' }));
    expect(c.id).toMatch(/^none:/);
    expect(c.gateRole).toBe('OBSERVE');
    expect(c.sensor).toBe('NONE');
    expect(c.rationale).toMatch(/nothing is asked of the model/);
  });

  it('the four dispositions produce four DIFFERENT components — none collapses into another', () => {
    const ids = (['REQUIRED', 'TOLERATED', 'PREFERRED', 'INCIDENTAL'] as Materiality[])
      .map((m) => componentFor(req({ materiality: m })).id.split(':')[0]);
    expect(new Set(ids).size).toBe(4);
  });
});

describe('realization tolerance decides whether the FORM is pinned', () => {
  it('REQUIRED + STRICT pins the form with an example', () => {
    const c = componentFor(req({ materiality: 'REQUIRED', realizationTolerance: 'STRICT', outputShape: null }));
    expect(c.carrier).toBe('EXAMPLE');
    expect(c.gateRole).toBe('ENFORCE');
    expect(c.rationale).toMatch(/the exact form is the point/);
  });

  it('REQUIRED + FLEXIBLE states the invariant and leaves the form open', () => {
    for (const t of ['FLEXIBLE', 'FUNCTIONALLY_EQUIVALENT'] as RealizationTolerance[]) {
      const c = componentFor(req({ materiality: 'REQUIRED', realizationTolerance: t, outputShape: null }));
      expect(c.carrier).toBe('PROSE');
    }
  });

  it('STRICT and FLEXIBLE no longer compile identically — the regression, pinned', () => {
    const strict = componentFor(req({ materiality: 'REQUIRED', realizationTolerance: 'STRICT', outputShape: null }));
    const flex = componentFor(req({ materiality: 'REQUIRED', realizationTolerance: 'FLEXIBLE', outputShape: null }));
    expect(strict.carrier).not.toBe(flex.carrier);
  });
});

describe('an unanswered axis is ABSENT, never defaulted', () => {
  it('null materiality falls through to the pre-existing kind-based arrangement', () => {
    // a standard ratified before the axes existed must compile exactly as it did.
    const c = componentFor(req({ materiality: null }));
    expect(c.id).toMatch(/^do:/);
    expect(c.gateRole).toBe('ENFORCE');
    expect(c.carrier).toBe('PROSE');
  });

  it('a null answer is not read as INCIDENTAL, nor as REQUIRED', () => {
    const none = componentFor(req({ materiality: null }));
    expect(none.id).not.toMatch(/^none:/);
    expect(none.rationale).not.toMatch(/nothing is asked/);
  });
});
