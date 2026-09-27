// atelier/core/observers/contrast.ts — RULES FROM THE GAP BETWEEN THE AUTHOR AND THE MODEL'S DEFAULTS.
//
// The model writes a few plain drafts on the kind of topic the author writes about, with no skill.
// Every named pattern in `style.ts` is counted in both. A pattern the model uses far more than the
// author becomes a proposed cap; one the author uses far more than the model becomes a proposed floor;
// the author's function-word profile against the model's becomes a style-distance measure. Each
// proposal carries both numbers, and each is checked on held-out pieces before it is proposed at all:
// a "rule" the author's own unseen work breaks is a rule against the author, and is dropped.
//
// Beyond named patterns, it compares proportions (./balance.ts): which of two competing words the author
// reaches for ("but" or "however", "it's" or "it is"), connectives they lean on far more than the model,
// words the model leans on that they barely use, and the mix of short and long sentences.
//
// Like every discovered rule, these are proposals. The person rules on them on the same screen.

import type { Measurement, Requirement } from '../state/canonical-state.js';
import { measure, findTerms } from './registry.js';
import { RATIO_MIN_EVENTS, lengthMix, mixDistance, bandLabel, DISTRIBUTION_MIN_SENTENCES, unitLengths, coefficientOfVariation, RHYTHM_MIN_UNITS, type RhythmUnit } from './balance.js';
import { PATTERN_IDS, PATTERN_LABEL, patternRate, findPattern, fragmentShare, deltaReference, styleDistanceDocs, proseWords, perPieceP, type PatternId } from './style.js';
import { quantile, sentencesOf, paragraphsOf, wordsOf } from './text.js';
import { headingsOf, headingCase, OPENING_TROPES, CLOSING_TROPES, HEADING_TROPES } from './structure.js';
import type { MeasuredProposal } from './derive.js';

interface Piece { readonly id: string; readonly text: string }

/** A gap wide enough to be a fingerprint rather than noise. */
const overUsed = (author: number, model: number): boolean => model >= 1 && model >= Math.max(3 * author, author + 1.5);
const underUsed = (author: number, model: number): boolean => author >= 1 && author >= Math.max(3 * model, model + 1.5);
const r1 = (x: number): number => Math.round(x * 10) / 10;

/** Patterns with a proposal of their own below, not the generic author-against-model comparison. */
const VOICE_LAYER: ReadonlySet<PatternId> = new Set<PatternId>(['DASH_ASIDE', 'FIRST_PERSON', 'BRITISH_SPELLING', 'AMERICAN_SPELLING', 'CONTRACTION', 'FULL_FORM']);

/**
 * THE AUTHOR'S POSITIVE SIGNATURE, HELD IN A BAND, AND USED TO CHOOSE, NOT TO STEER. Ceilings on the
 * model's tells alone produce a de-AI'd generic writer. But an author does not write at a rate: across
 * one real corpus, one-line paragraphs ran 0.4 to 10.4 per 1,000 words by piece, first person 0.7 to
 * 36. A rule instructing the average steers every piece toward a piece they never wrote. So these bands
 * are wide (the author's own range) and proposed as WEAK: checked on every output, reported, and used
 * to choose between drafts, never instructed and never rewritten toward. The voice itself is carried by
 * the author's own pieces and a persona brief (core/compiler/).
 */
const SIGNATURE: ReadonlySet<PatternId> = new Set<PatternId>(['BOLD_SPAN', 'ONE_LINE_PARAGRAPH', 'RHETORICAL_QUESTION', 'SEMICOLON']);

/** Constructions measured as model habits (see the the author audit, 2026-09-27): capped at the author's rate when they rarely use them. */
const MODEL_TYPICAL: ReadonlySet<PatternId> = new Set<PatternId>(['EM_DASH', 'NOT_X_ITS_Y', 'THAT_OPENER', 'HERES_OPENER', 'SIGNPOST', 'INTENSIFIER', 'SHORT_VERDICT', 'REPEATED_OPENER']);

