// tests/step-mutants.test.ts — A WRITTEN CHECK IS QUALIFIED BY THE OWNER'S EXAMPLES AND BY EDITS THAT BREAK ONLY ITS STEP.
import { describe, it, expect } from 'vitest';
import { STEP_MUTANTS, qualifyCheck, markQualified, mutate, describeQualification, MUTANTS_PER_STEP } from '../core/method/mutants.js';
import { checkQualified } from '../core/observers/written.js';

const EXAMPLE = '## Facts\n\nThe laptop was taken on March 5 [police report]. Two invoices were filed [invoice A], [invoice B].\n\n## Reserve\n\nThe reserve is 6,050 dollars, the sum of the invoices.\n\n## Decision\n\nCovered under clause 4.2 (contents).\n';
const HEX = { observer: 'CHECK' as const, params: { source: ['(text) => { const h = [...text.matchAll(/#[0-9a-fA-F]{3,8}\\b/g)]; return { ok: h.length === 0, detail: h.length + " hex", spans: h.map((m) => ({ start: m.index, end: m.index + m[0].length })) }; }'], means: ['no colour as a hex value'] } };
const CITES = { observer: 'CHECK' as const, params: { source: ['(text) => { const facts = (text.split("## Facts")[1] ?? "").split("##")[0]; const sentences = facts.split(/(?<=[.!?])\\s+/).map((s) => s.trim()).filter(Boolean); const bare = sentences.filter((s) => !/\\[[^\\]]+\\]/.test(s)); return { ok: bare.length === 0, detail: bare.length + " fact(s) without a citation", spans: [] }; }'], means: ['every fact under Facts cites a document'] } };
const steps = [{ id: '1', text: 'Every fact cites a document in the file.', means: 'every fact under Facts cites a document' }, { id: '2', text: 'Never write a colour as a hex value.', means: 'no colour as a hex value' }];

describe('grounding the mutants', () => {
  it('keeps an edit whose find occurs once in the piece and changes it; drops the rest; caps the count', () => {
    const v = STEP_MUTANTS.ground({ mutants: [
      { id: '1a', find: 'on March 5 [police report]', replace: 'on March 5', why: 'the date loses its citation' },
      { id: '1', find: 'not in the piece', replace: 'x', why: '' },
      { id: '1', find: 'invoice', replace: 'bill', why: 'occurs twice' },
      { id: '1', find: 'Two invoices were filed', replace: 'Two invoices were filed', why: 'changes nothing' },
      { id: '9', find: 'The reserve', replace: 'A reserve', why: 'no such step' },
      ...Array.from({ length: MUTANTS_PER_STEP + 2 }, (_, i) => ({ id: '2', find: 'Covered under clause 4.2', replace: `Covered under clause 4.${i}`, why: 'same find' })),
    ] }, { steps, example: EXAMPLE })!;
    expect(v['1']).toEqual([{ find: 'on March 5 [police report]', replace: 'on March 5', why: 'the date loses its citation' }]);
    expect(v['2']).toHaveLength(1);
    expect(v['9']).toBeUndefined();
    expect(STEP_MUTANTS.ground({ nope: 1 }, { steps, example: EXAMPLE })).toBeNull();
    expect(STEP_MUTANTS.decide({ steps: [], example: EXAMPLE })).toEqual({});
    expect(STEP_MUTANTS.floor({ steps, example: EXAMPLE })).toEqual({});
    expect(mutate(EXAMPLE, v['1'][0])).toContain('taken on March 5. Two');
  });
});

describe('qualifying a written check', () => {
  const ctx = {};
  it('a check that passes the example, catches its mutants and ignores the others is qualified and marked', () => {
    const own = [{ text: mutate(EXAMPLE, { find: 'on March 5 [police report]', replace: 'on March 5', why: '' }), context: ctx }, { text: mutate(EXAMPLE, { find: 'filed [invoice A], [invoice B]', replace: 'filed', why: '' }), context: ctx }];
    const others = [{ text: mutate(EXAMPLE, { find: 'Covered under clause 4.2 (contents).', replace: 'Covered: border #ffcc00.', why: '' }), context: ctx }];
    const q = qualifyCheck(CITES, [{ text: EXAMPLE, context: ctx }], own, others);
    expect(q).toMatchObject({ examples: { passed: 1, read: 1, of: 1 }, own: { caught: 2, of: 2 }, cross: { fired: 0, of: 1 }, qualified: true, why: null });
    expect(checkQualified(markQualified(CITES, q))).toBe(true);
    expect(describeQualification(q)).toMatch(/^qualified: passes 1 of 1/);
  });
  it('a check that misses its own mutant, or fires on another step\'s, is not qualified and says why', () => {
    const miss = qualifyCheck(HEX, [{ text: EXAMPLE }], [{ text: mutate(EXAMPLE, { find: '6,050 dollars', replace: '6,250 dollars', why: '' }) }], []);
    expect(miss.qualified).toBe(false); expect(miss.why).toMatch(/caught 0 of 1/);
    const cross = qualifyCheck(HEX, [{ text: EXAMPLE }], [{ text: EXAMPLE.replace('(contents)', '(#abc)') }], [{ text: EXAMPLE.replace('6,050', '#6050') }]);
    expect(cross.qualified).toBe(false); expect(cross.why).toMatch(/fired on 1 of 1/);
    expect(checkQualified(markQualified(HEX, cross))).toBe(false);
  });
  it('a check that fails the owner\'s own example, or reads none of them, is not qualified', () => {
    const fails = qualifyCheck(HEX, [{ text: `${EXAMPLE}\nUse #fff for the border.\n` }], [{ text: EXAMPLE.replace('(contents)', '(#abc)') }], []);
    expect(fails.why).toMatch(/fails 1 of the 1 examples/);
    const none = qualifyCheck({ observer: 'CHECK', params: { source: ['() => null'], means: ['nothing'] } }, [{ text: EXAMPLE }], [], []);
    expect(none.why).toBe('it read none of your examples');
    const noMutants = qualifyCheck(CITES, [{ text: EXAMPLE }], [], []);
    expect(noMutants.why).toMatch(/no edit of your examples/);
  });
});
