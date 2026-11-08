// tests/atelier-style.test.ts — HOW THE AUTHOR WRITES, READ ON THE PIECE (core/direct/style.ts).
//
// The habits the build reads from the author's pieces had no reader on the default run, and the method's steps no check
// counts were "yours to judge" on every run. One reading after the draft now reads both: report only by default, and
// with --style-review what the draft does not hold reaches the self-review. Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { STYLE_READ, styleItems, styleNote, styleLines, STYLE_ITEMS_MAX } from '../core/direct/style.js';

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
    expect(styleItems(Array.from({ length: 30 }, (_, i) => ({ description: `H${i}`, frequency: 'ALWAYS', quote: 'q' })), []).length).toBe(STYLE_ITEMS_MAX);
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
  it('the review is told only what the draft does not hold, a habit with the author\'s sentence', () => {
    expect(styleNote(items, [{ id: 'h1', held: false }, { id: 's1', held: true, quote: 'q' }])).toBe(
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
