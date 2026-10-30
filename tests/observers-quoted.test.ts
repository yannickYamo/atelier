// tests/observers-quoted.test.ts — WHAT A REVIEW QUOTES OF ITS SUBJECT IS NOT ITS OWN STYLE.
//
// The stage baseline (27 Oct): four of eight design reviews were blocked on em dashes and bold inherited from the
// proposal they quoted. Pinned: a style count reads the work less what the subject text also holds, six words or more;
// the reviewer's own dashes still count; nothing else moves.
import { describe, it, expect } from 'vitest';
import { maskQuoted } from '../core/observers/quoted.js';
import { verifyText } from '../core/observers/verify.js';
import { standardHashOf, type StandardVersion } from '../core/state/canonical-state.js';
import { aRequirement } from './fixtures.js';

const proposal = 'The controller — which owns the **optional node preparation** step — retries three times before it gives up on the node.';
const review = `The retry clause is wrong. You write "the controller — which owns the **optional node preparation** step — retries three times" but nothing bounds the backoff.`;

describe('maskQuoted', () => {
  it('blanks the quoted stretch, keeps every offset, and leaves the reviewer\'s words', () => {
    const m = maskQuoted(review, proposal);
    expect(m.length).toBe(review.length);
    expect(m).not.toContain('—');
    expect(m).not.toContain('**');
    expect(m.startsWith('The retry clause is wrong.')).toBe(true);
    expect(m).toContain('but nothing bounds the backoff.');
  });
  it('a reviewer\'s own dash outside the quotation stays', () => {
    const m = maskQuoted(`${review} My view — keep it simple.`, proposal);
    expect((m.match(/—/g) ?? []).length).toBe(1);
  });
  it('a short shared phrase (under six words) is not masked, and a text with no subject is untouched', () => {
    expect(maskQuoted('the controller retries', proposal)).toBe('the controller retries');
    expect(maskQuoted(review, '')).toBe(review);
  });
});

describe('verifyText with the subject in context', () => {
  const dash = aRequirement({ requirementId: 'c1', statement: 'No em dashes.', materiality: 'REQUIRED', provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED',
    measurement: { observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: 0, anyLength: 1 } } });
  const bold = aRequirement({ requirementId: 'c5', statement: 'No bold.', materiality: 'REQUIRED', provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED',
    measurement: { observer: 'PATTERN_RATE', params: { pattern: ['BOLD_SPAN'], maxPer1000: 0, anyLength: 1 } } });
  const body = { evidenceId: null, workType: 'review', requirements: [dash, bold] };
  const v = { standardVersionHash: standardHashOf(body), ...body, authorityState: 'RATIFIED', mintedAt: '2026-10-01T00:00:00.000Z', supersedes: null, reason: null } as unknown as StandardVersion;
  const verdicts = (ctx?: { worksOn: string }) => Object.fromEntries(verifyText('r', v, review, ctx).checked.map((c) => [c.requirementId, c.result.verdict]));
  it('without the subject, the quoted dashes and bold fail the review', () => {
    expect(verdicts()).toEqual({ c1: 'VIOLATED', c5: 'VIOLATED' });
  });
  it('with the subject bound as what the run works on, the review holds both rules', () => {
    expect(verdicts({ worksOn: proposal })).toEqual({ c1: 'MET', c5: 'MET' });
  });
  it('a dash the reviewer wrote still fails', () => {
    const r = verifyText('r', v, `${review} My view — keep it simple.`, { worksOn: proposal });
    expect(r.checked.find((c) => c.requirementId === 'c1')?.result.verdict).toBe('VIOLATED');
  });
});
