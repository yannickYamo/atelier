// atelier/core/loop/own-words.ts — THE PIECE SPEAKS TO ITS READER, NEVER ABOUT ITS OWN MAKING.
//
// A writer short of a fact, or told what it was not given, says so on the page: "The brief doesn't say when I first hit
// this", "I don't have the measured lift in front of me, and I'm not going to invent one". A reader of the post never saw
// a brief and never asked for the writer's scruples: the line breaks the piece. On a blind test such lines were in 21 of
// 25 deep posts and 13 of 25 plain ones, and none of the self-review baseline's; the judges named them every time.
//
// What is missing belongs beside the draft (the run's report, `inferred`), never in it. This reading finds, on the text
// a run is about to deliver, each sentence that talks about the piece's own making: its brief, notes, material or sources;
// what it was not given or does not know; what it will not invent or claim; the writer's process or its instructions. For
// each it writes the sentence again so it carries its point to the reader at the strength what is given supports (the
// claim argued as a view, the mechanism, the reasoning), or drops it where it carried nothing but the confession.
//
// Code grounds every answer: the sentence must be in the text as written; a rewrite is one sentence, adds no figure and no
// name that neither the sentence nor what was given holds, and is not the sentence as it was. With no model, nothing is
// read and the text stands, said as not checked: a run is never refused for it.

import { readContext, type Decision, type Reading } from '../inference/reading.js';
import type { Budget, InferenceClient } from '../inference/client.js';
import { numbersIn, namesIn } from './integrity.js';
import { sentencesOf } from '../observers/text.js';

export interface OwnWordsInput {
  /** the text about to be delivered */
  readonly text: string;
  /** the request and its material: the only figures and names a rewrite may add */
  readonly given: string;
}
export interface OwnWordsFix {
  /** the sentence as the text has it */
  readonly sentence: string;
  /** what it talked about, in a few words (the reading's own) */
  readonly about: string;
  /** the sentence carrying its point to the reader; null drops it */
  readonly rewrite: string | null;
}
export interface OwnWordsReading { readonly fixes: readonly OwnWordsFix[]; readonly dropped: readonly { readonly sentence: string; readonly why: string }[] }

/** The most sentences one reading rewrites. */
export const MAX_FIXES = 6;

export const OWN_WORDS_SYSTEM = `You read a piece of writing just before it is published, as an editor. Find every sentence where the piece talks about its own making instead of to its reader:
- it mentions a brief, notes, material, sources, instructions or a request it was written from;
- it says what it was not given, does not have, does not know or could not find ("the figure isn't in front of me", "no data was provided");
- it says what it will not invent, claim or make up, or apologises for a missing fact;
- it describes the writer's own process of writing it.

A bracketed slot the piece leaves for the author to fill (such as "[figure: what it measures]") is the author's own: leave it.

A sentence that states a limit of the subject itself, as the author would to a reader ("Nobody has measured this yet across the industry"), or the author's opinion plainly marked as theirs, is the piece talking to its reader: leave it.

For each sentence you find, give:
- sentence: copied exactly from the piece;
- about: what it talked about, in at most six words;
- rewrite: the same point carried to the reader, in the piece's voice, at the strength what the piece does say supports: argue it as the author's view, give the mechanism or the reasoning, or name what the reader should check. One sentence. No figure, name, date or story the piece does not already hold, in digits or in words. Never mention what is missing. Use null when the sentence carried nothing but the confession and the piece reads whole without it.

Most pieces have none: then answer with an empty list.`;

export const OWN_WORDS_SCHEMA: Record<string, unknown> = {
  type: 'object', additionalProperties: false, required: ['found'],
  properties: { found: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['sentence', 'about', 'rewrite'],
    properties: { sentence: { type: 'string' }, about: { type: 'string' }, rewrite: { type: ['string', 'null'] } } } } },
};

/** Where `sentence` stands in `text`, spaces and line breaks read as one: every place, in order. */
export function placesOf(text: string, sentence: string): { start: number; end: number }[] {
  const words = sentence.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return [];
  const re = new RegExp(words.join('\\s+'), 'g');
  return [...text.matchAll(re)].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
}
/** A slot the piece leaves for the author ("[figure: what it measures]"): the author's to fill, never this reading's. */
const SLOT = /\[[^\]\n]{2,}\]/;

const flat = (s: string): string => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

/** Figures written out in words: a rewrite that adds one adds a figure all the same. */
const WORD_FIGURES = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|dozens?|half|halves|thirds?|quarters?|percent|per cent|twice|double|triple|tenfold)\b/gi;
const wordFigures = (s: string): string[] => [...s.matchAll(WORD_FIGURES)].map((m) => m[0].toLowerCase());

/**
 * Why a rewrite may not stand in for `sentence`, or null. Code only. `held` is what a figure or a name may come from: the
 * request and its material, and the piece itself (a name the piece already uses is no new name).
 */
