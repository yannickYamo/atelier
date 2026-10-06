// atelier/core/observers/derive.ts — THE MEASURABLE PART OF A VOICE, READ OFF THE WORK ITSELF.
//
// A hand-kept house style that survives contact with a model carries numbers: a median sentence
// length, a paragraph cap, a hedging ratio, a list of words that are never used. Discovery proposes
// rules a model can phrase; it cannot produce these, because they are counts, not readings. So they
// are counted — deterministically, over the pieces discovery was allowed to read — and proposed on
// the same review screen as everything else, each with its measurement attached and with how many of
// the author's own pieces meet it.
//
// They are PROPOSALS. A distribution is a description of the corpus until the owner says it is a
// target, exactly like any other discovered rule; `suggest` weighs them and the person rules.
//
// Minimums are deliberate: a median over twelve sentences is noise with a decimal point.

import type { Measurement, ObserverId, Requirement } from '../state/canonical-state.js';
import { sentencesOf, paragraphsOf, wordsOf, proseRegions, quantile, findTerms, DEFAULT_HEDGES, measure, validateMeasurement } from './registry.js';
import { lengthMix, mixDistance } from './balance.js';
import { allowed, CORPUS_RULE_SHARE } from '../ratification/suggest.js';

/**
 * Phrases that mark text as generic model output, proposed as banned ONLY where the author's own
 * corpus never uses them. A list, named as one: it is the one place here where a word list is the
 * point rather than a proxy, because the rule it produces is literally "these words do not appear".
 */
export const GENERIC_PHRASES: readonly string[] = [
  // Only phrases whose presence marks text as generic model output. Ordinary connectives a careful
  // writer uses ("additionally", "moreover", "in conclusion") are NOT here: their absence from a few
  // thousand words is no evidence of a decision, and banning them would be the machine's taste.
  'delve', 'delves', 'delving', 'tapestry', 'a testament to', 'in today\'s fast-paced', 'ever-evolving',
  'unlock the power', 'unleash the power', 'navigate the complexities', 'it\'s important to note',
  'it is important to note', 'it\'s worth noting', 'embark on a journey', 'elevate your', 'a plethora of',
  'in the realm of', 'the world of', 'game-changer', 'let\'s dive in',
];

export interface MeasuredProposal {
  readonly requirement: Requirement;
  /**
   * How the target fares on work it was NOT computed from: the held-out pieces, when there are any.
   * Scoring the target on the pieces it was computed from, with slack added, passes by construction
   * and made every measured rule look like a finding. `independent` says which this is.
   */
  readonly conformance: { readonly applicable: number; readonly present: number; readonly independent: boolean;
    /** proposed on indirect evidence: shown and used for draft selection, never instructed by default */
    readonly weak?: boolean;
    /**
     * the proposed limit was moved to where the author's own pieces are (`fitToCorpus`). The counts above are then
     * still the held-out pieces against the limit BEFORE it was moved: the moved limit was set using those pieces,
     * so they are no independent check of it, and its evidence is the corpus count kept beside it.
     */
    readonly fitted?: boolean };
}

export const MIN_WORDS = 1000;
export const MIN_LEXICON_WORDS = 3000;
export const MIN_SENTENCES = 30;
export const MIN_PARAGRAPHS = 10;

const conformanceOn = (pieces: readonly string[], m: Measurement): { applicable: number; present: number } => {
  const rs = pieces.map((t) => measure(t, m));
  return { applicable: rs.filter((r) => r.verdict !== 'NOT_APPLICABLE').length, present: rs.filter((r) => r.verdict === 'MET').length };
};

/**
 * WHICH OF THE AUTHOR'S OWN PIECES BREAK A MEASURED RULE, by their place in `pieces`. A piece the rule cannot be
 * measured on is not one that breaks it. This is the evidence for the question a held-out check does not ask: a
 * target is set a little tighter than the author's average and checked rule by rule, on the few pieces held out,
 * so each rule can pass its check while the rules together fail half of the very pieces they were read from
 * (core/ratification/suggest.ts, `suggestAll`).
 */
export function piecesBreaking(pieces: readonly string[], m: Measurement): number[] {
  return pieces.flatMap((t, i) => { const v = measure(t, m).verdict; return v !== 'NOT_APPLICABLE' && v !== 'MET' ? [i] : []; });
}

