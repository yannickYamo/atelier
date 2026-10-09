// core/observers/rhythm-signature.ts — IS THE LENGTH OF THIS WRITER'S SENTENCES A SIGNATURE, OR JUST WHAT THE PIECE NEEDED?
//
// How long sentences run follows the piece: its format, its reader, what it is for. An analysis under question
// headings has short lines a monologue has none of, and neither says anything of the writer. A count read off a few
// pieces (a median, a share of short sentences, a mix of lengths) and then required failed an author's own held-back
// work, and failed every output written to their standard on that one rule.
//
// Some writers do have a rhythm that is theirs: a monologue that runs a hundred words before it stops, or prose cut
// to the bone, in piece after piece, whatever the piece is about. That is a thing to DETECT, and it is detected by
// two facts, both about pieces and neither about a number chosen in advance:
//
//   CONSISTENT   the writer's own pieces agree with each other. A rhythm that moves with each piece is the piece's.
//   APART        those pieces sit outside what a model writes on the same topics, all on one side, by a margin that
//                is large beside the writer's own spread. A rhythm a model already has is nobody's signature.
//
// Only then may a rule on sentence length or pace be suggested as required. Otherwise it is counted and shown, used to
// choose between drafts, and never enforced or repaired toward.
//
// PROSE SENTENCES ONLY. A heading, a line that is only a bold label ("**What breaks first?**"), a list item and a
// table cell are not sentences of the writer's prose, and counted as such they are most of what looked like a habit.

import { proseSentencesOf, quantile } from './text.js';

/** Fewer prose sentences than this in a piece, and its rhythm is not read. */
export const MIN_SENTENCES = 20;
/** Fewer readable pieces of the writer's, or fewer drafts of the model's, and nothing is called a signature. */
export const MIN_PIECES = 4;
export const MIN_DRAFTS = 3;
/** With fewer drafts than this, every one of the writer's pieces must stand beyond every draft, not all but one. */
export const DRAFTS_FOR_ONE_EXCEPTION = 5;
/** The writer's pieces agree when their spread is at most this share of their own typical value. */
export const MAX_OWN_SPREAD = 0.25;
/** The gap to the model must be at least this many times the writer's own spread, and this share of the model's value. */
export const MIN_GAP_IN_SPREADS = 2;
export const MIN_GAP_SHARE = 0.4;

/** The lengths, in words, of a text's prose sentences: no headings, no list items, no line that is only a bold label. */
export function proseLengths(text: string): number[] {
  return proseSentencesOf(text).filter((s) => !/^\s*(?:\*\*[^*]+\*\*|__[^_]+__)[:.?!]?\s*$/.test(s.text) && !/^\s*\|.*\|\s*$/.test(s.text)).map((s) => s.words);
}

export interface RhythmReading {
  /** which way the writer's sentences stand apart, or null when they do not */
  readonly signature: 'LONG' | 'SHORT' | null;
  /** in a person's words: what was found, with the numbers it rests on */
  readonly why: string;
  readonly pieces: number; readonly drafts: number;
  /** the typical sentence of each side (median over pieces of each piece's median), and the long ones (90th percentile) */
  readonly writer: { readonly median: number; readonly long: number; readonly spread: number } | null;
  readonly model: { readonly median: number; readonly long: number } | null;
}

// The middle of a side, between its two middle values when it has an even number: taken as the lower of two drafts,
// a writer level with one draft stood "apart from the model" because the other draft was shorter.
const at = (xs: readonly number[], q: number): number => { const s = [...xs].sort((a, b) => a - b); if (!s.length) return 0; const i = (s.length - 1) * q; const lo = Math.floor(i); return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo); };
const mid = (xs: readonly number[]): number => at(xs, 0.5);
/** Half the distance between the quarter points, as a share of the middle: how far a writer's pieces sit from each other. */
const spreadOf = (xs: readonly number[]): number => { const m = mid(xs); return m ? (at(xs, 0.75) - at(xs, 0.25)) / 2 / m : 0; };
const r1 = (x: number): number => Math.round(x * 10) / 10;

