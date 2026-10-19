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
//               (`selectWithinBudget`): opt-in, for a smaller skill that still shows the author's range
//   length      the author's usual piece length, the middle half of their pieces (`usualLength`), which a
//               rules-only skill lost: its output ran 1,500 words where the author's run 2,000 or more
//   passages    the first design, a few short passages served inline; kept so
//               packages built with it still render; nothing chooses them now
//
// Pieces reserved for blind testing never reach this module: callers pass readable pieces only.

import { oneLength } from '../intake/length.js';
import type { ScopeProfile } from './scope.js';
import type { TraitClass } from '../composite/traits.js';
import { quantile } from '../observers/text.js';
import { functionProfile, proseWords, patternRate, type PatternId } from '../observers/style.js';
import type { Persona } from './persona.js';
import { contextClassOf } from '../fidelity/types.js';

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
  /** six-word runs found in three or more separate pieces of the corpus: the author's standard wording, not counted as copying (../observers/overlap.ts). Kept with the stored voice, never in a package */
  readonly standardWording?: readonly string[];
  /** the moves that reading covered, by requirement id: a build reads again only when a move is not among them */
  readonly holdsBackOf?: readonly string[];
  /** the shortest and the longest of the author's pieces, in prose words (`lengthSpan`): what an output is held to when the request names no length. Kept with the stored voice, never in a package */
  readonly lengthSpan?: readonly [number, number];
  /** how many pieces `lengthSpan` was read from: a span of three says little about how long the fourth runs */
  readonly lengthPieces?: number;
  /** the longest run of words any one of the author's pieces shares with another, standard wording left out (../observers/overlap.ts, `sharedAmong`). Kept with the stored voice, never in a package */
  readonly sharedAmong?: number;
  /** pieces chosen to span the author's modes, served as reference files: whole (`selectVoicePieces`), or as excerpts */
  readonly pieces?: readonly string[];
  /**
   * THE REQUEST EACH PIECE ANSWERED, in the order of `pieces`, where its file carried one (`request:` front matter);
   * null where it did not. Served beside the piece, so the writer sees a request and what the author made of it: the
   * piece is an answer to that request, and its subject is that request's, never the next one's.
   */
  readonly pieceRequests?: readonly (string | null)[];
  /** how `pieces` are shown. Absent: whole, which is every skill built before excerpts existed */
  readonly pieceForm?: PieceForm;
  /** the word budget the pieces were chosen within, when the owner set one (`--piece-budget`); absent: the default */
  readonly pieceBudget?: number;
  /** how the author sounds, described with frequencies and proven by quotes (./persona.ts) */
  readonly persona?: Persona;
  /** the form of the work as read at build (core/observers/work-form.ts): how the skill is compiled; null when nothing read it */
  readonly form?: 'REPLY' | 'DOCUMENT';
  /** every piece served whole, as a build from a method serves them: no later build spreads or budgets them unless asked to (cli/commands/build.ts) */
  readonly servedWhole?: true;
  /**
   * A COMPOSITE VOICE (core/composite): the skill was built from pieces by several authors, and the owner chose what
   * to take from each. The "how I sound" section is written from these traits, never from one author's description;
   * `pieceAuthors` names the writer of each served piece, so no piece is read as the whole voice.
   */
  readonly composite?: CompositeVoice;
  /**
   * EVERY PIECE OF EVERY CHOSEN AUTHOR, for the copying check alone (cli/eval-run.ts): a phrase lifted from any of them
   * is copying, served or not. Kept with the stored voice, never in a package.
   */
  readonly guardPieces?: readonly string[];
}

/**
 * WHAT AN OUTPUT IS CHECKED FOR COPYING AGAINST: the passages and pieces the skill serves and, for a composite, every
 * piece of every author it was combined from, served or not. A sentence lifted from any of them is copying.
 */
export const copyGuardPieces = (voice: Pick<Voice, 'passages' | 'pieces' | 'guardPieces'> | null | undefined): string[] => {
  const served = [...(voice?.passages ?? []), ...(voice?.pieces ?? [])];
  return [...served, ...(voice?.guardPieces ?? []).filter((p) => !served.includes(p))];
};

export interface CompositeVoice {
  readonly authors: readonly { readonly name: string; readonly classes: readonly TraitClass[]; readonly traits: readonly string[] }[];
  /** the author of each entry of `pieces`, in order */
  readonly pieceAuthors: readonly string[];
}

