// tests/atelier-composite-quantity.test.ts — A QUANTITY SAID IN WORDS IS READ ONE WAY, AND TWO RULES ARE COMPARED AS RANGES.
//
// Defects a reviewer reproduced, each held here with expected values written from the rules' own words (the ranges in
// the tables below are worked out by hand, not read off the code):
//   worded quantities were read by ad-hoc patterns, so most wordings were missed ("about 300 words", "under 2,000
//   characters", "at least eight hundred words", "a five-minute read", "roughly 1,200 words") and the guard shipped
//   instructions that cannot all be followed; "no more than 1,000 words" was read as a floor of 1,001;
//   two counted ceilings on one measure ("a median under 5 words" against "under 40") were shown as conflicts;
//   with a model, the numbers of a rule were read by the grammar alone, never checked against a second reading;
//   a skill whose authors' piece lengths were left open still stated a length band from the authors' medians;
//   "both (one range)" was offered on a conflict of two statements, which make no range.
import { describe, it, expect } from 'vitest';
import type { Measurement, Requirement } from '../core/state/canonical-state.js';
import { buildTraitTable, relationOf, type TraitClass } from '../core/composite/traits.js';
import { composeSelection, describeComposite, type CompositeAuthor, type CompositeDecision, type CompositeRecord } from '../core/composite/selection.js';
import { compositeLength } from '../core/compiler/voice.js';

const rule = (id: string, statement: string, measurement: Measurement | null = null): Requirement => ({
  requirementId: id, statement, appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'DERIVED_UNRATIFIED', provenance: 'MACHINE_DISCOVERED',
  evidence: null, evidenceItemId: null, wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null,
  ...(measurement ? { measurement } : {}),
});
const W = (statement: string): Pick<Requirement, 'statement' | 'measurement' | 'kind'> => ({ statement, kind: 'GENERATIVE' });
const C = (measurement: Measurement): Pick<Requirement, 'statement' | 'measurement' | 'kind'> => ({ statement: 'counted', measurement, kind: 'GENERATIVE' });
const ALL: TraitClass[] = ['opening', 'structure', 'evidence', 'pace', 'voice', 'method'];
const author = (name: string, classes: TraitClass[] = ALL): CompositeAuthor => ({ name, pieces: [`${name}.md`], admired: classes.length ? 'everything' : null, classes });
const instructs = (d: CompositeDecision | undefined): boolean => d?.outcome === 'SELECTED' && !d.shownOnly && !d.mergedInto;