// ── A LIMIT SET WHERE THE AUTHOR'S OWN PIECES ARE ──────────────────────────────────────────────
//
// A limit is computed from the author's pooled numbers with a fixed margin (the pooled median times 1.2, plus
// one) and then checked piece by piece. A pooled median says nothing about how far single pieces sit from it, so
// pieces of the author's own break the author's own rule: four posts of one blog had a median of 19 to 22 words
// against "a median under 19". Suggesting such a rule as a preference keeps the wrong number and loses the rule.
// Where the rule is a numeric limit, the limit is moved instead, just far enough that the author's pieces meet
// it, so the rule stays one an output can be held to and is true of the person it was read from.

/** One numeric limit of a measurement: an upper limit only ever goes up, a lower one only ever down. */
interface Limit { readonly key: string; readonly side: 'MAX' | 'MIN'; readonly decimals: 0 | 1 | 2;
  /** how the evidence line names it when it is moved */
  readonly said: string }

const LIMITS: Readonly<Partial<Record<ObserverId, readonly Limit[]>>> = {
  SENTENCE_LENGTH: [{ key: 'medianMax', side: 'MAX', decimals: 0, said: 'a median of ' }, { key: 'p90Max', side: 'MAX', decimals: 0, said: 'nine in ten under ' }],
  PARAGRAPH_LENGTH: [{ key: 'maxSentences', side: 'MAX', decimals: 0, said: '' }],
  HEDGE_RATE: [{ key: 'maxPer1000', side: 'MAX', decimals: 1, said: '' }],
  PATTERN_RATE: [{ key: 'minPer1000', side: 'MIN', decimals: 1, said: 'a floor of ' }, { key: 'maxPer1000', side: 'MAX', decimals: 1, said: 'a ceiling of ' }],
  TERM_RATE: [{ key: 'minPer1000', side: 'MIN', decimals: 1, said: 'a floor of ' }, { key: 'maxPer1000', side: 'MAX', decimals: 1, said: 'a ceiling of ' }],
  FRAGMENT_SHARE: [{ key: 'maxShare', side: 'MAX', decimals: 2, said: '' }],
  RATIO: [{ key: 'minShare', side: 'MIN', decimals: 2, said: 'a floor of ' }, { key: 'maxShare', side: 'MAX', decimals: 2, said: 'a ceiling of ' }],
  DISTRIBUTION: [{ key: 'tolerance', side: 'MAX', decimals: 2, said: 'a tolerance of ' }],
  RHYTHM: [{ key: 'minCv', side: 'MIN', decimals: 2, said: 'a floor of ' }, { key: 'maxCv', side: 'MAX', decimals: 2, said: 'a ceiling of ' }],
  OPENING: [{ key: 'maxWords', side: 'MAX', decimals: 0, said: '' }],
  CLOSING: [{ key: 'maxWords', side: 'MAX', decimals: 0, said: '' }],
};

/** Shares are stored as fractions and said as percentages, as every observer's `describe` says them. */
const SAID_AS_PERCENT: ReadonlySet<string> = new Set(['minShare', 'maxShare', 'tolerance']);
const sayLimit = (key: string, x: number): string => (SAID_AS_PERCENT.has(key) ? `${Math.round(x * 100)}%` : `${x}`);

const roundTo = (x: number, decimals: number): number => Math.round(x * 10 ** decimals) / 10 ** decimals;
/** Up to the next step, so a limit set from a piece's own value is one that piece meets. */
const ceilTo = (x: number, decimals: number): number => Math.ceil(x * 10 ** decimals - 1e-9) / 10 ** decimals;

/**
 * WHERE ONE PIECE STANDS ON EACH LIMIT: for an upper limit the smallest value the piece meets, for a lower limit
 * the largest. 'UNMEASURED' when the rule cannot be measured on the piece (it does not break it either), and
 * 'BREAKS_ANYWAY' when the piece breaks the rule for a reason no limit can move (a banned phrase in its opening, a
 * move the author is recorded as never making, an opening under a minimum this function does not move).
 */
