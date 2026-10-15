// atelier/core/observers/short-form.ts — WHAT A FOLDER OF SHORT PIECES SHOWS, READ WITHOUT A WORD FLOOR.
//
// A skill built from five tweets learned two rules: a judgement and the machine-tell ban. Every counted measure is
// per piece and wants 150 words, so twenty tweets measured nothing, and a 486-character corporate paragraph read
// the same as a good tweet. Short pieces carry two things a long-form rule cannot read:
//
//   SHAPE BANDS   each piece's shape (./shape.ts), read whole: the band of the pieces, widened as a section's length
//                 is (../intake/length.ts, `ownLengthBand`). Length in characters is the strongest signal. A band
//                 every example meets is REQUIRED from five examples; under five it is PREFERRED, and the build
//                 screen says how many more would let it block.
//   POOLED RATES  each counted feature's events over all the words of all the pieces (./pooled.ts), where there are
//                 at least ten events: a short output is held to the count its length expects. Always PREFERRED, as a
//                 counted feature's band is: a rate steers and chooses between drafts, and never blocks on its own.
//
// The platform's limit is never read off the pieces. It comes from the format (a post on X: 280) or from the owner
// (`--limit`), and the character band is clipped to it.

import type { Measurement, Requirement } from '../state/canonical-state.js';
import type { MeasuredProposal } from './derive.js';
import { measure } from './registry.js';
import { formatOf } from './formats.js';
import { MIN_PIECES_TO_COUNT, thinEvidence } from '../ratification/suggest.js';
import { FEATURES, type Feature } from './features.js';
import { pooledRateOf, pooledParams, POOLED_MIN_EVENTS, sayPooled, isShortForm, type PooledRate } from './pooled.js';
import { shapeOf, SHAPE_LABEL, sayKind, type Shape, type ShapeId, type NumericShape, type KindShape } from './shape.js';
import { ownLengthBand } from '../intake/length.js';
import { proseWordsOf, quantile } from './text.js';

/** A shape band every example meets is required from this many examples. */
export const SHAPE_REQUIRED_FROM = 5;

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
      statement: `${f.label[0].toUpperCase()}${f.label.slice(1)}: about ${sayPooled(pooled.perWord)} in my pieces; a new piece carries ${f.specifics ? 'no more than' : 'about as many as'} its length expects.`,
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
  /** the band's ceiling is the platform's limit (the format's or the owner's), not the pieces' own range */
  readonly limited?: true;
  /** the platform's limit stated on its own, because some of the author's pieces run past it: a platform rule, not their habit */
  readonly platform?: true;
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
    // A LIMIT SOME OF THE AUTHOR'S OWN PIECES RUN PAST is not folded into their band: the band stays their habit, as
    // every piece shows it, and the limit is stated beside it as the platform's rule.
    const past = id === 'characters' && opts.limit ? hi > opts.limit : false;
    if (past && opts.limit) {
      const n = xs.filter((x) => x > (opts.limit ?? Infinity)).length;
      out.push({ shape: id, measurement: { observer: 'SHAPE', params: { shape: [id], max: opts.limit, ...url } },
        statement: `At most ${opts.limit} characters: the platform's limit.`,
        evidence: `${n} of ${xs.length} examples run past it (they run ${lo} to ${hi} characters)`, required: true, more: 0, limited: true, platform: true });
    }
    const limit = id === 'characters' && opts.limit && !past ? opts.limit : null;
    const max = limit !== null ? Math.min(band[1], limit) : band[1];
    // A floor of nothing says nothing: the longest sentence of a piece is held by its ceiling alone.
    const min = Math.min(band[0], max);
    const said = id === 'longestSentence'
      ? `The longest sentence in my pieces runs ${lo === hi ? `${lo}` : `${lo} to ${hi}`} words; in a new piece it stays ${min > 0 ? `between ${min} and ${max}` : `at most ${max}`} words`
      : `My pieces run ${lo === hi ? `${lo}` : `${lo} to ${hi}`} ${SHAPE_LABEL[id]}; a new piece stays ${min > 0 ? `between ${min} and ${max}` : `at most ${max}`}`;
    out.push({ shape: id, measurement: { observer: 'SHAPE', params: { shape: [id], ...(min > 0 ? { min } : {}), max, ...(id === 'characters' ? url : {}) } },
      statement: `${said}${limit !== null && max === limit ? ` (${limit} is the platform's limit)` : ''}.`,
      evidence: `${lo} to ${hi} ${id === 'longestSentence' ? 'words in the longest sentence' : SHAPE_LABEL[id]} over ${n} pieces`, ...requiredAt(SHAPE_REQUIRED_FROM),
      ...(limit !== null && max === limit ? { limited: true as const } : {}) });
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
      evidence: `over ${n} pieces: ${counts}`, ...requiredAt(SHAPE_REQUIRED_FROM) });
  };
  kinds('opening', ['claim', 'question', 'number', 'imperative']);
  kinds('closing', ['statement', 'shortest', 'imperative', 'question']);
  kinds('firstWord', ['capital', 'lower', 'digit', 'symbol']);
  return out;
}

