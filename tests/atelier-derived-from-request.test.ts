// tests/atelier-derived-from-request.test.ts — A FIGURE COMPUTED FROM THE REQUEST'S OWN FIGURE AND THE MATERIAL'S IS THE PERSON'S.
//
// The stage baseline (27 Oct): a strict analysis skill stopped 20 correct vendor comparisons of 20 because "15 × $24 =
// $360 per month" was read against the price list alone, and the team size 15 was in the request. Pinned: derivation
// reads the request with the material; without the request the same sentence is still a figure not in the material.
import { describe, it, expect } from 'vitest';
import { checkDraft } from '../core/loop/run-repair.js';
import { claimAction } from '../core/loop/claim-extract.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const STD = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
const material = 'PRICE LIST (per month, billed monthly)\nJuno Board: 12 dollars per seat, minimum 25 seats\nCygnus Flow: 17 dollars per seat, minimum 50 seats\nHeronry: 24 dollars per seat, minimum 5 seats\n';
const request = 'Compare these vendors on price for a team of 15 people.';
const memo = 'Heronry costs least for a team of 15, at $360 per month. Juno Board charges for 25 seats, so 25 × $12 = $300 per month.\n';
const strict = { material, listsBecause: claimAction({ level: 'STRICT', cls: null, bound: true }).why, claimAct: 'block' as const };

describe('a strict skill and a figure derived from the request and the material', () => {
  it('with the request in context, the computed costs are derived: nothing fails, the arithmetic is listed', () => {
    const r = checkDraft('s', STD, memo, { ...strict, context: { request } });
    expect(r.failed).toBe(false);
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED')?.result.verdict).toBe('MET');
    const derived = r.checked.find((c) => c.requirementId === 'UNSOURCED·derived');
    expect(derived?.result.detail).toContain('24 × 15');
  });
  it('without the request, the same sentence is a figure not in the material (the operand 15 is nowhere)', () => {
    const r = checkDraft('s', STD, memo, strict);
    expect(r.failed).toBe(true);
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED')?.result.spans.map((sp) => sp.text).join(' ')).toContain('360');
  });
  it('a figure computed from a verified figure is derived too: the rate per person and the gap between vendors', () => {
    // Second order: $300 is 25 × $12 (verified), then $20.00 is $300 ÷ 15, and $60 is $360 − $300; third order: a year of the gap.
    const second = `${memo}Effective rate $20.00 per person ($300 ÷ 15). Heronry is $60 per month cheaper than Juno Board, or $720 across twelve months.\n`;
    const r = checkDraft('s', STD, second, { ...strict, context: { request } });
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED')?.result.spans.map((sp) => sp.text).join(' ') ?? '').not.toMatch(/20\.00|\$60|720/);
    expect(r.failed).toBe(false);
    const derived = r.checked.find((c) => c.requirementId === 'UNSOURCED·derived');
    // every figure of the second-order sentences is on the derived line with an arithmetic to check
    for (const f of ['20.00', '60', '720']) expect(derived?.result.detail).toMatch(new RegExp(`(^|[;:] )${f}: `));
  });
  it('a wrong second-order figure is still a figure not in the material: the closure widens nothing but the chain', () => {
    // $60 is the gap (360 − 300); $63 is no operation on any two of the person's figures, nor a year of one, so $756
    // (63 × 12) has no settled operand either. KNOWN LIMIT, not widened here: $65 would pass as 50 + 15 (a seat minimum
    // plus the team size), one operation over the person's own figures, as derived.ts has always allowed and its header
    // bounds; the closure adds chains from settled figures only, never a new first step.
    const wrong = `${memo}Heronry is $63 per month cheaper than Juno Board, or $756 across twelve months.\n`;
    const r = checkDraft('s', STD, wrong, { ...strict, context: { request } });
    expect(r.failed).toBe(true);
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED')?.result.spans.map((sp) => sp.text).join(' ')).toContain('$63');
  });
  it('an invented figure beside a derived one still stops the work', () => {
    const r = checkDraft('s', STD, `${memo}Cygnus Flow quoted $4,750 for onboarding.\n`, { ...strict, context: { request } });
    expect(r.failed).toBe(true);
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED')?.result.spans.map((sp) => sp.text).join(' ')).toContain('4,750');
  });
});