// ── 1. THE REVIEWER'S 35 PAIRS ─────────────────────────────────────────────────────────────────────
// CONFLICT: no piece can follow both. OK: one piece can. The probe left two open ("CONFLICT?" and "?"); they are settled
// here by the rules' words: "under twenty-five" stops at 24 where "between 25 and 40" starts, and "Keep it short" puts no
// number on the piece.
const PAIRS: readonly (readonly [string, string, 'CONFLICT' | 'OK'])[] = [
  ['Keep the piece to about 300 words.', 'Write at least 800 words.', 'CONFLICT'],
  ['Keep the piece to about 300 words.', 'Write at least eight hundred words.', 'CONFLICT'],
  ['Keep the piece under 300 words.', 'Write at least eight hundred words.', 'CONFLICT'],
  ['Keep the piece to about 300 words.', 'Write roughly 1,200 words.', 'CONFLICT'],
  ['Keep the piece around 300 words.', 'Keep the piece over 1,500 words.', 'CONFLICT'],
  ['Write no more than 1,000 words.', 'Write over 900 words.', 'OK'],
  ['Write no more than 1,000 words.', 'Write at least 800 words.', 'OK'],
  ['Keep the piece under 300 words.', 'Write no more than 500 words.', 'OK'],
  ['Keep it under 2,000 characters.', 'Keep the piece at least 5,000 characters long.', 'CONFLICT'],
  ['Aim for a five-minute read.', 'Keep each piece under three minutes of reading.', 'CONFLICT'],
  ['Keep it under a two-minute read.', 'Write at least 1,000 words.', 'CONFLICT'],
  ['Keep sentences to roughly ten words.', 'Write sentences of around thirty words.', 'CONFLICT'],
  ['Keep sentences to roughly ten words.', 'Let sentences run between 25 and 40 words.', 'CONFLICT'],
  ['Never write a sentence over 15 words.', 'Let sentences run between 25 and 40 words.', 'CONFLICT'],
  ['Keep sentences under twenty-five words.', 'Let sentences run between 25 and 40 words.', 'CONFLICT'],
  ['Keep sentences under twenty-five words.', 'Never write a sentence over 15 words.', 'OK'],
  ['Sentences should be at least eighteen words long.', 'Never write a sentence over 15 words.', 'CONFLICT'],
  ['Sentences should be at least eighteen words long.', 'Keep sentences to roughly ten words.', 'CONFLICT'],
  ['Sentences should be at least 18 words long.', 'Keep sentences to roughly ten words.', 'CONFLICT'],
  ['Aim for sentences of about 12 words.', 'No sentence longer than twenty words.', 'OK'],
  ['Write sentences of about twenty words.', 'Write sentences of about 22 words.', 'OK'],
  ['Keep sentences under twenty-five words.', 'Write sentences of around thirty words.', 'CONFLICT'],
  ['Keep sentences to twenty-five words at most.', 'Keep sentences of about ten words.', 'OK'],
  ['Keep paragraphs to no more than three sentences.', 'Write paragraphs of about eight sentences.', 'CONFLICT'],
  ['Write paragraphs of between two and four sentences.', 'Each paragraph should have at least seven sentences.', 'CONFLICT'],
  ['Write paragraphs of between two and four sentences.', 'Write paragraphs of roughly six sentences.', 'CONFLICT'],
  ['Keep paragraphs short, around two sentences.', 'Write paragraphs of roughly six sentences.', 'CONFLICT'],
  ['Keep paragraphs short, around two sentences.', 'Each paragraph should have at least seven sentences.', 'CONFLICT'],
  ['Keep paragraphs under five sentences.', 'Write paragraphs of about eight sentences.', 'CONFLICT'],
  ['Keep paragraphs to at most three sentences.', 'Keep paragraphs under five sentences.', 'OK'],
  ['Keep paragraphs to at most six sentences.', 'Paragraphs of at least four sentences.', 'OK'],
  ['Keep paragraphs to at most three sentences.', 'Paragraphs of at least four sentences.', 'CONFLICT'],
  ['Keep paragraphs to at most three sentences.', 'Paragraphs of at least four sentences.', 'CONFLICT'],
  ['Keep the piece over 1,500 words.', 'Keep the piece between 400 and 600 words.', 'CONFLICT'],
  ['Keep the piece over 1,500 words.', 'Keep it short.', 'OK'],
];
describe('two worded quantities: a conflict exactly when no piece can follow both', () => {
  it('holds all 35 of the reviewer\'s pairs', () => { expect(PAIRS).toHaveLength(35); });
  for (const [a, b, want] of PAIRS) {
    it(`${want}: ${a} / ${b}`, () => {
      expect(relationOf(W(a), W(b)) === 'CONFLICT').toBe(want === 'CONFLICT');
      expect(relationOf(W(b), W(a)) === 'CONFLICT').toBe(want === 'CONFLICT');
    });
  }
});