/**
 * How many more pieces like these would carry POOLED_MIN_EVENTS of the most frequent counted feature, at the rate the
 * pieces show; null when no feature occurs at all.
 */
export function piecesForARate(texts: readonly string[]): number | null {
  const best = Math.max(0, ...FEATURES.flatMap((f) => (f.count ? [pooledRateOf(texts, f.count.bind(f)).events] : [])));
  if (best === 0 || !texts.length) return null;
  return Math.max(1, Math.ceil((POOLED_MIN_EVENTS * texts.length) / best) - texts.length);
}

/** One line on the corpus: how many pieces, how long, and whether it is short form at all. */
export function shortFormSummary(texts: readonly string[], shapes: readonly Shape[] = texts.map((t) => shapeOf(t))): string {
  const words = texts.map(proseWordsOf).filter((n) => n > 0);
  const chars = shapes.map((s) => s.characters);
  return `${texts.length} short piece${texts.length === 1 ? '' : 's'}: median ${quantile(words, 0.5)} words, ${Math.min(...chars)} to ${Math.max(...chars)} characters`;
}

/** The same limits in one line, for the short build screen; the lines of `shortFormLimits` are the long account. */
export function shortFormBrief(texts: readonly string[], shapes: readonly ShapeBandRule[], rates: readonly PooledRateRule[], limit: { readonly chars: number; readonly from: string } | null, answers = false): string {
  const blocking = shapes.filter((s) => s.required && !s.platform).length; const waiting = shapes.filter((s) => !s.required);
  const more = waiting.length ? Math.max(...waiting.map((s) => s.more)) : 0;
  const bands = answers ? 'no band of shape (answers take their length from the request)'
    : `${blocking} shape band${blocking === 1 ? '' : 's'} required${waiting.length ? `, ${waiting.length} shown until ${more} more example${more === 1 ? '' : 's'}` : ''}`;
  const rateGap = rates.length ? null : piecesForARate(texts);
  const said = rates.length ? `${rates.length} rate${rates.length === 1 ? '' : 's'} pooled (never blocking)` : `no rate yet${rateGap !== null ? ` (about ${rateGap} more piece${rateGap === 1 ? '' : 's'})` : ''}`;
  return `${shortFormSummary(texts)}; ${bands}; ${said}; ${limit ? `limit ${limit.chars} characters (${limit.from})` : 'no platform limit (--limit <chars>)'}.`;
}

/**
 * THE LIMITS OF A SMALL CORPUS, SAID ON THE BUILD SCREEN: which bands may block and which may not yet, and how many
 * more examples would let them; that rates never block. Nothing here changes a rule.
 */
export function shortFormLimits(texts: readonly string[], shapes: readonly ShapeBandRule[], rates: readonly PooledRateRule[], limit: { readonly chars: number; readonly from: string } | null, answers = false): string[] {
  const out = [shortFormSummary(texts)];
  if (answers) out.push('These answer requests: their length and shape follow the request, so no band of either is held.');
  const blocking = shapes.filter((s) => s.required && !s.platform); const waiting = shapes.filter((s) => !s.required);
  if (blocking.length) out.push(`${blocking.length} shape band${blocking.length === 1 ? '' : 's'} read from ${texts.length} examples, every example meets ${blocking.length === 1 ? 'it' : 'them'}: required.`);
  for (const more of [...new Set(waiting.map((s) => s.more))].sort((a, b) => a - b)) {
    const these = waiting.filter((s) => s.more === more);
    out.push(`${these.length} shape band${these.length === 1 ? '' : 's'} (${these.map((s) => SHAPE_LABEL[s.shape]).join(', ')}) read from ${texts.length} examples; ${more} more would let ${these.length === 1 ? 'it' : 'them'} block. Until then: shown, and used to choose between drafts.`);
  }
  if (rates.length) out.push(`${rates.length} rate${rates.length === 1 ? '' : 's'} pooled over ${rates[0].pooled.words.toLocaleString('en-US')} words (${rates.slice(0, 4).map((r) => r.feature.label).join(', ')}${rates.length > 4 ? ', …' : ''}): a new piece is held to the count its length expects; shown and used to choose between drafts, never blocking.`);
  else {
    const more = piecesForARate(texts);
    out.push(`No rate has ${POOLED_MIN_EVENTS} occurrences across these pieces, so none is read${more !== null ? `: about ${more} more piece${more === 1 ? '' : 's'} like these would let the first be read` : ''}.`);
  }
  const past = limit ? texts.filter((t) => shapeOf(t).characters > limit.chars).length : 0;
  out.push(limit ? `Platform limit: ${limit.chars} characters (${limit.from}); the length in characters is held under it${past ? `, though ${past} of your ${texts.length} examples run past it` : ''}.`
    : 'No platform limit: none was given (--limit <chars>, or --class x-post for 280).');
  return out;
}

