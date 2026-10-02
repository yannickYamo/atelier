// atelier/core/voice/pairs.ts — THE PAIR BANK: THE SAME CONTENT, PLAIN AND AS THE AUTHOR WROTE IT.
//
// Showing a model the author's pieces teaches it their topics along with their voice, and it reuses both.
// A pair holds the content still: one paragraph of the author's, and the same facts in plain neutral
// English. What differs between the two sides is only how it is said, which is the thing to learn.
//
// The author side comes from the passages a skill already retrieves from (../fidelity/retrieval.ts): the
// pieces discovery READ, never the ones held back, so a reserved piece cannot enter the bank. The neutral
// side is written by a model, once, when the owner runs `atelier voice pairs`; every pair records which
// model wrote it, and a pair is kept only if it passes three deterministic checks:
//
//   facts      both sides carry the same figures, dates, quotations, links and names
//   length     the neutral side is between 0.6 and 1.4 of the author's, in words
//   changed    the neutral side is not the author's sentence returned: no shared run of 12 words
//
// "Neutral" is one model's idea of neutral. A bank written by one neutraliser teaches, in part, how to undo
// that model's habits, so the neutraliser is named on every pair and a bank may hold more than one.
//
// The bank is named by a hash of its pairs. A voice pass records the bank it drew its examples from.

import { createHash } from 'node:crypto';
import { wordsOf } from '../observers/text.js';
import { overlapIndex } from '../observers/overlap.js';
import { spend, BudgetExceeded, CallBudgetExceeded, UnboundedRuntime, type Budget, type InferenceClient } from '../inference/client.js';
import { termsOf, type Passage } from '../fidelity/retrieval.js';
import { factsMissing } from './integrity.js';

export const PAIR_WORDS: readonly [number, number] = [40, 300];
export const PAIR_LENGTH_RATIO: readonly [number, number] = [0.6, 1.4];
/** Below this many validated pairs a bank is too thin to show a model how the author sounds on anything. */
export const MIN_PAIRS = 12;

export interface VoicePair {
  readonly id: string;
  readonly piece: string;
  readonly neutral: string;
  readonly author: string;
  /** the model that wrote the neutral side */
  readonly neutraliser: string;
}

export type PairRejection = 'facts' | 'length' | 'unchanged' | 'failed';

export interface PairBank {
  readonly version: 1;
  /** the retrieval index the author's side came from */
  readonly sourceHash: string;
  readonly pairs: readonly VoicePair[];
  /** pairs dropped, by the check that dropped them */
  readonly rejected: Readonly<Record<PairRejection, number>>;
  readonly builtAt: string;
  /** hash of the pairs */
  readonly hash: string;
}

export const NEUTRALISE_SYSTEM = 'Rewrite the paragraph in plain, neutral, encyclopedic English. Keep every fact, figure, name, date, '
  + 'quotation and claim exactly, in the same order. Do not add or remove information. Do not imitate any author or keep '
  + 'distinctive phrasing. Return only the rewritten paragraph.';

const SCHEMA = { type: 'object', properties: { paragraph: { type: 'string' } }, required: ['paragraph'], additionalProperties: false };

export const pairsHash = (pairs: readonly VoicePair[]): string =>
  createHash('sha256').update(JSON.stringify(pairs.map((p) => [p.piece, p.neutral, p.author, p.neutraliser]))).digest('hex').slice(0, 16);

/** The author's paragraphs a pair can be made from: prose of 40 to 300 words that is not mostly quotation. */
export function pairCandidates(passages: readonly Passage[]): Passage[] {
  return passages.filter((p) => {
    const n = wordsOf(p.text).length;
    if (n < PAIR_WORDS[0] || n > PAIR_WORDS[1]) return false;
    const quoted = [...p.text.matchAll(/["“]([^"”]{2,})["”]/g)].reduce((a, m) => a + wordsOf(m[1]).length, 0);
    return quoted <= n / 2;
  });
}

/** Why a pair is refused, or null when it is kept. */
export function pairProblem(author: string, neutral: string): PairRejection | null {
  const a = wordsOf(author).length; const n = wordsOf(neutral).length;
  if (!n || n / a < PAIR_LENGTH_RATIO[0] || n / a > PAIR_LENGTH_RATIO[1]) return 'length';
  if (factsMissing(author, neutral).length || factsMissing(neutral, author).length) return 'facts';
  if (overlapIndex([author])(neutral).longestShared >= 12) return 'unchanged';
  return null;
}

/**
 * Build a bank: one metered call per candidate paragraph, each neutral side validated in code. A call that
 * fails costs that pair, never the bank. Stops quietly when the budget is reached and keeps what it has.
 */
export async function buildPairBank(client: InferenceClient, budget: Budget, passages: readonly Passage[], sourceHash: string,
  neutraliser: string, at: string, onProgress: (done: number, of: number) => void = () => undefined): Promise<PairBank> {
  const candidates = pairCandidates(passages);
  const pairs: VoicePair[] = [];
  const rejected: Record<PairRejection, number> = { facts: 0, length: 0, unchanged: 0, failed: 0 };
  for (const [i, c] of candidates.entries()) {
    let neutral: string;
    try {
      neutral = await spend(budget, 0.01, async () => {
        const x = await client.complete({ stableBlock: NEUTRALISE_SYSTEM, variableBlock: '', userMessage: c.text,
          toolName: 'emit_paragraph', toolDescription: 'Return the rewritten paragraph.', schema: SCHEMA, maxTokens: 1200, temperature: 0 });
        const out = (x.json as { paragraph?: unknown }).paragraph;
        return { value: typeof out === 'string' ? out.trim() : '', cost: x.cost };
      });
    } catch (e) {
      // Out of budget ends the build with what it has; any other failure costs this one pair.
      if (e instanceof BudgetExceeded || e instanceof CallBudgetExceeded || e instanceof UnboundedRuntime) break;
      rejected.failed += 1; continue;
    }
    const problem = pairProblem(c.text, neutral);
    if (problem) rejected[problem] += 1;
    else pairs.push({ id: createHash('sha256').update(`${c.piece}\n${c.text}`).digest('hex').slice(0, 12), piece: c.piece, neutral, author: c.text, neutraliser });
    onProgress(i + 1, candidates.length);
  }
  return { version: 1, sourceHash, pairs, rejected, builtAt: at, hash: pairsHash(pairs) };
}

/**
 * The `k` pairs whose NEUTRAL side is nearest to `text`, by index into `bank.pairs`: the examples closest in
 * content to the paragraph about to be rewritten. TF-IDF over the neutral sides, ties to the earlier pair,
 * and a pair sharing no term is never returned.
 */
export function nearestPairs(bank: PairBank, text: string, k: number): number[] {
  if (k <= 0 || !bank.pairs.length) return [];
  const docs = bank.pairs.map((p) => termsOf(p.neutral));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const vec = (terms: readonly string[]): Map<string, number> => {
    const tf = new Map<string, number>();
    for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    const v = new Map<string, number>();
    for (const [t, c] of tf) { const d = df.get(t); if (d !== undefined) v.set(t, (1 + Math.log(c)) * (Math.log((docs.length + 1) / (d + 1)) + 1)); }
    return v;
  };
  const cos = (a: Map<string, number>, b: Map<string, number>): number => {
    let dot = 0; let na = 0; let nb = 0;
    for (const [t, w] of a) { na += w * w; const o = b.get(t); if (o !== undefined) dot += w * o; }
    for (const w of b.values()) nb += w * w;
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  };
  const q = vec(termsOf(text));
  return docs.map((d, i) => ({ i, s: cos(q, vec(d)) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, k).map((x) => x.i);
}
