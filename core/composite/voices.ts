// atelier/core/composite/voices.ts — HOW MANY VOICES A FOLDER HOLDS, READ FROM THE WRITING ITSELF.
//
// "Here are nine pieces I like." Nobody said who wrote which, and nobody should have to. Read as one voice, three
// writers give the average of three; so when no author is declared (front matter, a folder per author, --authors:
// ./authors.ts, which always win), the pieces are grouped by HOW they are written, never by what they are about:
//
//   FUNCTION WORDS     the rates of the fixed English list of ../fidelity/stylometry.ts, per 1,000 words: the words a
//                      writer does not choose on purpose ("than", "that's", "because")
//   CHARACTER RUNS     the 200 most frequent three-character runs across the pieces, per 1,000 characters
//   VOICE FEATURES     punctuation, constructions and wording that travel with a writer across formats; sentence and
//                      paragraph length are shape, not voice
//   SHAPE              length, structure and pace; heard only up to the distance already present in the voice signals,
//                      so a list cannot become a second author merely because it is a list
//
// List bullets, thread numbers, headings and bold marks are removed before the voice is read. Two pieces are as far
// apart as the mean, over the voice blocks both can be read on, of each block's mean relative gap |x − y| / (|x| +
// |y| + floor). Shape can sharpen an existing voice difference but never create one by itself. Every distance is in
// [0, 1] and absolute: near-identical pieces are near 0 whatever the rest of the folder holds.
//
// THE NUMBER OF VOICES. The pieces are joined by average linkage (deterministic: ties go to the lower index), and
// every cut from 2 voices to min(8, pieces / 2) is scored by its mean SILHOUETTE (how much nearer each piece is to
// its own voice than to the next one; 1 is perfectly apart, 0 is no structure). The best cut is taken when
//
//   its silhouette over like-format comparisons is at least 0.5, and
//   every voice has at least 2 pieces (one odd piece is an outlier of a voice, not a voice of its own), and
//   every pair of voices has like-format pieces to compare (a format-only split has none), and
//   the two closest voices sit at least 0.3 apart in voice signals on those comparable pieces
//
// otherwise the folder is ONE voice, exactly as it always was. Fewer than 4 pieces are one voice: there is nothing to
// compare a split with. The confidence recorded is the silhouette of the cut taken, or, for one voice, one minus the
// best silhouette any cut reached (how far the folder was from splitting).
//
// Nothing here calls a model, and the same pieces give the same grouping on every machine.

import { proseRegions, proseSentencesOf, paragraphsOf, wordsOf } from '../observers/text.js';
import { FEATURES } from '../observers/features.js';
import { FUNCTION_WORDS, proseLine } from '../fidelity/stylometry.js';
import { authorsDeclared, detectAuthors, withoutFrontMatter, type AuthorMap } from './authors.js';

/** A cut is taken only at this mean silhouette or above. */
export const MIN_SILHOUETTE = 0.5;
/**
 * Two voices are told apart only when they sit at least this far apart on average (the closest pair of voices, by the
 * mean distance between comparable pieces). Silhouette measures how clean a split is, not how wide: pieces that
 * differ only in format or shape remain one writer.
 */
export const MIN_VOICE_GAP = 0.3;
/** A voice is read from at least this many pieces. */
export const MIN_PIECES_PER_VOICE = 2;
/** Below this many pieces a folder is one voice. */
export const MIN_PIECES_TO_GROUP = 4;
/** At most this many voices. */
export const MAX_VOICES = 8;
const TRIGRAMS = 200;
/** Below this many words a piece is SHORT (a tweet, a post, a thread of a few lines); at or above it, LONG. */
export const SHORT_WORDS = 120;
/** Two pieces of one kind whose lengths are within this factor are compared even across the line between the bands. */
const NEAR_LENGTH = 2;

