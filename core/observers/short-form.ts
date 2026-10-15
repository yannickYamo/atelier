// atelier/core/observers/short-form.ts — WHAT A FOLDER OF SHORT PIECES SHOWS, READ WITHOUT A WORD FLOOR.
//
// A skill built from five tweets learned two rules: a judgement and the machine-tell ban. Every counted measure is
// per piece and wants 150 words, so twenty tweets measured nothing, and a 486-character corporate paragraph read
// the same as a good tweet. Short pieces carry two things a long-form rule cannot read:
//
//   SHAPE BANDS   each piece's shape (./shape.ts), read whole: the band of the pieces, widened as a section's length
//                 is (../intake/length.ts, `ownLengthBand`). Length in characters is the strongest signal. A numeric
//                 band every example meets is REQUIRED from five examples; what a piece opens and closes on, and the
//                 case of its first word, from ten, because five pieces that happen to open on a claim have not shown
//                 a habit. Under those counts the band is PREFERRED and the build screen says how many more would let
//                 it block.
//   POOLED RATES  each counted feature's events over all the words of all the pieces (./pooled.ts), where there are
//                 at least ten events: a short output is held to the count its length expects. Always PREFERRED, as a
//                 counted feature's band is: a rate steers and chooses between drafts, and never blocks on its own.
//
// The platform's limit is never read off the pieces. It comes from the format (a post on X: 280) or from the owner
// (`--limit`), and the character band is clipped to it.

import type { Measurement } from '../state/canonical-state.js';
import { FEATURES, type Feature } from './features.js';
import { pooledRateOf, pooledParams, POOLED_MIN_EVENTS, sayPooled, isShortForm, type PooledRate } from './pooled.js';
import { shapeOf, SHAPE_LABEL, sayKind, type Shape, type ShapeId, type NumericShape, type KindShape } from './shape.js';
import { ownLengthBand } from '../intake/length.js';
import { proseWordsOf, quantile } from './text.js';

/** A numeric shape band every example meets is required from this many examples. */
export const SHAPE_REQUIRED_FROM = 5;
/** What a piece opens and closes on, and its first word's case, are required from this many. */
export const KIND_REQUIRED_FROM = 10;

export interface PooledRateRule { readonly feature: Feature; readonly pooled: PooledRate; readonly measurement: Measurement; readonly statement: string; readonly evidence: string }

/**
 * The counted features whose events the pieces carry at least POOLED_MIN_EVENTS of, each as a FEATURE measurement
 * with its pooled rate and no band. A feature that is a value and not a count (a percentile, a correlation) has no
 * pooled rate and is not here.
 */
export function pooledRateRules(texts: readonly string[]): PooledRateRule[] {
  return FEATURES.flatMap((f): PooledRateRule[] => {
    if (!f.count) return [];
    const counter = f.count.bind(f);
    const pooled = pooledRateOf(texts, counter);
    if (pooled.events < POOLED_MIN_EVENTS || pooled.words === 0) return [];
    return [{ feature: f, pooled, measurement: { observer: 'FEATURE', params: { feature: [f.id], ...pooledParams(pooled) } },
      statement: `${f.label[0].toUpperCase()}${f.label.slice(1)}: about ${sayPooled(pooled.perWord)} in my pieces; a new piece carries about as many as its length expects.`,
      evidence: `${pooled.events} in ${pooled.words.toLocaleString('en-US')} words over ${pooled.pieces} pieces` }];
  }).sort((a, b) => b.pooled.events - a.pooled.events);
}

export interface ShapeBandRule {
  readonly shape: ShapeId;
  readonly measurement: Measurement;
  readonly statement: string;
  readonly evidence: string;
  /** every example meets it and there are enough of them for the band to block */
  readonly required: boolean;
  /** how many more examples would let it block; 0 when it already may */
  readonly more: number;
}

/** Shapes held on both sides: how big the piece is. */
const BANDED: readonly NumericShape[] = ['characters', 'words', 'sentences', 'longestSentence'];
/** Shapes held by a cap only: a floor on hashtags or line breaks would ask for furniture. */
const CAPPED: readonly NumericShape[] = ['lineBreaks', 'blankLines', 'hashtags', 'mentions', 'links', 'emoji'];

/** A count band widened as a length is: by its own width on each side, never under zero. */
const countBand = (lo: number, hi: number): readonly [number, number] => { const w = Math.max(1, hi - lo); return [Math.max(0, lo - w), hi + w]; };

/**
 * THE SHAPE BANDS THE PIECES SHOW. `limit`: the platform's character limit, where the format or the owner gives one;
 * the character band never exceeds it. `urlChars`: what the platform counts a link as.
 */
