// tests/atelier-rhythm-signature.test.ts — SENTENCE LENGTH IS A RULE ONLY WHERE IT IS THE WRITER'S OWN RHYTHM.
//
// A count is not a style. The length of a writer's sentences is held as a rule when it is the same in piece after
// piece and apart from what a model writes on the same topics (a monologue that runs a hundred words before it
// stops), and otherwise it is what each piece needed (core/observers/rhythm-signature.ts).
import { describe, it, expect } from 'vitest';
import { rhythmSignature, proseLengths, isSentenceLengthRule } from '../core/observers/rhythm-signature.js';
import { suggest } from '../core/ratification/suggest.js';
import { aRequirement } from './fixtures.js';

const words = (n: number, seed: number): string => Array.from({ length: n }, (_, k) => ['road', 'night', 'engine', 'river', 'town', 'light', 'rain', 'music', 'friend', 'window', 'mile', 'dawn'][(k * 7 + seed) % 12]).join(' ');
const sentence = (n: number, seed: number): string => `${words(n, seed).replace(/^./, (c) => c.toUpperCase())}.`;
/** A piece of `count` sentences whose lengths cycle through `lengths`, three to a paragraph. */
const piece = (lengths: readonly number[], count = 36, seed = 0): string => Array.from({ length: count }, (_, i) => `${sentence(lengths[i % lengths.length], seed + i)}${i % 3 === 2 ? '\n\n' : ' '}`).join('').trim();
const modelDrafts = [0, 1, 2].map((s) => piece([12, 16, 9, 20, 14, 18], 36, s));