export function ownWordsProblem(sentence: string, rewrite: string, given: string, piece = ''): string | null {
  const r = rewrite.trim();
  if (!r) return 'the rewrite was empty';
  if (sentencesOf(r).length !== 1) return 'the rewrite is not one sentence';
  if (r.length > sentence.trim().length * 1.6 + 60) return 'the rewrite runs far longer than the sentence';
  if (flat(r) === flat(sentence)) return 'the rewrite is the sentence as it was';
  const held = `${sentence}\n${given}\n${piece}`;
  const figures = new Set(numbersIn(held));
  const newFigure = numbersIn(r).find((n) => !figures.has(n));
  if (newFigure) return `the rewrite states ${newFigure}, which nothing given holds`;
  const spelled = new Set(wordFigures(held));
  const newWord = wordFigures(r).find((w) => !spelled.has(w));
  if (newWord) return `the rewrite states "${newWord}", a figure nothing given holds`;
  // a name is given when what was given holds it anywhere, a sentence's first word included (where no capital marks a name)
  const words = flat(held).replace(/[^\p{L}\p{N}\s'-]/gu, ' ');
  const extra = namesIn(r).filter((x) => !` ${words} `.includes(` ${flat(x).replace(/[^\p{L}\p{N}\s'-]/gu, ' ').trim()} `));
  if (extra.length) return `the rewrite names ${extra.join(', ')}, which nothing given holds`;
  return null;
}

export const OWN_WORDS: Reading<OwnWordsInput, OwnWordsReading> = {
  id: 'own-words', version: '2', system: OWN_WORDS_SYSTEM, schema: OWN_WORDS_SCHEMA,
  toolName: 'emit_own_words', toolDescription: 'The sentences where the piece talks about its own making, each written again to speak to the reader, or dropped.',
  maxTokens: 1500, estimateUsd: 0.01,
  prompt: (i) => `<piece>\n${i.text.trim()}\n</piece>`,
  decide: (i) => (i.text.trim() ? null : { fixes: [], dropped: [] }),
  ground(raw, i) {
    // a bump of the version: the slot rule, figures in words, and the piece's own names (2026-11-03)
    const found = (raw as { found?: unknown } | null)?.found;
    if (!Array.isArray(found)) return null;
    const fixes: OwnWordsFix[] = []; const dropped: { sentence: string; why: string }[] = [];
    for (const f of found as { sentence?: unknown; about?: unknown; rewrite?: unknown }[]) {
      const sentence = typeof f?.sentence === 'string' ? f.sentence.trim() : '';
      if (!sentence) continue;
      if (!placesOf(i.text, sentence).length) { dropped.push({ sentence, why: 'the sentence is not in the piece as written' }); continue; }
      if (SLOT.test(sentence)) { dropped.push({ sentence, why: 'it holds a slot for the author to fill' }); continue; }
      if (fixes.some((x) => x.sentence === sentence)) continue;
      if (fixes.length >= MAX_FIXES) { dropped.push({ sentence, why: `at most ${MAX_FIXES} sentences are rewritten in one read` }); continue; }
      const about = typeof f.about === 'string' ? f.about.trim().slice(0, 80) : '';
      if (f.rewrite === null) { fixes.push({ sentence, about, rewrite: null }); continue; }
      const rewrite = typeof f.rewrite === 'string' ? f.rewrite.trim() : '';
      const problem = ownWordsProblem(sentence, rewrite, i.given, i.text);
      // a rewrite that does not hold leaves the sentence for the person, listed: never a deletion the reading did not ask for
      if (problem) { dropped.push({ sentence, why: problem }); continue; }
      fixes.push({ sentence, about, rewrite });
    }
    return { fixes, dropped };
  },
  floor: () => ({ fixes: [], dropped: [] }),
};

/** The reading on one text: what to change, by a model, or nothing (not checked) without one. */
export function readOwnWords(input: OwnWordsInput, client: InferenceClient | null, model: string | null, budget: Budget): Promise<Decision<OwnWordsReading>> {
  return readContext(OWN_WORDS, input, client, model, budget, 'repair');
}

/** The text with each fix applied where its sentence stands, every place it stands: a rewrite in place, a drop with the
 * space around it closed, and a line left with only its list marker or empty emphasis removed. */
export function withOwnWords(text: string, fixes: readonly OwnWordsFix[]): string {
  let out = text;
  for (const f of fixes) {
    for (const at of placesOf(out, f.sentence).reverse()) {
      if (f.rewrite !== null) { out = `${out.slice(0, at.start)}${f.rewrite}${out.slice(at.end)}`; continue; }
      const before = out.slice(0, at.start); const after = out.slice(at.end);
      out = before.endsWith(' ') ? `${before.slice(0, -1)}${after}` : after.startsWith(' ') ? `${before}${after.slice(1)}` : `${before}${after}`;
    }
  }
  // what a drop can leave: empty emphasis ("****", "__"), and a line that is only a list marker or a quote mark
  out = out.replace(/ ?(\*\*|__)\s*\1/g, '').replace(/^[ \t]*(?:[-*+•]|\d+[.)]|>)[ \t]*$/gm, '').replace(/[ \t]+$/gm, '');
  return out.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n{2,}$/, '\n');
}

/** The one line said of what was found and done. */
export function ownWordsNote(fixes: readonly OwnWordsFix[]): string {
  const re = fixes.filter((f) => f.rewrite !== null).length; const cut = fixes.length - re;
  return `The piece talked about its own making in ${fixes.length} sentence(s) (${fixes.map((f) => f.about || 'its notes').join('; ')}): ${[re ? `${re} written again to speak to the reader` : '', cut ? `${cut} dropped` : ''].filter(Boolean).join(', ')}. What was missing is listed beside the draft, never in it.`;
}