export interface VoiceGrouping {
  /** the voices, in the order of their first piece; one voice when the folder does not split */
  readonly groups: readonly { readonly name: string; readonly pieces: readonly string[] }[];
  /** the mean silhouette of the cut taken, or null for one voice */
  readonly silhouette: number | null;
  /** how sure the grouping is, in [0, 1]: the silhouette taken, or one minus the best any cut reached */
  readonly confidence: number;
  /**
   * the best silhouette of each cut tried, by number of voices; `alike` is whether every two of its voices have pieces of
   * a like format to be compared on (a cut that only separates formats is not a cut between writers)
   */
  readonly tried: readonly { readonly k: number; readonly silhouette: number; readonly gap: number; readonly alike: boolean; readonly valid: boolean }[];
  /** the rule that chose the number, in words, for the record */
  readonly criterion: string;
}

export const CRITERION = `average-linkage clusters of how the pieces are written (function words, character runs, punctuation and wording; their shape counts only as far as these agree); the cut of 2 to ${MAX_VOICES} voices with the highest mean silhouette over pieces of a like format, taken when it is at least ${MIN_SILHOUETTE}, every voice has at least ${MIN_PIECES_PER_VOICE} pieces, every two voices have pieces of a like format (list or prose, short or long) to be compared on, and on those pieces the closest two voices are at least ${MIN_VOICE_GAP} apart; otherwise one voice`;

type Vec = readonly (number | null)[];
type Kind = 'LIST' | 'PROSE';
interface Reading { readonly fw: Vec | null; readonly tg: Vec; readonly vc: Vec; readonly sc: Vec; readonly sh: Vec; readonly words: number; readonly kind: Kind }

const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * VOICE OR SHAPE. The counted features of punctuation and wording, and the sentence openers and constructions, are how
 * a writer writes in any format; the lengths of sentences and paragraphs, a piece's structure, pace and spread are
 * what its format makes them (a list's items are short, a tweet has one paragraph).
 */
const SENTENCE_SHAPE = new Set(['sentenceP10', 'sentenceP90', 'cadence', 'sentenceCv']);
const VOICE_FEATURES = FEATURES.filter((f) => f.layer === 1 || f.layer === 4 || (f.layer === 2 && !SENTENCE_SHAPE.has(f.id)));
const SHAPE_FEATURES = FEATURES.filter((f) => !VOICE_FEATURES.includes(f));

/** A line's list or thread marker, its heading marks and bold: format, not words. */
const LIST_LINE = /^\s*(?:[-*+]|\d+[.)/])\s+\S/;
const unformatted = (text: string): string => text.split('\n')
  .map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)/])\s+/, '').replace(/^#{1,6}\s+/, '').replace(/\*\*/g, '')).join('\n');

/** LIST when at least half its lines are list items or numbered thread posts; otherwise PROSE. */
function kindOf(text: string): Kind {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !/^#{1,6}\s/.test(l));
  return lines.length && lines.filter((l) => LIST_LINE.test(l)).length * 2 >= lines.length ? 'LIST' : 'PROSE';
}

function shapeOf(text: string): number[] {
  const prose = proseRegions(text).map((r) => r.text).join('\n\n');
  const words = wordsOf(prose);
  const sentences = proseSentencesOf(text);
  const paras = paragraphsOf(text);
  const n = Math.max(1, sentences.length);
  const chars = Math.max(1, prose.length);
  return [
    Math.log(1 + words.length),
    mean(sentences.map((s) => s.words)),
    mean(paras.map((p) => p.sentences)),
    sentences.filter((s) => s.text.trim().endsWith('?')).length / n,
    sentences.filter((s) => s.text.trim().endsWith('!')).length / n,
    (prose.match(/,/g) ?? []).length / n,
    mean(words.map((w) => w.length)),
    ((prose.match(/\d/g) ?? []).length * 1000) / chars,
    ((prose.match(/[A-Z]/g) ?? []).length * 1000) / chars,
  ];
}

const measured = (fs: typeof FEATURES, t: string): (number | null)[] => fs.map((f) => { try { return f.measure(t); } catch { return null; } });

function readingsOf(texts: readonly string[]): Reading[] {
  // The voice is read with the format taken off: a list's bullets and a thread's numbers are not anyone's words.
  const plain = texts.map(unformatted);
  const lines = plain.map(proseLine);
  const totals = new Map<string, number>();
  for (const l of lines) for (let i = 0; i + 3 <= l.length; i++) { const g = l.slice(i, i + 3); totals.set(g, (totals.get(g) ?? 0) + 1); }
  const grams = [...totals].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, TRIGRAMS).map(([g]) => g);
  return texts.map((t, i) => {
    const line = lines[i];
    const tokens = wordsOf(line);
    const fwCount = new Map<string, number>();
    for (const w of tokens) fwCount.set(w, (fwCount.get(w) ?? 0) + 1);
    const g = new Map<string, number>();
    for (let j = 0; j + 3 <= line.length; j++) { const x = line.slice(j, j + 3); g.set(x, (g.get(x) ?? 0) + 1); }
    const chars = Math.max(1, line.length);
    return {
      // A handful of words carries no function-word profile.
      fw: tokens.length >= 20 ? FUNCTION_WORDS.map((w) => ((fwCount.get(w) ?? 0) * 1000) / tokens.length) : null,
      tg: grams.map((x) => ((g.get(x) ?? 0) * 1000) / chars),
      vc: measured(VOICE_FEATURES, plain[i]),
      sc: measured(SHAPE_FEATURES, t),
      sh: shapeOf(t),
      words: tokens.length,
      kind: kindOf(t),
    };
  });
}