// ── 2. THE REVIEWER'S RUNS: NO TWO RULES THAT WILL INSTRUCT CANNOT BOTH BE FOLLOWED ────────────────
// Each run's worded rules with the range their words allow, worked out by hand: "about N" is 0.8N to 1.2N with its ends
// excluded; "under N" is at most N-1; "over N" at least N+1; characters are six to a word; a minute of reading is 230 words.
interface Hand { readonly id: string; readonly author: string; readonly statement: string; readonly measure: string; readonly lo: number; readonly hi: number; readonly open?: true }
const G1M: readonly Hand[] = [
  { id: 'p1', author: 'pia', statement: 'Keep the piece to about 300 words.', measure: 'piece', lo: 240, hi: 360, open: true },
  { id: 'p2', author: 'pia', statement: 'Keep it under 2,000 characters.', measure: 'piece', lo: 0, hi: 1999 / 6 },
  { id: 'p5', author: 'quin', statement: 'Write at least eight hundred words.', measure: 'piece', lo: 800, hi: Infinity },
  { id: 'p6', author: 'quin', statement: 'Aim for a five-minute read.', measure: 'piece', lo: 920, hi: 1380, open: true },
  { id: 'p9', author: 'rosa', statement: 'Keep the piece between 250 and 400 words.', measure: 'piece', lo: 250, hi: 400 },
  { id: 'p10', author: 'rosa', statement: 'Write no more than 1,000 words.', measure: 'piece', lo: 0, hi: 1000 },
  { id: 'p13', author: 'sol', statement: 'Write roughly 1,200 words.', measure: 'piece', lo: 960, hi: 1440, open: true },
  { id: 'p14', author: 'sol', statement: 'Keep each piece under three minutes of reading.', measure: 'piece', lo: 0, hi: 690 },
  { id: 'p17', author: 'tam', statement: 'Write over 900 words.', measure: 'piece', lo: 901, hi: Infinity },
  { id: 'p18', author: 'tam', statement: 'Keep the piece at least 5,000 characters long.', measure: 'piece', lo: 5000 / 6, hi: Infinity },
];
const G2M: readonly Hand[] = [
  { id: 'x1', author: 'xan', statement: 'Keep sentences to roughly ten words.', measure: 'sentence', lo: 8, hi: 12, open: true },
  { id: 'x2', author: 'xan', statement: 'Never write a sentence over 15 words.', measure: 'sentence', lo: 0, hi: 15 },
  { id: 'y1', author: 'yara', statement: 'Write sentences of around thirty words.', measure: 'sentence', lo: 24, hi: 36, open: true },
  { id: 'y2', author: 'yara', statement: 'Let sentences run between 25 and 40 words.', measure: 'sentence', lo: 25, hi: 40 },
  { id: 'z1', author: 'zed', statement: 'Keep sentences under twenty-five words.', measure: 'sentence', lo: 0, hi: 24 },
  { id: 'z2', author: 'zed', statement: 'No sentence longer than twenty words.', measure: 'sentence', lo: 0, hi: 20 },
  { id: 'f1', author: 'fen', statement: 'Sentences should be at least eighteen words long.', measure: 'sentence', lo: 18, hi: Infinity },
  { id: 'f2', author: 'fen', statement: 'Aim for sentences of about 12 words.', measure: 'sentence', lo: 9.6, hi: 14.4, open: true },
];
const G3M: readonly Hand[] = [
  { id: 'g1', author: 'gil', statement: 'Keep paragraphs to no more than three sentences.', measure: 'paragraph', lo: 0, hi: 3 },
  { id: 'g2', author: 'gil', statement: 'Write paragraphs of between two and four sentences.', measure: 'paragraph', lo: 2, hi: 4 },
  { id: 'h1', author: 'hal', statement: 'Each paragraph should have at least seven sentences.', measure: 'paragraph', lo: 7, hi: Infinity },
  { id: 'h2', author: 'hal', statement: 'Write paragraphs of about eight sentences.', measure: 'paragraph', lo: 6.4, hi: 9.6, open: true },
  { id: 'k1', author: 'kai', statement: 'Keep paragraphs under five sentences.', measure: 'paragraph', lo: 0, hi: 4 },
  { id: 'k2', author: 'kai', statement: 'Keep the piece over 1,500 words.', measure: 'piece', lo: 1501, hi: Infinity },
  { id: 'l1', author: 'lena', statement: 'Write paragraphs of roughly six sentences.', measure: 'paragraph', lo: 4.8, hi: 7.2, open: true },
  { id: 'l2', author: 'lena', statement: 'Keep paragraphs short, around two sentences.', measure: 'paragraph', lo: 1.6, hi: 2.4, open: true },
];
/** Whether one piece can follow both, from the hand-worked ranges. */
const meet = (x: Hand, y: Hand): boolean => {
  if (x.measure !== y.measure) return true;
  const lo = Math.max(x.lo, y.lo); const hi = Math.min(x.hi, y.hi);
  if (lo > hi) return false;
  // a point where the two touch is in neither when it is an end of a size said "about"
  return !(lo === hi && [x, y].some((h) => h.open && (h.lo === lo || h.hi === lo)));
};
const RUNS = [['G1m: piece length in words, characters and minutes of reading', G1M], ['G2m: sentence length', G2M], ['G3m: paragraph length', G3M]] as const;
for (const [name, hand] of RUNS) {
  describe(`the reviewer's run ${name}, every author admired for everything`, () => {
    const rules = hand.map((h) => rule(h.id, h.statement));
    const src = Object.fromEntries(hand.map((h) => [h.id, h.author]));
    const table = buildTraitTable(rules, (id) => src[id]);
    const rec = composeSelection(table, rules, [...new Set(hand.map((h) => h.author))].map((a) => author(a)));
    const live = hand.filter((h) => instructs(rec.decisions.find((d) => d.id === h.id)));
    it('no two rules from two authors that will instruct are out of each other\'s range', () => {
      const bad = live.flatMap((x, i) => live.slice(i + 1).filter((y) => x.author !== y.author && !meet(x, y)).map((y) => `${x.id}/${y.id}`));
      expect(bad).toEqual([]);
    });
    it('every pair of two authors\' rules out of each other\'s range is a conflict, and every conflict is such a pair', () => {
      const want = hand.flatMap((x, i) => hand.slice(i + 1).filter((y) => x.author !== y.author && !meet(x, y)).map((y) => `${x.id}/${y.id}`)).sort();
      const got = rec.conflicts.map((c) => `${c.sides[0].id}/${c.sides[1].id}`).sort();
      expect(got).toEqual(want);
    });
  });
}
it('G1m: "no more than 1,000 words" is a ceiling, so it and "over 900 words" leave room for both', () => {
  const rules = [rule('p10', 'Write no more than 1,000 words.'), rule('p17', 'Write over 900 words.')];
  const t = buildTraitTable(rules, (id) => (id === 'p10' ? 'rosa' : 'tam'));
  expect(t.conflicts).toEqual([]);
  const rec = composeSelection(t, rules, [author('rosa'), author('tam')]);
  expect(rec.decisions.every(instructs)).toBe(true);
});