export function deriveContrastRules(
  read: readonly Piece[], held: readonly Piece[], drafts: readonly string[], provenance: Requirement['provenance'],
): MeasuredProposal[] {
  if (read.length < 3 || drafts.length < 2) return [];
  const authorTexts = read.map((p) => p.text);
  const authorAll = authorTexts.join('\n\n'); const modelAll = drafts.join('\n\n');
  const words = proseWords(authorAll);
  const checkOn = held.length ? held.map((p) => p.text) : authorTexts;
  const out: MeasuredProposal[] = [];
  let n = 0;
  const propose = (statement: string, kind: Requirement['kind'], measurement: Measurement, evidence: string, weak = false, separate = false): void => {
    // MUST SEPARATE. A proportion the model's own drafts already meet measures nothing about the voice:
    // at least three in five drafts, each measured on its own, must fail it.
    if (separate) {
      const d = drafts.map((t) => measure(t, measurement)).filter((x) => x.verdict !== 'NOT_APPLICABLE');
      const failing = d.filter((x) => x.verdict === 'VIOLATED').length;
      if (!d.length || failing / d.length < 0.6) return;
      evidence = `${evidence}; ${failing} of ${d.length} of its drafts fail it`;
    }
    // THE FALSE-POSITIVE GUARD. A cap the author's own held-out writing breaks is a rule against them.
    // Where no held-out piece is long enough for the rule to apply (common for a ratio, which needs
    // several uses), the pieces it was counted from are the check, and the proposal says so; where none
    // of those applies either, there is no evidence the author meets it, and it is not proposed.
    let independent = held.length > 0;
    let rs = checkOn.map((t) => measure(t, measurement));
    if (!rs.some((x) => x.verdict !== 'NOT_APPLICABLE')) { rs = authorTexts.map((t) => measure(t, measurement)); independent = false; }
    const applicable = rs.filter((x) => x.verdict !== 'NOT_APPLICABLE').length;
    const present = rs.filter((x) => x.verdict === 'MET').length;
    if (!applicable || present / applicable < 0.8) return;
    n += 1;
    out.push({
      requirement: { requirementId: `c${n}`, statement, appliesWhen: 'GENERAL', kind, authority: 'DERIVED_UNRATIFIED', provenance,
        evidence, evidenceItemId: null, wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null, measurement },
      conformance: { applicable, present, independent, ...(weak ? { weak: true } : {}) },
    });
  };

  // Mean of per-piece rates, not the rate of everything joined: a pattern that counts repeats (the same
  // opening three times) grows with length, and a corpus joined into one text inflated it eightfold.
  const meanRate = (texts: readonly string[], p: PatternId): number => r1(texts.reduce((s0, t) => s0 + patternRate(t, p), 0) / Math.max(1, texts.length));
  const authorRate = (p: PatternId): number => meanRate(authorTexts, p);
  const spacedHyphen = authorRate('SPACED_HYPHEN');
  // The band around an author's own rate: most of their pieces sit inside it, and it neither pushes a
  // habit up to their heaviest piece nor lets it vanish.
  const bandOf = (p: PatternId): { lo: number; hi: number; a: number } => {
    const a = authorRate(p);
    const per = (q: number): number => perPieceP(authorTexts, (t) => patternRate(t, p), q);
    return { a, lo: r1(per(0.25) * 0.6), hi: r1(Math.max(per(0.9) * 1.5, a * 2)) };
  };
  for (const p of PATTERN_IDS) {
    if (VOICE_LAYER.has(p)) continue;
    const a = authorRate(p); const m = meanRate(drafts, p);
    const perPiece = (q: number): number => perPieceP(authorTexts, (t) => patternRate(t, p), q);
    const ev = `you: ${a === 0 ? `none in ${words.toLocaleString()} words` : `${a} per 1,000 words`}; the model on its own: ${m} per 1,000`;
    if (overUsed(a, m)) {
      const cap = a === 0 ? 0 : r1(Math.max(perPiece(0.9) * 1.25, a * 1.5, 0.3));
      // Where the author has their own mark for the same job, the rule says to use it.
      const prefer = p === 'EM_DASH' && spacedHyphen >= 1 ? [' - '] : undefined;
      const statement = cap === 0
        ? `Never use ${PATTERN_LABEL[p]}${prefer ? '; I write a spaced hyphen (" - ") instead' : ''}.`
        : `Keep ${PATTERN_LABEL[p]} to at most ${cap} per 1,000 words.`;
      propose(statement, 'BOUNDARY', { observer: 'PATTERN_RATE', params: { pattern: [p], maxPer1000: cap, ...(prefer ? { prefer } : {}) } }, ev);
      // THE MOVE GETS A CAP, NOT JUST THE GLYPH. Told to write " - " where it would have written "—", a
      // model moves every aside onto the substitute: spaced hyphens went to 8.7 and then 8.9 per 1,000
      // words against the author's 4.0 and 2.9. So every dash aside, whatever the character, is held
      // near the author's own rate (half as much again as their typical piece, or their overall rate),
      // proposed when the model's own asides would exceed it.
      if (prefer) {
        const aside = authorRate('DASH_ASIDE');
        const cap = r1(Math.max(perPieceP(authorTexts, (t) => patternRate(t, 'DASH_ASIDE'), 0.5) * 1.5, aside * 1.5, 0.3));
        const moved = meanRate(drafts, 'DASH_ASIDE');
        if (moved > cap) {
          propose(`Keep dash asides (—, – or " - ") to my rate: at most ${cap} per 1,000 words. A banned em dash is not to be moved onto another mark.`, 'BOUNDARY',
            { observer: 'PATTERN_RATE', params: { pattern: ['DASH_ASIDE'], maxPer1000: cap, role: ['dash-substitute'] } },
            `you: ${aside} dash asides per 1,000 words; the model on its own: ${moved}`);
        }
      }
    } else if (MODEL_TYPICAL.has(p) && a <= 0.5 && m > a + 0.2) {
      // A construction models reach for, which this author almost never uses. The cap sits at the
      // author's own rate. Where the model's plain drafts already exceed it, the evidence is direct;
      // where they do not, the tic may only appear under a skill's instructions (as it did when a rule
      // asking for "a short declarative reversal" produced one per paragraph), and the rule is proposed
      // as WEAK: shown and used to choose between drafts, not instructed, until the owner says so.
      const cap = r1(Math.max(perPiece(0.9) * 1.5, 0.5));
      propose(`Keep ${PATTERN_LABEL[p]} rare: at most ${cap} per 1,000 words.`, 'BOUNDARY',
        { observer: 'PATTERN_RATE', params: { pattern: [p], maxPer1000: cap } },
        `you: ${a === 0 ? `none in ${words.toLocaleString()} words` : `${a} per 1,000 words`}; the model's plain drafts here: ${m} per 1,000`,
        m <= cap);
    } else if (SIGNATURE.has(p) && a >= 1) {
      const b = bandOf(p);
      if (b.lo > 0) {
        propose(`Use ${PATTERN_LABEL[p]} within my range: between ${b.lo} and ${b.hi} per 1,000 words (I use about ${b.a}).`, 'GENERATIVE',
          { observer: 'PATTERN_RATE', params: { pattern: [p], minPer1000: b.lo, maxPer1000: b.hi } }, ev, true);
      }
    } else if (underUsed(a, m)) {
      const floor = r1(perPiece(0.1) * 0.8);
      if (floor > 0) {
        propose(`Use ${PATTERN_LABEL[p]}: at least ${floor} per 1,000 words (I use about ${a}).`, 'GENERATIVE',
          { observer: 'PATTERN_RATE', params: { pattern: [p], minPer1000: floor } }, ev);
      }
    }
  }

  proposeVoice(authorTexts, drafts, propose, bandOf, meanRate);

  const aFrag = fragmentShare(authorAll, 5); const mFrag = fragmentShare(modelAll, 5);
  if (mFrag >= 1.5 * aFrag && mFrag - aFrag >= 0.05) {
    const max = Math.min(0.95, Math.round(Math.max(perPieceP(authorTexts, (t) => fragmentShare(t, 5), 0.9) * 1.15, aFrag * 1.3) * 100) / 100);
    propose(`Few very short sentences: at most ${Math.round(max * 100)}% of sentences are five words or fewer.`, 'BOUNDARY',
      { observer: 'FRAGMENT_SHARE', params: { maxWords: 5, maxShare: max } },
      `you: ${Math.round(aFrag * 100)}% of sentences; the model on its own: ${Math.round(mFrag * 100)}%`);
  }

  // ── Style distance, only where it can tell the two apart ────────────────────────────────────────
  //
  // Distances are to each document, averaged — not to a centroid, which with a dozen author pieces and
  // three drafts sits near the pooled mean and calls anything "closer to the author". And it is proposed
  // only when it works on this corpus: every model draft, left out in turn, must land on the model's
  // side, and every held-out piece on the author's. Otherwise it would be a number that sounds like a
  // measure of voice and is not one.
  if (read.length >= 4 && drafts.length >= 3) {
    const ref = deltaReference(authorTexts, drafts);
    // At least four in five: one borderline draft should not veto a measure that otherwise separates
    // (measured on real data: 4 of 5 drafts recognised, the fifth by 0.03).
    const recognised = drafts.filter((d, i) => {
      const others = drafts.filter((_, j) => j !== i);
      const x = styleDistanceDocs(d, deltaReference(authorTexts, others));
      return x.model < x.author;
    }).length;
    // And the other side: each of the author's own pieces, left out in turn, must land on the author's
    // side too. Without this the measure passed the held-out check and then failed 2 of 3 pieces the
    // author had reserved (a real run): it had learned the pieces, not the voice.
    const ownRecognised = authorTexts.filter((t, i) => {
      const x = styleDistanceDocs(t, deltaReference(authorTexts.filter((_, j) => j !== i), drafts));
      return x.author < x.model;
    }).length;
    const loo = recognised / drafts.length >= 0.8 && ownRecognised / authorTexts.length >= 0.8;
    const heldOk = (held.length ? held.map((p) => p.text) : []).every((t) => { const x = styleDistanceDocs(t, ref); return x.author < x.model; });
    if (loo && heldOk) {
      propose('Stay closer to my word habits than to your defaults (the function words I use, and how often).', 'GENERATIVE',
        { observer: 'STYLE_DISTANCE', params: { words: [...ref.words], mean: [...ref.mean], sd: [...ref.sd],
          authorDocs: ref.authorDocs.flat(), modelDocs: ref.modelDocs.flat() } },
        `Burrows' Delta over ${ref.words.length} function words, from ${read.length} of your pieces and ${drafts.length} plain drafts by the model; left out in turn, ${recognised} of ${drafts.length} drafts were recognised as the model's and ${ownRecognised} of ${authorTexts.length} of your pieces as yours`);
    }
  }
  proposeProportions(authorTexts, drafts, propose);
  proposeStructure(authorTexts, drafts, propose);
  proposePace(authorTexts, drafts, propose);
  return out;
}

