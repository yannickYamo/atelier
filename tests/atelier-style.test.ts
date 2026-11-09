// tests/atelier-style.test.ts — HOW THE AUTHOR WRITES, READ ON THE PIECE (core/direct/style.ts).
//
// The habits the build reads from the author's pieces had no reader on the default run, and the method's steps no check
// counts were "yours to judge" on every run. One reading after the draft now reads both: report only by default, and
// with --style-review what the draft does not hold reaches the self-review. Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { STYLE_READ, styleItems, styleNote, styleLines, STYLE_ITEMS_MAX, STYLE_HABITS_MAX } from '../core/direct/style.js';
import { rulesLines } from '../cli/direct.js';
import type { Entry } from '../core/eval/record.js';

const habits = [
  { description: 'Pairs a claim with its contrast.', frequency: 'ALWAYS', quote: 'The form is there. The fit is not.' },
  { description: 'Uses humour.', frequency: 'SOMETIMES', quote: 'A joke.' },
  { description: 'Closes on a plain sentence.', frequency: 'OFTEN', quote: 'That is the whole trade.' },
  { description: 'No quote of theirs.', frequency: 'ALWAYS', quote: '' },
  { description: 'Counted and standing.', frequency: 'SOMETIMES', quote: 'Counted.', kind: 'standing' },
  { description: 'Counted and occasional.', frequency: 'ALWAYS', quote: 'Rare.', kind: 'occasional' },
];

describe('what is read', () => {
  it('habits shown always or often (a counted habit by its count), each with their sentence; then the steps no check reads', () => {
    const items = styleItems(habits, ['End on the idea, never an ask.']);
    expect(items).toEqual([
      { id: 'h1', kind: 'habit', text: 'Pairs a claim with its contrast.', theirs: 'The form is there. The fit is not.' },
      { id: 'h2', kind: 'habit', text: 'Closes on a plain sentence.', theirs: 'That is the whole trade.' },
      { id: 'h3', kind: 'habit', text: 'Counted and standing.', theirs: 'Counted.' },
      { id: 's1', kind: 'step', text: 'End on the idea, never an ask.' },
    ]);
    const many = Array.from({ length: 30 }, (_, i) => ({ description: `H${i}`, frequency: 'ALWAYS', quote: 'q' }));
    expect(styleItems(many, []).length).toBe(STYLE_ITEMS_MAX);
    // a long persona never crowds out the author's steps
    const both = styleItems(many, Array.from({ length: 8 }, (_, i) => `Step ${i}.`));
    expect([both.filter((x) => x.kind === 'habit').length, both.filter((x) => x.kind === 'step').length]).toEqual([STYLE_HABITS_MAX, STYLE_ITEMS_MAX - STYLE_HABITS_MAX]);
    expect(styleItems(many, ['One step.']).map((x) => x.kind).filter((k) => k === 'habit').length).toBe(STYLE_ITEMS_MAX - 1);
  });
});

describe('the reading is grounded by code', () => {
  const items = styleItems(habits.slice(0, 1), ['End on the idea, never an ask.']);
  const piece = 'The tool is there. The habit is not. We end on why it matters.';
  it('held stands only with the piece\'s own words; not held stands as said; anything else is not read', () => {
    const g = STYLE_READ.ground({ items: [
      { id: 'h1', held: true, quote: 'The tool is there. The habit is not.' },
      { id: 's1', held: true, quote: 'words the piece never had' },
      { id: 'zz', held: true, quote: 'The tool is there.' },
    ] }, { items, piece });
    expect(g?.found).toEqual([{ id: 'h1', held: true, quote: 'The tool is there. The habit is not.' }, { id: 's1', held: null }]);
    expect(STYLE_READ.ground({ items: [{ id: 'h1', held: false, quote: null }] }, { items, piece })?.found).toEqual([{ id: 'h1', held: false }, { id: 's1', held: null }]);
    expect(STYLE_READ.ground({ nope: 1 }, { items, piece })).toBeNull();
  });
  it('nothing to read asks nothing', () => {
    expect(STYLE_READ.decide({ items: [], piece })).toEqual({ found: [] });
    expect(STYLE_READ.decide({ items, piece: '  ' })).toEqual({ found: [] });
    expect(STYLE_READ.decide({ items, piece })).toBeNull();
  });
});

