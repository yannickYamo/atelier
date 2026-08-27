// tests/atelier-arms.test.ts — THE BASELINE IS AN OBJECT, NOT A FLAG.
//
// The criticism this file exists to make unrepeatable is "weak baseline". The defect behind it was
// not that the baseline was weak; it was that the baseline was ABSENT — nothing in the system could
// generate one, so no run could contain one, and the gap was invisible in every output.
//
// So the tests here assert three things and none of them is about statistics: the set is fixed, an
// arm that needs a human input refuses instead of substituting, and the identity of the set travels
// with the result so labels from one arm set cannot be scored against pairs from another.

import { describe, it, expect } from 'vitest';
import {
  ALL_ARMS, TREATMENT, NEEDS_HUMAN_INPUT, PAIR_KINDS, armsRequiredBy,
  servedTextFor, armSetHash, MissingArmInput, type ArmInputs, type ArmId,
} from '../core/reference/arms.js';
import { mcnemarExactP, scorePairedArms, MIN_DISCORDANT } from '../core/reference/reference-test.js';

const inputs = (over: Partial<ArmInputs> = {}): ArmInputs => ({
  compiledSkillText: 'COMPILED',
  corpusText: 'CORPUS',
  standardAsProse: 'STANDARD',
  modelStyleGuide: 'GUIDE',
  expertOnePager: 'ONEPAGER',
  ...over,
});

describe('the arm set is fixed, not chosen', () => {
  it('contains the baseline that decides the product and the one that decides the business', () => {
    expect(ALL_ARMS).toContain('B1_CORPUS_IN_PROMPT');
    expect(ALL_ARMS).toContain('B4_EXPERT_ONE_PAGER');
    expect(ALL_ARMS).toContain(TREATMENT);
  });

  it('the primary comparison is the treatment against pasting the work into the prompt', () => {
    const primary = PAIR_KINDS.filter((k) => k.primary);
    expect(primary).toHaveLength(1);
    expect(primary[0].left).toBe('T_ATELIER');
    expect(primary[0].right).toBe('B1_CORPUS_IN_PROMPT');
  });

  it('every arm a pair kind names is an arm the set can generate', () => {
    const required = armsRequiredBy(PAIR_KINDS);
    for (const a of required) expect(ALL_ARMS).toContain(a);
  });

  it('every arm produces a distinct served text, so no two arms are secretly the same run', () => {
    const seen = new Map<string, ArmId>();
    for (const a of ALL_ARMS) {
      const text = servedTextFor(a, inputs());
      const clash = seen.get(text);
      expect(clash, `${a} serves the same text as ${clash ?? ''}`).toBeUndefined();
      seen.set(text, a);
    }
  });
});

describe('an arm that needs a person refuses rather than substituting', () => {
  it('the expert one-pager is declared as needing human input', () => {
    expect(NEEDS_HUMAN_INPUT).toContain('B4_EXPERT_ONE_PAGER');
  });

  it('refuses when the expert one-pager is absent', () => {
    expect(() => servedTextFor('B4_EXPERT_ONE_PAGER', inputs({ expertOnePager: null })))
      .toThrow(MissingArmInput);
  });

  it('refuses when the model-written guide is absent', () => {
    expect(() => servedTextFor('B2_MODEL_STYLE_GUIDE', inputs({ modelStyleGuide: null })))
      .toThrow(MissingArmInput);
  });

  it('the refusal names why a stand-in is not acceptable', () => {
    try {
      servedTextFor('B4_EXPERT_ONE_PAGER', inputs({ expertOnePager: null }));
      expect.unreachable('should have refused');
    } catch (e) {
      expect((e as Error).message).toMatch(/no substitute|--one-pager/);
    }
  });

  it('the bare arm serves nothing, and that is a value rather than a missing input', () => {
    expect(servedTextFor('B0_BARE', inputs())).toBe('');
  });
});

describe('the arm set has an identity that travels with the result', () => {
  it('is order-independent, because it identifies a set', () => {
    const a = armSetHash(['T_ATELIER', 'B0_BARE'], 'sv1');
    const b = armSetHash(['B0_BARE', 'T_ATELIER'], 'sv1');
    expect(a).toBe(b);
  });

  it('changes when an arm is added, so a partial run cannot be scored as a full one', () => {
    const full = armSetHash(ALL_ARMS, 'sv1');
    const partial = armSetHash(ALL_ARMS.filter((x) => x !== 'B1_CORPUS_IN_PROMPT'), 'sv1');
    expect(partial).not.toBe(full);
  });

  it('changes with the skill version, because the same arms against a different package is a different comparison', () => {
    expect(armSetHash(ALL_ARMS, 'sv1')).not.toBe(armSetHash(ALL_ARMS, 'sv2'));
  });
});

describe('the paired test', () => {
  it('is symmetric in the two discordant counts', () => {
    expect(mcnemarExactP(7, 2)).toBeCloseTo(mcnemarExactP(2, 7), 12);
  });

  it('returns 1 when nothing is discordant, because that is no information rather than no difference', () => {
    expect(mcnemarExactP(0, 0)).toBe(1);
  });

  it('matches the exact binomial by hand: b=0, c=5 is two-sided 2*(1/32)', () => {
    expect(mcnemarExactP(0, 5)).toBeCloseTo(2 * 0.5 ** 5, 12);
  });

  it('matches the exact binomial by hand: b=1, c=5 is two-sided 2*(7/64)', () => {
    // one-sided tail = C(6,0)+C(6,1) over 2^6 = 7/64
    expect(mcnemarExactP(1, 5)).toBeCloseTo(2 * (7 / 64), 12);
  });

  it('never exceeds 1 even when the split is even', () => {
    for (const [b, c] of [[1, 1], [2, 2], [3, 3], [5, 5]]) {
      expect(mcnemarExactP(b, c)).toBeLessThanOrEqual(1);
    }
  });

  it('refuses a nonsense count rather than returning a number', () => {
    expect(() => mcnemarExactP(-1, 2)).toThrow();
    expect(() => mcnemarExactP(1.5, 2)).toThrow();
  });

  it('reports that too few discordant pairs cannot resolve, instead of printing a bare p', () => {
    const thin = scorePairedArms('T_vs_B1', 3, 0, 9);
    expect(thin.resolves).toBe(false);
    expect(thin.n).toBe(12);

    const enough = scorePairedArms('T_vs_B1', MIN_DISCORDANT, 0, 4);
    expect(enough.resolves).toBe(true);
  });

  it('excludes concordant pairs from the test but keeps them in n', () => {
    const r = scorePairedArms('T_vs_B1', 6, 1, 10);
    expect(r.n).toBe(17);
    expect(r.p).toBeCloseTo(mcnemarExactP(6, 1), 12);
  });
});