type Propose = (statement: string, kind: Requirement['kind'], measurement: Measurement, evidence: string, weak?: boolean, separate?: boolean) => void;

/**
 * Competing ways to say the same thing. The first list is the plain register, the second the one a
 * model drifts to. Which one an author picks, and how consistently, is voice; neither is wrong.
 */
export const COMPETING: readonly { readonly a: readonly string[]; readonly b: readonly string[] }[] = [
  { a: ['but'], b: ['however', 'nevertheless', 'nonetheless'] },
  { a: ['so'], b: ['therefore', 'thus', 'hence', 'consequently'] },
  { a: ['also'], b: ['moreover', 'furthermore', 'additionally', 'in addition'] },
  { a: ['use', 'uses', 'used', 'using'], b: ['utilize', 'utilizes', 'utilise', 'leverage', 'leverages', 'leveraging'] },
  { a: ['help', 'helps', 'helped'], b: ['facilitate', 'facilitates', 'facilitated'] },
  { a: ['show', 'shows', 'showed'], b: ['demonstrate', 'demonstrates', 'demonstrated', 'showcase', 'showcases'] },
  { a: ['it\'s', 'don\'t', 'isn\'t', 'can\'t', 'won\'t', 'doesn\'t', 'aren\'t', 'that\'s', 'we\'re', 'you\'re'],
    b: ['it is', 'do not', 'is not', 'cannot', 'will not', 'does not', 'are not', 'that is', 'we are', 'you are'] },
];