function standing(text: string, m: Measurement, limits: readonly Limit[]): Readonly<Record<string, number>> | 'UNMEASURED' | 'BREAKS_ANYWAY' {
  const p = m.params;
  const read = (params: Measurement['params']): ReturnType<typeof measure> => measure(text, { observer: m.observer, params });
  const without = (...keys: string[]): Measurement['params'] => Object.fromEntries(Object.entries(p).filter(([k]) => !keys.includes(k)));
  const every = (x: number): Record<string, number> => Object.fromEntries(limits.map((l) => [l.key, x]));
  // A share worked out here can differ from the observer's own in its last binary digit. Whether the piece meets
  // the limit is asked of the observer itself, and the limit is one step looser when it does not.
  const upperMet = (key: string, x: number, decimals: number): number => (read({ ...p, [key]: x }).verdict === 'MET' ? x : roundTo(x + 10 ** -decimals, decimals));
  switch (m.observer) {
    case 'SENTENCE_LENGTH': {
      const lens = sentencesOf(text).map((x) => x.words);
      return lens.length < 3 ? 'UNMEASURED' : { medianMax: quantile(lens, 0.5), p90Max: quantile(lens, 0.9) };
    }
    // The observer's value is the statistic the limit is compared with: the longest paragraph, the rate, the variation.
    case 'PARAGRAPH_LENGTH': case 'HEDGE_RATE': case 'RHYTHM': {
      const r = read(p);
      return r.verdict === 'NOT_APPLICABLE' || r.value === null ? 'UNMEASURED' : every(r.value);
    }
    // Read with no floor and no ceiling: what is left to break is a move the author never makes, at any rate.
    case 'PATTERN_RATE': case 'TERM_RATE': {
      const r = read({ ...without('minPer1000', 'maxPer1000'), maxPer1000: Number.MAX_SAFE_INTEGER });
      if (r.verdict === 'VIOLATED') return 'BREAKS_ANYWAY';
      return r.verdict === 'NOT_APPLICABLE' || r.value === null ? 'UNMEASURED' : every(r.value);
    }
    case 'FRAGMENT_SHARE': {
      if (read(p).verdict === 'NOT_APPLICABLE') return 'UNMEASURED';
      const ss = sentencesOf(text); const w = typeof p.maxWords === 'number' ? p.maxWords : 5;
      return { maxShare: upperMet('maxShare', ceilTo(ss.filter((x) => x.words <= w).length / ss.length, 2), 2) };
    }
    // The observer reports the share rounded; whether the piece meets a limit at that rounding is asked of the
    // observer itself, and the limit is one step looser when it does not.
    case 'RATIO': {
      const r = read(p);
      if (r.verdict === 'NOT_APPLICABLE' || r.value === null) return 'UNMEASURED';
      const lists = without('minShare', 'maxShare'); const v = r.value;
      return { minShare: read({ ...lists, minShare: v }).verdict === 'MET' ? v : roundTo(v - 0.01, 2),
        maxShare: read({ ...lists, maxShare: v }).verdict === 'MET' ? v : roundTo(v + 0.01, 2) };
    }
    case 'DISTRIBUTION': {
      if (read(p).verdict === 'NOT_APPLICABLE') return 'UNMEASURED';
      const numbers = (k: string): number[] => (Array.isArray(p[k]) ? (p[k] as readonly unknown[]).filter((x): x is number => typeof x === 'number') : []);
      return { tolerance: upperMet('tolerance', ceilTo(mixDistance(lengthMix(text, numbers('edges')).shares, numbers('shares')), 2), 2) };
    }
    case 'OPENING': case 'CLOSING': {
      const rest = read(without('maxWords'));
      if (rest.verdict === 'NOT_APPLICABLE') return 'UNMEASURED';
      if (rest.verdict === 'VIOLATED') return 'BREAKS_ANYWAY';
      // Against a maximum of no words at all, what the observer counts as over is the paragraph's length.
      return { maxWords: read({ maxWords: 0 }).value ?? 0 };
    }
    default: return 'UNMEASURED';
  }
}

