// tests/atelier-own-corpus.test.ts — A GOLDEN CORPUS PASSES ITS OWN STANDARD, AND A REBUILD CHANGES NOTHING UNASKED.
//
// An outside tester handed Atelier one author's posts and found 13 of 24 of them breaking a REQUIRED rule of the
// standard read from those same posts. Each counted rule had passed its own check on the pieces held out; nothing
// read the rules together, or against the rest of the author's work. Pinned here: which of an author's pieces break
// a counted rule (core/observers/derive.ts), the suggestions read together against them
// (core/ratification/suggest.ts, `suggestAll`), and that a run made as a test is never learned from.
import { describe, it, expect } from 'vitest';
import { piecesBreaking } from '../core/observers/derive.js';
import { suggest, suggestAll, CORPUS_RULE_SHARE, CORPUS_SET_SHARE, type ProposalEvidence } from '../core/ratification/suggest.js';
import { selectContrastPairs } from '../core/compiler/contrast-examples.js';
import { ruleKey, measurementId } from '../core/state/rule-key.js';
import type { InvocationRecord, StandardVersion } from '../core/state/canonical-state.js';
import { aRequirement } from './fixtures.js';

/** A counted rule, strong on the pieces held out (4 of 4), with `breaking` of the author's `pieces` own pieces breaking it. */
const counted = (id: string, breaking: readonly number[], pieces = 24): { p: ReturnType<typeof aRequirement>; e: ProposalEvidence } => ({
  p: aRequirement({ requirementId: id, statement: `Counted rule ${id}.`, measurement: { observer: 'HEDGE_RATE', params: { maxPer1000: 4 } } }),
  e: { framings: [], heldOut: null, needs: null, inSample: { applicable: 4, present: 4, independent: true }, corpus: { pieces, breaking } },
});
const together = (rules: readonly ReturnType<typeof counted>[]) =>
  suggestAll(rules.map((r) => r.p), Object.fromEntries(rules.map((r) => [r.p.requirementId, r.e])), 'GENERATE');

describe('which of the author\'s own pieces break a counted rule', () => {
  it('a piece that does what the rule rules out breaks it; one that does not is left out', () => {
    const rule = { observer: 'LEXICON' as const, params: { terms: ['leverage'] } };
    const clean = 'We use the data. Then we ship it, and we say what happened.';
    const breaks = 'We leverage the data. Then we ship it, and we say what happened.';
    expect(piecesBreaking([clean, breaks, clean, breaks], rule)).toEqual([1, 3]);
    expect(piecesBreaking([clean, clean], rule)).toEqual([]);
  });
});

describe('the suggestions, read together against the author\'s own pieces', () => {
  it('a rule most pieces meet is suggested required; one that 4 of 24 of the author\'s own pieces break is shown instead, and says why', () => {
    const r = together([counted('m1', []), counted('m2', [3, 7, 9, 20])]);
    expect(r.suggestions.map((s) => s.materiality)).toEqual(['REQUIRED', 'PREFERRED']);
    expect(r.suggestions[1].decision).toBe('APPROVE');
    expect(r.suggestions[1].why).toMatch(/4 of your own 24 pieces break it, so it is shown and used to choose between drafts until you make it required$/);
    expect(r.corpus).toEqual({ pieces: 24, passing: 24, moved: ['m2'] });
    expect((24 - 4) / 24).toBeLessThan(CORPUS_RULE_SHARE);
  });
  it('rules that each pass on their own can fail the author together: the ones most pieces break are moved until nine pieces in ten pass', () => {
    // Thirteen rules, each broken by one different piece of 24: every rule holds in 96% of the pieces, and the set in 46%.
    const rules = Array.from({ length: 13 }, (_, i) => counted(`m${i + 1}`, [i]));
    for (const r of rules) expect(suggest(r.p, r.e, 'GENERATE').materiality).toBe('REQUIRED');
    const r = together(rules);
    const required = r.suggestions.filter((s) => s.materiality === 'REQUIRED').length;
    expect(required).toBe(2);
    expect(r.corpus?.passing).toBe(22);
    expect((r.corpus?.passing ?? 0) / 24).toBeGreaterThanOrEqual(CORPUS_SET_SHARE);
    // the rule a second piece also breaks goes first, whatever its place on the screen
    const uneven = together([counted('m1', [0], 40), counted('m2', [1, 2], 40), counted('m3', [3], 40), counted('m4', [4], 40)]);
    expect(uneven.corpus?.moved).toEqual(['m2']);
    expect(uneven.suggestions[1].why).toMatch(/with it, only 35 of your own 40 pieces would meet every required rule/);
    expect(uneven.corpus?.passing).toBe(37);
  });
  it('polarity: a corpus that meets its rules moves nothing, and a session with no count of the corpus is left exactly as it was', () => {
    const clean = [counted('m1', []), counted('m2', [5]), counted('m3', [])];
    const r = together(clean);
    expect(r.suggestions).toEqual(clean.map((x) => suggest(x.p, x.e, 'GENERATE')));
    expect(r.corpus).toEqual({ pieces: 24, passing: 23, moved: [] });
    const old = clean.map((x) => ({ p: x.p, e: { ...x.e, corpus: undefined } }));
    const before = suggestAll(old.map((x) => x.p), Object.fromEntries(old.map((x) => [x.p.requirementId, x.e])), 'GENERATE');
    expect(before.corpus).toBeNull();
    expect(before.suggestions).toEqual(old.map((x) => suggest(x.p, x.e, 'GENERATE')));
  });
  it('only a rule suggested as required is ever moved: a preference, a rejection and a rule only a reading can check are untouched', () => {
    const weak = counted('m1', [1, 2, 3, 4, 5, 6]); const weakE = { ...weak.e, inSample: { applicable: 4, present: 2, independent: true } };
    const read = { p: aRequirement({ requirementId: 'p1', statement: 'I lead with the decision.' }), e: { framings: ['a', 'b'], heldOut: { applicable: 5, present: 5 }, needs: null } };
    const r = suggestAll([weak.p, read.p], { m1: weakE, p1: read.e }, 'GENERATE');
    expect(r.suggestions[0]).toEqual(suggest(weak.p, weakE, 'GENERATE'));
    expect(r.suggestions[1]).toEqual(suggest(read.p, read.e, 'GENERATE'));
    expect(r.corpus?.moved).toEqual([]);
  });
});

describe('a run made as a test is never learned from', () => {
  it('its "write this, not that" pairs are left out, however new; the same run without the mark feeds them', () => {
    const rule = aRequirement({ requirementId: 'x1', kind: 'BOUNDARY', statement: 'Never say leverage.', materiality: 'REQUIRED', measurement: { observer: 'LEXICON', params: { terms: ['leverage=>use'] } } });
    const v = { standardVersionHash: 's', requirements: [rule] } as unknown as StandardVersion;
    const pair = { key: ruleKey(rule), check: measurementId(rule.measurement!), before: 'We leverage A.', after: 'We use A.' };
    const run = (testRun: boolean): InvocationRecord => ({ at: '2026-10-06', input: 'write something', repair: { pairs: [pair] },
      settings: { flags: { drafts: 2, noTaste: false, allowUnsourced: false, placeholders: false, ...(testRun ? { testRun: true } : {}) } } } as unknown as InvocationRecord);
    expect(selectContrastPairs([run(true)], v)).toEqual([]);
    expect(selectContrastPairs([run(false)], v).map((p) => p.before)).toEqual(['We leverage A.']);
  });
});
