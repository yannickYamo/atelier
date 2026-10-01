// atelier/core/observers/pace.ts — HOW FAR EACH SENTENCE MOVES, READ OFF ITS WORDS.
//
// Studies found a skill reproducing an author's punctuation and tells while missing how their argument
// moves: some writers stay on one thing for a paragraph and then jump, others drift a little every
// sentence, and some come back to an early point many sentences later. Semantic pace is properly a
// question for embeddings, but a model call is not deterministic and is not free, and a sensor the loop
// steers on must be both. So this is a LEXICAL PROXY: each sentence is a bag of its content words, and
// how far one sentence moves from another is one minus the cosine of their bags. It misses synonyms and
// paraphrase (a sentence that says the same thing in new words reads as a jump); what it measures is
// whether the vocabulary moves, which is the part of pace a reader can see on the page.
//
// Content words are words of four or more letters that are not in STOP: short words and function words
// are shared by every pair of sentences and would make everything look on-topic.

import { wordsOf } from './text.js';

/**
 * Function words of four letters or more. They carry grammar, not topic, so two sentences sharing "about"
 * and "would" are no closer in what they discuss. Kept short on purpose: a long list starts removing words
 * that are topic for some writer.
 */
const STOP = new Set([
  'about', 'above', 'across', 'after', 'again', 'against', 'almost', 'along', 'already', 'also', 'although', 'always',
  'among', 'another', 'anyone', 'anything', 'around', 'away', 'back', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'cannot', 'come', 'comes', 'could', 'does', 'doing', 'done', 'down', 'during', 'each', 'either',
  'else', 'enough', 'even', 'ever', 'every', 'from', 'further', 'gets', 'give', 'goes', 'going', 'gone', 'have',
  'having', 'here', 'herself', 'himself', 'into', 'itself', 'just', 'know', 'last', 'less', 'like', 'made', 'make',
  'makes', 'many', 'might', 'more', 'most', 'much', 'must', 'myself', 'need', 'needs', 'never', 'next', 'nothing',
  'once', 'only', 'onto', 'other', 'others', 'ours', 'ourselves', 'over', 'perhaps', 'quite', 'rather', 'really',
  'same', 'says', 'seem', 'seems', 'shall', 'should', 'since', 'some', 'something', 'still', 'such', 'take', 'takes',
  'than', 'that', 'thats', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'thing', 'things',
  'this', 'those', 'though', 'through', 'thus', 'together', 'too', 'toward', 'towards', 'under', 'until', 'upon',
  'very', 'want', 'wants', 'well', 'were', 'what', 'whatever', 'when', 'where', 'whether', 'which', 'while', 'whom',
  'whose', 'will', 'with', 'within', 'without', 'would', 'your', 'yours', 'yourself', 'yourselves',
]);

/** A content-word bag: each word and how often it occurs. */
export type Bag = ReadonlyMap<string, number>;

/**
 * One word folded so "costs", "cost's" and "cost" count as the same topic: the possessive and a plain
 * plural -s are dropped. Not a stemmer: "running" and "ran" stay apart, which errs toward reading a
 * step as larger than it is, never smaller.
 */
const fold = (w: string): string => {
  const x = w.toLowerCase().replace(/['’]s$/, '').replace(/['’]/g, '');
  return x.length > 4 && x.endsWith('s') && !x.endsWith('ss') ? x.slice(0, -1) : x;
};

/** The content words of one sentence, as a bag. Empty when the sentence has none. */
export function bagOf(sentence: string): Bag {
  const bag = new Map<string, number>();
  for (const raw of wordsOf(sentence)) {
    if (!/^[A-Za-z]/.test(raw)) continue;
    const w = fold(raw);
    if (w.length < 4 || STOP.has(w)) continue;
    bag.set(w, (bag.get(w) ?? 0) + 1);
  }
  return bag;
}

/** The cosine of two bags: 1 for the same words in the same proportions, 0 for no word shared or an empty bag. */
export function cosine(a: Bag, b: Bag): number {
  if (!a.size || !b.size) return 0;
  let dot = 0; let na = 0; let nb = 0;
  for (const [w, x] of a) { na += x * x; const y = b.get(w); if (y) dot += x * y; }
  for (const y of b.values()) nb += y * y;
  return dot / Math.sqrt(na * nb);
}

/**
 * The step between each pair of consecutive sentences: 1 minus their cosine. A pair where either sentence
 * has no content word ("So it goes.") is skipped, not read as a full jump: it carries no lexical
 * information, and counting it as 1 would make a writer of short connective sentences look restless.
 */
export function paceSteps(bags: readonly Bag[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < bags.length; i++) if (bags[i].size && bags[i - 1].size) out.push(1 - cosine(bags[i], bags[i - 1]));
  return out;
}

/** How a callback is recognised: far enough back to be a return, close enough to be the same topic, and a break from the sentence before. */
export const CALLBACK = { gap: 5, hit: 0.25, miss: 0.1 } as const;

/**
 * The share of sentences that return to an earlier topic: the best cosine with any sentence at least
 * CALLBACK.gap earlier reaches CALLBACK.hit, while the cosine with the sentence just before stays under
 * CALLBACK.miss. The second condition is what makes it a return rather than a continuation: a writer who
 * stays on one topic matches everything far back too, and that is staying, not coming back.
 */
export function callbackShare(bags: readonly Bag[]): number {
  if (!bags.length) return 0;
  let hits = 0;
  for (let i = CALLBACK.gap; i < bags.length; i++) {
    if (!bags[i].size || cosine(bags[i], bags[i - 1]) >= CALLBACK.miss) continue;
    let best = 0;
    for (let j = 0; j <= i - CALLBACK.gap; j++) best = Math.max(best, cosine(bags[i], bags[j]));
    if (best >= CALLBACK.hit) hits += 1;
  }
  return hits / bags.length;
}