/**
 * A MEASUREMENT WITH ITS NUMERIC LIMITS LOOSENED JUST ENOUGH THAT AT MOST `allowedBreaking` OF THE AUTHOR'S OWN
 * PIECES BREAK IT (`piecesBreaking`), or null: when the measurement has no numeric limit to move, when it already
 * holds, or when no loosening inside the bound achieves it. Deterministic, and no model is asked anything.
 *
 * It only ever loosens. An upper limit goes up and never past twice what it was; a lower limit goes down and never
 * under half what it was. Inside that bound the result is the smallest loosening, read off the pieces' own values:
 * for one limit, the value of the piece that leaves exactly `allowedBreaking` pieces past it (fewer when pieces
 * tie); for two, the pair with the smallest relative movement in total. Whole-number limits stay whole numbers,
 * rates per 1,000 words keep one decimal, shares and variations two: the precision each observer measures at.
 *
 * MOVED, and why each is a limit a piece of the author's can sit on the wrong side of:
 *   SENTENCE_LENGTH    medianMax, p90Max        a piece's own median and 90th percentile
 *   PARAGRAPH_LENGTH   maxSentences             a piece's longest paragraph
 *   HEDGE_RATE         maxPer1000               a piece's rate
 *   PATTERN_RATE       minPer1000, maxPer1000   a piece's rate (never the `never` families: see below)
 *   TERM_RATE          minPer1000, maxPer1000   a piece's rate
 *   FRAGMENT_SHARE     maxShare                 a piece's share of very short sentences
 *   RATIO              minShare, maxShare       a piece's share of the two word lists
 *   DISTRIBUTION       tolerance                how far a piece's mix sits from the target mix
 *   RHYTHM             minCv, maxCv             a piece's variation
 *   OPENING, CLOSING   maxWords                 the length of a piece's first or last paragraph
 *
 * NEVER MOVED:
 *   an upper limit of 0   it means "never". A ban the author breaks is a different finding from a limit set a
 *                         little tight, and twice nothing is nothing: null.
 *   PATTERN_RATE never, pattern, prefer; LEXICON; OPENING, CLOSING and HEADINGS avoid; HEADINGS case; PRESENCE;
 *                         STYLE_DISTANCE: bans, presence checks and a comparison. There is no number to move, and a
 *                         piece that breaks one of them breaks it at any limit.
 *   FRAGMENT_SHARE maxWords; DISTRIBUTION edges and shares; RATIO and TERM_RATE word lists: they say WHAT is
 *                         counted. Moving them would make it another rule, not a looser one.
 *   OPENING, CLOSING minWords   a minimum applies only to a text at least four times as long, so lowering it
 *                         changes which pieces it applies to and can make a piece break that did not.
 *   FEATURE minValue, maxValue  a counted feature's band is what was qualified to tell the author from the model
 *                         (./selection.ts), and it is never suggested as required; a moved band is one nothing
 *                         qualified.
 *   HEADINGS maxWords, minPer1000, maxPer1000   discovery proposes no numeric heading limit; one an owner
 *                         declared by hand is theirs to move.
 */
export function fitToCorpus(m: Measurement, pieces: readonly string[], allowedBreaking: number): Measurement | null {
  const limits = (LIMITS[m.observer] ?? []).filter((l) => typeof m.params[l.key] === 'number');
  if (!limits.length) return null;
  const now = (l: Limit): number => m.params[l.key] as number;
  if (limits.some((l) => l.side === 'MAX' && now(l) <= 0)) return null;
  if (piecesBreaking(pieces, m).length <= allowedBreaking) return null;
  const stands = pieces.map((t) => standing(t, m, limits));
  const measured = stands.filter((x): x is Readonly<Record<string, number>> => typeof x !== 'string');
  const anyway = stands.filter((x) => x === 'BREAKS_ANYWAY').length;
  // Everything below is in one direction: a larger number is a looser limit, whichever side the limit is on.
  const dir = (l: Limit): number => (l.side === 'MAX' ? 1 : -1);
  const at = (l: Limit): number => dir(l) * now(l);
  const bound = (l: Limit): number => (l.side === 'MAX' ? 2 * now(l) : -now(l) / 2);
  const need = (v: Readonly<Record<string, number>>, l: Limit): number => dir(l) * (l.side === 'MAX' ? ceilTo(v[l.key], l.decimals) : roundTo(v[l.key], l.decimals));
  const moved = (x: number, l: Limit): number => (x - at(l)) / (Math.abs(at(l)) || 1);
  // No observer has more than two limits that move.
  const a = limits[0]; const b = limits.length > 1 ? limits[1] : null;
  const candidates = [...new Set([at(a), ...measured.map((v) => need(v, a)).filter((x) => x > at(a) && x <= bound(a))])].sort((x, y) => x - y);
  let best: { readonly a: number; readonly b: number | null; readonly cost: number } | null = null;
  for (const ca of candidates) {
    const meet = measured.filter((v) => need(v, a) <= ca);
    // What is left of the allowance once the pieces this limit still leaves out are counted.
    const left = allowedBreaking - anyway - (measured.length - meet.length);
    if (left < 0) continue;
    let cb: number | null = null;
    if (b) {
      const past = meet.map((v) => need(v, b)).filter((x) => x > at(b)).sort((x, y) => y - x);
      cb = past[left] ?? at(b);
      if (cb > bound(b)) continue;
    }
    const cost = moved(ca, a) + (b && cb !== null ? moved(cb, b) : 0);
    // On a tie the first limit moves least: the candidates are tried from the tightest up.
    if (!best || cost < best.cost - 1e-12) best = { a: ca, b: cb, cost };
  }
  if (!best || best.cost <= 0) return null;
  const params = { ...m.params, [a.key]: dir(a) * best.a, ...(b && best.b !== null ? { [b.key]: dir(b) * best.b } : {}) };
  const fitted: Measurement = { observer: m.observer, params };
  // The observer has the last word: the arithmetic above is a way to find the limit, not the check itself.
  if (validateMeasurement(fitted) !== null || piecesBreaking(pieces, fitted).length > allowedBreaking) return null;
  return fitted;
}