export { isShortForm };

/**
 * THE SAME READING FOR DISCOVERY (cli/commands/discover.ts): the shape bands read from the pieces discovery read, and
 * checked on the pieces it held out, beside the pooled rates, as measured proposals the review weighs like any other
 * count (../ratification/suggest.ts). Nothing when the pieces are not short form.
 */
export function shortFormMeasured(read: readonly { readonly id: string; readonly text: string }[], held: readonly { readonly id: string; readonly text: string }[],
  provenance: Requirement['provenance'], opts: { readonly limit?: number | null; readonly urlChars?: number; readonly answers?: boolean } = {}): MeasuredProposal[] {
  const texts = read.map((p) => p.text);
  if (!isShortForm(texts) || texts.length < MIN_PIECES_TO_COUNT) return [];
  const own = [...read, ...held.filter((h) => !read.some((r) => r.id === h.id))];
  const checkOn = held.length ? held.map((p) => p.text) : texts;
  const thin = thinEvidence(own.length);
  const conformance = (m: Measurement): MeasuredProposal['conformance'] => {
    const rs = checkOn.map((t) => measure(t, m));
    return { applicable: rs.filter((r) => r.verdict !== 'NOT_APPLICABLE').length, present: rs.filter((r) => r.verdict === 'MET').length, independent: held.length > 0, ...(thin ? { thin } : {}) };
  };
  // A SKILL THAT ANSWERS takes its length and its shape from the request, never from a habit of the examples
  // (../compiler/scope.ts): its pieces' rates are read, and no band of their shape is proposed.
  const rules = [
    ...(opts.answers ? [] : shapeBandRules(texts, opts)).map((s) => ({ statement: s.statement, evidence: s.evidence, measurement: s.measurement })),
    ...pooledRateRules(texts).map((r) => ({ statement: r.statement, evidence: r.evidence, measurement: r.measurement })),
  ];
  return rules.map((r, i): MeasuredProposal => ({
    requirement: { requirementId: `s${i + 1}`, statement: r.statement, appliesWhen: 'GENERAL', kind: /^\s*no\b/i.test(r.statement) ? 'BOUNDARY' : 'GENERATIVE', authority: 'DERIVED_UNRATIFIED', provenance,
      evidence: r.evidence, evidenceItemId: null, wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null, wordedFromCheck: true, measurement: r.measurement },
    conformance: conformance(r.measurement),
  }));
}

/** The platform's facts for short pieces: a character limit and where it came from, and how a link is counted. */
export interface ShortFormOptions { readonly limit?: { readonly chars: number; readonly from: string } | null; readonly urlChars?: number;
  /** the pieces answer requests (the format lists claims: an assistant reply, a code review comment): length follows the request */
  readonly answers?: boolean }

/**
 * `--limit <chars>`, the owner's to state, or the limit of the format the class names (a post on X: 280); and how
 * that format counts a link. A limit that is not a whole number above zero is refused, never guessed at: the reason
 * comes back as a string.
 */
export function shortFormOptions(cls: string | null | undefined, given: string | undefined): ShortFormOptions | string {
  if (given !== undefined && (!/^\d{1,6}$/.test(given.trim()) || Number(given) <= 0)) return `--limit takes a whole number of characters above zero, got "${given}".`;
  const f = formatOf(cls);
  const limit = given !== undefined ? { chars: Number(given), from: '--limit' } : f?.maxChars !== undefined ? { chars: f.maxChars, from: f.label } : null;
  return { limit, ...(f?.urlChars !== undefined ? { urlChars: f.urlChars } : {}), ...(f?.claims === 'list' ? { answers: true } : {}) };
}

