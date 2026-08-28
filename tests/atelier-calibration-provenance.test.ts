// A rule scored on the cases that produced it reports how well it was FITTED.
import { describe, it, expect } from 'vitest';
import {
  sealCalibrationSet, assertNoReuse, assertValidationUsable,
  DevelopmentCasesReused, ValidationSetTooThin, MIN_VALIDATION_CASES,
} from '../core/discovery/calibration-provenance.js';

const dev = sealCalibrationSet('the refined wording', 'DEVELOPMENT',
  ['m01', 'm02', 'm03', 'm04'], '2026-08-28T00:00:00.000Z');

describe('cases that shaped a rule cannot also test it', () => {
  it('REFUSES on a single shared case, not on a ratio', () => {
    // A threshold would invite arguing about how much contamination is tolerable. It is none.
    expect(() => assertNoReuse(dev, ['m99', 'm04'])).toThrow(DevelopmentCasesReused);
    expect(() => assertNoReuse(dev, ['m04'])).toThrow(/shaped the rule being validated/);
  });

  it('names which cases are contaminated, so it can be acted on', () => {
    try { assertNoReuse(dev, ['m01', 'm02', 'm99']); expect.unreachable(); }
    catch (e) { expect((e as DevelopmentCasesReused).offending).toEqual(['m01', 'm02']); }
  });

  it('POLARITY: a genuinely fresh set passes', () => {
    expect(() => assertNoReuse(dev, ['m90', 'm91', 'm92'])).not.toThrow();
  });

  it('seals deterministically, so the set can be cited later', () => {
    const a = sealCalibrationSet('w', 'DEVELOPMENT', ['b', 'a'], 'T');
    const b = sealCalibrationSet('w', 'DEVELOPMENT', ['a', 'b'], 'T');
    expect(a.setHash).toBe(b.setHash);
    expect(a.caseIds).toEqual(['a', 'b']);
  });

  it('a validation set records WHICH wording it is validating', () => {
    // Two refinements of the same rule are different targets; a set that did not say which one it
    // tested could be quoted against either.
    expect(sealCalibrationSet('w1', 'VALIDATION', ['a'], 'T').setHash)
      .not.toBe(sealCalibrationSet('w2', 'VALIDATION', ['a'], 'T').setHash);
  });
});

describe('a validation set must be able to say something', () => {
  const lab = (n: number, l: string) => Array.from({ length: n }, () => ({ label: l }));

  it('refuses a set too thin to score, counting DECIDED cases only', () => {
    // Abstention is a real answer and is excluded, so a set can be large and still too thin.
    expect(() => assertValidationUsable([...lab(6, 'YES'), ...lab(6, 'NO'), ...lab(20, 'UNSURE')]))
      .not.toThrow();
    expect(() => assertValidationUsable([...lab(4, 'YES'), ...lab(4, 'NO'), ...lab(30, 'UNSURE')]))
      .toThrow(ValidationSetTooThin);
  });

  it('refuses a single-class set, where agreement cannot beat a constant', () => {
    expect(() => assertValidationUsable(lab(MIN_VALIDATION_CASES + 4, 'YES'))).toThrow(/same class/);
    expect(() => assertValidationUsable(lab(MIN_VALIDATION_CASES + 4, 'NO'))).toThrow(/same class/);
  });
});
