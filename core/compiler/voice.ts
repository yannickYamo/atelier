// atelier/core/compiler/voice.ts — A FEW PASSAGES OF THE AUTHOR'S OWN, SERVED WITH THE SKILL.
//
// Rules describe a writer; they do not sound like one. In a blind round on one author's corpus, the
// model given the author's pieces in its prompt sounded more like them than the compiled skill did,
// although the skill met every one of its rules: the served skill held about 2,500 words of rules and
// statistics and not one paragraph the author wrote. So a skill now carries a handful of the author's
// own passages, chosen here, deterministically, and the rules and checks sit on top of them.
//
//   typical     each candidate passage (a run of consecutive prose paragraphs, no headings, lists,
//               code or links) is scored by Burrows' Delta against the author's own pieces: the
//               passage that sounds most like the author overall, not their most striking one
//   spread      passages come from different pieces, chosen greedily to share as few content words as
//               possible, so the model takes the voice rather than one piece's topic
//   length      the author's usual piece length (the middle half of their pieces), which a
//               rules-only skill lost: its output ran 1,500 words where the author's run 2,000 or more
//
// Pieces reserved for blind testing never reach this function: the caller passes readable pieces only.

import { paragraphsOf, wordsOf, quantile } from '../observers/text.js';
import { functionProfile, proseWords, FUNCTION_WORDS } from '../observers/style.js';

export interface VoicePassages {
  readonly passages: readonly string[];
  /** the middle half of the author's piece lengths, in words, rounded to 100 */
  readonly lengthWords: readonly [number, number] | null;
}

export const VOICE_PASSAGES = 3;
const MIN_WORDS = 120;
const MAX_WORDS = 320;

const FUNCTION = new Set(FUNCTION_WORDS);
const contentWords = (t: string): Set<string> =>
  new Set(wordsOf(t).map((w) => w.toLowerCase()).filter((w) => w.length > 3 && !FUNCTION.has(w)));

/** A paragraph that is prose: not a heading, list, quote, table, code, image or a line carrying a link. */
const isProse = (p: string): boolean => {
  const t = p.trim();
  return !!t && !/^(#|[-*+] |\d+[.)] |>|\||```|~~~|!\[)/.test(t) && !/https?:\/\/|\]\(/.test(t) && !t.includes('`');
};

/** Runs of consecutive prose paragraphs, each between MIN_WORDS and MAX_WORDS words. */
function windowsOf(text: string): string[] {
  const paras = paragraphsOf(text).map((p) => p.text.trim());
  const out: string[] = [];
  for (let i = 0; i < paras.length; i++) {
    if (!isProse(paras[i])) continue;
    let words = 0;
    for (let j = i; j < paras.length && isProse(paras[j]); j++) {
      words += wordsOf(paras[j]).length;
      if (words > MAX_WORDS) break;
      if (words >= MIN_WORDS) out.push(paras.slice(i, j + 1).join('\n\n'));
    }
  }
  return out;
}

/** Mean absolute z-difference of a text's function-word profile from the author's mean profile. */
function typicality(pieces: readonly string[]): (t: string) => number {
  const profiles = pieces.map((t) => functionProfile(t));
  const k = profiles[0]?.length ?? 0;
  const mean = Array.from({ length: k }, (_, i) => profiles.reduce((s, p) => s + p[i], 0) / profiles.length);
  const sd = Array.from({ length: k }, (_, i) => Math.sqrt(profiles.reduce((s, p) => s + (p[i] - mean[i]) ** 2, 0) / Math.max(1, profiles.length - 1)) || 1e-6);
  return (t) => { const p = functionProfile(t); return p.reduce((s, v, i) => s + Math.abs((v - mean[i]) / sd[i]), 0) / Math.max(1, k); };
}

/**
 * Choose up to VOICE_PASSAGES passages from the author's readable pieces. Needs at least three pieces;
 * fewer, and there is no telling a typical passage from an unusual one, so nothing is chosen.
 */
export function selectVoicePassages(pieces: readonly string[], count = VOICE_PASSAGES): VoicePassages {
  const lengths = pieces.map((t) => proseWords(t)).filter((n) => n > 0);
  const round = (n: number): number => Math.max(100, Math.round(n / 100) * 100);
  const lengthWords = lengths.length >= 3 ? [round(quantile(lengths, 0.25)), round(quantile(lengths, 0.75))] as const : null;
  if (pieces.length < 3) return { passages: [], lengthWords };
  const score = typicality(pieces);
  // The most typical window of each piece.
  const best = pieces.flatMap((t, i) => {
    const w = windowsOf(t).map((x) => ({ text: x, delta: score(x) })).sort((a, b) => a.delta - b.delta)[0];
    return w ? [{ piece: i, ...w, words: contentWords(w.text) }] : [];
  }).sort((a, b) => a.delta - b.delta);
  // Greedy: the most typical first, then each next one sharing the fewest content words with those chosen.
  const chosen: typeof best = [];
  while (chosen.length < count && chosen.length < best.length) {
    const left = best.filter((b) => !chosen.includes(b));
    const overlap = (b: (typeof best)[number]): number => chosen.reduce((m, c) => {
      const inter = [...b.words].filter((w) => c.words.has(w)).length;
      return Math.max(m, inter / Math.max(1, Math.min(b.words.size, c.words.size)));
    }, 0);
    left.sort((a, b) => (overlap(a) + a.delta / 10) - (overlap(b) + b.delta / 10));
    chosen.push(left[0]);
  }
  return { passages: chosen.map((c) => c.text), lengthWords };
}
