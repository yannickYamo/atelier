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
//   excerpts    the same choice over more pieces, each shown by its opening and a passage from its middle
//               (`selectVoiceExcerpts`): opt-in, for a smaller skill that still shows the author's range
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

/** How a chosen piece is shown: all of it, or its opening and a passage from its middle. */
export type PieceForm = 'whole' | 'excerpts';

/** What a skill serves of the author's own writing. */
export interface Voice {
  /** short passages served inline (the first design; kept so packages built with it still render) */
  readonly passages: readonly string[];
  /** the middle half of the author's piece lengths, in words. Stated for writing only: an answer's length belongs to its request (./scope.ts) */
  readonly lengthWords: readonly [number, number] | null;
  /** how much the author writes for what was asked, for a skill that answers requests (./scope.ts) */
  readonly scope?: ScopeProfile;
  /** readable pieces of the corpus the skill was built from: what a move's evidence is counted against (./applicability.ts) */
  readonly corpusPieces?: number;
  /** the moves a reader found to hold back what was asked (a refusal, a question before any answer), by requirement id */
  readonly holdsBack?: readonly string[];
  /** pieces chosen to span the author's modes, served as reference files: whole (`selectVoicePieces`), or as excerpts */
  readonly pieces?: readonly string[];
  /** how `pieces` are shown. Absent: whole, which is every skill built before excerpts existed */
  readonly pieceForm?: PieceForm;
  /** the word budget the pieces were chosen within, when the owner set one (`--piece-budget`); absent: the default */
  readonly pieceBudget?: number;
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

/**
 * Words of the author's pieces a skill serves at most, by default: enough for two or three whole pieces. On the two
 * skills first measured, these pieces were seven words in ten of the export (core/eval/size.ts), so the budget is
 * the owner's to set per build (`--piece-budget`); the default moves only on a measured comparison.
 */
export const PIECE_BUDGET_WORDS = 9000;

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
 * THE ORDER IN WHICH PIECES ARE CHOSEN TO SPAN HOW THE AUTHOR WRITES: the most typical piece first, then, while the
 * budget allows, the piece least like any already chosen (farthest-point sampling on standardised mode features).
 * `eligible` are the indexes that may be chosen and `cost` what each uses of the budget; typicality and the mode
 * features are always read on the whole pieces, whatever part of one is then shown.
 */
function spanningOrder(pieces: readonly string[], eligible: readonly number[], cost: (i: number) => number, budgetWords: number): number[] {
  if (!eligible.length) return [];
  const vs = pieces.map(modeVector);
  const k = vs[0].length;
  const mean = Array.from({ length: k }, (_, j) => vs.reduce((a, v) => a + v[j], 0) / vs.length);
  const sd = Array.from({ length: k }, (_, j) => Math.sqrt(vs.reduce((a, v) => a + (v[j] - mean[j]) ** 2, 0) / Math.max(1, vs.length - 1)) || 1);
  const z = vs.map((v) => v.map((x, j) => (x - mean[j]) / sd[j]));
  const dist = (a: number, b: number): number => Math.sqrt(z[a].reduce((s, x, j) => s + (x - z[b][j]) ** 2, 0));
  const score = typicality(pieces);
  const chosen = [eligible.slice().sort((a, b) => score(pieces[a]) - score(pieces[b]))[0]];
  let used = cost(chosen[0]);
  for (;;) {
    const next = eligible.filter((i) => !chosen.includes(i) && used + cost(i) <= budgetWords)
      .map((i) => ({ i, d: Math.min(...chosen.map((c) => dist(i, c))) })).sort((a, b) => b.d - a.d)[0];
    if (!next) break;
    chosen.push(next.i); used += cost(next.i);
  }
  return chosen;
}

/**
 * WHOLE PIECES THAT SPAN HOW THE AUTHOR WRITES. An author writes in modes (an essay, a list, a talk
 * transcript), and a short passage shows one paragraph of one of them. So: the most typical piece
 * first, then, while the word budget allows, the piece least like any already chosen (`spanningOrder`).
 * Pieces longer than half the budget are left out, so one long piece cannot use it all. The budget counts
 * words of prose, as it always has: code, tables and headings in a piece are served and not counted. Needs
 * three pieces or more; a budget of 0 chooses none.
 */
export function selectVoicePieces(pieces: readonly string[], budgetWords = PIECE_BUDGET_WORDS): string[] {
  if (pieces.length < 3 || budgetWords <= 0) return [];
  const words = pieces.map((t) => proseWords(t));
  const fits = pieces.map((_, i) => i).filter((i) => words[i] > 0 && words[i] <= budgetWords / 2);
  return spanningOrder(pieces, fits, (i) => words[i], budgetWords).map((i) => pieces[i]);
}

/** About this many words for each of the two passages an excerpt shows. */
export const EXCERPT_WORDS = 250;
/** What stands between an excerpt's two passages, so a reader never takes them for one continuous text. */
export const EXCERPT_GAP = '[…]';

/** One run of the author's text, and what stood between it and the run before it in the piece. */
interface Unit { readonly text: string; readonly gap: string }

/**
 * A PIECE AS UNITS AN EXCERPT CAN BE BUILT FROM, in the author's order and words. A unit is a block as the author laid
 * it out (text between blank lines; a fenced code block is one unit, blank lines and all). A block longer than a
 * passage is taken apart, or a piece written as one long paragraph, or with single line breaks, would have no
 * excerpt shorter than itself: first at its line breaks, then, for a line still too long, at its sentence ends.
 * Each unit remembers what joined it to the one before, so units put back together read exactly as the piece did.
 */
function unitsOf(text: string): Unit[] {
  const blocks: { text: string; fenced: boolean }[] = []; let held: string[] = []; let fence: string | null = null; let fenced = false;
  const flush = (): void => { if (held.some((l) => l.trim())) blocks.push({ text: held.join('\n').replace(/\s+$/, ''), fenced }); held = []; fenced = false; };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const mark = /^\s*(```|~~~)/.exec(line)?.[1] ?? null;
    if (fence) { held.push(line); if (mark === fence) fence = null; continue; }
    if (mark) { fence = mark; fenced = true; held.push(line); continue; }
    if (line.trim()) held.push(line); else flush();
  }
  flush();
  const long = (t: string): boolean => wordsOf(t).length > EXCERPT_WORDS;
  const out: Unit[] = [];
  for (const b of blocks) {
    // Code is never taken apart: half a block of code shows nothing of how the author writes it.
    const lines = b.fenced || !long(b.text) ? [b.text] : b.text.split('\n');
    lines.forEach((line, i) => {
      const sentences = b.fenced || !long(line) ? [line] : line.split(/(?<=[.!?]["')\]]?)\s+(?=\S)/);
      sentences.forEach((sentence, j) => out.push({ text: sentence, gap: j > 0 ? ' ' : i > 0 ? '\n' : '\n\n' }));
    });
  }
  return out;
}

/** Units put back together as they stood in the piece. */
const joined = (units: readonly Unit[]): string => units.map((u, i) => (i === 0 ? u.text : `${u.gap}${u.text}`)).join('');

/**
 * ONE PIECE SHOWN BY ITS OPENING AND A PASSAGE FROM ITS MIDDLE, about EXCERPT_WORDS each. The author's own words in
 * the author's order, never reworded, in whole units (`unitsOf`): the opening runs from the first unit until it has
 * the words, the middle starts at the unit the piece's midpoint falls in. A piece too short to leave anything out is
 * returned whole. A passage can run over EXCERPT_WORDS by its last unit, which is at most a paragraph of that
 * length, a sentence, or a block of code.
 */
export function excerptOf(text: string): string {
  const units = unitsOf(text);
  const words = units.map((u) => wordsOf(u.text).length);
  const total = words.reduce((a, b) => a + b, 0);
  if (total <= EXCERPT_WORDS * 3) return joined(units);
  const run = (from: number): number => { let n = 0; let j = from; while (j < units.length && n < EXCERPT_WORDS) n += words[j++]; return j; };
  const openEnd = run(0);
  // The unit the piece's midpoint falls in, or the first one after the opening when the opening already reached it.
  let seen = 0; let mid = 0;
  while (mid < units.length - 1 && seen + words[mid] < total / 2) seen += words[mid++];
  const midStart = Math.max(mid, openEnd);
  if (midStart >= units.length) return joined(units);
  const midEnd = run(midStart);
  // Contiguous passages are one run of the piece and are joined as it joined them; a real cut is marked.
  if (midStart === openEnd) return `${joined(units.slice(0, midEnd))}${midEnd < units.length ? `\n\n${EXCERPT_GAP}` : ''}`;
  return `${joined(units.slice(0, openEnd))}\n\n${EXCERPT_GAP}\n\n${joined(units.slice(midStart, midEnd))}${midEnd < units.length ? `\n\n${EXCERPT_GAP}` : ''}`;
}

/**
 * EXCERPTS FROM MORE PIECES, IN PLACE OF A FEW WHOLE ONES. Two or three whole essays show two or three of an
 * author's modes at length; for the same words, an opening and a middle passage from each of many pieces show more
 * of the range. Pieces are chosen exactly as whole ones are (`spanningOrder`), each costing its excerpt's words. A
 * piece of any length can be shown, but never one whose excerpt alone is over the budget: the budget is a ceiling,
 * for the first piece chosen as for the last. Opt-in (`--pieces excerpts`): whether it carries a voice as well as
 * whole pieces do is a question for a measured comparison, not for this function.
 */
export function selectVoiceExcerpts(pieces: readonly string[], budgetWords = PIECE_BUDGET_WORDS): string[] {
  if (pieces.length < 3 || budgetWords <= 0) return [];
  const excerpts = pieces.map(excerptOf);
  // Counted as an export counts them (runs of non-whitespace, the cut marks included), so the budget holds exactly
  // on the number a person reads off `atelier export`.
  const words = excerpts.map((t) => { const x = t.trim(); return x ? x.split(/\s+/).length : 0; });
  const eligible = pieces.map((_, i) => i).filter((i) => words[i] > 0 && words[i] <= budgetWords);
  return spanningOrder(pieces, eligible, (i) => words[i], budgetWords).map((i) => excerpts[i]);
}
