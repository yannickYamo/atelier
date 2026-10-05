// atelier/core/compiler/voice.ts — HOW THE AUTHOR SOUNDS, SERVED WITH THE SKILL: THEIR OWN PIECES AND LENGTH.
//
// Rules describe a writer; they do not sound like one. In blind rounds on one author's corpus, a skill
// that met every rule it held, and served not one paragraph the author wrote, was ranked least like the
// author. So a skill now carries the author's own writing, chosen here, deterministically, and the rules
// and checks sit on top of it (a persona of how they sound comes from ./persona.ts):
//
//   pieces      WHOLE pieces spanning the author's modes (an essay, a list, a talk transcript): the most
//               typical piece by Burrows' Delta first, then the piece least like any chosen, within a word
//               budget (`selectVoicePieces`)
//   length      the author's usual piece length, the middle half of their pieces (`usualLength`), which a
//               rules-only skill lost: its output ran 1,500 words where the author's run 2,000 or more
//   passages    the first design, a few short passages served inline (`selectVoicePassages`); kept so
//               packages built with it still render, and no longer chosen by `build`
//
// Pieces reserved for blind testing never reach this module: callers pass readable pieces only.

import type { ScopeProfile } from './scope.js';
import { paragraphsOf, wordsOf, quantile } from '../observers/text.js';
import { functionProfile, proseWords, patternRate, FUNCTION_WORDS, type PatternId } from '../observers/style.js';
import type { Persona } from './persona.js';

/** What a skill serves of the author's own writing. */
export interface Voice {
  /** short passages served inline (the first design; kept so packages built with it still render) */
  readonly passages: readonly string[];
  /** the middle half of the author's piece lengths, in words. Stated for writing only: an answer's length belongs to its request (./scope.ts) */
  readonly lengthWords: readonly [number, number] | null;
  /** how much the author writes for what was asked, for a skill that answers requests (./scope.ts) */
  readonly scope?: ScopeProfile;
  /** WHOLE pieces chosen to span the author's modes (`selectVoicePieces`), served as reference files */
  readonly pieces?: readonly string[];
  /** how the author sounds, described with frequencies and proven by quotes (./persona.ts) */
  readonly persona?: Persona;
}

/**
 * The middle half of the author's piece lengths in prose words; null under three pieces. Rounded to 100 from 200
 * words up and to 10 below: with a floor of 100, answers of 9 to 108 words were described as "about 100 words".
 */
export function usualLength(pieces: readonly string[]): readonly [number, number] | null {
  const lengths = pieces.map((t) => proseWords(t)).filter((n) => n > 0);
  const round = (n: number): number => (n < 200 ? Math.max(10, Math.round(n / 10) * 10) : Math.round(n / 100) * 100);
  return lengths.length >= 3 ? [round(quantile(lengths, 0.25)), round(quantile(lengths, 0.75))] as const : null;
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
 * LEGACY (the first design; `build` now serves whole pieces). Choose up to VOICE_PASSAGES passages from
 * the author's readable pieces. Needs at least three pieces;
 * fewer, and there is no telling a typical passage from an unusual one, so nothing is chosen.
 */
export function selectVoicePassages(pieces: readonly string[], count = VOICE_PASSAGES): Voice {
  const lengthWords = usualLength(pieces);
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

/** Words of whole pieces a skill serves at most: enough for two or three modes, small enough to serve. */
const PIECE_BUDGET_WORDS = 9000;

/** What distinguishes one mode of an author's writing from another: point of view, layout, pace, length. */
const MODE_FEATURES: readonly PatternId[] = ['FIRST_PERSON', 'ONE_LINE_PARAGRAPH', 'BOLD_SPAN', 'DASH_ASIDE', 'RHETORICAL_QUESTION', 'CONTRACTION'];
function modeVector(t: string): number[] {
  const lines = t.split('\n'); const n = Math.max(1, lines.filter((l) => l.trim()).length);
  return [...MODE_FEATURES.map((p) => patternRate(t, p)),
    lines.filter((l) => /^\s*([-*+]|\d+[.)])\s/.test(l)).length / n,     // how much of it is lists
    lines.filter((l) => /^#{1,6}\s/.test(l)).length / n,                  // how sectioned
    Math.log(Math.max(1, proseWords(t)))];
}

/**
 * WHOLE PIECES THAT SPAN HOW THE AUTHOR WRITES. An author writes in modes (an essay, a list, a talk
 * transcript), and a short passage shows one paragraph of one of them. So: the most typical piece
 * first, then, while the word budget allows, the piece least like any already chosen (farthest-point
 * sampling on standardised mode features). Pieces longer than half the budget are left out, so one
 * long piece cannot use it all. Needs three pieces or more.
 */
export function selectVoicePieces(pieces: readonly string[], budgetWords = PIECE_BUDGET_WORDS): string[] {
  if (pieces.length < 3) return [];
  const words = pieces.map((t) => proseWords(t));
  const fits = pieces.map((_, i) => i).filter((i) => words[i] > 0 && words[i] <= budgetWords / 2);
  if (!fits.length) return [];
  const vs = pieces.map(modeVector);
  const k = vs[0].length;
  const mean = Array.from({ length: k }, (_, j) => vs.reduce((a, v) => a + v[j], 0) / vs.length);
  const sd = Array.from({ length: k }, (_, j) => Math.sqrt(vs.reduce((a, v) => a + (v[j] - mean[j]) ** 2, 0) / Math.max(1, vs.length - 1)) || 1);
  const z = vs.map((v) => v.map((x, j) => (x - mean[j]) / sd[j]));
  const dist = (a: number, b: number): number => Math.sqrt(z[a].reduce((s, x, j) => s + (x - z[b][j]) ** 2, 0));
  const score = typicality(pieces);
  const chosen = [fits.slice().sort((a, b) => score(pieces[a]) - score(pieces[b]))[0]];
  let used = words[chosen[0]];
  for (;;) {
    const next = fits.filter((i) => !chosen.includes(i) && used + words[i] <= budgetWords)
      .map((i) => ({ i, d: Math.min(...chosen.map((c) => dist(i, c))) })).sort((a, b) => b.d - a.d)[0];
    if (!next) break;
    chosen.push(next.i); used += words[next.i];
  }
  return chosen.map((i) => pieces[i]);
}