/** Connectives and discourse words whose rate is a habit rather than a topic. */
export const CONNECTIVES: readonly string[] = ['but', 'so', 'and', 'because', 'which', 'though', 'still', 'yet', 'actually', 'just', 'really', 'even', 'then', 'now', 'here', 'instead', 'maybe'];

/** Words a model reaches for in plain prose that careful writers rarely use. Proposed as a cap only
 *  from the words the model's own drafts used here, never as a list imposed from outside. */
export const MODEL_VOCABULARY: readonly string[] = ['crucial', 'pivotal', 'landscape', 'robust', 'seamless', 'seamlessly', 'navigate',
  'navigating', 'delve', 'foster', 'fostering', 'harness', 'empower', 'unlock', 'tapestry', 'realm', 'ever-evolving', 'game-changer',
  'cutting-edge', 'streamline', 'holistic', 'nuanced', 'vital', 'ensure', 'ensuring', 'elevate', 'paramount', 'intricate', 'underscore', 'underscores'];

/** The sentence-length bands a mix is counted over. */
export const LENGTH_EDGES: readonly number[] = [8, 18, 30];

function proposeProportions(authorTexts: readonly string[], drafts: readonly string[], propose: Propose): void {
  const words = (t: string): number => proseWords(t);
  const rate = (t: string, terms: readonly string[]): number => { const w = words(t); return w ? (findTerms(t, terms).length / w) * 1000 : 0; };
  const meanRate = (texts: readonly string[], terms: readonly string[]): number => r1(texts.reduce((x, t) => x + rate(t, terms), 0) / Math.max(1, texts.length));
  const pct = (x: number): string => `${Math.round(x * 100)}%`;
  const say = (xs: readonly string[]): string => xs.slice(0, 4).map((x) => `"${x}"`).join('/') + (xs.length > 4 ? '…' : '');

  // ── Which of two competing words ─────────────────────────────────────────────────────────────────
  for (const { a, b } of COMPETING) {
    const count = (texts: readonly string[]): { a: number; b: number } =>
      texts.reduce((c, t) => ({ a: c.a + findTerms(t, a).length, b: c.b + findTerms(t, b).length }), { a: 0, b: 0 });
    const au = count(authorTexts); const mo = count(drafts);
    // Enough uses on both sides for a share to mean something: two per piece is not a habit.
    if (au.a + au.b < 2 * RATIO_MIN_EVENTS || mo.a + mo.b < RATIO_MIN_EVENTS) continue;
    const sa = au.a / (au.a + au.b); const sm = mo.a / (mo.a + mo.b);
    if (Math.abs(sa - sm) < 0.3) continue;
    // Per-piece shares, over the pieces where either occurs often enough, set the bound: the author's
    // own least typical piece, less a margin, so their normal variation is never a violation.
    const perPiece = authorTexts.map((t) => ({ x: findTerms(t, a).length, y: findTerms(t, b).length }))
      .filter((c) => c.x + c.y >= RATIO_MIN_EVENTS).map((c) => c.x / (c.x + c.y));
    const ev = `you: ${say(a)} in ${pct(sa)} of ${au.a + au.b} uses; the model on its own: ${pct(sm)} of ${mo.a + mo.b}`;
    if (sa > sm) {
      const min = Math.max(0.05, Math.round((Math.min(perPiece.length ? quantile(perPiece, 0.1) : sa, sa) - 0.1) * 20) / 20);
      if (min <= sm) continue;
      propose(`Prefer ${say(a)} to ${say(b)}: at least ${pct(min)} of the uses of either.`, 'GENERATIVE',
        { observer: 'RATIO', params: { numerator: [...a], denominator: [...b], minShare: min } }, ev, false, true);
    } else {
      const max = Math.min(0.95, Math.round((Math.max(perPiece.length ? quantile(perPiece, 0.9) : sa, sa) + 0.1) * 20) / 20);
      if (max >= sm) continue;
      propose(`Prefer ${say(b)} to ${say(a)}: at most ${pct(max)} of the uses of either are ${say(a)}.`, 'GENERATIVE',
        { observer: 'RATIO', params: { numerator: [...a], denominator: [...b], maxShare: max } }, ev, false, true);
    }
  }

  // ── Connectives the author leans on: one floor over the group ───────────────────────────────────
  //
  // One connective's rate swings widely from piece to piece (0.7 to 9.2 per 1,000 for "so" across one
  // author's twelve posts), so a floor on it either fails the author or passes everything. The group of
  // connectives they lean on is steadier, and is what a reader hears. The floor is the author's own
  // least typical piece, and it is proposed only if it separates: most of the model's drafts fall below.
  const group = CONNECTIVES.filter((c) => { const a = meanRate(authorTexts, [c]); const m = meanRate(drafts, [c]); return a >= 1 && a >= 1.5 * m + 0.3; });
  if (group.length >= 2) {
    const floor = r1(perPieceP(authorTexts, (t) => rate(t, group), 0.1) * 0.9);
    if (floor > 0) {
      // `role` keeps the rule's key stable when a later run finds a slightly different group.
      propose(`Lean on my connectives (${say(group)}): at least ${floor} per 1,000 words together.`, 'GENERATIVE',
        { observer: 'TERM_RATE', params: { terms: group, minPer1000: floor, role: ['connectives'] } },
        `you: ${meanRate(authorTexts, group)} per 1,000 words for these; the model on its own: ${meanRate(drafts, group)}`, false, true);
    }
  }

  // ── Words the model leans on that the author barely uses: one cap over the ones it used here ────
  const used = MODEL_VOCABULARY.filter((w) => meanRate(drafts, [w]) > 0);
  if (used.length) {
    const a = meanRate(authorTexts, used); const m = meanRate(drafts, used);
    if (m >= 1 && m >= Math.max(3 * a, a + 1)) {
      const cap = r1(Math.max(perPieceP(authorTexts, (t) => rate(t, used), 0.9) * 1.5, 0.5));
      if (cap < m) {
        propose(`Keep the model's stock vocabulary rare (${say(used)}): at most ${cap} per 1,000 words together.`, 'BOUNDARY',
          { observer: 'TERM_RATE', params: { terms: used, maxPer1000: cap, role: ['model-vocabulary'] } },
          `you: ${a} per 1,000 words for these; the model on its own: ${m} per 1,000`, false, true);
      }
    }
  }

  // ── The mix of sentence lengths ───────────────────────────────────────────────────────────────
  const mixable = authorTexts.filter((t) => sentencesOf(t).length >= DISTRIBUTION_MIN_SENTENCES);
  const draftMixable = drafts.filter((t) => sentencesOf(t).length >= DISTRIBUTION_MIN_SENTENCES);
  if (mixable.length >= 3 && draftMixable.length >= 2) {
    const mean = (mixes: number[][]): number[] => mixes[0].map((_, i) => mixes.reduce((x, m) => x + m[i], 0) / mixes.length);
    const author = mean(mixable.map((t) => lengthMix(t, LENGTH_EDGES).shares));
    const model = mean(draftMixable.map((t) => lengthMix(t, LENGTH_EDGES).shares));
    const gap = mixDistance(author, model);
    // Tolerance from the author's own spread: their least typical piece must pass.
    const spread = quantile(mixable.map((t) => mixDistance(lengthMix(t, LENGTH_EDGES).shares, author)), 0.9);
    const tolerance = Math.ceil(Math.max(0.1, spread) * 100) / 100;
    // Proposed only if it separates: most of the model's drafts, each on its own, fall outside it.
    const outside = draftMixable.filter((t) => mixDistance(lengthMix(t, LENGTH_EDGES).shares, author) > tolerance).length;
    if (gap >= 0.1 && outside / draftMixable.length >= 0.6) {
      const shares = toHundredths(author);
      const show = (m: readonly number[]): string => m.map((x, i) => `${pct(x)} ${bandLabel(LENGTH_EDGES, i)}`).join(', ');
      propose(`Mix sentence lengths as I do: about ${show(shares)}.`, 'GENERATIVE',
        { observer: 'DISTRIBUTION', params: { edges: [...LENGTH_EDGES], shares, tolerance } },
        `you: ${show(author)}; the model on its own: ${show(model)} (${pct(gap)} of its sentences in a different band)`);
    }
  }
}

