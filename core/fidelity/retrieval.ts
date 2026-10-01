// atelier/core/fidelity/retrieval.ts — THE AUTHOR'S OWN PASSAGES NEAREST TO A REQUEST.
//
// A skill already serves whole pieces chosen at build time to span the author's modes
// (../compiler/voice.ts). Those are the same for every request. What they cannot do is show how the
// author writes about something CLOSE to what was just asked: the register they take on that kind of
// subject, the paragraph length they use for it. Retrieval adds a few such passages per request.
//
// TF-IDF, not embeddings. It runs offline, is deterministic, has no model behind it to drift, and its
// index is small enough to hash and store with a release: a release names the index it retrieved from,
// so the passages an output was shown can be recovered from the record alone. Whether lexical nearness
// is the right nearness is a measured question for a study, not a reason to add a dependency first.
//
// THE PASSAGES ARE FOR VOICE, NEVER TO COPY. The rendered block says so, and a draft that lifts a run
// of 12 or more words from the author is flagged elsewhere in Atelier regardless of what it was shown.
//
// Passages are paragraphs of prose of at least MIN_PASSAGE_WORDS words: list items, headings, code and
// tables are not how the author's sentences move, and a short paragraph carries too few words to be
// near anything for a reason.

import { createHash } from 'node:crypto';
import { paragraphsOf, wordsOf } from '../observers/text.js';
import { FUNCTION_WORDS } from '../observers/style.js';

export const MIN_PASSAGE_WORDS = 40;

export interface Passage {
  /** the piece it came from, as the caller named it */
  readonly piece: string;
  readonly text: string;
}

/** Serialisable: passages in a fixed order, document frequencies, and a hash naming both. */
export interface RetrievalIndex {
  readonly version: 1;
  readonly passages: readonly Passage[];
  /** term -> how many passages contain it */
  readonly df: Readonly<Record<string, number>>;
  /** hash of the passages; df is derived from them */
  readonly hash: string;
}

/**
 * Function words carry style, not subject. Left in, they make every passage near every request in
 * proportion to its length, which is retrieval by size.
 */
const STOP = new Set(FUNCTION_WORDS.map((w) => w.toLowerCase()));
export const termsOf = (text: string): string[] =>
  wordsOf(text).map((w) => w.toLowerCase().replace(/[’']s$/, '').replace(/[’']/g, ''))
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));

/** The hash an index's passages are named by. Stable for the same pieces in the same order. */
export const passagesHash = (passages: readonly Passage[]): string =>
  createHash('sha256').update(JSON.stringify(passages.map((p) => [p.piece, p.text]))).digest('hex').slice(0, 16);

/** Paragraph passages of every piece, in piece order then paragraph order. */
export function buildRetrievalIndex(pieces: readonly { readonly id: string; readonly text: string }[]): RetrievalIndex {
  const passages: Passage[] = [];
  for (const piece of pieces) {
    for (const p of paragraphsOf(piece.text)) {
      const text = p.text.replace(/\s+/g, ' ').trim();
      if (wordsOf(text).length >= MIN_PASSAGE_WORDS) passages.push({ piece: piece.id, text });
    }
  }
  const counts = new Map<string, number>();
  for (const p of passages) for (const t of new Set(termsOf(p.text))) counts.set(t, (counts.get(t) ?? 0) + 1);
  // Sorted keys so the serialised index is byte-identical however the map was filled.
  const df: Record<string, number> = {};
  for (const t of [...counts.keys()].sort()) df[t] = counts.get(t) ?? 0;
  return { version: 1, passages, df, hash: passagesHash(passages) };
}

/** Smoothed IDF: a term in every passage still counts a little, a term in none is skipped. */
const idf = (index: RetrievalIndex, term: string): number => {
  const d = index.df[term] as number | undefined;
  return d === undefined ? 0 : Math.log((index.passages.length + 1) / (d + 1)) + 1;
};

function vectorOf(index: RetrievalIndex, text: string): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of termsOf(text)) tf.set(t, (tf.get(t) ?? 0) + 1);
  const v = new Map<string, number>();
  for (const [t, c] of tf) { const w = (1 + Math.log(c)) * idf(index, t); if (w > 0) v.set(t, w); }
  return v;
}

const cosine = (a: Map<string, number>, b: Map<string, number>): number => {
  let dot = 0; let na = 0; let nb = 0;
  for (const [t, w] of a) { na += w * w; const o = b.get(t); if (o !== undefined) dot += w * o; }
  for (const w of b.values()) nb += w * w;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

/**
 * The `k` passages nearest to `query`, by index into `index.passages`. Ties go to the earlier passage,
 * so the same request against the same index always retrieves the same passages. A passage sharing no
 * term with the request is never returned: nearness of zero is not nearness.
 */
export function retrieve(index: RetrievalIndex, query: string, k: number): number[] {
  if (k <= 0 || !index.passages.length) return [];
  const q = vectorOf(index, query);
  if (!q.size) return [];
  return index.passages
    .map((p, i) => ({ i, s: cosine(q, vectorOf(index, p.text)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, k)
    .map((x) => x.i);
}

/** The block a prompt carries. Empty when nothing was retrieved, so an absent block costs no tokens. */
export function renderRetrieved(index: RetrievalIndex, ids: readonly number[]): string {
  const shown = ids.filter((i) => Number.isInteger(i) && i >= 0 && i < index.passages.length);
  if (!shown.length) return '';
  return 'THE AUTHOR\'S OWN PASSAGES CLOSEST TO THIS REQUEST\n'
    + 'These were written by the author and chosen because they sit nearest to what was asked. Read them '
    + 'for how the author sounds on this kind of subject: how sentences move, how long paragraphs run, '
    + 'which register they take. They are for voice, never to copy: do not reuse their sentences or their '
    + 'specifics, and a run of 12 or more words lifted from them is flagged.\n'
    + '```text\n'
    + shown.map((i, n) => `[${n + 1}] ${index.passages[i].text}`).join('\n\n')
    + '\n```';
}
