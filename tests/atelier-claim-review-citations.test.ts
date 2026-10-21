// A REVIEW'S FINDING IS NOT A RESULT SEEN (core/loop/answer-claims.ts). "**orders.py:42** — the status is written
// straight onto the column" carries "written" and a number, and was read as a figure of progress ("1.1M rows written")
// on nine of twenty reviews in every arm of a study, blocking each on the grounding gate. The number is the line the
// finding cites; a line reference is not a figure, and a line inside a hunk the material shows is known.
import { describe, it, expect } from 'vitest';
import { answerWorkClaims, hunkLines } from '../core/loop/answer-claims.js';

const DIFF = 'diff --git a/src/webhooks/orders.py b/src/webhooks/orders.py\n--- a/src/webhooks/orders.py\n+++ b/src/webhooks/orders.py\n@@ -18,0 +18,28 @@\n+import json\n+def order_webhook():\n+    payload = json.loads(request.get_data(as_text=True))\n+    order.status = status\n';
const known = `Review this change.\n\n${DIFF}`;

describe('a cited line is not a figure of result', () => {
  it('the hunk header says which lines the material shows', () => {
    expect(hunkLines(DIFF)).toEqual(Array.from({ length: 28 }, (_, i) => String(18 + i)));
    expect(hunkLines('@@ -3 +7 @@\n')).toEqual(['7']);
    expect(hunkLines('nothing here')).toEqual([]);
  });
  it('a finding that cites a line and says what the code does is no claim of work done; a real result claim still is', () => {
    const finding = '**src/webhooks/orders.py:42** — The status is written straight onto the column with no check.';
    expect(answerWorkClaims(finding, known, [])).toEqual([]);
    // a line outside any hunk, cited as a reference, is still a reference and not a result
    expect(answerWorkClaims('**src/webhooks/orders.py:9** — The import is written twice.', known, [])).toEqual([]);
    // a figure of progress with a result word is the claim the check exists for
    const result = 'The backfill left 1.1M of 2.4M rows written and the rest remaining.';
    expect(answerWorkClaims(result, known, []).map((c) => c.why)).toEqual(['a claim of work done or a result seen, which the request did not report']);
    // and work done in so many words
    expect(answerWorkClaims('I ran the migration and the tests pass.', known, []).length).toBe(1);
    // a number inside a name is not a figure either
    expect(answerWorkClaims('The sha256 digest is written to the row.', known, [])).toEqual([]);
  });
});
