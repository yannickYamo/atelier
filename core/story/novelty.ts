// atelier/core/story/novelty.ts — WHICH SENTENCES GIVE THE READER SOMETHING NEW, AND WHERE A DRAFT RUNS THIN.
//
// A reader keeps reading while sentences keep paying: a fact they did not have, a turn they did not expect. A
// reading marks the sentences that carry new information or a surprise, and the claims a piece makes with the words
// that back each one, if any. Every mark is a quote; code places it in a sentence and drops what it cannot place.
// Read twice (the second time with the instructions' lists reversed); a sentence is novel where both reads mark it,
// and a claim is unsupported only where both reads find it and neither finds a proof that code could place.
//
// From the marks: novelty density (novel sentences per 100 words) and the longest stretch, in words, of sentences
// with nothing new. The user's band comes from their golden pieces (./bands.ts); the `thin` check flags every
// stretch of a draft longer than the band and every paragraph that makes a claim with no proof. Graded targets for
// span repair, never a failure.

import { createHash } from 'node:crypto';
import { readContext, type DecidedBy, type Reading } from '../inference/reading.js';
import type { Budget, InferenceClient } from '../inference/client.js';
import { cohenKappa } from '../stats/agreement.js';
import { userBand, type Band } from './bands.js';
import { indexText, locateQuote, type TextIndex } from './locate.js';

export const NOVELTY_KINDS = ['new', 'surprise'] as const;
export type NoveltyKind = typeof NOVELTY_KINDS[number];

export interface NoveltyMap {
  /** one entry per prose sentence: the kind of novelty it carries, or null */
  readonly novel: readonly (NoveltyKind | null)[];
  /** claims, by sentence, with the sentence of their proof (null: none the reading could place) */
  readonly claims: readonly { readonly sentence: number; readonly claimQuote: string; readonly proofSentence: number | null }[];
  readonly dropped: number;
}

const KIND_DEFS: Readonly<Record<NoveltyKind, string>> = {
  new: 'gives the reader information the piece has not given before: a fact, a number, a case, a distinction',
  surprise: 'goes against what the reader would expect at that point',
};
const TASKS = {
  novel: (kinds: readonly NoveltyKind[]) => `NOVEL. Each sentence that carries something new, with a quote from it and its kind, one of:\n${kinds.map((k) => `   - ${k}: ${KIND_DEFS[k]}`).join('\n')}\n   A sentence that restates, sums up or only connects is not novel.`,
  claims: () => 'CLAIMS. Each claim the piece asks the reader to accept (claimQuote), with proofQuote: the words in the piece that back it (a figure, a case, a source, a demonstration), or null when nothing in the piece does.',
};
const systemFor = (order: 'forward' | 'reversed'): string => {
  const kinds = order === 'forward' ? NOVELTY_KINDS : [...NOVELTY_KINDS].reverse();
  const tasks = order === 'forward' ? [TASKS.novel(kinds), TASKS.claims()] : [TASKS.claims(), TASKS.novel(kinds)];
  return `You map what a piece of writing gives its reader, sentence by sentence. You do not judge it.
The sentences are numbered. Every quote must be copied word for word from one sentence: at least a few consecutive words.
${tasks.map((t, i) => `${i + 1}. ${t}`).join('\n')}
Report only what is in the piece. Empty lists are a valid answer.`;
};

const SCHEMA = { type: 'object', additionalProperties: false, required: ['novel', 'claims'], properties: {
  novel: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['quote', 'kind'], properties: { quote: { type: 'string' }, kind: { type: 'string', enum: [...NOVELTY_KINDS] } } } },
  claims: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['claimQuote', 'proofQuote'], properties: { claimQuote: { type: 'string' }, proofQuote: { type: ['string', 'null'] } } } },
} };

export const NOVELTY_READER_VERSION = createHash('sha256').update(`${systemFor('forward')}|${JSON.stringify(SCHEMA)}|two reads, reversed lists|v1`).digest('hex').slice(0, 8);

/** A piece with fewer prose sentences than this is not read. */
export const MIN_NOVELTY_SENTENCES = 4;

const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x : null);
const asList = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter((e): e is Record<string, unknown> => !!e && typeof e === 'object') : []);

