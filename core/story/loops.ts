// atelier/core/story/loops.ts — THE QUESTIONS A PIECE OPENS AND PAYS OFF, READ AND PLACED.
//
// A piece holds a reader by keeping something in question: it opens a loop (a question, a stake, a promise, a
// set-up) at one point and pays it off at a later one. Every story check is a statistic on those loops, so the
// reading emits them and nothing else:
//
//   loops    {question, openQuote, closeQuote | null, kind}: what is put in question, where, and where it is answered
//   stakes   {what, forWhom, quote}: what is lost if it goes badly, and for whom
//   links    {quoteStart, link}: each beat after the first, and how it follows the one before it: AND_THEN (only
//            succession), BUT (it goes against what came before) or THEREFORE (it follows because of it)
//
// A small model reads (core/inference/reading.ts); code locates every quote and computes its position in the piece
// (./locate.ts); a finding whose quote is not in the piece is dropped. The piece is read twice, the second time with
// every list in the instructions reversed, and only what both reads place in the same sentence is kept. Agreement
// is reported as Cohen's κ, per kind of finding, over the piece's sentences. With no model, or a read code could not
// ground, nothing is placed and the result says it is unverified: a story check then reports nothing, never a miss.

import { createHash } from 'node:crypto';
import { readContext, type DecidedBy, type Reading } from '../inference/reading.js';
import type { Budget, InferenceClient } from '../inference/client.js';
import { cohenKappa } from '../stats/agreement.js';
import { indexText, locateQuote, type TextIndex } from './locate.js';

export const LOOP_KINDS = ['stakes', 'mystery', 'promise', 'setup'] as const;
export type LoopKind = typeof LOOP_KINDS[number];
export const LINKS = ['AND_THEN', 'BUT', 'THEREFORE'] as const;
export type Link = typeof LINKS[number];

/** A loop placed in the piece: positions are t ∈ [0,1], computed by code from the quotes. */
export interface PlacedLoop {
  readonly question: string;
  readonly kind: LoopKind;
  readonly openQuote: string;
  readonly closeQuote: string | null;
  readonly open: number;
  readonly close: number | null;
  /** first word of each quote, for spans */
  readonly openWord: number;
  readonly closeWord: number | null;
}
export interface PlacedStakes { readonly what: string; readonly forWhom: string; readonly quote: string; readonly at: number; readonly word: number }
export interface PlacedLink { readonly quoteStart: string; readonly link: Link; readonly at: number; readonly word: number }

/** The loop graph of one piece. */
export interface LoopGraph {
  /** total words: the denominator of every position */
  readonly words: number;
  readonly loops: readonly PlacedLoop[];
  readonly stakes: readonly PlacedStakes[];
  /** in position order */
  readonly links: readonly PlacedLink[];
  /** findings dropped because a quote was not in the piece (or a close came before its open) */
  readonly dropped: number;
}

const KIND_DEFS: Readonly<Record<LoopKind, string>> = {
  stakes: 'something is at risk: the reader is made to wonder whether it will be lost or saved',
  mystery: 'something is unexplained: the reader is made to wonder why, how or what',
  promise: 'the piece says it will show or give something later',
  setup: 'a detail, tool or claim is planted that only pays off later',
};
const LINK_DEFS: Readonly<Record<Link, string>> = {
  AND_THEN: 'it only comes next: nothing in it turns on what came before',
  BUT: 'it goes against what came before: a complication, a reversal, a counter-case',
  THEREFORE: 'it follows because of what came before: a consequence, a decision, a result',
};

const systemFor = (kinds: readonly LoopKind[], links: readonly Link[]): string => `You map how a piece of writing keeps its reader. You do not judge it.
Every quote you give must be copied word for word from the piece: at least a few consecutive words, enough to find the place.

1. LOOPS. A loop is a question the piece puts in the reader's mind at one point and answers at a later point. For each:
   - question: the question, in a few words of your own;
   - openQuote: the words where it is first raised;
   - closeQuote: the words where it is answered, or null when the piece never answers it;
   - kind, one of:
${kinds.map((k) => `     - ${k}: ${KIND_DEFS[k]}`).join('\n')}
2. STAKES. What is lost if things go badly, and for whom, with the words that say it (what, forWhom, quote). Only stakes the piece states.
3. BEATS. Split the piece into its beats (a beat is a unit of action or argument, usually a paragraph or a few sentences). For each beat AFTER THE FIRST give quoteStart (its first words) and link, how it follows the beat before it, one of:
${links.map((l) => `   - ${l}: ${LINK_DEFS[l]}`).join('\n')}
Report only what is in the piece. Empty lists are a valid answer.`;

