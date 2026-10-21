// tests/check-correction.test.ts — A QUALIFIED WRITTEN CHECK MAY SUPPLY THE CORRECTION, AND CODE PUTS IT IN PLACE.
//
// The integrity guard refuses any rewrite that moves a figure, so a reserve that does not equal the invoices could only
// be BLOCKED. A written check that computed the right value from the material supplies it as the span's replacement;
// once the check is qualified on the owner's examples and their mutants, that correction is applied in code, the figure
// allowed to change only inside the span the check flagged. An unqualified check's correction is shown, never applied.
import { describe, it, expect } from 'vitest';
import { measure } from '../core/observers/registry.js';
import { correctMechanicalErrors, grammarFixes } from '../core/loop/mechanical-repair.js';
import { verifyText } from '../core/observers/verify.js';
import { aRequirement } from './fixtures.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const MEMO = '## Facts\n\nTwo invoices were filed [invoice A], [invoice B].\n\n## Reserve\n\nThe reserve is 6,250 dollars, the sum of the invoices.\n';
const MATERIAL = [{ name: 'invoice A', text: 'Invoice A: 4,200 dollars.' }, { name: 'invoice B', text: 'Invoice B: 1,850 dollars.' }];
// the reserve equals the sum of the invoice amounts in the material; the span is the stated reserve, the replacement the sum
const RESERVE = `(text, request, material) => { const sum = material.flatMap((m) => [...m.text.matchAll(/(\\d[\\d,]*) dollars/g)].map((x) => Number(x[1].replace(/,/g, '')))).reduce((a, b) => a + b, 0); const m = /reserve is (\\d[\\d,]*) dollars/.exec(text); if (!m || !sum) return null; const stated = Number(m[1].replace(/,/g, '')); const start = m.index + 'reserve is '.length; return { ok: stated === sum, detail: stated === sum ? 'the reserve equals the invoices' : 'the reserve ' + m[1] + ' is not the invoices\\' sum ' + sum.toLocaleString('en-US'), spans: stated === sum ? [] : [{ start, end: start + m[1].length, why: 'the reserve must equal the invoices', replacement: sum.toLocaleString('en-US') }] }; }`;
const source = [RESERVE];
const std = (qualified: boolean): StandardVersion => ({ standardVersionHash: 'std', requirements: [aRequirement({ requirementId: 'r1', statement: 'The reserve equals the invoices.', materiality: 'REQUIRED',
  measurement: { observer: 'CHECK', params: { source, means: ['the reserve equals the invoices'], ...(qualified ? { qualified: 1 } : {}) } } })] } as unknown as StandardVersion);

describe('a correction supplied by a written check', () => {
  it('the check flags the reserve with the sum it computed from the material', () => {
    const r = measure(MEMO, { observer: 'CHECK', params: { source, means: ['x'] } }, { material: MATERIAL });
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans).toEqual([{ start: MEMO.indexOf('6,250'), end: MEMO.indexOf('6,250') + 5, text: '6,250', why: 'the reserve must equal the invoices', replacement: '6,050' }]);
  });
  it('in code, the figure may change only where the check allows it; the mechanical path alone refuses it', () => {
    const spans = measure(MEMO, { observer: 'CHECK', params: { source, means: ['x'] } }, { material: MATERIAL }).spans;
    expect(correctMechanicalErrors(MEMO, spans).corrected).toBe(0);
    const fixed = correctMechanicalErrors(MEMO, spans, { figuresMayChange: true });
    expect(fixed.corrected).toBe(1);
    expect(fixed.text).toContain('The reserve is 6,050 dollars');
    expect(fixed.changes).toEqual(['"6,250" → "6,050"']);
  });
  it('a qualified check\'s correction is applied without --fix-grammar; an unqualified one\'s is not', () => {
    const q = verifyText('s', std(true), MEMO, { material: MATERIAL });
    expect(q.failed).toBe(true);
    const g = grammarFixes(std(true), q, MEMO);
    expect(g.text).toContain('6,050'); expect(g.fixed[0]).toMatch(/^r1: 1 value\(s\) corrected by its check: "6,250" → "6,050"/);
    expect(verifyText('s', std(true), g.text, { material: MATERIAL }).failed).toBe(false);
    const u = verifyText('s', std(false), MEMO, { material: MATERIAL });
    expect(grammarFixes(std(false), u, MEMO)).toEqual({ text: MEMO, fixed: [] });
  });
});
