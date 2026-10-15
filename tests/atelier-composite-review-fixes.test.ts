// tests/atelier-composite-review-fixes.test.ts — DEFECTS A REVIEWER REPRODUCED, EACH HELD HERE.
//
// Each case below failed before its fix, on the reviewer's own inputs or the same shape of input:
//   plainly opposed worded traits read as unrelated, so both sides instructed;
//   the side the person chose in a conflict (--conflict n=A) did not instruct;
//   "above all, the openings" selected every class in the keyword reading;
//   a REQUIRED rule nobody confirmed showed its check with no reason it blocked nothing;
//   GFM tables with no leading pipe, and tables in a blockquote, lost their dash cells;
//   a tab-indented sub-bullet was read as a finding of its own;
//   a composite carried one length over all its writers, and its pieces' front matter;
//   the run card's counts did not add up, "a new piece stays between 0 and 5", "3 hashtags (at most 0): long by 3",
//   "not checked, yours to read: Write" under "Write between 120 and 400 words.", and the fitted-limit wording.
import { describe, it, expect } from 'vitest';
import { relationOf, plainlyOpposed, buildTraitTable, describeTraitCounts } from '../core/composite/traits.js';
import { keywordClasses } from '../core/composite/admire.js';
import { composeSelection } from '../core/composite/selection.js';
import { decisionsFor } from '../cli/commands/composite.js';
import { withoutFrontMatter } from '../core/composite/authors.js';
import { compositeLength } from '../core/compiler/voice.js';
import { buildRecord } from '../core/eval/record-build.js';
import { renderRunCard } from '../core/eval/run-card.js';
import { observesOf } from '../core/eval/observes.js';
import { planFor, describePlan } from '../core/plan/execution-plan.js';
import { replaceEmDashes } from '../core/loop/mechanical-repair.js';
import { findingsOf } from '../core/observers/obligations.js';
import { shapeBandRules } from '../core/observers/short-form.js';
import { SHAPE } from '../core/observers/shape.js';
import { suggest } from '../core/ratification/suggest.js';
import type { Requirement } from '../core/state/canonical-state.js';
import { aRequirement } from './fixtures.js';

const worded = (statement: string): Pick<Requirement, 'statement' | 'measurement' | 'kind'> => ({ statement, kind: 'GENERATIVE' });
const ALL = ['opening', 'structure', 'evidence', 'pace', 'voice', 'method'] as const;

describe('plainly opposed worded traits are a conflict', () => {
  const opposed: [string, string][] = [
    ['Use contractions throughout, in a chatty register.', 'Never use contractions; keep a formal, precise register.'],
    ['Use headings to break up long pieces.', 'Avoid headings; let the prose carry the structure.'],
    ['Keep paragraphs short.', 'Let paragraphs run long when the argument needs room.'],
    ['Use British spelling.', 'Use American spelling.'],
  ];
  for (const [a, b] of opposed) it(`${a} / ${b}`, () => { expect(relationOf(worded(a), worded(b))).toBe('CONFLICT'); expect(relationOf(worded(b), worded(a))).toBe('CONFLICT'); });
  it('and things that are not opposed stay apart', () => {
    expect(plainlyOpposed('Use short sentences.', 'Keep paragraphs short.')).toBe(false);
    expect(plainlyOpposed('Open with a question.', 'Close with a question.')).toBe(false);
    expect(plainlyOpposed('Use British spelling.', 'Cite sources inline.')).toBe(false);
    expect(relationOf(worded('Use contractions freely.'), worded('Contractions are fine throughout.'))).not.toBe('CONFLICT');
  });
});

describe('the keyword reading of what is liked', () => {
  it('"above all" names one class; only "everything" or "all of it" takes every class', () => {
    expect(keywordClasses('above all, the openings', ALL)).toEqual(['opening']);
    expect(keywordClasses('most of all how it opens', ALL)).toEqual(['opening']);
    expect(keywordClasses('everything', ALL)).toEqual([...ALL]);
    expect(keywordClasses('all of it', ALL)).toEqual([...ALL]);
  });
});

describe('the side chosen in a conflict instructs', () => {
  const ps = [aRequirement({ requirementId: 'p1', statement: 'Use contractions throughout, in a chatty register.' }), aRequirement({ requirementId: 'p2', statement: 'Never use contractions; keep a formal, precise register.' })];
  const source: Record<string, string> = { p1: 'Ada', p2: 'Dee' };
  const table = buildTraitTable(ps, (id) => source[id]);
  const authors = [{ name: 'Ada', pieces: ['ada.md'], admired: null, classes: [] }, { name: 'Dee', pieces: ['dee.md'], admired: null, classes: [] }];
  it('is one conflict, said once in the counts', () => {
    expect(table.conflicts.length).toBe(1);
    expect(describeTraitCounts(table)).toBe('2 rule(s) read, each author on their own: 0 shared, 0 unique to one author, 2 in conflict between authors');
  });
  it('--conflict 1=B: the chosen side is ratified REQUIRED, as the owner\'s word; the other is rejected', () => {
    const record = composeSelection(table, ps, authors, { 1: 'B' });
    const ds = decisionsFor(record, ps, new Map(), new Map());
    expect(ds.find((d) => d.id === 'p2')).toMatchObject({ decision: 'APPROVE', materiality: 'REQUIRED' });
    expect(ds.find((d) => d.id === 'p1')?.decision).toBe('REJECT');
  });
});