const SCHEMA = { type: 'object', additionalProperties: false, required: ['loops', 'stakes', 'beats'], properties: {
  loops: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['question', 'openQuote', 'closeQuote', 'kind'], properties: {
    question: { type: 'string' }, openQuote: { type: 'string' }, closeQuote: { type: ['string', 'null'] }, kind: { type: 'string', enum: [...LOOP_KINDS] } } } },
  stakes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['what', 'forWhom', 'quote'], properties: {
    what: { type: 'string' }, forWhom: { type: 'string' }, quote: { type: 'string' } } } },
  beats: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['quoteStart', 'link'], properties: {
    quoteStart: { type: 'string' }, link: { type: 'string', enum: [...LINKS] } } } },
} };

/** Names the instrument: a change to the prompt, the schema or the grounding is a new reader. */
export const LOOP_READER_VERSION = createHash('sha256').update(`${systemFor(LOOP_KINDS, LINKS)}|${JSON.stringify(SCHEMA)}|two reads, reversed lists|same sentence|v1`).digest('hex').slice(0, 8);

/** A piece shorter than this is not read for loops: there is no room for one to open and close. */
export const MIN_LOOP_WORDS = 60;

const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x : null);
const asList = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object') : []);

/**
 * The model's answer placed in the piece, or null when it is not the shape asked for. Every quote is located by code;
 * a loop whose close is not found AFTER its open is dropped whole (a close that cannot be placed is not an open loop).
 * Also used for hand labels, which are the same shape.
 */
export function placeLoops(raw: unknown, index: TextIndex): LoopGraph | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { loops?: unknown; stakes?: unknown; beats?: unknown };
  if (!Array.isArray(r.loops) || !Array.isArray(r.stakes) || !Array.isArray(r.beats)) return null;
  let dropped = 0;
  const loops: PlacedLoop[] = [];
  for (const l of asList(r.loops)) {
    const kind = (LOOP_KINDS as readonly unknown[]).includes(l.kind) ? l.kind as LoopKind : null;
    const openQuote = str(l.openQuote); const closeQuote = str(l.closeQuote);
    const o = openQuote ? locateQuote(index, openQuote) : null;
    const c = o && closeQuote ? locateQuote(index, closeQuote, o.word + 1) : null;
    if (!kind || !o || !openQuote || (closeQuote && !c)) { dropped++; continue; }
    loops.push({ question: str(l.question) ?? '', kind, openQuote, closeQuote: c ? closeQuote : null, open: o.t, close: c ? c.t : null, openWord: o.word, closeWord: c ? c.word : null });
  }
  const stakes: PlacedStakes[] = [];
  for (const s of asList(r.stakes)) {
    const quote = str(s.quote); const at = quote ? locateQuote(index, quote) : null;
    if (!quote || !at) { dropped++; continue; }
    stakes.push({ what: str(s.what) ?? '', forWhom: str(s.forWhom) ?? '', quote, at: at.t, word: at.word });
  }
  const links: PlacedLink[] = []; const seen = new Set<number>();
  for (const b of asList(r.beats)) {
    const link = (LINKS as readonly unknown[]).includes(b.link) ? b.link as Link : null;
    const quoteStart = str(b.quoteStart); const at = quoteStart ? locateQuote(index, quoteStart) : null;
    if (!link || !quoteStart || !at) { dropped++; continue; }
    if (seen.has(at.word)) continue;                                        // one beat per place
    seen.add(at.word);
    links.push({ quoteStart, link, at: at.t, word: at.word });
  }
  links.sort((a, b) => a.word - b.word);
  loops.sort((a, b) => a.openWord - b.openWord);
  return { words: index.words.length, loops, stakes, links, dropped };
}

const EMPTY = (words: number): LoopGraph => ({ words, loops: [], stakes: [], links: [], dropped: 0 });

/** One read of the piece, with the instructions' lists in the order given. */
export function loopReading(order: 'forward' | 'reversed'): Reading<TextIndex, LoopGraph> {
  const kinds = order === 'forward' ? LOOP_KINDS : [...LOOP_KINDS].reverse();
  const links = order === 'forward' ? LINKS : [...LINKS].reverse();
  return {
    id: 'story-loops', version: `${LOOP_READER_VERSION}-${order}`, system: systemFor(kinds, links), schema: SCHEMA,
    toolName: 'emit_loops', toolDescription: 'Return the loops, stakes and beats of the piece, each with a quote copied from it.',
    maxTokens: 3000, estimateUsd: 0.02,
    prompt: (index) => index.text,
    decide: (index) => (index.words.length < MIN_LOOP_WORDS ? EMPTY(index.words.length) : null),
    ground: (raw, index) => placeLoops(raw, index),
    floor: (index) => EMPTY(index.words.length),
  };
}