/**
 * ONE PIECE FROM EACH CHOSEN AUTHOR, within a budget (core/composite). Not the spanning choice over the pool, which
 * would take two of one writer and none of another: each author's most typical piece of their own (one, when they
 * have one), in author order, as excerpts by default, while the budget allows. The budget is shared equally, and
 * what one author's piece leaves is not given to the next, so no author is served more than another.
 */
export function selectCompositePieces(groups: readonly { readonly author: string; readonly pieces: readonly string[] }[], budgetWords: number, form: PieceForm = 'excerpts'): { author: string; text: string }[] {
  const chosen = groups.filter((g) => g.pieces.length);
  if (!chosen.length || budgetWords <= 0) return [];
  const share = Math.floor(budgetWords / chosen.length);
  return chosen.flatMap((g) => {
    const score = g.pieces.length >= 3 ? typicality(g.pieces) : () => 0;
    const ordered = g.pieces.map((t) => t).sort((a, b) => score(a) - score(b));
    for (const piece of ordered) {
      const shown = form === 'excerpts' ? excerptOf(piece) : piece;
      if (shown.trim() && exportWords(shown) + exportWords(pieceLabel(1, form === 'excerpts' && isExcerpt(shown), g.author)) <= share) return [{ author: g.author, text: shown }];
    }
    return [];
  });
}

/**
 * The middle half of the author's piece lengths in prose words; null under three pieces. Rounded to 100 from 200
 * words up and to 10 below: with a floor of 100, answers of 9 to 108 words were described as "about 100 words".
 */
export function usualLength(pieces: readonly string[]): readonly [number, number] | null {
  const lengths = pieces.map((t) => proseWords(t)).filter((n) => n > 0);
  const round = (n: number): number => (n < 200 ? Math.max(10, Math.round(n / 10) * 10) : Math.round(n / 100) * 100);
  if (lengths.length < 3) return null;
  const q1 = quantile(lengths, 0.25); const q3 = quantile(lengths, 0.75);
  // Pieces of very different lengths have no usual length: none is said, and the request sets it (`oneLength`).
  return oneLength(q1, q3) ? [round(q1), round(q3)] as const : null;
}

