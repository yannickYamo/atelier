// atelier/core/composite/voices.ts — HOW MANY VOICES A FOLDER HOLDS, READ FROM THE WRITING ITSELF.
//
// "Here are nine pieces I like." Nobody said who wrote which, and nobody should have to. Read as one voice, three
// writers give the average of three; so when no author is declared (front matter, a folder per author, --authors:
// ./authors.ts, which always win), the pieces are grouped by HOW they are written, never by what they are about:
//
//   FUNCTION WORDS     the rates of the fixed English list of ../fidelity/stylometry.ts, per 1,000 words: the words a
//                      writer does not choose on purpose ("than", "that's", "because")
//   CHARACTER RUNS     the 200 most frequent three-character runs across the pieces, per 1,000 characters
//   COUNTED FEATURES   the counted features of ../observers/features.ts (punctuation, sentence shape, wording, stance);
//                      a feature a piece is too short for is left out of that pair, never read as zero
//   SHAPE              what a piece of any length has: its length, its sentence and paragraph length, its questions,
//                      exclamations, commas, word length, digits and capitals. A tweet is grouped on this and on the
//                      two blocks above, which are rates at any length
//
// Two pieces are as far apart as the mean, over the blocks both can be read on, of each block's mean relative gap
// |x − y| / (|x| + |y| + floor) (a Canberra distance with a floor, so a rare word that one piece uses once and the
// other never does is not a gulf). Every distance is in [0, 1] and absolute: near-identical pieces are near 0
// whatever the rest of the folder holds, so a folder of one voice is not split by z-scoring its small differences.
//
// THE NUMBER OF VOICES. The pieces are joined by average linkage (deterministic: ties go to the lower index), and
// every cut from 2 voices to min(8, pieces / 2) is scored by its mean SILHOUETTE (how much nearer each piece is to
// its own voice than to the next one; 1 is perfectly apart, 0 is no structure). The best cut is taken when
//
//   its silhouette is at least 0.5    (the conventional threshold for "a reasonable structure"), and
//   every voice has at least 2 pieces (one odd piece is an outlier of a voice, not a voice of its own)
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
/** A voice is read from at least this many pieces. */
export const MIN_PIECES_PER_VOICE = 2;
/** Below this many pieces a folder is one voice. */
export const MIN_PIECES_TO_GROUP = 4;
/** At most this many voices. */
export const MAX_VOICES = 8;
const TRIGRAMS = 200;

export interface VoiceGrouping {
  /** the voices, in the order of their first piece; one voice when the folder does not split */
  readonly groups: readonly { readonly name: string; readonly pieces: readonly string[] }[];
  /** the mean silhouette of the cut taken, or null for one voice */
  readonly silhouette: number | null;
  /** how sure the grouping is, in [0, 1]: the silhouette taken, or one minus the best any cut reached */
  readonly confidence: number;
  /** the best silhouette of each cut tried, by number of voices (cuts with a one-piece voice are marked invalid) */
  readonly tried: readonly { readonly k: number; readonly silhouette: number; readonly valid: boolean }[];
  /** the rule that chose the number, in words, for the record */
  readonly criterion: string;
}

export const CRITERION = `average-linkage clusters of function-word, character-run, counted-feature and shape distances; the cut of 2 to ${MAX_VOICES} voices with the highest mean silhouette, taken when it is at least ${MIN_SILHOUETTE} and every voice has at least ${MIN_PIECES_PER_VOICE} pieces; otherwise one voice`;

type Vec = readonly (number | null)[];
interface Reading { readonly fw: Vec | null; readonly tg: Vec; readonly ct: Vec; readonly sh: Vec }

const mean = (xs: readonly number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

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

function readingsOf(texts: readonly string[]): Reading[] {
  const lines = texts.map(proseLine);
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
      ct: FEATURES.map((f) => { try { return f.measure(t); } catch { return null; } }),
      sh: shapeOf(t),
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

/** The distance matrix between the pieces: the mean over the blocks both can be read on. */
export function styleDistances(texts: readonly string[]): number[][] {
  const rs = readingsOf(texts.map(withoutFrontMatter));
  const fl = {
    fw: floorsOf(rs.map((r) => r.fw), 5), tg: floorsOf(rs.map((r) => r.tg), 2),
    ct: floorsOf(rs.map((r) => r.ct), 1e-3), sh: floorsOf(rs.map((r) => r.sh), 1e-3),
  };
  return rs.map((a, i) => rs.map((b, j) => {
    if (i === j) return 0;
    const blocks = [a.fw && b.fw ? gap(a.fw, b.fw, fl.fw) : null, gap(a.tg, b.tg, fl.tg), gap(a.ct, b.ct, fl.ct), gap(a.sh, b.sh, fl.sh)]
      .filter((x): x is number => x !== null);
    return blocks.length ? mean(blocks) : 0;
  }));
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

/** The mean silhouette of a cut: a piece alone in its cluster scores 0. */
export function silhouetteOf(d: readonly (readonly number[])[], clusters: readonly (readonly number[])[]): number {
  const of = new Map<number, number>();
  clusters.forEach((c, k) => { for (const i of c) of.set(i, k); });
  const scores = d.map((_, i) => {
    const own = clusters[of.get(i) ?? 0];
    if (own.length < 2) return 0;
    const a = mean(own.filter((j) => j !== i).map((j) => d[i][j]));
    const b = Math.min(...clusters.filter((c) => c !== own).map((c) => mean(c.map((j) => d[i][j]))));
    const m = Math.max(a, b);
    return m > 0 ? (b - a) / m : 0;
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
  const d = styleDistances(sorted.map((p) => p.text));
  const cuts = linkage(d);
  const top = Math.min(MAX_VOICES, Math.floor(sorted.length / MIN_PIECES_PER_VOICE));
  const tried: { k: number; silhouette: number; valid: boolean }[] = [];
  for (let k = 2; k <= top; k++) {
    const c = cuts.get(k);
    if (!c) continue;
    tried.push({ k, silhouette: r3(silhouetteOf(d, c)), valid: c.every((x) => x.length >= MIN_PIECES_PER_VOICE) });
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
