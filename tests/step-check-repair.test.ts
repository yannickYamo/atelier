// tests/step-check-repair.test.ts — A WRITTEN CHECK THAT FAILED IS SENT BACK ONCE; WHAT COMES BACK IS GROUNDED LIKE THE FIRST.
import { describe, it, expect } from 'vitest';
import { STEP_CHECK, STEP_CHECK_REPAIR, stepCheckInput } from '../core/method/step-check.js';
import { outlineOf } from '../core/method/standard.js';
import { countWords } from '../core/eval/size.js';

const EXAMPLE = '## Reserve\n\nThe reserve is 1,850 dollars.\n';
const step = { id: '1', text: 'The reserve equals the sum of the invoices.', under: null };
const material = [{ name: 'invoice 1', text: 'Amount: 1,200 dollars' }, { name: 'invoice 2', text: 'Amount: 650 dollars' }];
const input = { step, means: 'the reserve equals the invoices', source: '(text) => { const re = /reserve is (\\d+/; return { ok: true }; }', problem: 'the check does not compile: Invalid regular expression', example: EXAMPLE, material };
const GOOD = '(text, request, material) => { const sum = material.flatMap((m) => [...m.text.matchAll(/(\\d[\\d,]*) dollars/g)].map((x) => Number(x[1].replace(/,/g, "")))).reduce((a, b) => a + b, 0); const m = /reserve is (\\d[\\d,]*)/.exec(text); if (!m) return null; return { ok: Number(m[1].replace(/,/g, "")) === sum, detail: "sum " + sum }; }';

describe('the first reading keeps a failed attempt', () => {
  it('a check that does not compile is judgement with the attempt kept, so the build can send it back', () => {
    const i = stepCheckInput([step], [{ id: 'e1', task: 't', material, reference: EXAMPLE }], outlineOf, countWords);
    const v = STEP_CHECK.ground({ checks: [{ id: '1', how: 'written', measure: null, source: input.source, quote: 'reserve equals', means: 'x' }] }, i)!;
    expect(v['1']).toMatchObject({ how: 'judgement', by: 'floor', attempt: { source: input.source, problem: expect.stringContaining('does not compile') as string } });
  });
});

describe('the repair reading', () => {
  it('a corrected check that compiles and runs on the example is kept; one that does not is no answer; nothing is nothing', () => {
    expect(STEP_CHECK_REPAIR.ground({ source: GOOD }, input)).toEqual({ source: GOOD });
    expect(STEP_CHECK_REPAIR.ground({ source: '(text) => {' }, input)).toBeNull();
    expect(STEP_CHECK_REPAIR.ground({ source: '(text) => { throw new Error("no"); }' }, input)).toBeNull();
    expect(STEP_CHECK_REPAIR.ground({}, input)).toEqual({ source: null });
    expect(STEP_CHECK_REPAIR.floor(input)).toEqual({ source: null });
    expect(STEP_CHECK_REPAIR.prompt(input)).toContain('What went wrong:\nthe check does not compile');
  });
});
