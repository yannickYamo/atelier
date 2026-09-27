// atelier/core/observers/contrast.ts — RULES FROM THE GAP BETWEEN THE AUTHOR AND THE MODEL'S DEFAULTS.
//
// The model writes a few plain drafts on the kind of topic the author writes about, with no skill.
// Every named pattern in `style.ts` is counted in both. A pattern the model uses far more than the
// author becomes a proposed cap; one the author uses far more than the model becomes a proposed floor;
// the author's function-word profile against the model's becomes a style-distance measure. Each
// proposal carries both numbers, and each is checked on held-out pieces before it is proposed at all:
// a "rule" the author's own unseen work breaks is a rule against the author, and is dropped.
//
// Like every discovered rule, these are proposals. The person rules on them on the same screen.

import type { Measurement, Requirement } from '../state/canonical-state.js';
import { measure } from './registry.js';
import { PATTERN_IDS, PATTERN_LABEL, patternRate, fragmentShare, deltaReference, styleDistanceDocs, proseWords, perPieceP, type PatternId } from './style.js';
import type { MeasuredProposal } from './derive.js';

interface Piece { readonly id: string; readonly text: string }

/** A gap wide enough to be a fingerprint rather than noise. */
const overUsed = (author: number, model: number): boolean => model >= 1 && model >= Math.max(3 * author, author + 1.5);
const underUsed = (author: number, model: number): boolean => author >= 1 && author >= Math.max(3 * model, model + 1.5);
const r1 = (x: number): number => Math.round(x * 10) / 10;

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
  const propose = (statement: string, kind: Requirement['kind'], measurement: Measurement, evidence: string, weak = false): void => {
    const rs = checkOn.map((t) => measure(t, measurement));
    const applicable = rs.filter((x) => x.verdict !== 'NOT_APPLICABLE').length;
    const present = rs.filter((x) => x.verdict === 'MET').length;
    // THE FALSE-POSITIVE GUARD. A cap the author's own held-out writing breaks is a rule against them.
    if (applicable && present / applicable < 0.8) return;
    n += 1;
    out.push({
      requirement: { requirementId: `c${n}`, statement, appliesWhen: 'GENERAL', kind, authority: 'DERIVED_UNRATIFIED', provenance,
        evidence, evidenceItemId: null, wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null, measurement },
      conformance: { applicable, present, independent: held.length > 0, ...(weak ? { weak: true } : {}) },
    });
  };

  // Mean of per-piece rates, not the rate of everything joined: a pattern that counts repeats (the same
  // opening three times) grows with length, and a corpus joined into one text inflated it eightfold.
  const meanRate = (texts: readonly string[], p: PatternId): number => r1(texts.reduce((s0, t) => s0 + patternRate(t, p), 0) / Math.max(1, texts.length));
  const authorRate = (p: PatternId): number => meanRate(authorTexts, p);
  const spacedHyphen = authorRate('SPACED_HYPHEN');
  for (const p of PATTERN_IDS) {
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
    } else if (underUsed(a, m)) {
      const floor = r1(perPiece(0.1) * 0.8);
      if (floor > 0) {
        propose(`Use ${PATTERN_LABEL[p]}: at least ${floor} per 1,000 words (I use about ${a}).`, 'GENERATIVE',
          { observer: 'PATTERN_RATE', params: { pattern: [p], minPer1000: floor } }, ev);
      }
    }
  }

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
    const loo = recognised / drafts.length >= 0.8;
    const heldOk = (held.length ? held.map((p) => p.text) : []).every((t) => { const x = styleDistanceDocs(t, ref); return x.author < x.model; });
    if (loo && heldOk) {
      propose('Stay closer to my word habits than to your defaults (the function words I use, and how often).', 'GENERATIVE',
        { observer: 'STYLE_DISTANCE', params: { words: [...ref.words], mean: [...ref.mean], sd: [...ref.sd],
          authorDocs: ref.authorDocs.flat(), modelDocs: ref.modelDocs.flat() } },
        `Burrows' Delta over ${ref.words.length} function words, from ${read.length} of your pieces and ${drafts.length} plain drafts by the model; ${recognised} of ${drafts.length} drafts, each left out in turn, were recognised as the model's`);
    }
  }
  return out;
}

/** Topics for the model's plain drafts: the author's own titles, so the comparison is like for like. */
export const contrastTopics = (read: readonly Piece[], k = 3): string[] =>
  read.slice(0, k).map((p) => /^#\s+(.+)$/m.exec(p.text)?.[1]?.trim() ?? p.id.replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' '));