// ── 3. COUNTED RULES: TWO CEILINGS, OR TWO FLOORS, NEVER CONFLICT ───────────────────────────────────
describe('two counted rules on one measure conflict only when their ranges do not meet', () => {
  const SL = (medianMax: number, p90Max: number): Measurement => ({ observer: 'SENTENCE_LENGTH', params: { medianMax, p90Max } });
  const H = (maxPer1000: number): Measurement => ({ observer: 'HEDGE_RATE', params: { maxPer1000 } });
  const P = (maxSentences: number): Measurement => ({ observer: 'PARAGRAPH_LENGTH', params: { maxSentences } });
  const FP = (p: Record<string, number>): Measurement => ({ observer: 'PATTERN_RATE', params: { pattern: ['FIRST_PERSON'], ...p } });
  it('k1: hedging at most 22 and at most 2 a thousand words (its conflicts 7 and 8) are both met by a piece with one hedge', () => {
    expect(relationOf(C(H(22)), C(H(2)))).not.toBe('CONFLICT');
    expect(relationOf(C(H(2)), C(H(22)))).not.toBe('CONFLICT');
  });
  it('G2k and F3m: sentence ceilings from a median under 5 to under 40 words never conflict', () => {
    for (const [a, b] of [[SL(16, 16), SL(11, 12)], [SL(16, 16), SL(37, 37)], [SL(11, 12), SL(23, 23)], [SL(7, 12), SL(31, 31)], [SL(16, 16), SL(31, 31)], [SL(5, 13), SL(40, 49)]] as const) {
      expect(relationOf(C(a), C(b))).not.toBe('CONFLICT');
    }
    expect(relationOf(C(P(2)), C(P(7)))).not.toBe('CONFLICT');
  });
  it('two floors never conflict; a floor above a ceiling does; bands that do not meet do', () => {
    expect(relationOf(C(FP({ minPer1000: 2 })), C(FP({ minPer1000: 20 })))).not.toBe('CONFLICT');
    expect(relationOf(C(FP({ minPer1000: 5 })), C(FP({ maxPer1000: 3 })))).toBe('CONFLICT');
    expect(relationOf(C(FP({ minPer1000: 1, maxPer1000: 3 })), C(FP({ minPer1000: 8, maxPer1000: 10 })))).toBe('CONFLICT');
    expect(relationOf(C(FP({ minPer1000: 1, maxPer1000: 9 })), C(FP({ minPer1000: 8, maxPer1000: 10 })))).not.toBe('CONFLICT');
    const LW = (min: number, max: number): Measurement => ({ observer: 'LENGTH', params: { unit: ['words'], min, max } });
    expect(relationOf(C(LW(300, 500)), C(LW(1500, 2500)))).toBe('CONFLICT');
  });
});