describe('a REQUIRED rule nobody confirmed says why it blocks nothing', () => {
  const u = aRequirement({ requirementId: 'u1', statement: 'Never use the word "excited".', authority: 'DERIVED_UNRATIFIED', materiality: 'REQUIRED', measurement: { observer: 'LEXICON', params: { terms: ['excited'] } } });
  it('in the record, and in the plan; and it is still not enforced', () => {
    const plan = planFor({ requirements: [u] });
    expect(plan.rules[0].enforced).toBe(false);
    expect(describePlan(plan)[0]).toContain('does not block: nobody has confirmed it yet');
    const rec = buildRecord({ requirements: [u], checked: [{ id: 'u1', required: false, verdict: 'VIOLATED', detail: '1 use(s): excited' }], waived: new Map(), request: null, claims: null, copying: null });
    const e = rec.entries.find((x) => x.id === 'u1')!;
    expect(e.observation.evidence).toBe('1 use(s): excited. Nobody has confirmed this rule yet, so it blocks nothing');
    expect(rec.state).not.toBe('BLOCKED');
  });
});

describe('dash cells in every kind of table stay dash cells', () => {
  it('a GFM table with no leading pipe', () => {
    expect(replaceEmDashes('Feature | Us | Them\n--- | --- | ---\nSSO | yes | —\nAudit log | — | partial — beta'))
      .toBe('Feature | Us | Them\n--- | --- | ---\nSSO | yes | -\nAudit log | - | partial - beta');
  });
  it('a table inside a blockquote', () => {
    expect(replaceEmDashes('> | Quote | — |\n> |---|---|\n> | row | a — b |')).toBe('> | Quote | - |\n> |---|---|\n> | row | a - b |');
  });
  it('prose after a table is still prose', () => {
    expect(replaceEmDashes('| a | b |\n|---|---|\n| x | — |\n\nAn aside — like this — here.')).toBe('| a | b |\n|---|---|\n| x | - |\n\nAn aside, like this, here.');
  });
});

describe('a tab-indented sub-bullet carries on its finding', () => {
  it('is one finding, not two', () => {
    expect(findingsOf('## Findings\n\n- Overflow possible when x is large in the loop.\n\t- see src/a.ts:2 for where it is added\n').length).toBe(1);
  });
});

describe('a composite\'s served pieces and length', () => {
  it('front matter is stripped, and a piece without any is unchanged', () => {
    expect(withoutFrontMatter('---\nauthor: Ada\ntopic: x\n---\nWhy now?\n')).toBe('Why now?\n');
    expect(withoutFrontMatter('Why now?\n\n---\n\nThen.\n')).toBe('Why now?\n\n---\n\nThen.\n');
  });
  const words = (n: number): string => Array.from({ length: n }, () => 'word').join(' ');
  it('the chosen writers\' range, or none when they write pieces of different lengths', () => {
    expect(compositeLength([[words(300)], [words(500)]])).toEqual([300, 500]);
    expect(compositeLength([[words(120)], [words(2400)]])).toBeNull();
  });
});

describe('what the screens and cards say', () => {
  it('the run card\'s counts add up, with a set-aside check said apart', () => {
    const reqs = [aRequirement({ requirementId: 'x7', statement: 'Between 220 and 420 words.', provenance: 'EXPERT_STATED', authority: 'EXPERT_AUTHORED', materiality: 'REQUIRED', obligation: 'DELIVERABLE', measurement: { observer: 'LENGTH', params: { unit: ['words'], min: 220, max: 420 } } }),
      aRequirement({ requirementId: 'x8', statement: 'Take every name from the term sheet.', obligation: 'JUDGEMENT', provenance: 'EXPERT_STATED' })];
    const r = buildRecord({ requirements: reqs, checked: [{ id: 'x7', required: true, verdict: 'MET', detail: '400 words' }], waived: new Map(), request: null,
      claims: { state: 'off', bound: false, qualified: false, why: null, delivered: 0, open: 0, cut: 0 }, copying: null });
    const out = renderRunCard({ record: r, costUsd: 0, seconds: 1, drafts: 1, done: [], invocationId: 'i' }, 100).join('\n');
    expect(out).toContain('Nothing was seen to fail. 1 of 2 verified; 1 left for you to read; 1 set aside for this run.');
  });
  it('a band with no floor is said as a ceiling', () => {
    const pieces = ['One. Two. Three.', 'One.', 'One. Two.', 'One. Two. Three.', 'One. Two.'];
    const said = shapeBandRules(pieces).map((r) => r.statement).join('\n');
    expect(said).not.toMatch(/stays between 0 and/);
  });
  it('a ceiling of none is said as none', () => {
    const r = SHAPE.observe('Ship it #now #today #launch', { shape: ['hashtags'], max: 0 });
    expect(r.detail).toBe('no hashtags; this has 3');
  });
  it('"Write between 120 and 400 words." is read in full by a length check', () => {
    expect(observesOf('Write between 120 and 400 words.', { observer: 'LENGTH', params: { unit: ['words'], min: 120, max: 400 } }, false)?.coverage).toBe('FULL');
  });
  it('the fitted-limit wording is a sentence', () => {
    const p = aRequirement({ requirementId: 'r1', statement: 'Paragraphs of at most 4 sentences.', measurement: { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: 4 } } });
    const why = suggest(p, { framings: [], alsoPhrasedAs: [], heldOut: null, needs: null, inSample: { applicable: 4, present: 4, independent: true, fitted: true }, corpus: { pieces: 4, breaking: [0] } } as never, 'GENERATE').why;
    expect(why).toContain('4 of 4 held-out pieces meet the limit as it stood before it was moved to where your pieces are; checked on every output');
  });
});