/**
 * The edges and the signposts: phrases the model's drafts put in openings, closes and headings that the
 * author's work never uses there, heading case, and how long the opening runs. Each is proposed only if
 * most of the drafts fail it and the author's held-out work meets it.
 */
function proposeStructure(authorTexts: readonly string[], drafts: readonly string[], propose: Propose): void {
  const first = (t: string): string => paragraphsOf(t)[0]?.text ?? '';
  const last = (t: string): string => { const ps = paragraphsOf(t); return ps.length >= 2 ? ps[ps.length - 1].text : ''; };
  const headingText = (t: string): string => headingsOf(t).map((h) => h.text).join('\n');
  const seenIn = (texts: readonly string[], part: (t: string) => string, tropes: readonly string[]): string[] =>
    tropes.filter((tr) => texts.some((t) => findTerms(part(t), [tr]).length > 0));
  const say = (xs: readonly string[]): string => xs.slice(0, 4).map((x) => `"${x}"`).join(', ') + (xs.length > 4 ? '…' : '');

  // STOCK MOVES AT THE EDGES. Like the model-typical tics above, these often appear only once a skill
  // asks for a voice ("The thing everyone gets wrong about…" arrived in a skill's output, not in the
  // model's plain drafts). So every trope the author never uses in that position is proposed: as a
  // firm rule where the plain drafts already fail it, and as WEAK (shown, used to choose between
  // drafts, not instructed) where they do not.
  const edgeRule = (id: 'OPENING' | 'CLOSING' | 'HEADINGS', part: (t: string) => string, tropes: readonly string[],
    statement: (xs: readonly string[]) => string): void => {
    const absent = tropes.filter((tr) => !seenIn(authorTexts, part, [tr]).length);
    if (!absent.length) return;
    const inDrafts = seenIn(drafts, part, absent);
    const m: Measurement = { observer: id, params: { avoid: absent, role: [`${id.toLowerCase()}-tropes`] } };
    // Firm only where at least three in five of the drafts it applies to break it.
    const readings = drafts.map((t) => measure(t, m).verdict).filter((x) => x !== 'NOT_APPLICABLE');
    const failing = readings.filter((x) => x === 'VIOLATED').length;
    propose(statement(absent), 'BOUNDARY', m,
      inDrafts.length ? `your pieces never use these there; the model's plain drafts used ${say(inDrafts)}`
        : 'your pieces never use these there; stock moves models reach for under a voice instruction',
      failing / Math.max(1, readings.length) < 0.6);
  };
  edgeRule('OPENING', first, OPENING_TROPES, (xs) => `Open the way I do, without the stock moves: never ${say(xs)}.`);
  edgeRule('CLOSING', last, CLOSING_TROPES, (xs) => `Close the way I do, without the stock moves: never ${say(xs)}.`);
  edgeRule('HEADINGS', headingText, HEADING_TROPES, (xs) => `Write headings that say what the section says, never ${say(xs)}.`);

  // Openings: the author's own range of lengths, where the model's run outside it.
  const openLen = (t: string): number => wordsOf(first(t)).length;
  const lens = authorTexts.filter((t) => paragraphsOf(t).length >= 2).map(openLen);
  if (lens.length >= 3) {
    const lo = Math.max(0, Math.floor(quantile(lens, 0.1) * 0.8)); const hi = Math.ceil(quantile(lens, 0.9) * 1.25);
    propose(`Keep the opening paragraph to my length: ${lo}–${hi} words.`, 'GENERATIVE',
      { observer: 'OPENING', params: { minWords: lo, maxWords: hi } },
      `your openings run ${Math.min(...lens)}–${Math.max(...lens)} words; the model's: ${drafts.map(openLen).join(', ')}`, false, true);
  }

  // Heading case.
  const cases = (texts: readonly string[]): { title: number; sentence: number } => texts.flatMap((t) => headingsOf(t).map((h) => headingCase(h.text)))
    .reduce((c, x) => ({ title: c.title + (x === 'TITLE' ? 1 : 0), sentence: c.sentence + (x === 'SENTENCE' ? 1 : 0) }), { title: 0, sentence: 0 });
  const a = cases(authorTexts); const m = cases(drafts);
  const aN = a.title + a.sentence; const mN = m.title + m.sentence;
  if (aN >= 5 && mN >= 3) {
    const want = a.sentence / aN >= 0.8 ? 'SENTENCE' : a.title / aN >= 0.8 ? 'TITLE' : null;
    const modelOther = want === 'SENTENCE' ? m.title / mN : want === 'TITLE' ? m.sentence / mN : 0;
    if (want && modelOther >= 0.5) {
      propose(`Write headings in ${want === 'SENTENCE' ? 'sentence case' : 'Title Case'}, as I do.`, 'GENERATIVE',
        { observer: 'HEADINGS', params: { case: [want] } },
        `you: ${want === 'SENTENCE' ? a.sentence : a.title} of ${aN} headings; the model: ${want === 'SENTENCE' ? m.sentence : m.title} of ${mN}`, false, true);
    }
  }
}