/** The mean relative gap over the features both pieces have, with a floor per feature; null when none is shared. */
function gap(a: Vec, b: Vec, floors: readonly number[]): number | null {
  let s = 0; let n = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]; const y = b[i];
    if (x === null || y === null) continue;
    if (x === 0 && y === 0) continue;
    s += Math.abs(x - y) / (Math.abs(x) + Math.abs(y) + floors[i]); n++;
  }
  return n ? s / n : null;
}

/** A tenth of each feature's mean size over the pieces, and never below `least`: what a gap is read against. */
function floorsOf(vs: readonly (Vec | null)[], least: number): number[] {
  const first = vs.find((v): v is Vec => v !== null);
  if (!first) return [];
  return first.map((_, i) => Math.max(least, 0.1 * mean(vs.flatMap((v) => (v && v[i] !== null ? [Math.abs(v[i])] : [])))));
}

/** Two pieces of a like format: of one kind (list or prose), and in one length band or near each other in length. */
const alikeFormat = (a: Reading, b: Reading): boolean => a.kind === b.kind
  && ((a.words < SHORT_WORDS) === (b.words < SHORT_WORDS) || Math.max(a.words, b.words) <= NEAR_LENGTH * Math.max(1, Math.min(a.words, b.words)));

interface Distances {
  /** how far apart two pieces are written: function words, character runs, punctuation and wording */
  readonly voice: number[][];
  /** what the pieces are grouped by: the voice distance, with their shape heard only as far as the voice agrees */
  readonly style: number[][];
  /** whether two pieces are of a like format, and so can be compared as writing */
  readonly alike: boolean[][];
}