/** The answer placed in the piece's sentences, or null when it is not the shape asked for. Also used for hand labels. */
export function placeNovelty(raw: unknown, index: TextIndex): NoveltyMap | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { novel?: unknown; claims?: unknown };
  if (!Array.isArray(r.novel) || !Array.isArray(r.claims)) return null;
  let dropped = 0;
  const novel: (NoveltyKind | null)[] = index.sentences.map(() => null);
  for (const x of asList(r.novel)) {
    const kind = (NOVELTY_KINDS as readonly unknown[]).includes(x.kind) ? x.kind as NoveltyKind : null;
    const q = str(x.quote); const at = q ? locateQuote(index, q) : null;
    if (!kind || !at || at.sentence < 0) { dropped++; continue; }
    novel[at.sentence] ??= kind;
  }
  const claims: NoveltyMap['claims'][number][] = [];
  for (const c of asList(r.claims)) {
    const claimQuote = str(c.claimQuote); const proofQuote = str(c.proofQuote);
    const at = claimQuote ? locateQuote(index, claimQuote) : null;
    const proof = proofQuote ? locateQuote(index, proofQuote) : null;
    // A proof named but not found drops the claim: an unplaced quote is no evidence either way.
    if (!claimQuote || !at || at.sentence < 0 || (proofQuote && (!proof || proof.sentence < 0))) { dropped++; continue; }
    claims.push({ sentence: at.sentence, claimQuote, proofSentence: proof ? proof.sentence : null });
  }
  return { novel, claims, dropped };
}

const numbered = (index: TextIndex): string => index.sentences.map((s, i) => `[${i + 1}] ${s.text}`).join('\n');

export function noveltyReading(order: 'forward' | 'reversed'): Reading<TextIndex, NoveltyMap> {
  const empty = (index: TextIndex): NoveltyMap => ({ novel: index.sentences.map(() => null), claims: [], dropped: 0 });
  return {
    id: 'story-novelty', version: `${NOVELTY_READER_VERSION}-${order}`, system: systemFor(order), schema: SCHEMA,
    toolName: 'emit_novelty', toolDescription: 'Return the novel sentences and the claims of the piece, each with a quote copied from it.',
    maxTokens: 3000, estimateUsd: 0.02,
    prompt: numbered,
    decide: (index) => (index.sentences.length < MIN_NOVELTY_SENTENCES ? empty(index) : null),
    ground: (raw, index) => placeNovelty(raw, index),
    floor: empty,
  };
}

/** What two reads agree on: novel where both mark the sentence; a claim where both find it, unsupported only where neither places a proof. */
export function agreeNovelty(a: NoveltyMap, b: NoveltyMap): { map: NoveltyMap; kappa: number | null } {
  const novel = a.novel.map((k, i) => (k && b.novel[i] ? k : null));
  const claims = a.claims.flatMap((c) => {
    const other = b.claims.find((d) => d.sentence === c.sentence);
    return other ? [{ ...c, proofSentence: c.proofSentence ?? other.proofSentence }] : [];
  });
  const lab = (m: NoveltyMap): string[] => m.novel.map((k) => (k ? 'NOVEL' : 'NONE'));
  return { map: { novel, claims, dropped: a.dropped + b.dropped }, kappa: cohenKappa(lab(a), lab(b)) };
}

export interface NoveltyReadingResult {
  readonly version: string;
  readonly map: NoveltyMap | null;
  readonly kappa: number | null;
  readonly by: DecidedBy;
  readonly why?: string;
}

/** Read a piece twice for novelty and claims. Never throws: an unreadable piece is unverified. */
export async function readNovelty(text: string, client: InferenceClient | null, model: string | null, budget: Budget): Promise<NoveltyReadingResult> {
  const index = indexText(text);
  const first = await readContext(noveltyReading('forward'), index, client, model, budget, 'structure');
  if (first.by === 'code') return { version: NOVELTY_READER_VERSION, map: null, kappa: null, by: 'code', why: `fewer than ${MIN_NOVELTY_SENTENCES} prose sentences: too short to read` };
  if (first.by === 'floor') return { version: NOVELTY_READER_VERSION, map: null, kappa: null, by: 'floor', why: first.why ?? 'not read' };
  const second = await readContext(noveltyReading('reversed'), index, client, model, budget, 'structure');
  if (second.by !== 'model') return { version: NOVELTY_READER_VERSION, map: null, kappa: null, by: 'floor', why: `the second read failed: ${second.why ?? 'not read'}` };
  const { map, kappa } = agreeNovelty(first.value, second.value);
  return { version: NOVELTY_READER_VERSION, map, kappa, by: 'model' };
}