/** The limits `fitToCorpus` moved, in the measurement's own order: what each was and what it is. */
export function movedLimits(original: Measurement, fitted: Measurement): { readonly key: string; readonly was: number; readonly is: number; readonly wasSaid: string; readonly isSaid: string; readonly said: string }[] {
  return (LIMITS[original.observer] ?? []).flatMap((l) => {
    const was = original.params[l.key]; const is = fitted.params[l.key];
    return typeof was === 'number' && typeof is === 'number' && was !== is ? [{ key: l.key, was, is, wasSaid: sayLimit(l.key, was), isSaid: sayLimit(l.key, is), said: l.said }] : [];
  });
}

/**
 * THE EVIDENCE LINE'S ACCOUNT OF A MOVED LIMIT, in plain words: what it is set at, what the usual margin gave, and
 * how many of the author's own pieces meet it. Appended to a rule's evidence wherever its limit was fitted, so the
 * review screen never shows a moved number as if it were the computed one.
 */
export function fitNote(original: Measurement, fitted: Measurement, pieces: readonly string[]): string {
  const breaking = piecesBreaking(pieces, fitted).length;
  const meet = breaking === 0 ? `every one of your ${pieces.length} pieces meets it`
    : `all but ${breaking === 1 ? 'one' : breaking} of your ${pieces.length} pieces meet it`;
  return `set at ${movedLimits(original, fitted).map((x) => `${x.said}${x.isSaid} (not ${x.wasSaid})`).join(' and ')} so that ${meet}`;
}

/**
 * A STATEMENT WITH ITS QUOTED LIMITS REPLACED BY THE FITTED ONES, for a rule already approved whose owner is
 * offered the fitted limit (`atelier amend --measure`). The statement itself when it quotes none of the moved
 * limits; null when a moved limit's old number appears more than once, so that which one to replace would be a
 * guess: the owner rewords it then. Only a number standing on its own is taken for the limit ("19", never the 19
 * in "190" or "1.19").
 */
export function restateLimits(statement: string, original: Measurement, fitted: Measurement): string | null {
  const quoted = (said: string): RegExp => new RegExp(`(?<![\\d.,])${said.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${said.endsWith('%') ? '' : '(?!%|\\d|[.,]\\d)'}`, 'g');
  // A mix's tolerance is not in its statement, which quotes the shares: "about 20% under 8 words" is not the 0.2 moved.
  if (original.observer === 'DISTRIBUTION') return statement;
  const moves = movedLimits(original, fitted).map((x) => ({ ...x, at: [...statement.matchAll(quoted(x.wasSaid))].map((hit) => hit.index) }));
  if (moves.some((x) => x.at.length > 1) || new Set(moves.flatMap((x) => x.at)).size !== moves.flatMap((x) => x.at).length) return null;
  // Replaced from the end of the statement backwards, so an earlier replacement never shifts a later one's place.
  return moves.filter((x) => x.at.length === 1).sort((x, y) => y.at[0] - x.at[0])
    .reduce((s, x) => `${s.slice(0, x.at[0])}${x.isSaid}${s.slice(x.at[0] + x.wasSaid.length)}`, statement);
}

interface Piece { readonly id: string; readonly text: string }

/**
 * Targets are counted from `read` — the pieces discovery was allowed to read — and checked against
 * `held`, which it never saw. With nothing held out, conformance is reported on `read` and marked as
 * not independent, and the suggestion treats it that way.
 *
 * A numeric limit more of the author's pieces break than the review allows is then moved to where those pieces
 * are (`fitToCorpus`, over `read` and `held` together). The statement and the evidence quote the limit as moved,
 * the evidence says that it was, and the proposal is marked `fitted`.
 */
