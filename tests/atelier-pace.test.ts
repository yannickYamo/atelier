// tests/atelier-pace.test.ts — PACE: HOW MUCH LENGTHS VARY, NOT ONLY HOW LONG THEY ARE.
import { describe, it, expect } from 'vitest';
import { measure, validateMeasurement } from '../core/observers/registry.js';
import { unitLengths, coefficientOfVariation } from '../core/observers/balance.js';
import { deriveContrastRules } from '../core/observers/contrast.js';
import { orientedScore } from '../core/distinctiveness/measured.js';

const varied = (i: number): string => Array.from({ length: 6 }, (_, k) =>
  `Short one ${i}. This one runs a good deal longer than the one before it, with a clause, and then another clause after that. Mid-length line here ${k}.`).join('\n\n');
const flat = Array.from({ length: 6 }, () => 'Every sentence here has seven words in it. Every sentence here has seven words in it. Every sentence here has seven words in it.').join('\n\n');

describe('RHYTHM', () => {
  it('measures variation by unit; sections are the prose between headings', () => {
    expect(coefficientOfVariation([10, 10, 10])).toBe(0);
    expect(coefficientOfVariation([2, 20])).toBeGreaterThan(1);
    expect(unitLengths('# T\n\n## A\n\none two three\n\n## B\n\nfour five', 'SECTION')).toEqual([3, 2]);
  });
  it('a flat text breaks a floor on variation; a varied one meets it; too few units is not applicable', () => {
    const m = { observer: 'RHYTHM' as const, params: { unit: ['SENTENCE'], minCv: 0.3 } };
    expect(measure(flat, m).verdict).toBe('VIOLATED');
    expect(measure(varied(1), m).verdict).toBe('MET');
    expect(measure('One. Two.', m).verdict).toBe('NOT_APPLICABLE');
  });
  it('is oriented for the floor: more variation scores higher under a floor', () => {
    const m = { observer: 'RHYTHM' as const, params: { unit: ['SENTENCE'], minCv: 0.3 } };
    expect(orientedScore(m, measure(varied(1), m))!).toBeGreaterThan(orientedScore(m, measure(flat, m))!);
  });
  it('refuses a malformed target', () => {
    expect(validateMeasurement({ observer: 'RHYTHM', params: { unit: ['WORD'], minCv: 0.3 } })).toMatch(/unit/);
    expect(validateMeasurement({ observer: 'RHYTHM', params: { unit: ['SENTENCE'] } })).toMatch(/needs/);
  });
});

describe('the contrast pass proposes pace from the author against the model', () => {
  it('an author who varies sentence length, against flat drafts, gets a floor the drafts fail', () => {
    const read = [0, 1, 2, 3].map((i) => ({ id: `a${i}.md`, text: varied(i) }));
    const held = [4, 5].map((i) => ({ id: `a${i}.md`, text: varied(i) }));
    const rules = deriveContrastRules(read, held, [flat, flat, flat], 'MACHINE_DISCOVERED');
    const pace = rules.find((r) => r.requirement.measurement?.observer === 'RHYTHM' && (r.requirement.measurement.params.unit as string[])[0] === 'SENTENCE');
    expect(pace, 'no pace rule').toBeDefined();
    expect(measure(flat, pace!.requirement.measurement!).verdict).toBe('VIOLATED');
    expect(pace!.conformance.present).toBe(pace!.conformance.applicable);
  });
});
