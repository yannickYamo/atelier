// A HEADING IS THE FORM, NOT A CLAIM. On the code-review starter's reviews (27 Oct), the claim reader listed the
// section names a method requires ("Must fix", "Suggestions", "Summary") as specifics not shown in the material, and
// the delivered review carried "## Must fix [needs verification: not shown in what you supplied]". A specific that is
// a whole heading and states no figure is left out by code; a heading that states a figure is still read.
import { describe, it, expect } from 'vitest';
import { decideSpecifics, type ExtractedSpecific } from '../core/loop/claim-extract.js';

const text = '## Summary\n\nThe change moves the key.\n\n## Must fix\n\n- src/cache.js:12 drops the model from the key.\n\n## Q3 revenue: 4 million\n\nIt grew.\n';
const sp = (sentence: number, t: string): ExtractedSpecific => ({ sentence, text: t, kind: 'NAMED_FACT', attributed: false, source: 'NONE', support: '' });

describe('a specific that is a whole heading', () => {
  it('states no figure: not a claim; states a figure: still read', () => {
    const r = decideSpecifics(text, [sp(1, 'Summary'), sp(3, 'Must fix'), sp(5, 'Q3 revenue: 4 million')], 'diff --git a/src/cache.js\n+const key = sha(text);', 'Review this change.', false, 'test');
    const texts = r.claims.map((c) => c.text);
    expect(texts.some((t) => /^Summary$|^Must fix$/.test(t.trim()))).toBe(false);
    expect(texts.some((t) => t.includes('4 million'))).toBe(true);
  });
});