// ── A LONG-FORM STANDARD ASKED FOR A SHORT PIECE ────────────────────────────────────────────────────────
//
// A standard read from essays, asked for a post on X, used to hold the post to the essays' paragraph bands, their
// sentence mix and their word count, and the post failed for being a post. What carries is the owner's method (every
// step they stated) and every ban (a move the author never makes is never made, at any length). What does not carry
// is a band counted off long pieces: it describes a length the request does not ask for. Such a band does not apply
// to this output: it is recorded as such, with the reason, and never as unverified, because nothing is left for a
// person to read. The platform's limit is the format's or the request's, and the writer is told that the argument
// itself must survive the compression.

/** A request is short form when what it may hold is at most this many characters (about 150 words). */
export const SHORT_REQUEST_CHARS = 1000;

/** Observers that count over a long piece: their bands describe a length, and do not carry to a short one. */
const LONG_FORM_COUNTED: ReadonlySet<string> = new Set(['SENTENCE_LENGTH', 'PARAGRAPH_LENGTH', 'HEDGE_RATE', 'PATTERN_RATE', 'TERM_RATE', 'RATIO',
  'DISTRIBUTION', 'RHYTHM', 'FRAGMENT_SHARE', 'FEATURE', 'STYLE_DISTANCE', 'LENGTH', 'HEADINGS']);

/** A measurement that forbids something outright: it carries at any length. */
export function isBan(m: Measurement): boolean {
  const p = m.params;
  const has = (k: string): boolean => Array.isArray(p[k]) && (p[k] as readonly unknown[]).length > 0;
  if (m.observer === 'LEXICON') return true;
  if (m.observer === 'PATTERN_RATE' || m.observer === 'TERM_RATE' || m.observer === 'HEDGE_RATE') return has('never') || p.maxPer1000 === 0;
  if (m.observer === 'HEADINGS') return has('avoid');
  return false;
}

/** Does a standard already describe short pieces: it holds a band of their shape. */
export const isShortFormStandard = (requirements: readonly Pick<Requirement, 'measurement' | 'authority'>[]): boolean =>
  requirements.some((r) => r.authority !== 'EXPERT_REJECTED' && r.measurement?.observer === 'SHAPE');

export interface ShortTransfer {
  /** the long-form counted bands, by id, each with why it does not apply to this output */
  readonly doesNotApply: ReadonlyMap<string, string>;
  /** the limit the output is held to, and where it came from */
  readonly limit: { readonly chars: number; readonly from: string };
  /** said to the writer with the task */
  readonly note: string;
  /** said to the person */
  readonly said: string;
}

/**
 * WHAT A SHORT REQUEST KEEPS OF A LONG-FORM STANDARD, or null where there is nothing to transfer: the request is not
 * short form (no limit, or one over SHORT_REQUEST_CHARS), or the standard already describes short pieces. A rule the
 * owner stated (a step of their method) and a ban are kept; a band counted off the examples is set down as not
 * applying, with the reason.
 */
export function shortFormTransfer(requirements: readonly Requirement[], limit: { readonly chars: number; readonly from: string } | null): ShortTransfer | null {
  if (!limit || limit.chars > SHORT_REQUEST_CHARS || isShortFormStandard(requirements)) return null;
  const stated = (r: Requirement): boolean => r.provenance === 'EXPERT_STATED' || r.provenance === 'EXPERT_ADDED' || r.authority === 'EXPERT_AUTHORED';
  const doesNotApply = new Map<string, string>();
  for (const r of requirements) {
    const m = r.measurement;
    // GRAMMAR is never in LONG_FORM_COUNTED: a mechanical error is one in a tweet as in an essay, so it always holds.
    if (r.authority === 'EXPERT_REJECTED' || !m || !LONG_FORM_COUNTED.has(m.observer) || isBan(m) || stated(r)) continue;
    doesNotApply.set(r.requirementId, `a band counted off your longer pieces; this output is short form (at most ${limit.chars} characters, ${limit.from})`);
  }
  const n = doesNotApply.size;
  return {
    doesNotApply, limit,
    note: `\n\n(This is short form: at most ${limit.chars} characters (${limit.from}). The standard was read from longer pieces. Its method and its bans hold; its counts of length, paragraphs and sentence mix do not apply here. Compress the piece, and keep the essential argument: it must survive the compression.)`,
    said: `Short form (at most ${limit.chars} characters, ${limit.from}) from a standard read from longer pieces: its method and bans hold; ${n === 0 ? 'none of its rules is a band counted off longer pieces' : `${n} band${n === 1 ? '' : 's'} counted off your longer pieces do${n === 1 ? 'es' : ''} not apply to this output`}.`,
  };
}
