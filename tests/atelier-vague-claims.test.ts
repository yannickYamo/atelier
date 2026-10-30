// tests/atelier-vague-claims.test.ts — EVIDENCE CLAIMED, NOTHING SHOWN.
//
// An outside review found the invented-claim guard's hole: a draft that says "I checked our logs and most
// failures came from retries" names no figure, no date and no person, and the pattern check passed it,
// and a repair asked to "keep the point" of an invented story wrote exactly that kind of sentence. These
// pin the three fixes: the check flags vague first-hand evidence, the loop deletes a flagged claim in
// code rather than paraphrasing it, and nothing else can keep it.

import { describe, it, expect } from 'vitest';
import { unsourcedClaims } from '../core/loop/claims.js';
import { enforceClaims, CLAIM_SLOT } from '../core/loop/run-repair.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const v = { standardVersionHash: 'h', requirements: [] } as unknown as StandardVersion;

describe('vague first-hand evidence is a claim', () => {
  const vague = [
    'I checked our logs and most failures came from retries.',
    'We looked at the data and the pattern was clear.',
    'When I reviewed the tickets, half of them were duplicates.',
    'I talked to a few customers and they all said the same thing.',
    'We tested this internally and it held up.',
    "I've seen this fail in production more than once.",
    'Our team ran the numbers and the savings were real.',
    'A customer told me last week that it changed how they work.',
    'I asked around, and nobody uses the old flow anymore.',
  ];
  for (const s of vague) it(`flags: ${s}`, () => { expect(unsourcedClaims(s, '')).toHaveLength(1); });

  const notClaims = [
    'In my experience, teams that ship weekly do better.',
    'Most teams skip this step.',
    'Check your logs before you blame the model.',
    'If we look at the data, we should ask what it measures.',
    'We should have tested this earlier, and so should you.',
    "I'd check the logs first.",
    'Teams that measure lead time ship faster.',
    'I think most teams overrate dashboards.',
    'When you review pull requests, read the tests first.',
    'Ask your users what they need.',
  ];
  for (const s of notClaims) it(`leaves alone: ${s}`, () => { expect(unsourcedClaims(s, '')).toEqual([]); });

  it('the person\'s own account, in their material, is theirs to tell', () => {
    const material = 'I checked our logs in May and most failures came from retries against the billing API.';
    expect(unsourcedClaims('I checked our logs and most failures came from retries.', material)).toEqual([]);
  });
});

describe('a flagged claim is deleted in code, never reworded', () => {
  it('cuts every flagged sentence and reports each one', async () => {
    const text = 'Retries hide real failures. I checked our logs and most failures came from retries. Fix the cause.';
    const r = await enforceClaims('d', v, text, { material: '' });
    expect(r.text).toBe('Retries hide real failures. Fix the cause.');
    expect(r.cut).toEqual(['I checked our logs and most failures came from retries.']);
    expect(r.report.checked.find((c) => c.requirementId === 'UNSOURCED')?.result.verdict).toBe('MET');
  });
  it('leaves a slot instead when the person asked for slots', async () => {
    const r = await enforceClaims('d', v, 'We tested this internally and it held up. Ship it.', { material: '', placeholders: true });
    expect(r.text).toBe(`${CLAIM_SLOT} Ship it.`);
  });
  it('does nothing when the person turned the guard off', async () => {
    const text = 'We tested this internally and it held up.';
    expect((await enforceClaims('d', v, text, { guardClaims: false })).text).toBe(text);
  });
});
