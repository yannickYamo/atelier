// tests/atelier-run-record.test.ts — WHAT `atelier run` SAYS UNDER THE WORK, AND WHAT THE RUN IS HELD TO.
// (What a result means is pinned in tests/atelier-invariants.test.ts; this is how it is said, and two readers.)
import { describe, it, expect } from 'vitest';
import { buildRecord } from '../core/eval/record-build.js';
import { renderRunCard } from '../core/eval/run-card.js';
import { propositionOf } from '../core/eval/observes.js';
import { statedBounds, statedLength } from '../core/intake/length.js';
import type { Requirement, StandardVersion } from '../core/state/canonical-state.js';
import { aRequirement } from './fixtures.js';

const rule = (id: string, statement: string, measurement: Requirement['measurement'], o: Partial<Requirement> = {}): Requirement =>
  aRequirement({ requirementId: id, statement, provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', materiality: 'REQUIRED', obligation: 'DELIVERABLE', ...(measurement ? { measurement } : {}), ...o });
const card = (r: ReturnType<typeof buildRecord>, done: string[] = []): string => renderRunCard({ record: r, costUsd: 0.35, seconds: 52, drafts: 1, done, invocationId: 'i9' }, 100).join('\n');

describe('the card, layer by layer', () => {
  const reqs = [
    rule('x1', 'Open with a Parties section that names both parties exactly as the term sheet does.', { observer: 'PRESENCE', params: { sections: ['Parties'], body: 1, opens: 1 } }),
    rule('x7', 'Between 220 and 420 words.', { observer: 'LENGTH', params: { unit: ['words'], min: 220, max: 420 } }),
    aRequirement({ requirementId: 'x8', statement: 'Take every name from the term sheet.', obligation: 'JUDGEMENT', provenance: 'EXPERT_STATED' }),
  ];
  const checked = [{ id: 'x1', required: true, verdict: 'MET' as const, detail: 'everything it must contain is there' }, { id: 'x7', required: true, verdict: 'VIOLATED' as const, detail: '439 words (220 to 420): long by 19' }];
  it('a blocked run: the failure whole, the part-read rule with both halves, the judgement left to the owner, and one next step', () => {
    const out = card(buildRecord({ requirements: reqs, checked, waived: new Map(), request: null, claims: null, copying: null }));
    expect(out).toContain('── Evaluation · BLOCKED ');
    expect(out).toContain('Not usable as it stands: 1 requirement seen to fail. 0 of 3 verified, 2 left for you.');
    expect(out).toContain('    ✗  Between 220 and 420 words.\n         found: 439 words (220 to 420): long by 19');
    expect(out).toContain('    ~  Open with a Parties section that names both parties exactly as the term sheet does.\n         checked, and held: a "Parties" section, with something in it, opening the work\n         not checked, yours to read: names both parties exactly as the term sheet does');
    expect(out).toContain('    ?  Take every name from the term sheet.\n       (no check reads the rule marked ? with nothing under it: it is yours to judge)');
    expect(out.replace(/\s+/g, ' ')).toContain('Next: run it again. If the evaluation is wrong about your work: atelier fix "<what was wrong>" --check');
    expect(out).not.toMatch(/atelier rate/);
  });
  it('what the request set is its own layer, and a miss of it says to run again or ask for something else', () => {
    const out = card(buildRecord({ requirements: [], checked: [], waived: new Map(), request: { asked: '400 words', met: false, detail: '187 words written, short of it' }, claims: null, copying: null }));
    expect(out).toContain('  This request\n    ✗  The length the request asks for: 400 words\n         found: 187 words written, short of it');
    expect(out).toContain('Next: run it again, or change what the request asks for.');
  });
  it('a run with nothing failed and something unread asks the owner to read it, then to rate it', () => {
    const out = card(buildRecord({ requirements: reqs, checked: [checked[0], { ...checked[1], verdict: 'MET', detail: '400 words' }], waived: new Map(), request: null, claims: null, copying: null }), ['written again once, and it now holds what was missing']);
    expect(out).toContain('── Evaluation · NEEDS REVIEW ');
    expect(out).toContain('Nothing was seen to fail. 1 of 3 verified; 2 left for you to read.');
    expect(out).toContain('    ✓  Between 220 and 420 words.\n         400 words');
    expect(out).toContain('What was done: written again once, and it now holds what was missing');
    expect(out).toContain('Next: read what is marked ~ and ?. You would use it: atelier rate i9 yes');
    expect(out).toContain('Not right: atelier fix "<what was wrong>" writes this piece again');
  });
  it('a rule set aside for the run is shown as not checked, with why, and is the owner\'s to look at', () => {
    const r = buildRecord({ requirements: [reqs[1]], checked: [], waived: new Map([['x7', 'the request states its own length (600 words)']]), request: null, claims: null, copying: null });
    expect(r.state).toBe('NEEDS_REVIEW');
    expect(card(r)).toContain('    –  Between 220 and 420 words.\n         not checked on this run: the request states its own length (600 words)');
  });
  it('habits are counted under the layers, and the ones not kept are named', () => {
    const habit = aRequirement({ requirementId: 'h1', statement: 'Paragraphs of at most 4 sentences.', materiality: 'PREFERRED', wordedFromCheck: true, measurement: { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 4 } } });
    const out = card(buildRecord({ requirements: [habit], checked: [{ id: 'h1', required: false, verdict: 'VIOLATED', detail: 'a paragraph of 6 sentences' }], waived: new Map(), request: null, claims: null, copying: null }));
    expect(out).toContain('From your examples (not required): 0 of 1 habits kept\n         not kept: Paragraphs of at most 4 sentences. (a paragraph of 6 sentences)');
    expect(out).toContain('── Evaluation · VERIFIED ');
  });
});

describe('what a check reads, said plainly', () => {
  it('sections, where they stand, and what one starts with', () => {
    expect(propositionOf({ observer: 'PRESENCE', params: { sections: ['Verdict'], body: 1, closes: 1, options: ['Approve', 'Comment'] } })).toBe('a "Verdict" section, with something in it, ending the work, starting with one of "Approve", "Comment" on a line of its own');
    expect(propositionOf({ observer: 'PRESENCE', params: { sections: ['A', 'B'], body: 1 } })).toBe('the sections "A", "B", in that order, with something in it');
    expect(propositionOf({ observer: 'TABLE', params: { columns: ['vendor', 'price'], minRows: 1 } })).toBe('a table with the columns vendor, price');
    // a check this version does not know never stops a record being built
    expect(propositionOf({ observer: 'FROM_A_LATER_VERSION', params: {} } as never)).toBe('a check this version does not know (FROM_A_LATER_VERSION)');
  });
});

describe('what the run does with a draft, in plain words', () => {
  it('the engine\'s sentence about one more draft is said without its ids', async () => {
    const { doneOf } = await import('../cli/commands/run.js');
    expect(doneOf({ report: ['Written again: the first draft left out 2 thing(s) the method requires (x1: "a"; x2: "b"); it now leaves out 0.'], cut: [] })).toEqual(['written again once, and it now holds what was missing']);
    expect(doneOf({ report: ['Written again: the first draft left out 2 thing(s) the method requires (x1: "a"); it now leaves out 1 (x1: "a").'], cut: ['s'] })).toEqual(['written again once for what was missing; 1 thing is still missing', '1 sentence removed (not found in your material)']);
    expect(doneOf({ report: ['The draft leaves out 1 thing(s) the method requires (x1: "a"); one more draft did not do better, so the first is kept.'] })).toEqual(['one more draft was tried and was no better, so the first was kept']);
    expect(doneOf({ report: ['Length asked: 400 words.'] })).toEqual([]);
  });
});

describe('a lifted passage is shown, not only counted', () => {
  it('the words of the longest shared run come back when asked for, and the count is the same either way', async () => {
    const { overlapIndex } = await import('../core/observers/overlap.js');
    const piece = 'The receiving party shall hold the confidential information in strict confidence and use it only for the purpose.';
    const text = 'Each side agrees that the receiving party shall hold the confidential information in strict confidence at all times.';
    const plain = overlapIndex([piece])(text); const shown = overlapIndex([piece], [], { words: true })(text);
    expect(plain).toEqual({ shared6: plain.shared6, longestShared: 11 });
    expect(shown).toEqual({ ...plain, longestWords: 'the receiving party shall hold the confidential information in strict confidence' });
  });
  it('and the card carries them, with the most a run may share', () => {
    const r = buildRecord({ requirements: [], checked: [], waived: new Map(), request: null, claims: null, copying: { longest: 14, limit: 12, tellable: true, words: 'the receiving party shall hold' } });
    expect(r.entries[0].observation.evidence).toBe('a run of 14 words is shared with one of them (11 at most): "the receiving party shall hold"');
  });
});

describe('a mistake in what the person gave never stops the work', () => {
  it('a rule their own examples dispute is shown with what was found, not enforced, and said plainly either way', () => {
    const disputed = rule('x3', 'Include a table with the columns Type and Rationale.', { observer: 'TABLE', params: { columns: ['type', 'rationale'], minRows: 1 } }, { materiality: null, contested: 'your example does not do this (the table lacks the column(s) "type")' });
    for (const verdict of ['MET', 'VIOLATED'] as const) {
      const r = buildRecord({ requirements: [disputed], checked: [{ id: 'x3', required: false, verdict, detail: 'a table with 2 of 2 column(s)' }], waived: new Map(), request: null, claims: null, copying: null });
      expect(r.state).toBe('NEEDS_REVIEW');
      expect(card(r).replace(/\s+/g, ' ')).toContain('checked, and not enforced: a table with 2 of 2 column(s). Your own examples do not do this, so the rule blocks nothing until you confirm it');
    }
  });
  it('a comment at the top of a method note is not what the work is called', async () => {
    const { kindOfWork } = await import('../cli/commands/method.js');
    expect(kindOfWork('<!-- QUICK_MODE\nfocus: x\n-->\n\n# Competitive teardown\n\n1. Classify the competitor.', 'td', undefined)).toBe('competitive-teardown');
  });
});

describe('one length at a time', () => {
  it('where the owner requires a length of the whole work, the span of their pieces adds no second one', async () => {
    const { lengthIsRuled, ownLengthApplies } = await import('../cli/commands/invoke.js');
    const std = (rs: Requirement[]): StandardVersion => ({ requirements: rs }) as unknown as StandardVersion;
    const whole = rule('x7', 'Between 220 and 420 words.', { observer: 'LENGTH', params: { unit: ['words'], min: 220, max: 420 } });
    expect(lengthIsRuled(std([whole]))).toBe(true);
    // a section's length, a limit in characters, and a length the owner did not make required rule nothing of the whole
    expect(lengthIsRuled(std([rule('s', 'The Summary section is under 80 words.', { observer: 'LENGTH', params: { unit: ['words'], in: ['Summary'], max: 79 } })]))).toBe(false);
    expect(lengthIsRuled(std([rule('c', 'Under 280 characters.', { observer: 'LENGTH', params: { unit: ['characters'], max: 279 } })]))).toBe(false);
    expect(lengthIsRuled(std([{ ...whole, materiality: 'PREFERRED' }]))).toBe(false);
    const no = { stated: false, asked: false, shape: false, contract: false, answers: false, outOfRegister: false, sections: false };
    expect(ownLengthApplies(no)).toBe(true);
    expect(ownLengthApplies({ ...no, ruled: true })).toBe(false);
  });
  it('the ends a stated length allows: a target within a tenth, a range and a limit as written', () => {
    const [lo, hi] = statedBounds(statedLength('about 400 words')!);
    expect(lo).toBeCloseTo(360); expect(hi).toBeCloseTo(440);
    expect(statedBounds(statedLength('at most 300 words')!)).toEqual([null, 300]);
  });
});