export interface LoopReadingResult {
  readonly version: string;
  /** what both reads agree on; null when it could not be read (no model, or a read code could not ground) */
  readonly graph: LoopGraph | null;
  readonly first: LoopGraph | null;
  readonly second: LoopGraph | null;
  /** Cohen's κ between the reads over the piece's sentences, per kind of finding (null where nothing to compare) */
  readonly kappa: { readonly loops: number | null; readonly stakes: number | null; readonly links: number | null };
  readonly by: DecidedBy;
  /** why it is unverified, when `graph` is null */
  readonly why?: string;
}

/** The sentence a word falls in, or -(word+1) when it is outside prose sentences (so distinct places stay distinct). */
const sentenceOfWord = (index: TextIndex, word: number | null): number | null => {
  if (word === null) return null;
  const c = index.starts[word];
  const s = index.sentences.findIndex((x) => x.start <= c && c < x.end);
  return s >= 0 ? s : -(word + 1);
};

/** Per-sentence labels of one read, for κ. */
function labels(index: TextIndex, g: LoopGraph): { loops: string[]; stakes: string[]; links: string[] } {
  const n = Math.max(1, index.sentences.length);
  const loops = Array.from({ length: n }, () => ''); const stakes = Array.from({ length: n }, () => 'NONE'); const links = Array.from({ length: n }, () => 'NONE');
  const at = (w: number | null): number => { const s = sentenceOfWord(index, w); return s !== null && s >= 0 ? s : -1; };
  for (const l of g.loops) {
    const o = at(l.openWord); if (o >= 0) loops[o] += 'O';
    const c = at(l.closeWord); if (c >= 0) loops[c] += 'C';
  }
  for (const s of g.stakes) { const i = at(s.word); if (i >= 0) stakes[i] = 'STAKES'; }
  for (const l of g.links) { const i = at(l.word); if (i >= 0) links[i] = l.link; }
  return { loops: loops.map((x) => (x.includes('O') && x.includes('C') ? 'OC' : x.includes('O') ? 'O' : x.includes('C') ? 'C' : 'NONE')), stakes, links };
}

/** What two reads agree on: a loop opened and closed in the same sentences, stakes in the same sentence, a link of the same kind in the same sentence. */
export function agreeLoops(index: TextIndex, a: LoopGraph, b: LoopGraph): { graph: LoopGraph; kappa: LoopReadingResult['kappa'] } {
  const s = (w: number | null): number | null => sentenceOfWord(index, w);
  const loops = a.loops.filter((x) => b.loops.some((y) => s(y.openWord) === s(x.openWord) && s(y.closeWord) === s(x.closeWord)));
  const stakes = a.stakes.filter((x) => b.stakes.some((y) => s(y.word) === s(x.word)));
  const links = a.links.filter((x) => b.links.some((y) => y.link === x.link && s(y.word) === s(x.word)));
  const la = labels(index, a); const lb = labels(index, b);
  return { graph: { words: a.words, loops, stakes, links, dropped: a.dropped + b.dropped },
    kappa: { loops: cohenKappa(la.loops, lb.loops), stakes: cohenKappa(la.stakes, lb.stakes), links: cohenKappa(la.links, lb.links) } };
}

/** Read a piece's loops twice and keep what both reads place alike. Never throws: an unreadable piece is unverified. */
export async function readLoops(text: string, client: InferenceClient | null, model: string | null, budget: Budget): Promise<LoopReadingResult> {
  const index = indexText(text);
  const first = await readContext(loopReading('forward'), index, client, model, budget, 'structure');
  const none = { loops: null, stakes: null, links: null };
  // Too short for a loop to open and close: nothing to check, said as such rather than read as a piece with no loops.
  if (first.by === 'code') return { version: LOOP_READER_VERSION, graph: null, first: null, second: null, kappa: none, by: 'code', why: `under ${MIN_LOOP_WORDS} words: too short to read for loops` };
  if (first.by === 'floor') return { version: LOOP_READER_VERSION, graph: null, first: null, second: null, kappa: none, by: 'floor', why: first.why ?? 'not read' };
  const second = await readContext(loopReading('reversed'), index, client, model, budget, 'structure');
  if (second.by !== 'model') return { version: LOOP_READER_VERSION, graph: null, first: first.value, second: null, kappa: none, by: 'floor', why: `the second read failed: ${second.why ?? 'not read'}` };
  const { graph, kappa } = agreeLoops(index, first.value, second.value);
  return { version: LOOP_READER_VERSION, graph, first: first.value, second: second.value, kappa, by: 'model' };
}