export function deriveMeasuredRules(read: readonly Piece[], held: readonly Piece[], provenance: Requirement['provenance']): MeasuredProposal[] {
  const texts = read.map((p) => p.text);
  const checkOn = held.length ? held.map((p) => p.text) : texts;
  const all = texts.join('\n\n');
  const sentences = texts.flatMap(sentencesOf);
  const paragraphs = texts.flatMap(paragraphsOf);
  const words = texts.reduce((n, t) => n + proseRegions(t).reduce((k, r) => k + wordsOf(r.text).length, 0), 0);
  const out: MeasuredProposal[] = [];
  // THE AUTHOR'S OWN PIECES: those read and those held out, each once, and nothing else. Every limit below is
  // computed as before and then set where these pieces are (`fitToCorpus`), allowing the pieces the review allows.
  const own = [...read, ...held.filter((h) => !read.some((r) => r.id === h.id))].map((p) => p.text);
  const mayBreak = allowed(own.length, CORPUS_RULE_SHARE);
  let n = 0;
  const push = (statement: (m: Measurement) => string, kind: Requirement['kind'], computed: Measurement, evidence: string): void => {
    n += 1;
    const fitted = fitToCorpus(computed, own, mayBreak);
    const measurement = fitted ?? computed;
    out.push({
      requirement: { requirementId: `m${n}`, statement: statement(measurement), appliesWhen: 'GENERAL', kind, authority: 'DERIVED_UNRATIFIED', provenance,
        evidence: fitted ? `${evidence}; ${fitNote(computed, fitted, own)}` : evidence,
        evidenceItemId: null, wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null, measurement },
      // Against the limit as computed: the held-out pieces helped set a fitted one, so they cannot check it.
      conformance: { ...conformanceOn(checkOn, computed), independent: held.length > 0, ...(fitted ? { fitted: true } : {}) },
    });
  };
  const limit = (m: Measurement, key: string): number => m.params[key] as number;

  if (sentences.length >= MIN_SENTENCES) {
    const lens = sentences.map((s) => s.words);
    const med = quantile(lens, 0.5); const p90 = quantile(lens, 0.9);
    const medianMax = Math.ceil(med * 1.2 + 1); const p90Max = Math.ceil(p90 * 1.15 + 1);
    // The statement quotes the numbers it is checked against, so the rule and its check cannot disagree.
    push((m) => `I keep sentences short: a median under ${limit(m, 'medianMax')} words, and nine in ten under ${limit(m, 'p90Max')}.`, 'GENERATIVE',
      { observer: 'SENTENCE_LENGTH', params: { medianMax, p90Max } },
      `your median is ${med} words and nine in ten are under ${p90 + 1}, over ${sentences.length} sentences in ${read.length} pieces`);
  }
  if (paragraphs.length >= MIN_PARAGRAPHS) {
    const cap = Math.max(2, quantile(paragraphs.map((p) => p.sentences), 0.95));
    push((m) => `I keep paragraphs to ${limit(m, 'maxSentences')} sentences at most.`, 'GENERATIVE',
      { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: cap } },
      `95% of your ${paragraphs.length} paragraphs have ${cap} sentences or fewer`);
  }
  if (words >= MIN_WORDS) {
    const rate = Math.round((findTerms(all, DEFAULT_HEDGES).length / words) * 10000) / 10;
    const max = Math.max(2, Math.round(rate * 1.5 + 1));
    push((m) => `I hedge rarely: at most ${limit(m, 'maxPer1000')} hedging words per thousand.`, 'GENERATIVE',
      { observer: 'HEDGE_RATE', params: { maxPer1000: max } },
      `you use about ${rate} per thousand, over ${words} words`);
  }
  if (words >= MIN_LEXICON_WORDS) {
    const unused = GENERIC_PHRASES.filter((t) => findTerms(all, [t]).length === 0);
    if (unused.length >= 5) {
      push(() => `Never use stock model phrasing: ${unused.slice(0, 8).join(', ')}${unused.length > 8 ? ', …' : ''}.`, 'BOUNDARY',
        { observer: 'LEXICON', params: { terms: unused } },
        `none of these appears in ${words} words of your work`);
    }
  }
  return out;
}
