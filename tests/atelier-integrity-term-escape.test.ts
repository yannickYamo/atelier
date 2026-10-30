// tests/atelier-integrity-term-escape.test.ts — A TERM A RULE NAMES IS MATCHED AS TEXT, NEVER AS A PATTERN.
//
// On the design-review baseline (27 Oct) a repair step dropped the term "**optional node preparation**"; the meaning
// check built a regex from it, threw "Invalid quantifier", and the draft was delivered unrepaired. Pinned: a term with
// markdown, brackets or a dot neither throws nor matches anything but itself.
import { describe, it, expect } from 'vitest';
import { spanIntegrity } from '../core/loop/integrity.js';

describe('a dropped term with regex metacharacters', () => {
  it('does not throw, and the drop is honoured', () => {
    const a = 'The plan needs **optional node preparation** and perhaps a retry.';
    const b = 'The plan needs a retry.';
    expect(() => spanIntegrity(a, b, new Set(['**optional node preparation**', 'perhaps']), false)).not.toThrow();
    expect(spanIntegrity(a, b, new Set(['**optional node preparation**', 'perhaps']), false).ok).toBe(true);
  });
  it.each(['(see 3.1)', 'v1.2', 'a+b', '[L72]'])('a term "%s" is matched literally', (t) => {
    expect(() => spanIntegrity(`Keep ${t} here, maybe.`, 'Keep it here.', new Set([t, 'maybe']), false)).not.toThrow();
  });
  it('a dot in the term does not match any character', () => {
    // "v1.2" dropped must not license dropping "v102" (a figure), so the figure loss is still reported.
    const r = spanIntegrity('Ship v102 soon, perhaps.', 'Ship soon.', new Set(['v1.2', 'perhaps']), false);
    expect(r.ok).toBe(false);
  });
});