/**
 * THE VOICE LAYER: what is true of every piece the author writes, whatever the topic, and so easy to
 * miss for a discovery that looks for distinctive moves. In a blind round the skill's output had no
 * first person at all (the author writes about 13 "I"/"my" per 1,000 words) and British spelling
 * throughout (the author's corpus: 93 American spellings to 6 British). Neither was a rule.
 *
 *   point of view   a first-person author gets a band on the first person, and the statement separates
 *                   a VIEW in the first person ("I think", "I'd hold this loosely"), which needs no
 *                   source, from a first-hand STORY or figure, which does; an author who keeps out of
 *                   the text gets a cap where the model does not.
 *   register        a cap on uncontracted forms for an author who contracts (at least 75% of the forms
 *                   that can be), or on contractions for one who does not (at most 25%)
 *   dialect         an author who spells one way (at least ten marked words, the other way at most
 *                   15% of them) gets a cap on the other dialect's spellings.
 */
function proposeVoice(authorTexts: readonly string[], drafts: readonly string[], propose: Propose,
  bandOf: (p: PatternId) => { lo: number; hi: number; a: number }, meanRate: (texts: readonly string[], p: PatternId) => number): void {
  // How much a first-person author says "I" depends on the piece (a workflow diary against an analysis:
  // 0.7 to 36 per 1,000 words in one real corpus), so the floor sits near their lightest pieces. What
  // it must catch is a text with no first person at all, which is what a rules-only skill produced.
  const b0 = bandOf('FIRST_PERSON'); const mfp = meanRate(drafts, 'FIRST_PERSON');
  const fp = { ...b0, lo: r1(Math.max(0.5, perPieceP(authorTexts, (t) => patternRate(t, 'FIRST_PERSON'), 0.1) * 0.4)) };
  if (fp.a >= 4) {
    propose(`Write in the first person, as I do: between ${fp.lo} and ${fp.hi} "I", "my" or "me" per 1,000 words (I use about ${fp.a}). `
      + 'A view or a hedge in the first person ("I think", "I\'d hold this loosely", "I\'m skeptical") needs no source; a first-hand story or figure does.',
    'GENERATIVE', { observer: 'PATTERN_RATE', params: { pattern: ['FIRST_PERSON'], minPer1000: fp.lo, maxPer1000: fp.hi } },
    `you: ${fp.a} per 1,000 words; the model on its own: ${mfp}`, true);
  } else if (fp.a < 1 && mfp >= 3) {
    const cap = r1(Math.max(fp.hi, 0.5));
    propose(`Keep myself out of the text, as I do: at most ${cap} "I", "my" or "me" per 1,000 words.`, 'BOUNDARY',
      { observer: 'PATTERN_RATE', params: { pattern: ['FIRST_PERSON'], maxPer1000: cap } }, `you: ${fp.a} per 1,000 words; the model on its own: ${mfp}`);
  }
  const count = (p: PatternId): number => authorTexts.reduce((n, t) => n + findPattern(t, p).length, 0);
  // REGISTER: a speaker who contracts almost everything gets a cap on the forms left whole, and one who
  // writes formally a cap on contractions. A repair can fix either word by word, so these are boundaries.
  const contracted = count('CONTRACTION'); const whole = count('FULL_FORM');
  const share = contracted + whole >= 20 ? contracted / (contracted + whole) : null;
  if (share !== null && (share >= 0.75 || share <= 0.25)) {
    const other = share >= 0.75 ? 'FULL_FORM' as const : 'CONTRACTION' as const;
    const cap = r1(Math.max(perPieceP(authorTexts, (t) => patternRate(t, other), 0.9) * 1.5, 1));
    const m = meanRate(drafts, other);
    propose(share >= 0.75
      ? `Contract as I do ("don't", "it's", "you're"): at most ${cap} uncontracted forms ("do not", "it is") per 1,000 words.`
      : `Write out what I write out ("do not", "it is"): at most ${cap} contractions per 1,000 words.`, 'BOUNDARY',
    { observer: 'PATTERN_RATE', params: { pattern: [other], maxPer1000: cap } },
    `you contract ${Math.round(share * 100)}% of the forms that can be contracted; the model's plain drafts: ${m} ${other === 'FULL_FORM' ? 'uncontracted forms' : 'contractions'} per 1,000 words`);
  }
  const us = count('AMERICAN_SPELLING'); const uk = count('BRITISH_SPELLING');
  const dialect = us >= 10 && uk <= 0.15 * (us + uk) ? { other: 'BRITISH_SPELLING' as const, mine: 'American', eg: 'behavior, organize, center', not: 'behaviour, organise, centre' }
    : uk >= 10 && us <= 0.15 * (us + uk) ? { other: 'AMERICAN_SPELLING' as const, mine: 'British', eg: 'behaviour, organise, centre', not: 'behavior, organize, center' } : null;
  if (dialect) {
    const cap = r1(Math.max(perPieceP(authorTexts, (t) => patternRate(t, dialect.other), 0.9) * 1.5, 0.5));
    propose(`Spell the ${dialect.mine} way, as I do (${dialect.eg}), not ${dialect.not}: at most ${cap} other spellings per 1,000 words.`, 'BOUNDARY',
      { observer: 'PATTERN_RATE', params: { pattern: [dialect.other], maxPer1000: cap } },
      `your pieces: ${dialect.mine === 'American' ? us : uk} ${dialect.mine} spellings to ${dialect.mine === 'American' ? uk : us} of the other`);
  }
}

