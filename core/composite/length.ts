// atelier/core/composite/length.ts — WHETHER A RULE STATES A LENGTH, AND ON WHAT.
//
// Two authors' lengths are never judged compatible by reading their words. A worded length can be said in more ways
// than any grammar holds ("shouldn't run over four sentences", "at least 500 and at most 800 words", "a five-minute
// read", "fit it in a tweet"), and a number in a rule is not always a length ("cite three sources per 1,000 words").
// Reading the numbers to decide shipped contradictions and invented others. So the question asked here is only
// WHETHER a rule states a length, and ON WHICH MEASURE, and the answer is deliberately broad:
//
//   a worded rule states a length on a measure when it MENTIONS the measure and carries a QUANTITY CUE
//     piece       the piece, the whole, a post, an article, an essay, a draft, a report, a story, a newsletter; a
//                 page, a tweet (each a size of its own); characters; minutes or reading time; "it" kept short or
//                 long; words, when no sentence or paragraph is named; a count of paragraphs ("three paragraphs"),
//                 or of sentences where no paragraph is named ("forty sentences in all")
//     sentence    a sentence, unless sentences are named only as what a paragraph is counted in
//     paragraph   a paragraph
//     cue         any digit, any number word, or: short, long, brief, concise, lengthy, max, min, cap, limit, under,
//                 over, at most, at least, no more, fewer, longer, shorter (and their near forms)
//   a counted rule states a length on the measure its observer counts: LENGTH of the piece (in words, characters or
//     sentences), LENGTH of the longest sentence, SENTENCE_LENGTH, PARAGRAPH_LENGTH
//
// What the reading costs when it is too broad is one more question to the person; what it would cost when too narrow
// is two instructions that cannot both be followed. Two rules from different authors that state a length on one
// measure are always asked (./traits.ts); the quantity grammar (./quantity.ts) only shows how each side reads.

import type { Measurement } from '../state/canonical-state.js';
import { NUMBER_WORDS } from '../loop/numbers.js';
import { describeQuantity, quantitiesOf, type Quantity, type QuantityMeasure } from './quantity.js';

export const LENGTH_MEASURES: readonly QuantityMeasure[] = ['piece', 'sentence', 'paragraph'];

const NUMBER = `(?:${[...NUMBER_WORDS, 'single', 'couple', 'half'].join('|')})`;
const CUE = new RegExp(String.raw`\d|\b${NUMBER}\b|\b(?:short|shorter|shortest|long|longer|longest|brief|briefer|concise|lengthy|max|maximum|min|minimum|cap|caps|capped|limit|limits|limited|under|over|at most|at least|no more|not more|fewer|less than|more than|within|up to|exceed|exceeds|exceeding|beyond|past)\b`, 'i');
const SENTENCE = /\bsentences?\b/i;
const PARAGRAPH = /\bparagraphs?\b/i;
const WORDS = /\bwords?\b/i;
const PIECE = /\b(?:pieces?|whole|posts?|articles?|essays?|drafts?|reports?|stor(?:y|ies)|newsletters?|characters?|chars?|minutes?|mins?|read|reading time)\b/i;
/** A size of its own: "keep it to a page", "fit it in a tweet". */
const SIZED = /\b(?:pages?|tweets?)\b/i;
/** "Keep it brief", "make this short": the piece, named by a pronoun. */
const IT_SIZED = /\b(?:it|this|everything)\s+(?:\w+\s+)?(?:short|shorter|brief|concise|tight|long|longer|lengthy)\b/i;
/** A count of the unit: "three paragraphs", "40 sentences", "a five-paragraph essay", "a paragraph or two". */
const COUNT_OF = (unit: string): RegExp => new RegExp(String.raw`(?:\d[\d,]*|\b${NUMBER})[\s-]+(?:(?!sentences?\b|paragraphs?\b)\w+[\s-]+)?${unit}\b|\b(?:a|one)\s+${unit}\s+or\s+two\b`, 'i');
const PARAGRAPH_COUNT = COUNT_OF('paragraphs?');
const SENTENCE_COUNT = COUNT_OF('sentences?');
/** Sentences said short or long themselves, where a paragraph is also named. */
const SENTENCE_SIZED = /\b(?:short|shorter|long|longer|brief|lengthy|concise)\s+sentences?\b|\bsentences?\s+(?:\w+\s+){0,3}(?:short|shorter|long|longer|brief|lengthy|concise)\b/i;

/** The measures a worded rule states a length on, by its words alone (see the head of this file). */
export function wordedLengthMeasures(statement: string): QuantityMeasure[] {
  const s = statement;
  const sized = SIZED.test(s);
  if (!CUE.test(s) && !sized) return [];
  const sentence = SENTENCE.test(s); const paragraph = PARAGRAPH.test(s) || /-paragraph\b/i.test(s);
  const out = new Set<QuantityMeasure>();
  if (sentence && (!paragraph || WORDS.test(s) || SENTENCE_SIZED.test(s))) out.add('sentence');
  if (paragraph) out.add('paragraph');
  if (PIECE.test(s) || sized || IT_SIZED.test(s) || (WORDS.test(s) && !sentence && !paragraph)
    || PARAGRAPH_COUNT.test(s) || (SENTENCE_COUNT.test(s) && !paragraph)) out.add('piece');
  return LENGTH_MEASURES.filter((m) => out.has(m));
}

/** The measure a count's band is of, or null when it counts no length of the three. */
export function countedLengthMeasure(m: Measurement): QuantityMeasure | null {
  if (m.observer === 'SENTENCE_LENGTH') return 'sentence';
  if (m.observer === 'PARAGRAPH_LENGTH') return 'paragraph';
  if (m.observer !== 'LENGTH') return null;
  if (Array.isArray(m.params.in) && m.params.in.length > 0) return null;
  const unit = Array.isArray(m.params.unit) ? String(m.params.unit[0]).toLowerCase() : 'words';
  return unit === 'sentence' ? 'sentence' : 'piece';
}

/**
 * EVERY MEASURE A RULE STATES A LENGTH ON. A counted rule: its observer's. A worded rule: its words (broad, above), with
 * every measure a reading of its numbers names added (the grammar's, and the model's where it read one), so a reading
 * can only add a measure, never take one away.
 */
export function lengthMeasuresOf(r: { readonly statement: string; readonly measurement?: Measurement | null; readonly readings?: readonly (readonly Quantity[])[] }): QuantityMeasure[] {
  if (r.measurement) { const m = countedLengthMeasure(r.measurement); return m ? [m] : []; }
  const found = new Set<QuantityMeasure>([...wordedLengthMeasures(r.statement), ...quantitiesOf(r.statement).map((q) => q.measure),
    ...(r.readings ?? []).flatMap((qs) => qs.map((q) => q.measure))]);
  return LENGTH_MEASURES.filter((m) => found.has(m));
}

/** The measures two rules both state a length on. */
export function sharedLengthMeasures(a: Parameters<typeof lengthMeasuresOf>[0], b: Parameters<typeof lengthMeasuresOf>[0]): QuantityMeasure[] {
  const mb = lengthMeasuresOf(b);
  return lengthMeasuresOf(a).filter((m) => mb.includes(m));
}

/**
 * HOW A WORDED RULE READS ON A MEASURE, for the screen only: "at most 800 words in the piece", or "unclear" where the
 * grammar finds no quantity on that measure. It decides nothing.
 */
export function readsAs(statement: string, measures: readonly QuantityMeasure[]): string {
  const qs = quantitiesOf(statement).filter((q) => measures.includes(q.measure));
  return qs.length ? qs.map(describeQuantity).join(' and ') : 'unclear';
}