/** One statistic, read on each side: consistent among the writer's pieces, and apart from every draft of the model's. */
function apart(writer: readonly number[], model: readonly number[]): 'LONG' | 'SHORT' | null {
  const w = mid(writer); const m = mid(model); const own = spreadOf(writer);
  if (own > MAX_OWN_SPREAD || !m) return null;
  const gap = Math.abs(w - m);
  if (gap < MIN_GAP_IN_SPREADS * own * w || gap < MIN_GAP_SHARE * m) return null;
  // All of the writer's pieces but one beyond every draft of the model's, on the same side.
  const beyond = w > m ? writer.filter((x) => x > Math.max(...model)).length : writer.filter((x) => x < Math.min(...model)).length;
  return beyond >= writer.length - (model.length >= DRAFTS_FOR_ONE_EXCEPTION ? 1 : 0) ? (w > m ? 'LONG' : 'SHORT') : null;
}

/**
 * Whether the writer's sentence rhythm is theirs. Read on the typical sentence of each piece and on its long ones:
 * either may carry the signature (a monologue is known by its long sentences before its typical one).
 */
export function rhythmSignature(writerTexts: readonly string[], modelDrafts: readonly string[]): RhythmReading {
  const read = (texts: readonly string[]): number[][] => texts.map(proseLengths).filter((l) => l.length >= MIN_SENTENCES);
  const w = read(writerTexts); const m = read(modelDrafts);
  const base = { pieces: w.length, drafts: m.length };
  if (w.length < MIN_PIECES || m.length < MIN_DRAFTS) {
    return { ...base, signature: null, writer: null, model: null,
      why: `too little to tell a rhythm from a piece: ${w.length} of your pieces and ${m.length} of the model's drafts have ${MIN_SENTENCES} prose sentences or more (${MIN_PIECES} and ${MIN_DRAFTS} are needed)` };
  }
  const wMed = w.map(mid); const wLong = w.map((l) => quantile(l, 0.9)); const mMed = m.map(mid); const mLong = m.map((l) => quantile(l, 0.9));
  const writer = { median: r1(mid(wMed)), long: r1(mid(wLong)), spread: Math.round(Math.max(spreadOf(wMed), spreadOf(wLong)) * 100) / 100 };
  const model = { median: r1(mid(mMed)), long: r1(mid(mLong)) };
  const onMedian = apart(wMed, mMed); const onLong = apart(wLong, mLong);
  const signature = onMedian ?? onLong;
  const numbers = `your typical sentence runs ${writer.median} words and your long ones ${writer.long}; the model's, on your topics, ${model.median} and ${model.long}`;
  if (signature) {
    return { ...base, signature, writer, model,
      why: `your sentences run ${signature === 'LONG' ? 'long' : 'short'} in piece after piece, and apart from what the model writes: ${numbers}, over ${w.length} of your pieces` };
  }
  const own = Math.max(spreadOf(wMed), spreadOf(wLong));
  return { ...base, signature: null, writer, model,
    why: own > MAX_OWN_SPREAD
      ? `how long your sentences run changes from piece to piece, so it follows the piece and is not held as a rule (${numbers})`
      : `your sentences run about as long as the model's, so their length sets nothing of yours apart (${numbers})` };
}

/** The measurements that are about how long sentences run, or how their lengths vary: what a rhythm signature gates. */
export function isSentenceLengthRule(m: { readonly observer: string; readonly params: Readonly<Record<string, unknown>> } | null | undefined): boolean {
  if (!m) return false;
  if (m.observer === 'SENTENCE_LENGTH' || m.observer === 'FRAGMENT_SHARE') return true;
  if (m.observer === 'RHYTHM') return ((m.params.unit as readonly string[] | undefined) ?? []).some((u) => /sentence/i.test(u));
  // A distribution over word-count edges is the mix of sentence lengths.
  return m.observer === 'DISTRIBUTION' && Array.isArray(m.params.edges);
}