/** The shortest and the longest of the author's pieces in prose words; null under three pieces, where one odd piece is a third of the evidence. */
export function lengthSpan(pieces: readonly string[]): readonly [number, number] | null {
  const lengths = pieces.map((t) => proseWords(t)).filter((n) => n > 0);
  if (lengths.length < 3) return null;
  const lo = Math.min(...lengths); const hi = Math.max(...lengths);
  // a span that is no length in common holds nothing: no draft is chosen or written again toward it
  return oneLength(lo, hi) ? [lo, hi] as const : null;
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
 * Words of the author's pieces a skill serves at most, by default: enough for two or three whole pieces. On the two
 * skills first measured, these pieces were seven words in ten of the export (core/eval/size.ts), so the budget is
 * the owner's to set per build (`--piece-budget`); the default moves only on a measured comparison.
 */
export const PIECE_BUDGET_WORDS = 9000;

/**
 * THE COMPACT DEFAULT FOR A SKILL THAT WRITES FROM THE AUTHOR'S PIECES, at its first build: passages from more pieces
 * within 3,000 words, exactly what `--piece-budget 3000 --pieces excerpts` chooses, and stored on the skill as if the
 * owner had asked for it, so a rebuild chooses the same whatever this default later becomes. Measured on one
 * newsletter skill against the whole serving: an export of 7,121 words against 12,555, a run 34% cheaper, and no
 * loss of quality measured on five titles (CHANGELOG). The whole serving stays as the recorded fallback:
 * `--pieces whole --piece-budget default`. Not applied to a skill that answers (its examples are short and shown
 * whole) nor to one built from a method, and never to a skill that already holds a voice (cli/commands/build.ts).
 */
export const COMPACT_PIECE_BUDGET_WORDS = 3000;
export const COMPACT_PIECE_FORM: PieceForm = 'excerpts';

/**
 * THE DEFAULT FOR A SKILL THAT WRITES FROM THE AUTHOR'S PIECES, at its first build: whole pieces, chosen to span how
 * they write, within 8,000 words (owner's ruling after an outside test in which the author's essays pasted whole beat
 * the compact excerpts on voice). Whole pieces carry what excerpts cut: how an argument is built, opened and closed.
 * Stored on the skill as if asked for, so a rebuild keeps it; `--pieces excerpts --piece-budget 3000` is the compact
 * serving, one flag away. Provisional: the next comparison on fresh tasks says whether it closes the gap.
 */
export const WRITING_PIECE_BUDGET_WORDS = 8000;

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
 * Pieces longer than half the budget are left out, so one long piece cannot use it all. This is the
 * DEFAULT selection and is kept as it has always been, down to what it counts: words of prose, in Latin
 * script, with code, tables and headings served and not counted. A budget the owner sets is held more
 * strictly (`selectWithinBudget`). Needs two pieces or more (two are what pasting them would show); a budget of 0 chooses none.
 */
export function selectVoicePieces(pieces: readonly string[], budgetWords = PIECE_BUDGET_WORDS): string[] {
  if (pieces.length < 2 || budgetWords <= 0) return [];
  const words = pieces.map((t) => proseWords(t));
  const fits = pieces.map((_, i) => i).filter((i) => words[i] > 0 && words[i] <= budgetWords / 2);
  return spanningOrder(pieces, fits, (i) => words[i], budgetWords).map((i) => pieces[i]);
}

/** About this many words for each of the two passages an excerpt shows. */
export const EXCERPT_WORDS = 250;
/** What stands where an excerpt leaves text out, so a reader never takes two passages for one continuous text. */
export const EXCERPT_GAP = '[…]';

/**
 * Whether a piece chosen under `excerpts` was cut: it carries the mark. A short piece is served whole and is not.
 * Only meaningful for a voice whose form is `excerpts`: an author may write the mark in a piece of their own.
 */
export const isExcerpt = (piece: string): boolean => piece.includes(EXCERPT_GAP);

/**
 * THE LINE THAT OPENS A PIECE'S FILE in the compiled skill (renderers/agent-skill/render.ts). It lives here because
 * a budget the owner sets is a ceiling on what the export counts, and the export counts this line. It says what the
 * file holds: a model told it holds a whole piece takes a cut for the ending, and one told it holds passages looks
 * for a cut that is not there.
 */
export const pieceLabel = (n: number, cut: boolean, author?: string): string => (author
  ? `[voice-${n}] ${cut ? `Passages from one piece by ${author} (its opening and a part from its middle; ${EXCERPT_GAP} marks what is left out)` : `One whole piece by ${author}`}, one of the writers this voice is combined from. Take from it only the trait named for ${author} in SKILL.md. Not content, and not words: never reuse its topic, facts, names, figures, sentences, phrases or coined terms.`
  // The one frame around the pieces is in SKILL.md (renderers/agent-skill/render.ts, WRITE_LIKE_THESE): the label says what the file is, and no more.
  : `[voice-${n}] ${cut ? `Passages from one piece of mine (its opening and a part from its middle; ${EXCERPT_GAP} marks what is left out)` : 'One whole piece of mine'}, for how it is written.`);

/**
 * WORDS, IN ANY SCRIPT. The counted checks read English and count Latin words (`wordsOf`); measured that way a
 * Russian piece is a handful of digits and a Chinese one is empty, so a budget in those words is no budget and an
 * excerpt is never cut. Here a word is a run of letters or digits in any script, and each Han or kana character is
 * one, since those scripts put no space between words.
 */
const scriptWords = (text: string): number => (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []).length;

/**
 * WHAT A PIECE COSTS OF A BUDGET THE OWNER SET: the larger of its words in any script and its words as an export
 * counts them (runs of non-whitespace, so code, tables and marks count). The larger, so the budget is a ceiling on
 * the number `atelier export` prints for "your pieces" whatever the piece is made of.
 */
const exportWords = (text: string): number => { const t = text.trim(); return Math.max(scriptWords(t), t ? t.split(/\s+/).length : 0); };

/** A stretch of the piece, by its offsets in the text. */
interface Unit { readonly start: number; readonly end: number; readonly words: number }

/** A line that opens or closes a fenced code block: three or more backticks or tildes, alone on the line but for an info string on the opener. */
const fenceOf = (line: string): { readonly mark: string; readonly bare: boolean } | null => {
  const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!m || (m[1].startsWith('`') && m[2].includes('`'))) return null;     // ```code``` on one line is inline code, not a fence
  return { mark: m[1], bare: m[2].trim() === '' };
};

