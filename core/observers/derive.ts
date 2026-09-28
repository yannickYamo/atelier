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

import type { Measurement, Requirement } from '../state/canonical-state.js';
import { sentencesOf, paragraphsOf, wordsOf, proseRegions, quantile, findTerms, DEFAULT_HEDGES, measure } from './registry.js';

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
    readonly weak?: boolean };
}

export const MIN_WORDS = 1000;
export const MIN_LEXICON_WORDS = 3000;
export const MIN_SENTENCES = 30;
export const MIN_PARAGRAPHS = 10;

const conformanceOn = (pieces: readonly string[], m: Measurement): { applicable: number; present: number } => {
  const rs = pieces.map((t) => measure(t, m));
  return { applicable: rs.filter((r) => r.verdict !== 'NOT_APPLICABLE').length, present: rs.filter((r) => r.verdict === 'MET').length };
};

interface Piece { readonly id: string; readonly text: string }

/**
 * Targets are counted from `read` — the pieces discovery was allowed to read — and checked against
 * `held`, which it never saw. With nothing held out, conformance is reported on `read` and marked as
 * not independent, and the suggestion treats it that way.
 */
export function deriveMeasuredRules(read: readonly Piece[], held: readonly Piece[], provenance: Requirement['provenance']): MeasuredProposal[] {
  const texts = read.map((p) => p.text);
  const checkOn = held.length ? held.map((p) => p.text) : texts;
  const all = texts.join('\n\n');
  const sentences = texts.flatMap(sentencesOf);
  const paragraphs = texts.flatMap(paragraphsOf);
  const words = texts.reduce((n, t) => n + proseRegions(t).reduce((k, r) => k + wordsOf(r.text).length, 0), 0);
  const out: MeasuredProposal[] = [];
  let n = 0;
  const push = (statement: string, kind: Requirement['kind'], measurement: Measurement, evidence: string): void => {
    n += 1;
    out.push({
      requirement: { requirementId: `m${n}`, statement, appliesWhen: 'GENERAL', kind, authority: 'DERIVED_UNRATIFIED', provenance,
        evidence, evidenceItemId: null, wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null, measurement },
      conformance: { ...conformanceOn(checkOn, measurement), independent: held.length > 0 },
    });
  };

  if (sentences.length >= MIN_SENTENCES) {
    const lens = sentences.map((s) => s.words);
    const med = quantile(lens, 0.5); const p90 = quantile(lens, 0.9);
    const medianMax = Math.ceil(med * 1.2 + 1); const p90Max = Math.ceil(p90 * 1.15 + 1);
    // The statement quotes the numbers it is checked against, so the rule and its check cannot disagree.
    push(`I keep sentences short: a median under ${medianMax} words, and nine in ten under ${p90Max}.`, 'GENERATIVE',
      { observer: 'SENTENCE_LENGTH', params: { medianMax, p90Max } },
      `your median is ${med} words and nine in ten are under ${p90 + 1}, over ${sentences.length} sentences in ${read.length} pieces`);
  }
  if (paragraphs.length >= MIN_PARAGRAPHS) {
    const cap = Math.max(2, quantile(paragraphs.map((p) => p.sentences), 0.95));
    push(`I keep paragraphs to ${cap} sentences at most.`, 'GENERATIVE',
      { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: cap } },
      `95% of your ${paragraphs.length} paragraphs have ${cap} sentences or fewer`);
  }
  if (words >= MIN_WORDS) {
    const rate = Math.round((findTerms(all, DEFAULT_HEDGES).length / words) * 10000) / 10;
    const max = Math.max(2, Math.round(rate * 1.5 + 1));
    push(`I hedge rarely: at most ${max} hedging words per thousand.`, 'GENERATIVE',
      { observer: 'HEDGE_RATE', params: { maxPer1000: max } },
      `you use about ${rate} per thousand, over ${words} words`);
  }
  if (words >= MIN_LEXICON_WORDS) {
    const unused = GENERIC_PHRASES.filter((t) => findTerms(all, [t]).length === 0);
    if (unused.length >= 5) {
      push(`Never use stock model phrasing: ${unused.slice(0, 8).join(', ')}${unused.length > 8 ? ', …' : ''}.`, 'BOUNDARY',
        { observer: 'LEXICON', params: { terms: unused } },
        `none of these appears in ${words} words of your work`);
    }
  }
  return out;
}
