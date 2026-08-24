import { describe, it, expect } from 'vitest';
import { describeSupport, assertNotSampleSize, compilesAsRequirement, compilesAsExemplar,
  protectsRatherThanGenerates, summariseCounterEvidence, readSiteEvidence,
  MATERIALITY_QUESTION, TOLERANCE_QUESTION,
  type EvidenceSupport, type Materiality, type CounterEvidence } from '../core/coverage/candidate-support.js';
import { blindSpotsOf, BLIND_SPOT_AUTHORITY, BLIND_SPOT_QUESTION,
  type UnrepresentedRecurrentBehavior } from '../core/coverage/blind-spot.js';

const sup = (o: Partial<EvidenceSupport> = {}): EvidenceSupport => ({
  discoveryCellRecurrence: 6, uniqueGoldenUnits: 5, uniqueArtifacts: 3,
  framingDiversity: 2, ladderDiversity: 2, ...o });

describe('support is decomposed, never summarised', () => {
  it('reports every axis and quotes no single number as the finding', () => {
    const d = describeSupport(sup());
    expect(d).toMatch(/6 discovery condition/);
    expect(d).toMatch(/5 unique GoldenUnit/);
    expect(d).toMatch(/3 source artifact/);
    expect(d).toMatch(/2 ladder/);
    expect(d).toMatch(/2 vantage/);
    expect(d).not.toMatch(/independent/);          // the word that was the overstatement
  });

  it('makes the weak case impossible to skip: 6 cells, ONE excerpt', () => {
    const d = describeSupport(sup({ uniqueGoldenUnits: 1, uniqueArtifacts: 1, ladderDiversity: 1 }));
    expect(d).toMatch(/6 discovery condition\(s\), supported by 1 unique GoldenUnit\(s\) from 1 source artifact/);
  });

  it('refuses cell recurrence as a sample size', () => {
    expect(() => { assertNotSampleSize('discoveryCellRecurrence'); }).toThrow(/not a count of independent expert/);
    expect(() => { assertNotSampleSize('uniqueArtifacts'); }).not.toThrow();
  });
});

describe('materiality and realization flexibility are TWO axes', () => {
  it('only REQUIRED compiles as an obligation', () => {
    expect(compilesAsRequirement('REQUIRED')).toBe(true);
    for (const m of ['PREFERRED', 'EXEMPLAR_ONLY', 'TOLERATED', 'INCIDENTAL'] as Materiality[]) {
      expect(compilesAsRequirement(m)).toBe(false);
    }
  });

  it('THE TYPO CASE — TOLERATED is protected, never generated, and is alone in that', () => {
    expect(protectsRatherThanGenerates('TOLERATED')).toBe(true);
    for (const m of ['REQUIRED', 'PREFERRED', 'EXEMPLAR_ONLY', 'INCIDENTAL'] as Materiality[]) {
      expect(protectsRatherThanGenerates(m)).toBe(false);
    }
    expect(compilesAsRequirement('TOLERATED')).toBe(false);
  });

  it('PREFERRED and EXEMPLAR_ONLY reach the model as examples, not obligations', () => {
    expect(compilesAsExemplar('PREFERRED')).toBe(true);
    expect(compilesAsExemplar('EXEMPLAR_ONLY')).toBe(true);
    expect(compilesAsExemplar('REQUIRED')).toBe(false);
    expect(compilesAsExemplar('INCIDENTAL')).toBe(false);
  });

  it('asks materiality and form separately — one question could not express "always, any form"', () => {
    expect(MATERIALITY_QUESTION).toMatch(/otherwise strong output less aligned/);
    expect(TOLERANCE_QUESTION).toMatch(/exact form matter/);
    expect(MATERIALITY_QUESTION).not.toBe(TOLERANCE_QUESTION);
  });
});

describe('counterevidence is same-site exceptions, not un-proposed opposite rules', () => {
  const ce = (unitId: string, behaviorPresent: boolean): CounterEvidence => ({ unitId, behaviorPresent, span: 's' });

  it('counts sites where the decision occurred and the expert chose otherwise', () => {
    const c = summariseCounterEvidence([ce('u1', true), ce('u2', true), ce('u3', false)], true);
    expect(c).toMatchObject({ sitesFound: 3, behaviorPresent: 2, behaviorAbsent: 1 });
    expect(c.exceptions.map((x) => x.unitId)).toEqual(['u3']);
  });

  it('reports counts and a reading — and no cutoff decides anything', () => {
    const r = readSiteEvidence(summariseCounterEvidence([ce('a', true), ce('b', true), ce('c', true)], true));
    expect(r).toMatchObject({ sitesFound: 3, behaviorPresent: 3, behaviorAbsent: 0, rate: 1 });
    // no exception is NOT read as an obligation — the honest reading names both possibilities
    expect(r.reading).toMatch(/consistent with an obligation and equally consistent with a habit/);
  });

  it('an exception is named as the part that matters, at any n', () => {
    const r = readSiteEvidence(summariseCounterEvidence([ce('a', true), ce('b', false)], true));
    expect(r.rate).toBe(0.5);
    expect(r.reading).toMatch(/the decision arose and you chose otherwise/);
  });

  it('two clean sites and twenty clean sites differ, and neither gets a label', () => {
    const few = readSiteEvidence(summariseCounterEvidence(Array.from({ length: 2 }, (_, i) => ce(`u${i}`, true)), true));
    const many = readSiteEvidence(summariseCounterEvidence(Array.from({ length: 20 }, (_, i) => ce(`u${i}`, true)), true));
    expect(few.sitesFound).toBe(2);
    expect(many.sitesFound).toBe(20);
    expect(few.rate).toBe(many.rate);                       // same rate
    expect(few.reading).not.toBe(many.reading);             // different sentence — the n is visible
    for (const r of [few, many]) {
      expect(r).not.toHaveProperty('suggestion');           // nothing categorical is produced
    }
  });

  it('distinguishes "no site arose" from "site arose and was not taken"', () => {
    const none = readSiteEvidence(summariseCounterEvidence([], true));
    expect(none.rate).toBeNull();
    expect(none.reading).toMatch(/Absence of the site is not absence of the behaviour/);
    expect(readSiteEvidence(summariseCounterEvidence([], false)).reading).toMatch(/no same-site search was run/);
  });
});

