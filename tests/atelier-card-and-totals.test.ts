// tests/atelier-card-and-totals.test.ts — WHAT THE WORK IS, READ ONCE; WHAT THE AUTHOR SETTLED, READ ON THE PIECE; AND A
// TOTAL ITS OWN ROWS DO NOT ADD UP TO. Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { PURPOSE_CARD, amendCard, cardLine, type CardInput } from '../core/direct/card.js';
import { answerItems, styleNote, STYLE_READ } from '../core/direct/style.js';
import { totalsOff, figureOf } from '../core/observers/totals.js';
import { EDITOR_QUESTIONS } from '../core/direct/questions.js';

const PIECES: CardInput = { purpose: 'pricing memos for our sales team', pieces: [
  { name: 'piece-1', text: 'To: the sales team\n\nWe price the Team plan at $12 a seat, against Acme at $15. Quote the annual plan first.' },
  { name: 'piece-2', text: 'To: the sales team\n\nThe Pro plan stays at $30; we compare it with Globex, not Acme.' }] };

describe('the purpose card, read from the pieces and held to them', () => {
  it('a kind and a reader stand only with a quote found in the pieces or the purpose; settles is kept to five', () => {
    const r = PURPOSE_CARD.ground({ kind: 'a pricing memo', kindQuote: 'pricing memos for our sales team', reader: 'a sales rep before a call', readerQuote: 'To: the sales team',
      purpose: 'Tells the team which price to quote and against whom.', settles: ['the price', 'what it is compared with', 'the price', 'which plan first', 'a', 'b', 'c'] }, PIECES);
    expect(r?.card).toEqual({ kind: 'a pricing memo', reader: 'a sales rep before a call', purpose: 'Tells the team which price to quote and against whom.',
      settles: ['the price', 'what it is compared with', 'which plan first', 'a', 'b'], by: 'model' });
    const made = PURPOSE_CARD.ground({ kind: 'a pricing memo', kindQuote: 'memos about pricing', reader: 'a CFO', readerQuote: 'the CFO reads it', purpose: null, settles: [] }, PIECES);
    expect(made?.card).toBeNull();
  });
  it('no pieces, nothing read; no model, no card', () => {
    expect(PURPOSE_CARD.decide({ purpose: 'x', pieces: [] })).toEqual({ card: null });
    expect(PURPOSE_CARD.floor(PIECES)).toEqual({ card: null });
  });
  it('the person\'s card replaces the fields they name and keeps the rest; a field it does not have is refused', () => {
    const was = { kind: 'a pricing memo', reader: null, purpose: null, settles: ['the price'], by: 'model' as const };
    expect(amendCard(was, 'reader=a sales rep before a call; settles=the price, per seat; settles=the competitor')).toEqual({ kind: 'a pricing memo', reader: 'a sales rep before a call', purpose: null, settles: ['the price, per seat', 'the competitor'], by: 'you' });
    expect(() => amendCard(was, 'tone=warm')).toThrow(/--card has no field "tone": kind, reader, purpose or settles/);
    expect(() => amendCard(was, 'just words')).toThrow(/field=value pairs/);
    expect(cardLine(amendCard(null, 'kind=a reply; settles=what is offered'))).toBe('This work: a reply; each piece settles: what is offered');
  });
  it('the editor is told the card as what the work usually is, never as a statement of this request', () => {
    const p = EDITOR_QUESTIONS.prompt({ request: 'Price the new plan.', material: [], method: '', told: [], card: { kind: 'a pricing memo', reader: null, purpose: null, settles: ['the price'], by: 'model' } });
    expect(p).toContain('What this author\'s work is, read from all their pieces (not a statement about this request): This work: a pricing memo; each piece settles: the price');
  });
});

