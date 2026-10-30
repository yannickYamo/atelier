// tests/atelier-stated-figure.test.ts — A GUESS IS NEVER PRESENTED AS A FACT.
//
// In a code review over a diff, "One risk: 95% of callers hit the retry path on line 40" is the claim a reader most
// needs to check, and it passed: the pattern check read a figure only beside a finding word ("according to", "we
// measured"). On a kind of work the claim check was not measured on, with material bound, a sentence that states a
// figure the material does not hold is now listed for the person to check, finding word or not. Never cut. A line
// reference, a year, a sentence that is plainly an example or a supposition, and a figure worked from two of the
// material's own are not listed.
import { describe, it, expect } from 'vitest';
import { checkDraft, enforceClaims, listedClaims } from '../core/loop/run-repair.js';
import { unsourcedClaims } from '../core/loop/claims.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const STD = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
const DIFF = `diff --git a/src/client.ts b/src/client.ts
@@ -36,6 +36,10 @@ export async function get(url: string) {
+  for (let attempt = 0; attempt < 3; attempt++) {
+    const res = await fetch(url);
+    if (res.ok) return res;
+  }
`;
const REVIEW = 'the claim check is not measured on code-review';
const RISK = 'One risk: 95% of callers hit the retry path on line 40.';
const listed = (text: string, material = DIFF, why: string | null = REVIEW): string[] => listedClaims(checkDraft('s', STD, text, { material, listsBecause: why }));

describe('a figure stated as fact, on a kind of work the claim check was not measured on', () => {
  it('the pattern check alone does not see it: it has no finding word', () => {
    expect(unsourcedClaims(`The change is correct. ${RISK}`, DIFF)).toEqual([]);
  });
  it('is listed, with or without a finding word, and the run passes', () => {
    const r = checkDraft('s', STD, `The change is correct. ${RISK}`, { material: DIFF, listsBecause: REVIEW });
    expect(listedClaims(r)).toEqual([RISK]);
    expect(r.failed).toBe(false);
    expect(listed('Most requests, about 1,200 a minute, go through this path.')).toEqual(['Most requests, about 1,200 a minute, go through this path.']);
  });
  it('is never cut', async () => {
    const text = `The change is correct. ${RISK}`;
    expect(await enforceClaims('s', STD, text, { material: DIFF, listsBecause: REVIEW })).toMatchObject({ text, cut: [] });
  });
  it('a figure the material holds is not listed', () => {
    expect(listed('The loop tries 3 times before it gives up.')).toEqual([]);
  });
});

describe('what is not a figure stated as fact', () => {
  it('a line reference, however it is written', () => {
    expect(listed('Line 40 adds the loop.')).toEqual([]);
    expect(listed('Lines 40 to 43 add the loop.')).toEqual([]);
    expect(listed('L40 adds the loop.')).toEqual([]);
    expect(listed('The loop at src/client.ts:40 is new.')).toEqual([]);
    expect(listed('See client.ts:12 for the call.')).toEqual([]);
  });
  it('a year', () => {
    expect(listed('The retry wrapper dates from 2019.')).toEqual([]);
  });
  it('an example, a supposition or a hypothesis', () => {
    expect(listed('If 10% of users retry at once, the pool runs dry.')).toEqual([]);
    expect(listed('For example, 50 requests a second would fill the queue.')).toEqual([]);
    expect(listed('Say 5 retries each, and the load grows fivefold.')).toEqual([]);
  });
  it('a product of two figures the material holds; a figure that follows from none is listed', () => {
    const notes = 'Each of the 12 workers retries 4 times.';
    expect(listed('In the worst case that is 48 calls at once.', notes)).toEqual([]);
    expect(listed('In the worst case that is 57 calls at once.', notes)).toEqual(['In the worst case that is 57 calls at once.']);
  });
});

describe('where the claim check was measured, or nothing is bound, nothing changes', () => {
  it('a measured kind of work: the sentence is neither listed nor cut, as before', () => {
    const r = checkDraft('s', STD, `The change is correct. ${RISK}`, { material: DIFF, listsBecause: null });
    expect(listedClaims(r)).toEqual([]);
    expect(r.failed).toBe(false);
  });
  it('no material bound: the figure is not listed', () => {
    expect(listed(RISK, '', 'no material was bound to check against')).toEqual([]);
  });
});
