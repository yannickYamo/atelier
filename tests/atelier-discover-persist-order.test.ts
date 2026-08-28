// A PAID RESULT IS WRITTEN BEFORE ANY STEP THAT MAY REFUSE.
//
// Discovery saved its proposals AFTER an optional methodology check. That check's own catch says
// "a failed methodology check must not cost the taste run that already succeeded and was paid for"
// — and the `readJson` that threw sat one line ABOVE the try. So the single failure it was written
// to prevent is the one that happened: a stale `skill-package.json` left in the GLOBAL store by an
// unrelated smoke test killed a fresh run after two vantage reads and 39 held-out checks, and
// discarded all 13 proposals.
//
// Source-level, because the defect is an ORDERING and a try boundary. A behavioural test would need
// a live provider to reach the line at all, which is why nothing caught it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../cli/commands/discover.ts', import.meta.url), 'utf8');

describe('discovery persists what was paid for before anything optional runs', () => {
  it('saveSession comes BEFORE the methodology block, not after', () => {
    const save = src.indexOf('saveSession(');
    const method = src.indexOf("existsSync(pkgPath)");
    expect(save).toBeGreaterThan(-1);
    expect(method).toBeGreaterThan(-1);
    expect(save, 'proposals must be written before the optional methodology check').toBeLessThan(method);
  });

  it('and saveSession is called exactly once, so no path can skip it', () => {
    // Two call sites would let a future edit persist on one branch and not the other.
    expect(src.match(/saveSession\(\{ \.\.\.s, run:/g) ?? []).toHaveLength(1);
  });

  it('the source-package read is INSIDE the try that exists to tolerate its failure', () => {
    const block = src.slice(src.indexOf("existsSync(pkgPath)"));
    const tryAt = block.indexOf('try {');
    const readAt = block.indexOf("readJson<{ absRoot");
    expect(readAt).toBeGreaterThan(-1);
    expect(tryAt).toBeGreaterThan(-1);
    expect(readAt, 'a malformed package must be caught, not thrown past the guard').toBeGreaterThan(tryAt);
  });

  it('the catch reports and continues rather than ending the command', () => {
    const block = src.slice(src.indexOf("existsSync(pkgPath)"));
    const katch = block.slice(block.indexOf('} catch'), block.indexOf('} catch') + 600);
    expect(katch).toMatch(/console\.log/);
    // `die` here would reintroduce the exact defect under a different spelling.
    expect(katch).not.toMatch(/\bdie\(/);
  });
});

describe('a missing observation never becomes a negative observation', () => {
  const src = readFileSync(new URL('../core/discovery/run-chain.ts', import.meta.url), 'utf8');

  it('refuses an unusable answer instead of defaulting it to "not applicable"', () => {
    // The read was `j?.applicable === true`, which is indistinguishable from a confident NO when
    // the object never arrived — and GoldenObservation has only two booleans, so there is no
    // "unobserved" to fall back to. Truncation therefore became evidence AGAINST a rule.
    expect(src).not.toMatch(/applicable: j\?\.applicable === true/);
    expect(src).toMatch(/typeof j\?\.applicable !== 'boolean'/);
  });

  it('bounds the only unbounded field at the schema rather than hoping the model is brief', () => {
    expect(src).toMatch(/why: \{ type: 'string', maxLength: \d+ \}/);
  });

  it('and gives the observer a budget with real headroom over that bound', () => {
    // 500 truncated in practice; the failure was silent because of the read above.
    const m = /schema: OBSERVER_SCHEMA, maxTokens: (\d+)/.exec(src);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(1500);
  });
});