describe('what is said and what the review is told', () => {
  const items = styleItems(habits.slice(0, 1), ['End on the idea, never an ask.']);
  it('the review is told what the draft does not hold, a habit with the author\'s sentence, and what it holds, in the draft\'s words, to keep', () => {
    expect(styleNote(items, [{ id: 'h1', held: false }, { id: 's1', held: true, quote: 'the idea it ends on' }])).toBe(
      'Where the draft does not yet write as the author does:\n- Pairs a claim with its contrast (theirs: "The form is there. The fit is not."): the draft does not.'
      + '\n\nWhat the draft already does as the author does, to keep as it is while you fix the rest:\n- End on the idea, never an ask: "the idea it ends on"');
    // a hold with no quote is not said: only the draft's own words are given to keep
    expect(styleNote(items, [{ id: 'h1', held: false }, { id: 's1', held: null }])).toBe(
      'Where the draft does not yet write as the author does:\n- Pairs a claim with its contrast (theirs: "The form is there. The fit is not."): the draft does not.');
    expect(styleNote(items, [{ id: 'h1', held: true, quote: 'q' }, { id: 's1', held: null }])).toBe('');
  });
  it('beside the piece: held, not held, not read', () => {
    expect(styleLines(items, [{ id: 'h1', held: true, quote: 'q' }, { id: 's1', held: false }], 'piece')).toEqual([
      'How you write, read on the piece (2; report only, it blocks nothing):',
      '  held (1): "Pairs a claim with its contrast."',
      '  not held (1): "End on the idea, never an ask."',
    ]);
    expect(styleLines([], [], 'piece')).toEqual([]);
  });
});

describe('the rules said under the piece and how you write do not say the same step twice two ways', () => {
  const step: Entry = { id: 'r1', dimension: 'STANDARD', source: 'METHOD', statement: 'End on an idea.', required: false, result: 'UNVERIFIED', reason: 'NOT_MACHINE_CHECKABLE',
    observation: { proposition: null, coverage: 'FULL', qualification: 'DETERMINISTIC', evidence: null } };
  it('read this run, the step points below; not read, it is yours to judge', () => {
    expect(rulesLines([step], true)).toEqual(['Your rules on this piece (1):', '  no check reads it: read below, under how you write (1): "End on an idea."']);
    expect(rulesLines([step])).toEqual(['Your rules on this piece (1):', '  no check reads it: yours to judge (1): "End on an idea."']);
  });
});

describe('atelier report shows what the run read of how you write', () => {
  it('the pieces written from, and each habit and step held, not held or not read', async () => {
    const { traceOf } = await import('../cli/commands/report.js');
    const rec = { input: 'Compare two tools.', at: '2026-11-08T00:00:00Z', observedRuntime: { resolvedModel: 'm' }, runtimeBinding: { requestedModel: 'm' },
      direct: { version: '1', asked: 'Compare two tools.', from: 3, pieces: [{ id: 'p1', title: 'Obsidian against Bear', kept: false }], route: { by: 'floor', reader: 'r', kind: null },
        effort: 'high', review: { ran: true }, corrections: 0,
        style: { by: 'model', reader: 'style-read-1:m', on: 'piece', steered: false, found: [
          { id: 'h1', kind: 'habit', text: 'Closes on a plain sentence.', held: true, quote: 'That is the whole trade' },
          { id: 's1', kind: 'step', text: 'End on an idea.', held: false }] } } } as never;
    const blocks = Object.fromEntries(traceOf(rec));
    expect(blocks['written from your pieces']).toEqual(['1 of 3 piece(s): Obsidian against Bear (chosen by shared words)', 'self-review: ran']);
    expect(blocks['how you write']).toEqual(['read on the piece, report only · style-read-1:m', 'held · "Closes on a plain sentence.": "That is the whole trade"', 'not held · "End on an idea."']);
  });
});

describe('with --style-review the piece is read again, and the line says what the review fixed', () => {
  it('missed on the draft, held on the piece: counted as fixed by the review', () => {
    const items = styleItems([{ description: 'Closes on a plain line.', frequency: 'ALWAYS', quote: 'Tests first.' }, { description: 'Opens on a stance.', frequency: 'OFTEN', quote: 'I would start here.' }], []);
    const lines = styleLines(items, [{ id: 'h1', held: true, quote: 'Tests first, then the rest.' }, { id: 'h2', held: false }], 'piece', [{ id: 'h1', held: false }, { id: 'h2', held: false }]);
    expect(lines.at(-1)).toBe('  the first draft did not hold 2; the review it was told of made 1 of them held, and the piece misses 1');
    expect(styleLines(items, [{ id: 'h1', held: true }, { id: 'h2', held: true }], 'piece').at(-1)).not.toContain('first draft');
  });
});