export function distancesOf(texts: readonly string[]): Distances {
  const rs = readingsOf(texts.map(withoutFrontMatter));
  const fl = {
    fw: floorsOf(rs.map((r) => r.fw), 5), tg: floorsOf(rs.map((r) => r.tg), 2),
    vc: floorsOf(rs.map((r) => r.vc), 1e-3), sc: floorsOf(rs.map((r) => r.sc), 1e-3), sh: floorsOf(rs.map((r) => r.sh), 1e-3),
  };
  const voice = rs.map((a, i) => rs.map((b, j) => {
    if (i === j) return 0;
    return mean([a.fw && b.fw ? gap(a.fw, b.fw, fl.fw) : null, gap(a.tg, b.tg, fl.tg), gap(a.vc, b.vc, fl.vc)].filter((x): x is number => x !== null));
  }));
  // SHAPE AGREES OR IS NOT HEARD: a gap in shape adds to two pieces' distance no more than their voices already sit
  // apart, so pieces written alike in different formats stay together, and shape only sharpens a split the voice makes.
  const style = rs.map((a, i) => rs.map((b, j) => {
    if (i === j) return 0;
    const shape = mean([gap(a.sh, b.sh, fl.sh), gap(a.sc, b.sc, fl.sc)].filter((x): x is number => x !== null));
    return (voice[i][j] + Math.min(shape, voice[i][j])) / 2;
  }));
  return { voice, style, alike: rs.map((a) => rs.map((b) => alikeFormat(a, b))) };
}

/** The distance matrix the pieces are grouped by (see `distancesOf`). */
export function styleDistances(texts: readonly string[]): number[][] {
  return distancesOf(texts).style;
}

/** Average linkage: the clusters at every number from n down to 1, as lists of piece indexes. */
function linkage(d: readonly (readonly number[])[]): Map<number, number[][]> {
  let clusters: number[][] = d.map((_, i) => [i]);
  const cuts = new Map<number, number[][]>([[clusters.length, clusters.map((c) => [...c])]]);
  const between = (a: readonly number[], b: readonly number[]): number => mean(a.flatMap((i) => b.map((j) => d[i][j])));
  while (clusters.length > 1) {
    let best = { i: 0, j: 1, v: Infinity };
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      const v = between(clusters[i], clusters[j]);
      if (v < best.v - 1e-12) best = { i, j, v };
    }
    const merged = [...clusters[best.i], ...clusters[best.j]].sort((x, y) => x - y);
    clusters = clusters.filter((_, k) => k !== best.i && k !== best.j);
    clusters.push(merged);
    clusters.sort((x, y) => x[0] - y[0]);
    cuts.set(clusters.length, clusters.map((c) => [...c]));
  }
  return cuts;
}

/**
 * The mean silhouette of a cut, each piece compared only with pieces of a like format (`alike`; every pair when it is
 * not given): a piece alone in its cluster scores 0, and a piece with nothing of its format on one side or the other
 * says nothing about the cut and is left out.
 */
export function silhouetteOf(d: readonly (readonly number[])[], clusters: readonly (readonly number[])[], alike?: readonly (readonly boolean[])[]): number {
  const like = (i: number, j: number): boolean => !alike || alike[i][j];
  const of = new Map<number, number>();
  clusters.forEach((c, k) => { for (const i of c) of.set(i, k); });
  const scores = d.flatMap((_, i) => {
    const own = clusters[of.get(i) ?? 0];
    if (own.length < 2) return [0];
    const mine = own.filter((j) => j !== i && like(i, j));
    const theirs = clusters.filter((c) => c !== own).map((c) => c.filter((j) => like(i, j))).filter((c) => c.length);
    if (!mine.length || !theirs.length) return [];
    const a = mean(mine.map((j) => d[i][j]));
    const b = Math.min(...theirs.map((c) => mean(c.map((j) => d[i][j]))));
    const m = Math.max(a, b);
    return [m > 0 ? (b - a) / m : 0];
  });
  return mean(scores);
}