/**
 * PACE: how much sentence, paragraph and section lengths vary (./balance.ts RHYTHM). Where the author
 * varies more than the model on average (by 0.1 or more), a floor just under the author's 10th-percentile
 * piece (×0.95), proposed only if the model's mean falls below it; in the rarer opposite case, a cap just
 * over the author's 90th-percentile piece. Every proposal then passes the contrast pass's separation guard.
 */
function proposePace(authorTexts: readonly string[], drafts: readonly string[], propose: Propose): void {
  const label: Readonly<Record<RhythmUnit, string>> = { SENTENCE: 'sentence', PARAGRAPH: 'paragraph', SECTION: 'section' };
  for (const unit of ['SENTENCE', 'PARAGRAPH', 'SECTION'] as const) {
    const cvs = (texts: readonly string[]): number[] => texts.map((t) => unitLengths(t, unit)).filter((xs) => xs.length >= RHYTHM_MIN_UNITS[unit]).map(coefficientOfVariation);
    const a = cvs(authorTexts); const m = cvs(drafts);
    if (a.length < 3 || m.length < 2) continue;
    const am = r2(mean(a)); const mm = r2(mean(m));
    const ev = `your ${label[unit]} lengths vary by ${am} on average (standard deviation over mean); the model's plain drafts by ${mm}`;
    if (am >= mm + 0.1) {
      const floor = r2(quantile(a, 0.1) * 0.95);
      if (floor > mm) propose(`Vary ${label[unit]} length as I do: at least ${floor} variation, not one even length after another.`, 'GENERATIVE',
        { observer: 'RHYTHM', params: { unit: [unit], minCv: floor } }, ev, false, true);
    } else if (mm >= am + 0.1) {
      const cap = r2(quantile(a, 0.9) * 1.05);
      if (cap < mm) propose(`Keep ${label[unit]} lengths as even as mine: at most ${cap} variation.`, 'GENERATIVE',
        { observer: 'RHYTHM', params: { unit: [unit], maxCv: cap } }, ev, false, true);
    }
  }
}