describe('standard-level blind spots', () => {
  const cl = (concern: string, cells: number, artifacts = 2): UnrepresentedRecurrentBehavior => ({
    concern, support: sup({ discoveryCellRecurrence: cells, uniqueArtifacts: artifacts }),
    evidenceSpans: ['a span'], internallyConsistent: true });

  it('reports unexplained concerns and holds back the weakly-recurring ones', () => {
    const b = blindSpotsOf('d1', [cl('how to open', 5), cl('how to close', 4), cl('one-off', 1)], 4);
    expect(b.unrepresented.map((u) => u.concern)).toEqual(['how to open', 'how to close']);
    expect(b.belowAttention).toBe(1);
    expect(b.why).toMatch(/not a gap in how well the standard is supported/);
    expect(b.why).toMatch(/cannot see the layer it excludes by construction/);
  });

  it('orders by ARTIFACT breadth first, not by cell count', () => {
    // 4 cells across 3 artifacts beats 6 cells across 1 — the cells reuse nested evidence.
    const b = blindSpotsOf('d1', [cl('narrow', 6, 1), cl('broad', 4, 3)], 4);
    expect(b.unrepresented[0].concern).toBe('broad');
  });

  it('produces no completeness score', () => {
    const b = blindSpotsOf('d1', [cl('x', 5)], 4);
    expect(b).not.toHaveProperty('score');
    expect(b).not.toHaveProperty('completeness');
  });

  it('may report silence and may never fill it', () => {
    expect(BLIND_SPOT_AUTHORITY.mayNeverSupport).toContain('adding a requirement without the author');
    expect(BLIND_SPOT_AUTHORITY.mayNeverSupport).toContain('scoring a standard for completeness');
    expect(BLIND_SPOT_AUTHORITY.why).toMatch(/never that an output failing to do it would be worse/);
    expect(BLIND_SPOT_QUESTION).toMatch(/none of these rules would catch/);
  });
});

describe('the abstraction check is semantic and advisory', () => {
  it('may flag wording and may never decide anything', async () => {
    const { ABSTRACTION_CHECK_AUTHORITY } = await import('../core/coverage/abstraction-check.js');
    expect(ABSTRACTION_CHECK_AUTHORITY.mayNeverSupport).toContain('rejecting a candidate');
    expect(ABSTRACTION_CHECK_AUTHORITY.mayNeverSupport).toContain('changing a materiality');
    expect(ABSTRACTION_CHECK_AUTHORITY.mayNeverSupport).toContain('blocking ratification');
  });

  it('no pattern-matching survives in the pure module — the property is semantic', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../core/coverage/candidate-support.ts', import.meta.url), 'utf8'));
    // a regex over counts/punctuation encodes ONE corpus's failure modes: it catches "two parallel
    // constructions" and misses "a pair of parallel constructions".
    expect(src).not.toMatch(/invariantStillNamesRealization/);
    // no REGEX LITERAL over those tokens. Naming them in prose is how the reason is explained;
    // compiling them into a pattern is what encoded one corpus's failure modes.
    expect(src).not.toMatch(/\/[^\n]*(trilogy|semicolon|parenthes|colon)[^\n]*\/[gimsuy]*/i);
  });

  it('defaults to ABSTRACTED when the instrument gives nothing — it must not reject on silence', async () => {
    const { checkAbstraction } = await import('../core/coverage/abstraction-check.js');
    const client = { async complete() {
      return { json: null, modelId: 'f', inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, cost: { basis: 'API_METERED' as const, billingUsd: 0 }, costUsd: 0 };
    } };
    const v = await checkAbstraction(client, { spentUsd: 0, capUsd: 1 }, 'anything');
    expect(v.abstracted).toBe(true);
    expect(v.stillSurface).toBe('');
  });
});

describe('"not measured" and "nothing found" must never print the same sentence', () => {
  it('an empty input reports NOT COMPUTED, not all-clear', () => {
    const b = blindSpotsOf('d1', [], 4);
    expect(b.computed).toBe(false);
    expect(b.why).toMatch(/NOT COMPUTED/);
    expect(b.why).toMatch(/nothing was looked at/);
    expect(b.why).not.toMatch(/accounted for/);
  });

  it('clusters supplied and all explained is a DIFFERENT, computed result', () => {
    const weak = { concern: 'x', support: sup({ discoveryCellRecurrence: 1 }), evidenceSpans: [], internallyConsistent: true };
    const b = blindSpotsOf('d1', [weak], 4);
    expect(b.computed).toBe(true);
    expect(b.unrepresented).toHaveLength(0);
    expect(b.why).toMatch(/accounted for/);
    expect(b.why).not.toMatch(/NOT COMPUTED/);
  });
});
