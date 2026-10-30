// tests/atelier-feature-carriers.test.ts — A FEATURE MISS POINTS AT ITS CARRIERS AND SAYS WHICH WAY AND HOW FAR.
//
// A rate has no single place it lives, so the FEATURE observer used to return no spans and a repair had nothing to
// point at; a later shape round started from an empty note and missed what the round before it missed. Now a miss
// is pointed at the sentences whose removal moves the value most toward the band, the detail says the direction and
// the distance, and the notes a redraft and a shape round are written from carry both.
import { describe, it, expect } from 'vitest';
import { FEATURE, featureOf, featureMove } from '../core/observers/features.js';
import { carriersOf } from '../core/observers/carrier.js';
import { carrier } from '../core/fidelity/structural.js';
import { proseSentences } from '../core/fidelity/operators.js';
import { statedLength } from '../core/intake/length.js';

const plain = 'The rule holds in this case and it holds elsewhere as well today, whatever the reader brings to it.';
const aside = 'The rule holds here (as it did last year) and it holds there too (most of the time, at least).';
/** `n` paragraphs of three sentences; every `every`-th sentence carries two parenthetical asides. */
const piece = (n: number, every: number | null): string => Array.from({ length: n }, (_, i) =>
  Array.from({ length: 3 }, (_, k) => (every !== null && (i * 3 + k) % every === 0 ? aside : plain)).join(' ')).join('\n\n');

describe('the FEATURE observer points a miss at its carriers', () => {
  const band = { feature: ['parenthesis'], minValue: 2, maxValue: 5 };
  it('above the band: VIOLATED, one to three spans on sentences with parentheses, the range and the amount to remove, a positive error', () => {
    const text = piece(8, 3);
    const r = FEATURE.observe(text, band);
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans.length).toBeGreaterThanOrEqual(1);
    expect(r.spans.length).toBeLessThanOrEqual(3);
    for (const sp of r.spans) {
      expect(sp.text).toContain('(');
      expect(text.slice(sp.start, sp.end)).toBe(sp.text);
      expect(sp.why).toMatch(/carries about \d+(\.\d)? of the \d+(\.\d)? to remove/);
    }
    expect(r.detail).toMatch(/^parenthetical asides \d+(\.\d+)? per 1,000 words; your range is 2 to 5 per 1,000 words; about \d+(\.\d)? to remove$/);
    expect(r.error).toBeGreaterThan(0);
    // the amount to remove is the distance past the top of the band
    expect(r.detail).toContain(`about ${Math.round(((r.value ?? 0) - 5) * 10) / 10} to remove`);
  });
  it('inside the band: MET, no spans, error 0', () => {
    const text = piece(8, 30);
    const v = featureOf('parenthesis')!.measure(text) ?? 0;
    expect(v).toBeGreaterThanOrEqual(2); expect(v).toBeLessThanOrEqual(5);
    const r = FEATURE.observe(text, band);
    expect(r).toMatchObject({ verdict: 'MET', spans: [], error: 0 });
  });
  it('below the band: a negative error and "to add"', () => {
    const r = FEATURE.observe(piece(8, null), band);
    expect(r.verdict).toBe('VIOLATED');
    expect(r.error).toBeLessThan(0);
    expect(r.detail).toMatch(/about 2 to add$/);
    for (const sp of r.spans) expect(sp.why).toContain('to add');
  });
  it('the error is in widths of the band, signed; one edge or no width reads in the feature\'s own unit', () => {
    const text = piece(8, 3); const v = featureOf('parenthesis')!.measure(text) ?? 0;
    expect(FEATURE.observe(text, band).error).toBeCloseTo((v - 5) / 3, 3);
    expect(FEATURE.observe(text, { feature: ['parenthesis'], maxValue: 5 }).error).toBeCloseTo(v - 5, 3);
    expect(FEATURE.observe(text, { feature: ['parenthesis'], minValue: 5, maxValue: 5 }).error).toBeCloseTo(v - 5, 3);
    expect(FEATURE.observe(piece(8, null), { feature: ['parenthesis'], minValue: 2, maxValue: 6 }).error).toBeCloseTo(-0.5, 3);
  });
  it('a draft nearer the band is pointed at no more places than one further out', () => {
    const far = FEATURE.observe(piece(8, 2), band).spans.length;
    const near = FEATURE.observe(piece(8, 6), band).spans.length;
    expect(near).toBeLessThanOrEqual(far);
  });
  it('says the move in plain words, or nothing inside the band', () => {
    expect(featureMove(band, 9.1)).toBe('about 4.1 fewer parenthetical asides per 1,000 words');
    expect(featureMove(band, 0.5)).toBe('about 1.5 more parenthetical asides per 1,000 words');
    expect(featureMove(band, 3)).toBeNull();
    expect(featureMove({ feature: ['question'], minValue: 0.1, maxValue: 0.2 }, 0.32)).toBe('about 12 points fewer questions');
    expect(featureMove({ feature: ['paragraphP50'], maxValue: 60 }, 72.4)).toBe('the length of your typical paragraph (median, words): about 12.4 lower');
  });
  it('the structural carrier is the first carrier, split the way the operators split', () => {
    const text = piece(8, 3); const f = featureOf('parenthesis')!;
    const c = carrier(text, 'parenthesis');
    expect(c?.s).toContain('(');
    expect(carriersOf(text, (t) => f.measure(t), proseSentences(text), 'lower', 1)[0]).toMatchObject({ s: c?.s, at: c?.at });
    expect(carrier(piece(8, null), 'parenthesis')).toBeNull();
  });
});