/**
 * A PIECE AS UNITS AN EXCERPT CAN BE BUILT FROM. A unit is a block as the author laid it out (text between blank
 * lines; a fenced code block is one unit, blank lines and all). A block longer than a passage is taken apart, or a
 * piece written as one long paragraph, or with single line breaks, would have no excerpt shorter than itself: first
 * at its line breaks, then, for a line still too long, at its sentence ends. Units are offsets into the text, so a
 * passage is always one unbroken stretch of the piece, byte for byte. A fence that is never closed is plain text.
 * Sentence ends are found by punctuation alone (a mark and a space; in Chinese and Japanese, the mark), so a passage
 * of one very long paragraph can stop after "Dr.".
 */
function unitsOf(text: string): Unit[] {
  const lines: { start: number; end: number; text: string }[] = [];
  for (let at = 0; at <= text.length;) { const nl = text.indexOf('\n', at); const end = nl === -1 ? text.length : nl; lines.push({ start: at, end, text: text.slice(at, end) }); at = end + 1; }
  // Which lines are inside a fenced block that closes: an opener, then the first later line that closes it.
  const fenced = new Array<boolean>(lines.length).fill(false);
  const marks = lines.map((l) => fenceOf(l.text));
  // The shortest opener of each character already found to have no closer after it: a later, longer one has none
  // either, so a piece of many unclosed openers is scanned once and not once per opener.
  const unclosed = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const open = marks[i];
    if (!open) continue;
    const ch = open.mark.charAt(0);
    if (open.mark.length >= (unclosed.get(ch) ?? Infinity)) continue;
    let close = -1;
    for (let j = i + 1; j < lines.length; j++) { const f = marks[j]; if (f?.bare && f.mark.startsWith(ch) && f.mark.length >= open.mark.length) { close = j; break; } }
    if (close === -1) { unclosed.set(ch, open.mark.length); continue; }
    for (let j = i; j <= close; j++) fenced[j] = true;
    i = close;
  }
  const out: Unit[] = [];
  const push = (start: number, end: number): void => { const words = scriptWords(text.slice(start, end)); if (words > 0 || text.slice(start, end).trim()) out.push({ start, end, words }); };
  for (let i = 0; i < lines.length;) {
    if (!fenced[i] && !lines[i].text.trim()) { i++; continue; }
    let j = i;
    // A block runs to the next blank line outside code; code is never taken apart, and stays with the block it touches.
    while (j + 1 < lines.length && (fenced[j + 1] || lines[j + 1].text.trim())) j++;
    const block = { start: lines[i].start, end: lines[j].end };
    const holdsCode = fenced.slice(i, j + 1).some(Boolean);
    if (holdsCode || scriptWords(text.slice(block.start, block.end)) <= EXCERPT_WORDS) push(block.start, block.end);
    else {
      for (let k = i; k <= j; k++) {
        const line = lines[k];
        if (scriptWords(line.text) <= EXCERPT_WORDS) { push(line.start, line.end); continue; }
        let from = line.start;
        for (const m of line.text.matchAll(/(?:[.!?]["'”’)\]]?\s+|[。！？][”’」』）]?\s*)(?=\S)/gu)) {
          const stop = line.start + (m.index ?? 0) + m[0].trimEnd().length;
          push(from, stop); from = line.start + (m.index ?? 0) + m[0].length;
        }
        push(from, line.end);
      }
    }
    i = j + 1;
  }
  return out;
}

/**
 * ONE PIECE SHOWN BY ITS OPENING AND A PASSAGE FROM ITS MIDDLE, about EXCERPT_WORDS each. Each passage is one
 * unbroken stretch of the piece, exactly as the author wrote it: the opening runs from the first unit until it has
 * the words, the middle starts at the unit the piece's midpoint falls in. Front matter is not the author's prose and
 * is left out. A piece too short to leave anything out is returned whole, with no mark, and is then not an excerpt
 * (`isExcerpt`). A passage can run over EXCERPT_WORDS by its last unit, which is at most a paragraph of that length,
 * a sentence, or a block of code.
 */
export function excerptOf(piece: string): string {
  const source = piece.replace(/\r\n?/g, '\n');
  // Front matter is a block of `key: value` lines between two rules at the very top; a piece that merely opens with a
  // rule, and has another further down, has none.
  const front = /^---\n(?=[\w-]+[ \t]*:)[\s\S]*?\n---[ \t]*(?:\n|$)/.exec(source);
  const text = front ? source.slice(front[0].length) : source;
  const units = unitsOf(text);
  const total = units.reduce((n, u) => n + u.words, 0);
  const whole = text.trim();
  if (!units.length || total <= EXCERPT_WORDS * 3) return whole;
  const run = (from: number): number => { let n = 0; let j = from; while (j < units.length && n < EXCERPT_WORDS) n += units[j++].words; return j; };
  const stretch = (from: number, to: number): string => text.slice(units[from].start, units[to - 1].end);
  const openEnd = run(0);
  // The unit the piece's midpoint falls in, or the first one after the opening when the opening already reached it.
  let seen = 0; let mid = 0;
  while (mid < units.length - 1 && seen + units[mid].words < total / 2) seen += units[mid++].words;
  const midStart = Math.max(mid, openEnd);
  if (midStart >= units.length) return whole;
  const midEnd = run(midStart);
  const tail = midEnd < units.length ? `\n\n${EXCERPT_GAP}` : '';
  // Passages that touch are one stretch of the piece; a real cut is marked.
  if (midStart === openEnd) return tail ? `${stretch(0, midEnd)}${tail}` : whole;
  return `${stretch(0, openEnd)}\n\n${EXCERPT_GAP}\n\n${stretch(midStart, midEnd)}${tail}`;
}

/**
 * THE AUTHOR'S PIECES WITHIN A BUDGET THE OWNER SET (`--piece-budget`), whole or as excerpts. Chosen in the same
 * order as the default (`spanningOrder`: the most typical, then the least like any chosen), and held to the budget
 * as a ceiling on what the export will count for them: each piece costs its words as exported, in any script, plus
 * the line that opens its file (`pieceLabel`), and no piece is chosen that would pass the budget, the first
 * included. A whole piece may use the whole budget: the owner who sets 3,000 words has said what one piece may
 * take.
 *
 * `excerpts` shows each piece by its opening and a passage from its middle (`excerptOf`), so the same words reach
 * more pieces. Whether that carries a voice as well as whole pieces do is a question for a measured comparison.
 */
export function selectWithinBudget(pieces: readonly string[], budgetWords: number, form: PieceForm): string[] {
  if (pieces.length < 3 || budgetWords <= 0) return [];
  const shown = form === 'excerpts' ? pieces.map(excerptOf) : pieces.map((t) => t);
  // The label's length does not depend on the file's number beyond a digit: counted for the first file.
  const cost = shown.map((t) => (t.trim() ? exportWords(t) + exportWords(pieceLabel(1, form === 'excerpts' && isExcerpt(t))) : 0));
  const eligible = pieces.map((_, i) => i).filter((i) => cost[i] > 0 && cost[i] <= budgetWords);
  return spanningOrder(pieces, eligible, (i) => cost[i], budgetWords).map((i) => shown[i]);
}

/**
 * THE LENGTH OF A COMPOSITE: the range the chosen writers' usual lengths span (each writer's median piece), or null
 * when they write pieces of different length classes (core/fidelity/types.ts): one length over all of them would be
 * the average nobody chose, and a request names its own. Null too when the authors' rules on the piece's length are
 * left open (`lengthOpen`: a conflict on it nobody answered, so neither side instructs): a band read from their
 * medians would decide what the person has not, so the skill says nothing of length and the person sets it.
 */
export function compositeLength(byAuthor: readonly (readonly string[])[], lengthOpen = false): readonly [number, number] | null {
  if (lengthOpen) return null;
  const medians = byAuthor.map((ps) => ps.map((t) => proseWords(t)).filter((n) => n > 0)).filter((ls) => ls.length).map((ls) => quantile(ls, 0.5));
  if (!medians.length || new Set(medians.map((m) => contextClassOf(Math.round(m)))).size > 1) return null;
  const round = (n: number): number => (n < 200 ? Math.max(10, Math.round(n / 10) * 10) : Math.round(n / 100) * 100);
  return [round(Math.min(...medians)), round(Math.max(...medians))] as const;
}