export function shapeBandRules(texts: readonly string[], opts: { readonly limit?: number | null; readonly urlChars?: number } = {}): ShapeBandRule[] {
  const shapes = texts.map((t) => shapeOf(t, opts.urlChars));
  const n = shapes.length;
  if (n < 3) return [];
  const out: ShapeBandRule[] = [];
  const url: Record<string, number> = opts.urlChars !== undefined ? { urlChars: opts.urlChars } : {};
  const requiredAt = (from: number): { required: boolean; more: number } => ({ required: n >= from, more: Math.max(0, from - n) });
  const of = (id: NumericShape): number[] => shapes.map((s) => s[id]);
  for (const id of BANDED) {
    const xs = of(id); const lo = Math.min(...xs); const hi = Math.max(...xs);
    const band = id === 'characters' || id === 'words' ? ownLengthBand([lo, hi]) : countBand(lo, hi);
    if (!band) continue;
    const limit = id === 'characters' && opts.limit ? opts.limit : null;
    const max = limit !== null ? Math.min(band[1], limit) : band[1];
    const unit = id === 'longestSentence' ? 'words in the longest sentence' : SHAPE_LABEL[id];
    out.push({ shape: id, measurement: { observer: 'SHAPE', params: { shape: [id], min: band[0], max, ...(id === 'characters' ? url : {}) } },
      statement: `${id === 'longestSentence' ? 'The longest sentence runs' : 'My pieces run'} ${lo === hi ? `${lo}` : `${lo} to ${hi}`} ${unit}; a new piece stays between ${band[0]} and ${max}${limit !== null && max === limit ? ` (${limit} is the platform's limit)` : ''}.`,
      evidence: `${lo} to ${hi} ${unit} over ${n} pieces`, ...requiredAt(SHAPE_REQUIRED_FROM) });
  }
  for (const id of CAPPED) {
    const xs = of(id); const lo = Math.min(...xs); const hi = Math.max(...xs);
    const max = hi === 0 ? 0 : countBand(lo, hi)[1];
    const label = SHAPE_LABEL[id];
    out.push({ shape: id, measurement: { observer: 'SHAPE', params: { shape: [id], max } },
      statement: hi === 0 ? `No ${label}: none of my pieces has one.` : `At most ${max} ${label}: my pieces carry ${lo === hi ? `${hi}` : `${lo} to ${hi}`}.`,
      evidence: hi === 0 ? `none in ${n} pieces` : `${lo} to ${hi} over ${n} pieces`, ...requiredAt(SHAPE_REQUIRED_FROM) });
  }
  // What the pieces open and close on, and how the first word is cased: the kinds seen, as a set. A set that is every
  // kind says nothing and is not proposed.
  const kinds = (id: KindShape, all: readonly string[]): void => {
    const seen = [...new Set(shapes.map((s) => s[id] as string | null).filter((k): k is string => k !== null))].sort((a, b) => all.indexOf(a) - all.indexOf(b));
    if (!seen.length || seen.length >= all.length) return;
    const counts = seen.map((k) => `${sayKind(k)} (${shapes.filter((s) => s[id] === k).length})`).join(', ');
    const said = seen.map(sayKind); const or = said.length === 1 ? said[0] : `${said.slice(0, -1).join(', ')} or ${said[said.length - 1]}`;
    out.push({ shape: id, measurement: { observer: 'SHAPE', params: { shape: [id], kinds: seen } },
      statement: id === 'firstWord' ? `The first word is ${or}, as in every piece of mine.` : `${id === 'opening' ? 'Open' : 'Close'} on ${or}, as my pieces do.`,
      evidence: `over ${n} pieces: ${counts}`, ...requiredAt(KIND_REQUIRED_FROM) });
  };
  kinds('opening', ['claim', 'question', 'number', 'imperative']);
  kinds('closing', ['statement', 'shortest', 'imperative', 'question']);
  kinds('firstWord', ['capital', 'lower', 'digit', 'symbol']);
  return out;
}

/** One line on the corpus: how many pieces, how long, and whether it is short form at all. */
export function shortFormSummary(texts: readonly string[], shapes: readonly Shape[] = texts.map((t) => shapeOf(t))): string {
  const words = texts.map(proseWordsOf).filter((n) => n > 0);
  const chars = shapes.map((s) => s.characters);
  return `${texts.length} short piece${texts.length === 1 ? '' : 's'}: median ${quantile(words, 0.5)} words, ${Math.min(...chars)} to ${Math.max(...chars)} characters`;
}

/**
 * THE LIMITS OF A SMALL CORPUS, SAID ON THE BUILD SCREEN: which bands may block and which may not yet, and how many
 * more examples would let them; that rates never block. Nothing here changes a rule.
 */
export function shortFormLimits(texts: readonly string[], shapes: readonly ShapeBandRule[], rates: readonly PooledRateRule[], limit: { readonly chars: number; readonly from: string } | null): string[] {
  const out = [shortFormSummary(texts)];
  const blocking = shapes.filter((s) => s.required); const waiting = shapes.filter((s) => !s.required);
  if (blocking.length) out.push(`${blocking.length} shape band${blocking.length === 1 ? '' : 's'} read from ${texts.length} examples, every example meets ${blocking.length === 1 ? 'it' : 'them'}: required.`);
  for (const more of [...new Set(waiting.map((s) => s.more))].sort((a, b) => a - b)) {
    const these = waiting.filter((s) => s.more === more);
    out.push(`${these.length} shape band${these.length === 1 ? '' : 's'} (${these.map((s) => SHAPE_LABEL[s.shape]).join(', ')}) read from ${texts.length} examples; ${more} more would let ${these.length === 1 ? 'it' : 'them'} block. Until then: shown, and used to choose between drafts.`);
  }
  if (rates.length) out.push(`${rates.length} rate${rates.length === 1 ? '' : 's'} pooled over ${rates[0].pooled.words.toLocaleString('en-US')} words (${rates.slice(0, 4).map((r) => r.feature.label).join(', ')}${rates.length > 4 ? ', …' : ''}): a new piece is held to the count its length expects; shown and used to choose between drafts, never blocking.`);
  else out.push('No rate has ten occurrences across these pieces, so none is read: more pieces would let the rates be read.');
  out.push(limit ? `Platform limit: ${limit.chars} characters (${limit.from}).` : 'No platform limit: none was given (--limit <chars>, or --class x-post for 280).');
  return out;
}

export { isShortForm };