describe('the notes a draft is written again from carry direction and distance', () => {
  const featureRule = { requirementId: 'f1', statement: 'Few asides in parentheses.', materiality: 'REQUIRED', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL',
    measurement: { observer: 'FEATURE', params: { feature: ['parenthesis'], minValue: 2, maxValue: 5 } } };
  const lengthRule = { requirementId: 'x7', statement: 'Between 220 and 420 words.', materiality: 'REQUIRED', obligation: 'DELIVERABLE', authority: 'USER_ADOPTED', appliesWhen: 'GENERAL',
    measurement: { observer: 'LENGTH', params: { unit: ['words'], min: 220, max: 420 } } };
  const std = { standardVersionHash: 's', requirements: [featureRule, lengthRule] } as never;
  const text = piece(8, 3);
  const missed = FEATURE.observe(text, featureRule.measurement.params);
  const report = { failed: true, unchecked: [], conditional: [], checked: [
    { requirementId: 'f1', statement: featureRule.statement, materiality: 'REQUIRED', observer: 'FEATURE', result: missed },
    { requirementId: 'x7', statement: lengthRule.statement, materiality: 'REQUIRED', observer: 'LENGTH', result: { verdict: 'VIOLATED', spans: [], value: 471, detail: '471 words (220 to 420): long by 51' } },
  ] } as never;

  it('redraftNote says how far and which way for a LENGTH miss and for a FEATURE miss', async () => {
    const { unmetReader, redraftNote } = await import('../cli/commands/invoke.js');
    const [length] = unmetReader(std)?.({ output: text, report }) ?? [];
    expect(length).toMatchObject({ id: 'x7', off: 51, move: 'about 51 words shorter' });
    const note = redraftNote([length, { id: 'f1', statement: featureRule.statement, detail: missed.detail, off: Math.abs(missed.error ?? 0), move: featureMove(featureRule.measurement.params, missed.value ?? 0) ?? '' }], 'd');
    expect(note).toContain('- Between 220 and 420 words. (471 words (220 to 420): long by 51; aim for 378 words or fewer; about 51 words shorter)');
    expect(note).toMatch(/- Few asides in parentheses\. \(parenthetical asides [\d.]+ per 1,000 words; your range is 2 to 5 per 1,000 words; about [\d.]+ to remove; about [\d.]+ fewer parenthetical asides per 1,000 words\)/);
  });
  it('a request length that is missed says the move too', async () => {
    const { unmetReader, LENGTH_ID } = await import('../cli/commands/invoke.js');
    const short = Array.from({ length: 100 }, () => 'word').join(' ');
    const asked = statedLength('Explain caching in 300 words.')!;
    const miss = unmetReader({ requirements: [] } as never, asked)?.({ output: short, report: { checked: [], unchecked: [], failed: false } as never })?.find((u) => u.id === LENGTH_ID);
    expect(miss?.move).toMatch(/^about \d+ words longer$/);
  });
  it('the shape-round note is non-empty after a round that missed, names each miss with its move, and is empty when nothing was missed', async () => {
    const { roundMisses, shapeNote } = await import('../cli/commands/invoke.js');
    const misses = roundMisses(std, { output: text, report });
    expect(misses.map((u) => u.id).sort()).toEqual(['f1', 'x7']);
    const f = misses.find((u) => u.id === 'f1');
    expect(f).toMatchObject({ statement: 'Few asides in parentheses.', off: missed.error });
    expect(f?.move).toMatch(/^about [\d.]+ fewer parenthetical asides per 1,000 words$/);
    const note = shapeNote(misses);
    expect(note).toContain('did not hold what this work requires');
    expect(note).toContain('about 51 words shorter');
    expect(note).toContain('fewer parenthetical asides per 1,000 words');
    expect(note).not.toContain('<earlier-draft>');
    const clean = { failed: false, unchecked: [], conditional: [], checked: [{ requirementId: 'f1', statement: featureRule.statement, materiality: 'REQUIRED', observer: 'FEATURE', result: FEATURE.observe(piece(8, 30), featureRule.measurement.params) }] } as never;
    expect(shapeNote(roundMisses(std, { output: piece(8, 30), report: clean }))).toBe('');
  });
  it('a PREFERRED rule that misses is not in the note: the round is told what acts, not what is shown', async () => {
    const { roundMisses } = await import('../cli/commands/invoke.js');
    const preferred = { failed: false, unchecked: [], conditional: [], checked: [{ requirementId: 'f1', statement: featureRule.statement, materiality: 'PREFERRED', observer: 'FEATURE', result: missed }] } as never;
    expect(roundMisses({ standardVersionHash: 's', requirements: [{ ...featureRule, materiality: 'PREFERRED' }] } as never, { output: text, report: preferred })).toEqual([]);
  });
});
