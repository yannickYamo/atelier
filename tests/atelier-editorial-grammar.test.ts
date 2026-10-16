// tests/atelier-editorial-grammar.test.ts — WHAT THE PERSON SEES WHEN GRAMMAR IS ONLY EDITORIAL.
//
// "Standard: VERIFIED. Editorial check: unavailable." The run's state is the person's standard; the editorial grammar
// check every build carries is said on its own line and never counted among the requirements read in full.
import { describe, it, expect } from 'vitest';
import { buildRecord } from '../core/eval/record-build.js';
import { renderRunCard, stateLine } from '../core/eval/run-card.js';
import { GRAMMAR_NOT_RUN, GRAMMAR_LISTED } from '../core/observers/grammar.js';
import { aRequirement } from './fixtures.js';

const rule = aRequirement({ requirementId: 'x1', statement: 'Between 100 and 400 words.', provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', materiality: 'REQUIRED', obligation: 'DELIVERABLE', measurement: { observer: 'LENGTH', params: { unit: ['words'], min: 100, max: 400 } } });
const grammar = aRequirement({ requirementId: 'g1', statement: 'No mechanical errors: spelling, agreement, punctuation.', authority: 'EXPERT_RATIFIED', materiality: 'REQUIRED', obligation: 'DELIVERABLE', measurement: { observer: 'GRAMMAR', params: {} } });
const record = (detail: string) => buildRecord({ requirements: [rule, grammar], checked: [{ id: 'x1', required: true, verdict: 'MET', detail: '250 words' }, { id: 'g1', required: true, verdict: 'NOT_APPLICABLE', detail }],
  waived: new Map(), request: null, claims: null, copying: null });

describe('the editorial check beside a verified standard', () => {
  it('unavailable: the standard is verified, and the card says grammar was not checked', () => {
    const r = record(`${GRAMMAR_NOT_RUN}: could not load: no wasm here`);
    expect(r.state).toBe('VERIFIED');
    expect(stateLine(r)).toBe('Every requirement was read in full and held (1 of 1).');
    const card = renderRunCard({ record: r, costUsd: 0.1, seconds: 3, drafts: 1, done: [], invocationId: 'i1' }).join('\n');
    expect(card).toContain('── Evaluation · VERIFIED');
    expect(card).toMatch(/·  No mechanical errors[^\n]*\n\s+grammar not checked: could not load: no wasm here/);
  });
  it('possible slips listed: verified, with each slip shown, never counted as held', () => {
    const r = record(`${GRAMMAR_LISTED}: 1 possible slip: "are" (subject–verb agreement)`);
    expect(r.state).toBe('VERIFIED');
    expect(r.entries.find((e) => e.id === 'g1')?.result).not.toBe('PASS');
    expect(renderRunCard({ record: r, costUsd: 0.1, seconds: 3, drafts: 1, done: [], invocationId: 'i1' }).join('\n')).toContain('1 possible slip: "are"');
  });
});