// NO POSITIVE VOCABULARY FLOOR BEYOND CONNECTIVES. Keyness against the model's drafts was tried on a
// real 20-post corpus: the words it found ("verification", "loops", "quality") were the author's TOPIC,
// not their voice, and a floor over them would push AI-engineering vocabulary into an article about
// space. On a single-domain corpus positive vocabulary is confounded with topic; the connectives floor
// above is the part of it that is topic-free. The rest belongs to the reading-based rules (a coined
// label, a favoured verb), which a reader checks in context.

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
/** Two decimals: a coefficient of variation needs them, where a rate per 1,000 words (`r1`) does not. */
const r2 = (x: number): number => Math.round(x * 100) / 100;

/** Shares rounded to hundredths that still sum to exactly 1 (largest remainder), never negative. */
export function toHundredths(xs: readonly number[]): number[] {
  const scaled = xs.map((x) => Math.max(0, x) * 100);
  const floors = scaled.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = scaled.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r);
  for (const { i } of order) { if (left <= 0) break; floors[i] += 1; left -= 1; }
  return floors.map((x) => x / 100);
}

/** Topics for the model's plain drafts: the author's own titles, so the comparison is like for like. */
export const contrastTopics = (read: readonly Piece[], k = 3): string[] =>
  read.slice(0, k).map((p) => /^#\s+(.+)$/m.exec(p.text)?.[1]?.trim() ?? p.id.replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' '));
