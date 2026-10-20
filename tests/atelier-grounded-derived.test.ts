// A FIGURE WORKED FROM WHAT WAS GIVEN, BY DIMENSION (core/observers/obligations.ts, CITED). On ten price analyses the
// method's own step "every figure must be sourced from the price list" read every worked cost as unsourced (12 × $8 =
// $96, $350 ÷ 12 = $29.17, $350 − $96 = $254): forty runs blocked, and the repair against it removed the worked costs
// from fifteen outputs whose drafts had them. A total is a count times a rate, a rate per head is money over a count,
// a gap is money less money, a year is a month twelve times, chained through figures the text states. The clinical
// false pass the strict rule was written against (a dose from an age plus a breathing rate) stays blocked.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CITED } from '../core/observers/obligations.js';

const LIST = 'PRICE LIST (per month, billed monthly)\nAcme Desk: 14 dollars per seat, minimum 25 seats\nFennel HQ: 19 dollars per seat, minimum 50 seats\nKelp: 8 dollars per seat, minimum 5 seats\n';
const REQ = 'Compare these vendors on price for a team of 12 people.';
const ctx = { request: REQ, material: [{ name: 'price-list', text: LIST }] };
const run = (text: string, c = ctx) => CITED.observe(text, { allow: 0 }, c);
const missing = (text: string, c = ctx): string[] => run(text, c).spans.map((s) => s.text);

describe('arithmetic the text shows its way to', () => {
  it('a total is a count times a rate; a rate per head is money over a count; a gap is money less money', () => {
    expect(missing('Kelp: 12 seats paid, 12 × $8 = $96 per month.')).toEqual([]);
    expect(missing('Acme Desk: 25 seats paid, 25 × $14 = $350 per month. Effective rate $29.17 per person ($350 ÷ 12).')).toEqual([]);
    expect(missing('Kelp costs $96 per month and Acme Desk $350 per month, so Kelp is $254 per month cheaper.')).toEqual([]);
  });
  it('a chain runs only through figures the text states: the gap needs the totals on the page', () => {
    // $254 is $350 − $96, but neither total is stated here: nothing to check against, so it is listed
    expect(missing('Kelp is $254 per month cheaper than Acme Desk for this team.')).toEqual(['$254']);
    expect(missing('Kelp is $96 per month and Acme Desk is $350 per month. Kelp is $254 per month cheaper.')).toEqual([]);
  });
  it('a year is twelve months, only where the words say a year', () => {
    expect(missing('Kelp costs $96 per month, or $1,152 a year.')).toEqual([]);
    const ten = { request: 'Compare these vendors on price for a team of 10 people.', material: ctx.material };
    expect(missing('Kelp costs $80 per month, or $960.', ten)).toEqual(['$960']);
    expect(missing('Kelp costs $80 per month, or $960 over twelve months.', ten)).toEqual([]);
    // a headcount has no year: 640 employees do not become 7,680 a year
    expect(missing('It plans to hire 7,680 people a year.', { request: '', material: [{ name: 'sheet', text: 'Headcount: 640 employees.' }] })).toEqual(['7,680']);
  });
  it('unused seats are a minimum less the team, as seats; a share is a count over a count of the same thing', () => {
    expect(missing('Acme Desk bills 25 seats, so the team pays for 13 unused seats.')).toEqual([]);
    expect(missing('Kelp\'s 5-seat minimum is 20% of the 25 seats Acme Desk bills.')).toEqual([]);
    // a share is of one thing in the same thing: 12 people over 25 seats is not a share the arithmetic vouches for
    expect(missing('The team fills 48% of the 25 seats Acme Desk bills.')).toEqual(['48%']);
  });
  it('a percentage of an amount, and an amount less a percentage', () => {
    const c = { request: 'Price the annual plan.', material: [{ name: 'list', text: 'Acme Desk: $350 per month, 20 percent off on the annual plan.' }] };
    expect(missing('With the 20% discount Acme Desk is $280 per month, $70 less.', c)).toEqual([]);
  });
});

describe('what stays unsourced', () => {
  it('an operand nobody gave: the figure is listed, and so is anything built on it', () => {
    expect(missing('Kelp costs $96 per month; with the 15-seat minimum we heard about it would be $120.')).toEqual(['15', '$120']);
  });
  it('a dose is not an age plus a breathing rate, nor four times a count: units decide, as before', () => {
    const c = { request: 'Write the handover.', material: [{ name: 'chart', text: 'Age 64. Respiratory rate 16 bpm. Four doses given.' }] };
    expect(missing('Give 80 mg now.', c)).toEqual(['80 mg']);
    expect(missing('Give 20 mg per dose, 4 doses, 80 mg in all.', c)).toEqual(['20 mg', '80 mg']);
  });
  it('the arithmetic is not tried past eighty operands', () => {
    const many = Array.from({ length: 90 }, (_, i) => `item ${i + 1}: $${i + 101} per seat`).join('\n');
    const c = { request: REQ, material: [{ name: 'list', text: many }] };
    expect(missing('12 seats × $101 = $1,212 per month.', c)).toEqual(['$1,212']);
  });
});

describe('a worked analysis passes the method\'s rule whole, so the repair has nothing to remove', () => {
  it('the real output of a run that was blocked on 2026-10-19', () => {
    const text = `## Verdict\n\nKelp costs least for a team of 12, at $96 per month. Its 5-seat minimum falls below the team size, so the team pays for exactly the 12 seats it uses. Acme Desk bills for 25 seats and Fennel HQ for 50, forcing payment for capacity the team will not use.\n\n## Vendor pricing\n\n| Vendor | Price per seat | Minimum seats |\n|---|---|---|\n| Acme Desk | $14 | 25 |\n| Fennel HQ | $19 | 50 |\n| Kelp | $8 | 5 |\n\n## Cost at this size\n\nSeats paid for is the team size (12) or the vendor minimum, whichever is larger.\n\n- **Kelp:** minimum 5 is below 12, so 12 seats are paid. 12 × $8 per month. Effective rate $8.00 per person. Total **$96 per month**.\n- **Acme Desk:** minimum 25 exceeds 12, so 25 seats are paid. 25 × $14 = **$350 per month**. Effective rate $29.17 per person ($350 ÷ 12).\n- **Fennel HQ:** minimum 50 exceeds 12, so 50 seats are paid. 50 × $19 = **$950 per month**. Effective rate $79.17 per person ($950 ÷ 12).\n\nKelp is $254 per month cheaper than Acme Desk and $854 per month cheaper than Fennel HQ, or $3,048 and $10,248 a year.\n\n## Risks\n\nThe comparison is on list price only; discounts and billing terms are not in the price list.\n`;
    const r = run(text);
    expect(r.spans.map((s) => s.text)).toEqual([]);
    expect(r.verdict).toBe('MET');
  });
  it('the public domain\'s own examples still pass as they did', () => {
    const dir = 'bench/standing/domains/analysis';
    const sheetsText = readFileSync(`${dir}/examples/e01.md`, 'utf8');
    const mat = /^material:\s*(.*)$/m.exec(sheetsText)?.[1]?.trim();
    const text = sheetsText.replace(/^---[\s\S]*?---\n/, '');
    const material = mat ? [{ name: mat, text: readFileSync(`${dir}/examples/${mat}`, 'utf8') }] : [];
    const req = /^request:\s*(.*)$/m.exec(sheetsText)?.[1] ?? '';
    expect(run(text, { request: req, material }).verdict).toBe('MET');
  });
});