describe('a rhythm is a signature when it is consistent across the writer\'s pieces and apart from the model\'s', () => {
  it('a monologue that runs long in every piece is the writer\'s own', () => {
    const kerouac = [0, 1, 2, 3, 4].map((s) => piece([70, 95, 55, 120, 80, 64], 30, s));
    const r = rhythmSignature(kerouac, modelDrafts);
    expect(r.signature).toBe('LONG');
    expect(r.why).toMatch(/^your sentences run long in piece after piece, and apart from what the model writes: your typical sentence runs \d+(\.\d)? words and your long ones \d+(\.\d)?; the model's, on your topics, \d+(\.\d)? and \d+(\.\d)?, over 5 of your pieces$/);
  });
  it('prose cut to the bone in every piece is too', () => {
    const terse = [0, 1, 2, 3, 4].map((s) => piece([4, 6, 3, 5, 7, 4], 40, s));
    expect(rhythmSignature(terse, modelDrafts).signature).toBe('SHORT');
  });
  it('a rhythm that changes from piece to piece follows the piece, and is no rule', () => {
    const mixed = [piece([8, 10, 9], 36, 0), piece([30, 34, 28], 36, 1), piece([14, 16, 12], 36, 2), piece([45, 50, 40], 36, 3), piece([9, 11, 10], 36, 4)];
    const r = rhythmSignature(mixed, modelDrafts);
    expect(r.signature).toBeNull();
    expect(r.why).toMatch(/^how long your sentences run changes from piece to piece, so it follows the piece and is not held as a rule/);
  });
  it('a writer whose sentences run about as long as a model\'s has no signature in them', () => {
    const plain = [0, 1, 2, 3, 4].map((s) => piece([13, 17, 10, 19, 15, 16], 36, s + 5));
    const r = rhythmSignature(plain, modelDrafts);
    expect(r.signature).toBeNull();
    expect(r.why).toMatch(/^your sentences run about as long as the model's, so their length sets nothing of yours apart/);
  });
  it('a little longer than the model is not apart: the gap must be large beside the writer\'s own spread', () => {
    const slightly = [0, 1, 2, 3, 4].map((s) => piece([16, 20, 13, 22, 18, 19], 36, s));
    expect(rhythmSignature(slightly, modelDrafts).signature).toBeNull();
  });
  it('with too few pieces or no drafts to compare, nothing is called a signature', () => {
    const kerouac = [0, 1, 2].map((s) => piece([70, 95, 55, 120], 30, s));
    expect(rhythmSignature(kerouac, modelDrafts)).toMatchObject({ signature: null, pieces: 3 });
    expect(rhythmSignature([0, 1, 2, 3, 4].map((s) => piece([70, 95, 55, 120], 30, s)), []).why).toMatch(/^too little to tell a rhythm from a piece: 5 of your pieces and 0 of the model's drafts/);
  });
});

describe('only prose sentences are counted', () => {
  it('a heading, a line that is only a bold label, a list item and a table row are not sentences', () => {
    const text = `# Title of the piece\n\n**What breaks first?**\n\n${sentence(20, 1)} ${sentence(22, 2)}\n\n- A short item.\n- Another one.\n\n| a | b |\n|---|---|\n| one | two |\n\n## A section heading\n\n${sentence(18, 3)}`;
    expect(proseLengths(text)).toEqual([20, 22, 18]);
  });
  it('a format full of bold question lines does not make its writer a writer of short sentences', () => {
    const body = (s: number): string => Array.from({ length: 12 }, (_, k) => `**What does point ${k} show?**\n\n${sentence(18, s + k)} ${sentence(22, s + k + 1)} ${sentence(15, s + k + 2)}`).join('\n\n');
    const r = rhythmSignature([0, 1, 2, 3, 4].map(body), modelDrafts);
    expect(r.signature).toBeNull();
    expect(r.writer?.median).toBeGreaterThan(14);
  });
});

describe('a rule on sentence length is suggested as required only on a signature', () => {
  const rule = (measurement: { observer: 'SENTENCE_LENGTH' | 'DISTRIBUTION' | 'FRAGMENT_SHARE' | 'HEDGE_RATE'; params: Record<string, unknown> }) => aRequirement({ requirementId: 'm1', statement: 'I keep sentences short.', measurement: measurement as never });
  it('which measurements are about sentence length', () => {
    expect(isSentenceLengthRule({ observer: 'SENTENCE_LENGTH', params: { medianMax: 19 } })).toBe(true);
    expect(isSentenceLengthRule({ observer: 'FRAGMENT_SHARE', params: { maxWords: 5, maxShare: 0.2 } })).toBe(true);
    expect(isSentenceLengthRule({ observer: 'DISTRIBUTION', params: { edges: [8, 18, 30], shares: [0.2, 0.3, 0.3, 0.2], tolerance: 0.15 } })).toBe(true);
    expect(isSentenceLengthRule({ observer: 'RHYTHM', params: { unit: ['SENTENCE'], minCv: 0.5 } })).toBe(true);
    expect(isSentenceLengthRule({ observer: 'RHYTHM', params: { unit: ['PARAGRAPH'], minCv: 0.5 } })).toBe(false);
    expect(isSentenceLengthRule({ observer: 'HEDGE_RATE', params: { maxPer1000: 4 } })).toBe(false);
    expect(isSentenceLengthRule(null)).toBe(false);
  });
  it('held by every held-out piece and still shown, with the reason, when the rhythm is not a signature', () => {
    const p = rule({ observer: 'DISTRIBUTION', params: { edges: [8, 18, 30], shares: [0.2, 0.3, 0.3, 0.2], tolerance: 0.15 } });
    const why = 'how long your sentences run changes from piece to piece, so it follows the piece and is not held as a rule (your typical sentence runs 18 words)';
    const shown = suggest(p, { inSample: { applicable: 2, present: 2, independent: true, contextual: why } } as never, 'GENERATE');
    expect(shown).toMatchObject({ decision: 'APPROVE', materiality: 'PREFERRED' });
    expect(shown.why).toBe(`${why}; it is shown and used to choose between drafts, and never enforced unless you make it required`);
    // the same rule on a signature is suggested as before
    expect(suggest(p, { inSample: { applicable: 2, present: 2, independent: true } } as never, 'GENERATE').materiality).toBe('REQUIRED');
  });
});
