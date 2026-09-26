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
  'delve', 'delves', 'delving', 'tapestry', 'testament to', 'in today\'s fast-paced', 'ever-evolving',
  'game-changer', 'game changer', 'unlock the power', 'unleash', 'navigate the complexities',
  'it\'s important to note', 'it is important to note', 'it\'s worth noting', 'in conclusion',
  'moreover', 'furthermore', 'additionally', 'seamless', 'seamlessly', 'cutting-edge', 'embark',
  'realm', 'paradigm shift', 'synergy', 'holistic', 'elevate your', 'myriad', 'plethora',
  'at the end of the day', 'deep dive', 'dive into', 'in the world of', 'when it comes to',
];

export interface MeasuredProposal {
  readonly requirement: Requirement;
  /** how many of the pieces it was measured on could be measured, and how many meet the target */
  readonly inSample: { readonly applicable: number; readonly present: number };
}

export const MIN_WORDS = 1000;
export const MIN_SENTENCES = 30;
export const MIN_PARAGRAPHS = 10;

const conformance = (pieces: readonly string[], m: Measurement): MeasuredProposal['inSample'] => {
  const rs = pieces.map((t) => measure(t, m));
  return { applicable: rs.filter((r) => r.verdict !== 'NOT_APPLICABLE').length, present: rs.filter((r) => r.verdict === 'MET').length };
};

export function deriveMeasuredRules(pieces: readonly { readonly id: string; readonly text: string }[], provenance: Requirement['provenance']): MeasuredProposal[] {
  const texts = pieces.map((p) => p.text);
  const all = texts.join('\n\n');
  const sentences = texts.flatMap(sentencesOf);
  const paragraphs = texts.flatMap(paragraphsOf);
  const words = texts.reduce((n, t) => n + proseRegions(t).reduce((k, r) => k + wordsOf(r.text).length, 0), 0);
  const base = (id: string, statement: string, kind: Requirement['kind'], measurement: Measurement, evidence: string): Requirement => ({
    requirementId: id, statement, appliesWhen: 'GENERAL', kind, authority: 'DERIVED_UNRATIFIED', provenance,
    evidence, evidenceItemId: null,
    wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null, measurement,
  });
  const out: MeasuredProposal[] = [];
  let n = 0;
  const push = (statement: string, kind: Requirement['kind'], m: Measurement, evidence: string): void => {
    n += 1;
    out.push({ requirement: base(`m${n}`, statement, kind, m, evidence), inSample: conformance(texts, m) });
  };

  if (sentences.length >= MIN_SENTENCES) {
    const lens = sentences.map((s) => s.words);
    const med = quantile(lens, 0.5); const p90 = quantile(lens, 0.9);
    push(`I keep sentences short: a median of about ${med} words, and nine in ten under ${p90 + 1}.`, 'GENERATIVE',
      { observer: 'SENTENCE_LENGTH', params: { medianMax: Math.ceil(med * 1.2 + 1), p90Max: Math.ceil(p90 * 1.15 + 1) } },
      `measured over ${sentences.length} sentences in ${pieces.length} pieces`);
  }
  if (paragraphs.length >= MIN_PARAGRAPHS) {
    const cap = Math.max(2, quantile(paragraphs.map((p) => p.sentences), 0.95));
    push(`I keep paragraphs to ${cap} sentences at most.`, 'GENERATIVE',
      { observer: 'PARAGRAPH_LENGTH', params: { maxSentences: cap } },
      `measured over ${paragraphs.length} paragraphs in ${pieces.length} pieces`);
  }
  if (words >= MIN_WORDS) {
    const rate = Math.round((findTerms(all, DEFAULT_HEDGES).length / words) * 10000) / 10;
    push(`I hedge rarely: about ${rate} hedging words per thousand.`, 'GENERATIVE',
      { observer: 'HEDGE_RATE', params: { maxPer1000: Math.max(2, Math.round(rate * 1.5 + 1)) } },
      `measured over ${words} words in ${pieces.length} pieces`);
    const unused = GENERIC_PHRASES.filter((t) => findTerms(all, [t]).length === 0);
    if (unused.length >= 5) {
      push(`I never use stock phrases like: ${unused.slice(0, 8).join(', ')}${unused.length > 8 ? ', …' : ''}.`, 'BOUNDARY',
        { observer: 'LEXICON', params: { terms: unused } },
        `none of these ${unused.length} appears in ${words} words of your work`);
    }
  }
  return out;
}