// ── 4. THE MODEL'S READING OF A RULE'S NUMBERS ──────────────────────────────────────────────────────
describe('a rule the model reads differently from its words is read both ways, and never silently resolved', () => {
  const rules = [rule('a1', 'Write at least eight hundred words.'), rule('b1', 'Keep the piece under 900 words.'), rule('b2', 'Keep it to a quick read.')];
  const src: Record<string, string> = { a1: 'ada', b1: 'bram', b2: 'bram' };
  const table = buildTraitTable(rules, (id) => src[id]);
  const authors = [author('ada'), author('bram')];
  const statementOf = (id: string): string => rules.find((r) => r.requirementId === id)?.statement ?? id;
  it('by its words alone, the three can all be followed', () => {
    const rec = composeSelection(table, rules, authors);
    expect(rec.conflicts).toEqual([]);
    expect(rec.decisions.every(instructs)).toBe(true);
  });
  it('a reading that agrees changes nothing, and says nothing', () => {
    const rec = composeSelection(table, rules, authors, {}, { modelQuantities: [{ id: 'a1', quantity: { measure: 'piece', unit: 'words', min: 800, max: null } }] });
    expect(rec.notes ?? []).toEqual([]);
    expect(rec.decisions.every(instructs)).toBe(true);
  });
  it('a reading that disagrees is shown as read two ways, and the pair either reading cannot follow is asked', () => {
    const rec = composeSelection(table, rules, authors, {}, { modelQuantities: [{ id: 'b2', quantity: { measure: 'piece', unit: 'words', min: null, max: 500 } }] });
    const screen = describeComposite(rec, statementOf).join('\n');
    expect(screen).toContain('read two ways: b2 "Keep it to a quick read." is no quantity by its words, and at most 500 words in the piece by the model; it is held against any rule either reading conflicts with.');
    const asked = rec.conflicts.find((c) => c.sides.some((s) => s.id === 'a1') && c.sides.some((s) => s.id === 'b2'));
    expect(asked).toMatchObject({ provenance: 'read by the model at build', answer: null });
    expect(asked?.reason).toContain('b2 read two ways');
    expect(rec.decisions.find((d) => d.id === 'a1')?.outcome).toBe('OPEN');
    expect(rec.decisions.find((d) => d.id === 'b2')?.outcome).toBe('OPEN');
    expect(instructs(rec.decisions.find((d) => d.id === 'b1'))).toBe(true);
    // answered like any other question
    const answered = composeSelection(table, rules, authors, { [asked?.n ?? 0]: 'A' }, { modelQuantities: [{ id: 'b2', quantity: { measure: 'piece', unit: 'words', min: null, max: 500 } }] });
    expect(instructs(answered.decisions.find((d) => d.id === 'a1'))).toBe(true);
    expect(answered.decisions.find((d) => d.id === 'b2')?.outcome).toBe('REJECTED');
  });
  it('the words\' reading still holds when the model\'s reads looser: a conflict either reading has is asked', () => {
    const tight = [rule('a1', 'Write at least eight hundred words.'), rule('b1', 'Keep the piece under 300 words.')];
    const t = buildTraitTable(tight, (id) => (id === 'a1' ? 'ada' : 'bram'));
    const rec = composeSelection(t, tight, authors, {}, { modelQuantities: [{ id: 'b1', quantity: { measure: 'piece', unit: 'words', min: null, max: 3000 } }] });
    expect(rec.decisions.map((d) => d.outcome)).toEqual(['OPEN', 'OPEN']);
    expect(rec.notes?.[0]).toMatch(/^read two ways: b1 "Keep the piece under 300 words\." is at most 299 words in the piece by its words, and at most 3000 words in the piece by the model/);
  });
});