const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * THE VOICES IN A FOLDER, from the writing alone. `pieces` in a fixed order (their ids sorted), so the grouping and
 * the names it gives ("voice 1", "voice 2", in the order of each voice's first piece) do not depend on how the folder
 * was listed.
 */
export function groupByStyle(pieces: readonly { readonly id: string; readonly text: string }[]): VoiceGrouping {
  const sorted = [...pieces].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const one = (confidence: number, tried: VoiceGrouping['tried']): VoiceGrouping => ({
    groups: [{ name: 'voice 1', pieces: sorted.map((p) => p.id) }], silhouette: null, confidence: r3(confidence), tried, criterion: CRITERION });
  if (sorted.length < MIN_PIECES_TO_GROUP) return one(1, []);
  const { voice, style, alike } = distancesOf(sorted.map((p) => p.text));
  const cuts = linkage(style);
  const top = Math.min(MAX_VOICES, Math.floor(sorted.length / MIN_PIECES_PER_VOICE));
  const tried: VoiceGrouping['tried'][number][] = [];
  // How far two voices sit apart, read on their pieces of a like format alone; null when they have none.
  const between = (a: readonly number[], b: readonly number[]): number | null => {
    const pairs = a.flatMap((i) => b.flatMap((j) => (alike[i][j] ? [voice[i][j]] : [])));
    return pairs.length ? mean(pairs) : null;
  };
  for (let k = 2; k <= top; k++) {
    const c = cuts.get(k);
    if (!c) continue;
    const pairs = c.flatMap((x, i) => c.slice(i + 1).map((y) => between(x, y)));
    // A cut two of whose voices share no format separates formats, not writers: an essay and a list, a tweet and a
    // long piece, cannot be told apart as writing, so nothing says they are two writers.
    const isAlike = pairs.every((x) => x !== null);
    const gap = isAlike ? Math.min(...pairs.map((x) => x ?? 0)) : 0;
    tried.push({ k, silhouette: r3(silhouetteOf(voice, c, alike)), gap: r3(gap), alike: isAlike,
      valid: isAlike && c.every((x) => x.length >= MIN_PIECES_PER_VOICE) && gap >= MIN_VOICE_GAP });
  }
  const valid = tried.filter((t) => t.valid);
  // The best valid cut; a tie goes to fewer voices.
  const best = valid.reduce<(typeof tried)[number] | null>((m, t) => (!m || t.silhouette > m.silhouette ? t : m), null);
  if (!best || best.silhouette < MIN_SILHOUETTE) return one(1 - Math.max(0, ...tried.map((t) => t.silhouette)), tried);
  const c = cuts.get(best.k) ?? [];
  return {
    groups: c.map((idx, k) => ({ name: `voice ${k + 1}`, pieces: idx.map((i) => sorted[i].id) })),
    silhouette: best.silhouette, confidence: best.silhouette, tried, criterion: CRITERION,
  };
}

/** The grouping as the author map every later step reads, or null for one voice. */
export function voicesAsAuthors(g: VoiceGrouping): AuthorMap | null {
  if (g.groups.length < 2) return null;
  return { names: g.groups.map((x) => x.name), of: Object.fromEntries(g.groups.flatMap((x) => x.pieces.map((p) => [p, x.name]))), how: 'INFERRED' };
}

/** The one line said at intake: "3 voices found in 9 pieces". */
export const describeVoices = (g: VoiceGrouping, pieces: number): string =>
  `${g.groups.length} voice${g.groups.length === 1 ? '' : 's'} found in ${pieces} piece${pieces === 1 ? '' : 's'}, by how they are written (confidence ${g.confidence.toFixed(2)}): each is read on its own first. ${g.groups.map((x) => `${x.name}: ${x.pieces.join(', ')}`).join('; ')}.`;

/**
 * WHO WROTE THE PIECES, AS `atelier new` READS IT: the authors declared (./authors.ts), which always win; else, when
 * nothing is declared at all, the voices found in the writing. `voices` is the grouping read (one voice included), or
 * null when authors were declared.
 */
export function authorship(files: readonly { readonly id: string; readonly text: string }[], listed: readonly string[] | null = null): { readonly authors: AuthorMap | null; readonly voices: VoiceGrouping | null } {
  const declared = detectAuthors(files, listed);
  if (declared || authorsDeclared(files, listed)) return { authors: declared, voices: null };
  const voices = groupByStyle(files);
  return { authors: voicesAsAuthors(voices), voices };
}