// ── features ──────────────────────────────────────────────────────────────────────────────────────

export interface NoveltyFeatures {
  readonly words: number;
  readonly novelCount: number;
  /** novel sentences per 100 words; null for an empty piece */
  readonly densityPer100: number | null;
  /** the longest run of consecutive sentences with nothing new, in words */
  readonly longestStretchWords: number;
}

/** Every maximal run of non-novel sentences, as [first, last] sentence indexes with its words. */
export function thinStretches(sentenceWords: readonly number[], novel: readonly boolean[]): { from: number; to: number; words: number }[] {
  const out: { from: number; to: number; words: number }[] = []; let start = -1; let w = 0;
  sentenceWords.forEach((n, i) => {
    if (novel[i]) { if (start >= 0) out.push({ from: start, to: i - 1, words: w }); start = -1; w = 0; } else { if (start < 0) start = i; w += n; }
  });
  if (start >= 0) out.push({ from: start, to: sentenceWords.length - 1, words: w });
  return out;
}

export function noveltyFeatures(sentenceWords: readonly number[], novel: readonly boolean[]): NoveltyFeatures {
  const words = sentenceWords.reduce((a, b) => a + b, 0);
  const novelCount = novel.filter(Boolean).length;
  return { words, novelCount, densityPer100: words ? (novelCount / words) * 100 : null,
    longestStretchWords: Math.max(0, ...thinStretches(sentenceWords, novel).map((s) => s.words)) };
}

/** The features of a placed map on its text. */
export const noveltyFeaturesOf = (text: string, map: NoveltyMap): NoveltyFeatures =>
  noveltyFeatures(indexText(text).sentences.map((s) => s.words), map.novel.map((k) => k !== null));

// ── band and the thin check ───────────────────────────────────────────────────────────────────────

/** Generic default where the user's pieces give no band: weak, and always assumed. */
export const GENERIC_STRETCH: Band = { lo: 0, hi: 150, n: 0, source: 'assumed', why: 'generic default: no more than about 150 words in a row with nothing new' };

/** The user's band for the longest thin stretch, or the generic default marked assumed. */
export function noveltyBand(golden: readonly NoveltyFeatures[]): { longestStretchWords: Band; densityPer100: Band | null } {
  return { longestStretchWords: userBand(golden.map((g) => g.longestStretchWords), false) ?? GENERIC_STRETCH,
    densityPer100: userBand(golden.map((g) => g.densityPer100), false) };
}

export interface ThinTarget {
  readonly kind: 'thin-stretch' | 'unproved-claim';
  readonly quotes: readonly string[];
  readonly span: { readonly start: number; readonly end: number };
  readonly repair: string;
  readonly measured?: number;
  readonly band?: Band;
}

/** Stretches of a draft with nothing new longer than the band, and paragraphs that claim without proof. */
export function thinTargets(text: string, map: NoveltyMap, band: Band): ThinTarget[] {
  const index = indexText(text); const ss = index.sentences;
  if (!ss.length || map.novel.length !== ss.length) return [];
  const out: ThinTarget[] = [];
  for (const s of thinStretches(ss.map((x) => x.words), map.novel.map((k) => k !== null)).filter((x) => x.words > band.hi)) {
    out.push({ kind: 'thin-stretch', quotes: [ss[s.from].text, ss[s.to].text].filter((q, i, a) => a.indexOf(q) === i), span: { start: ss[s.from].start, end: ss[s.to].end },
      measured: s.words, band,
      repair: `${s.words} words in a row give the reader nothing new (your band allows ${Math.round(band.hi)}). Add the fact, case or turn this stretch is missing, or cut it down.` });
  }
  const paragraphs = [...new Set(map.claims.filter((c) => c.proofSentence === null).map((c) => ss[c.sentence].paragraph))];
  for (const p of paragraphs) {
    const inP = ss.filter((x) => x.paragraph === p);
    const claims = map.claims.filter((c) => c.proofSentence === null && ss[c.sentence].paragraph === p).map((c) => c.claimQuote);
    out.push({ kind: 'unproved-claim', quotes: claims, span: { start: inP[0].start, end: inP[inP.length - 1].end },
      repair: 'This paragraph asks the reader to accept a claim nothing in the piece backs. Add the figure, case or source that shows it, from the material, or carry it with the reasoning that shows it, as your view.' });
  }
  return out;
}