// ── 5. A PIECE LENGTH LEFT OPEN IS NOT STATED FROM THE AUTHORS' MEDIANS ─────────────────────────────
describe('the composite\'s length', () => {
  const piece = (n: number): string => Array.from({ length: n }, () => 'word').join(' ');
  const byAuthor = [[piece(300), piece(320), piece(340)], [piece(380), piece(400), piece(420)]];
  it('a band from the chosen writers\' medians when nothing about length is open', () => {
    expect(compositeLength(byAuthor)).toEqual([300, 400]);
  });
  it('nothing when the authors\' rules on the piece\'s length are left open', () => {
    expect(compositeLength(byAuthor, true)).toBeNull();
  });
});

// ── 6. "BOTH (ONE RANGE)" ONLY WHERE THE TWO MAKE ONE RANGE ──────────────────────────────────────────
describe('the answer hint', () => {
  it('offers "both (one range)" on two counted bands, and plain "both" on two statements', () => {
    const rules = [rule('r1', 'My sentence lengths vary by 0.1 to 0.2.', { observer: 'RHYTHM', params: { minCv: 0.1, maxCv: 0.2 } }), rule('w1', 'Write in the first person.'),
      rule('r2', 'My sentence lengths vary by 0.5 to 0.6.', { observer: 'RHYTHM', params: { minCv: 0.5, maxCv: 0.6 } }), rule('w2', 'Write in the third person.')];
    const src: Record<string, string> = { r1: 'ada', w1: 'ada', r2: 'bram', w2: 'bram' };
    const t = buildTraitTable(rules, (id) => src[id]);
    const rec: CompositeRecord = composeSelection(t, rules, [author('ada', []), author('bram', [])]);
    const of = (id: string): Requirement | undefined => rules.find((r) => r.requirementId === id);
    const screen = describeComposite(rec, (id) => of(id)?.statement ?? id, (id) => of(id)?.measurement ?? undefined).join('\n');
    const n = (a: string): number => rec.conflicts.find((c) => c.sides.some((s) => s.id === a))?.n ?? -1;
    expect(screen).toContain(`answer with --conflict ${n('r1')}=A, ${n('r1')}=B or ${n('r1')}=both (one range), or leave it for later`);
    expect(screen).toContain(`answer with --conflict ${n('w1')}=A, ${n('w1')}=B or ${n('w1')}=both, or leave it for later`);
    expect(screen).not.toContain(`${n('w1')}=both (one range)`);
  });
});