describe('what the author settled before the draft, read on the piece', () => {
  it('each answer is an item of the style reading, by what it decides; the review is told an answer the draft does not carry out', () => {
    const items = answerItems([{ id: 'price-anchor', answer: 'The annual plan, at $12' }, { id: 'next', answer: '  ' }, { id: 'idea', answer: 'Quote annual first' }],
      (id) => (id === 'idea' ? 'The one idea the reader should leave with:' : id === 'price-anchor' ? 'the price it anchors on' : null));
    expect(items).toEqual([{ id: 'a1', kind: 'answer', text: 'the price it anchors on: The annual plan, at $12' }, { id: 'a2', kind: 'answer', text: 'The one idea the reader should leave with: Quote annual first' }]);
    expect(STYLE_READ.prompt({ items, piece: 'A memo.' })).toContain('What the author settled for this piece before it was written (held when the piece carries it out):\n- [a1] the price it anchors on: The annual plan, at $12');
    expect(styleNote(items, [{ id: 'a1', held: false }, { id: 'a2', held: true, quote: 'quote annual first' }]))
      .toBe('Where the draft does not yet write as the author does:\n- They settled, before the draft: the price it anchors on: The annual plan, at $12; the draft does not carry it out.'
        + '\n\nWhat the draft already does as the author does, to keep as it is while you fix the rest:\n- The one idea the reader should leave with: Quote annual first: "quote annual first"');
  });
});

describe('a total its own rows do not add up to', () => {
  const T = (rows: string): string => `Intro.\n\n| Item | Price | Seats |\n|---|---:|---:|\n${rows}\n\nAfter.`;
  it('listed column by column at the total\'s precision; a total that adds up says nothing', () => {
    expect(totalsOff(T('| Team | $12 | 10 |\n| Pro | $30 | 5 |\n| **Total** | **$42** | 15 |'))).toEqual([]);
    expect(totalsOff(T('| Team | $12 | 10 |\n| Pro | $30 | 5 |\n| Total | $45 | 15 |'))).toEqual([{ table: 1, column: 'Price', stated: '$45', sum: 42 }]);
    // 3.75 written at one decimal is 3.8: rounding is not a mistake; 3.9 is
    expect(totalsOff(T('| A | 1.25 | 1 |\n| B | 2.5 | 1 |\n| Sum | 3.8 | 2 |'))).toEqual([]);
    expect(totalsOff(T('| A | 1.25 | 1 |\n| B | 2.5 | 1 |\n| Sum | 3.9 | 2 |'))).toEqual([{ table: 1, column: 'Price', stated: '3.9', sum: 3.75 }]);
  });
  it('a column with a cell that is no figure, one row alone, or a row not labelled a total is not read', () => {
    expect(totalsOff(T('| Team | $12 | n/a |\n| Pro | $30 | 5 |\n| Total | $42 | 99 |'))).toEqual([]);
    expect(totalsOff(T('| Team | $12 | 10 |\n| Total | $99 | 10 |'))).toEqual([]);
    expect(totalsOff(T('| Team | $12 | 10 |\n| Pro | $30 | 5 |\n| Average | $21 | 7 |'))).toEqual([]);
  });
  it('a total closes its block: the rows after it add up to the next; each table is numbered', () => {
    const two = `${T('| A | 1 | 1 |\n| B | 2 | 1 |\n| Subtotal | 3 | 2 |')}\n\n| X | N |\n|---|---|\n| p | 4 |\n| q | 4 |\n| Total | 9 |`;
    expect(totalsOff(two)).toEqual([{ table: 2, column: 'N', stated: '9', sum: 8 }]);
  });
  it('a subtotal is checked on its own rows and stands for them in the total; a one-dash rule is a rule', () => {
    const sub = 'Intro.\n\n| Item | N |\n|-|-|\n| A | 1 |\n| B | 2 |\n| Subtotal | 3 |\n| C | 4 |\n| D | 5 |\n| Sub-total | 9 |\n| Total | 12 |';
    expect(totalsOff(sub)).toEqual([]);
    expect(totalsOff(sub.replace('| Total | 12 |', '| Total | 15 |'))).toEqual([{ table: 1, column: 'N', stated: '15', sum: 12 }]);
    expect(totalsOff(sub.replace('| Subtotal | 3 |', '| Subtotal | 4 |'))).toEqual([{ table: 1, column: 'N', stated: '4', sum: 3 }, { table: 1, column: 'N', stated: '12', sum: 13 }]);
  });
  it('a cell\'s figure: currency, thousands, a percent and a minus; words are none', () => {
    expect(figureOf('$1,200')).toEqual({ value: 1200, decimals: 0 });
    expect(figureOf('**12.5%**')).toEqual({ value: 12.5, decimals: 1 });
    expect(figureOf('−3')).toEqual({ value: -3, decimals: 0 });
    expect(figureOf('about 12')).toBeNull();
  });
});
