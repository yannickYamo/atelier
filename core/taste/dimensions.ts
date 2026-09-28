// atelier/core/taste/dimensions.ts — WHAT A STANDARD COVERS, BY WHAT MAKES WRITING GOOD.
//
// A standard is a list of rules, and a list does not show its holes. This sorts every rule into the
// dimension of writing it is about, so the review screen and `atelier plan` can say "nothing here covers
// your pace" instead of leaving the owner to notice.
//
// The sort is a fixed, published keyword map, not a model's opinion: a measured rule is sorted by what
// its observer counts, and a reading-based rule by the words its statement uses. It can be wrong about
// an unusual rule, and where no keyword matches it says "unsorted" rather than guessing.

import type { PatternId } from '../observers/style.js';
import type { Requirement } from '../state/canonical-state.js';

export type Dimension = 'ARGUMENT' | 'EVIDENCE' | 'VOCABULARY' | 'FIGURE' | 'PACE' | 'STRUCTURE' | 'REGISTER' | 'CADENCE' | 'UNSORTED';

export const DIMENSION_LABEL: Readonly<Record<Dimension, string>> = {
  ARGUMENT: 'argument and stance',
  EVIDENCE: 'evidence and specifics',
  VOCABULARY: 'vocabulary and phrasing',
  FIGURE: 'metaphor and figure',
  PACE: 'pace and rhythm',
  STRUCTURE: 'structure and shape',
  REGISTER: 'register and tone',
  CADENCE: 'openings, closings and emphasis',
  UNSORTED: 'unsorted',
};

/** The dimensions a complete standard would say something about, in the order they are shown. */
export const DIMENSIONS: readonly Exclude<Dimension, 'UNSORTED'>[] = ['ARGUMENT', 'EVIDENCE', 'VOCABULARY', 'FIGURE', 'PACE', 'STRUCTURE', 'REGISTER', 'CADENCE'];

const BY_OBSERVER: Readonly<Record<string, Dimension>> = {
  LEXICON: 'VOCABULARY', TERM_RATE: 'VOCABULARY', RATIO: 'VOCABULARY', HEDGE_RATE: 'REGISTER', STYLE_DISTANCE: 'VOCABULARY',
  SENTENCE_LENGTH: 'PACE', FRAGMENT_SHARE: 'PACE', DISTRIBUTION: 'PACE', RHYTHM: 'PACE', PARAGRAPH_LENGTH: 'STRUCTURE',
  HEADINGS: 'STRUCTURE', OPENING: 'CADENCE', CLOSING: 'CADENCE',
};

/** PATTERN_RATE counts constructions of different kinds; sorted by the pattern. Typed over every pattern, so a new one cannot go unsorted. */
const BY_PATTERN: Readonly<Record<PatternId, Dimension>> = {
  EM_DASH: 'VOCABULARY', SPACED_HYPHEN: 'VOCABULARY', SEMICOLON: 'VOCABULARY', INTENSIFIER: 'VOCABULARY',
  BRITISH_SPELLING: 'VOCABULARY', AMERICAN_SPELLING: 'VOCABULARY',
  NOT_X_ITS_Y: 'CADENCE', SHORT_VERDICT: 'CADENCE', THAT_OPENER: 'CADENCE', HERES_OPENER: 'CADENCE', REPEATED_OPENER: 'CADENCE',
  RATHER_THAN: 'ARGUMENT', REFRAME: 'ARGUMENT', CONTRAST_VERDICT: 'ARGUMENT', ORDINAL_CATALOGUE: 'STRUCTURE',
  SIGNPOST: 'REGISTER', RHETORICAL_QUESTION: 'REGISTER', FIRST_PERSON: 'REGISTER', CONTRACTION: 'REGISTER', FULL_FORM: 'REGISTER',
  MACHINE_TELL: 'REGISTER', DASH_ASIDE: 'PACE', BOLD_SPAN: 'STRUCTURE', ONE_LINE_PARAGRAPH: 'PACE',
};

/** Checked in order; the first match wins, so the more specific kinds come first. */
const BY_WORDS: readonly [Dimension, RegExp][] = [
  ['FIGURE', /\b(metaphor|figure|image|imagery|analog(y|ies)|comparison|picture)\b/i],
  ['EVIDENCE', /\b(evidence|cite|citation|source|study|studies|data|number|figure[sd]?|statistic|sample|incident|example|dateable|concrete|proof|measure)\b/i],
  ['CADENCE', /\b(open(s|ing)?|clos(e|es|ing)|ends?|last line|first line|antithe|punchline|emphasis|bold(ed)?|lead)\b/i],
  ['STRUCTURE', /\b(section|heading|structure|order|list|side by side|tl;?dr|summary|format|layout|paragraphs?)\b/i],
  ['PACE', /\b(pace|rhythm|short sentences?|long sentences?|sentence length|tempo|momentum|brevity)\b/i],
  ['REGISTER', /\b(register|tone|conversational|aside|voice|enthusias|optimis|casual|formal|humou?r|warm|self-correct|admit)\b/i],
  ['VOCABULARY', /\b(word|words|phrase|phrasing|term|label|name[sd]?|vocabulary|jargon|coin|diction)\b/i],
  ['ARGUMENT', /\b(argu|claim|position|stance|concede|counter|disagree|steelman|verdict|answer|advice|case against|trade-?off|split)\b/i],
];

export function dimensionOf(r: Requirement): Dimension {
  if (r.measurement) {
    if (r.measurement.observer === 'PATTERN_RATE') return BY_PATTERN[((r.measurement.params.pattern as readonly string[] | undefined) ?? [])[0] as PatternId] ?? 'VOCABULARY';
    return BY_OBSERVER[r.measurement.observer] ?? 'UNSORTED';
  }
  return BY_WORDS.find(([, re]) => re.test(r.statement))?.[0] ?? 'UNSORTED';
}

export interface Coverage {
  readonly byDimension: Readonly<Record<Dimension, readonly Requirement[]>>;
  /** dimensions no live rule is about */
  readonly gaps: readonly Dimension[];
  /** dimensions covered only by reading-based rules: no count checks them, only the taste reader does */
  readonly unchecked: readonly Dimension[];
}

export function coverageOf(requirements: readonly Requirement[]): Coverage {
  const live = requirements.filter((r) => r.authority !== 'EXPERT_REJECTED' && r.materiality !== 'INCIDENTAL');
  const byDimension = Object.fromEntries([...DIMENSIONS, 'UNSORTED'].map((d) => [d, live.filter((r) => dimensionOf(r) === d)])) as Record<Dimension, Requirement[]>;
  return { byDimension, gaps: DIMENSIONS.filter((d) => !byDimension[d].length),
    unchecked: DIMENSIONS.filter((d) => byDimension[d].length && byDimension[d].every((r) => !r.measurement)) };
}

export function describeCoverage(c: Coverage): string {
  const lines = DIMENSIONS.map((d) => {
    const rs = c.byDimension[d];
    const measured = rs.filter((r) => r.measurement).length;
    return `  ${DIMENSION_LABEL[d].padEnd(34)} ${rs.length ? `${rs.length} rule(s): ${measured} counted, ${rs.length - measured} read` : 'nothing'}`;
  });
  if (c.byDimension.UNSORTED.length) lines.push(`  ${'unsorted'.padEnd(34)} ${c.byDimension.UNSORTED.map((r) => r.requirementId).join(', ')}`);
  return lines.join('\n') + (c.gaps.length ? `\n  Nothing in this standard is about: ${c.gaps.map((d) => DIMENSION_LABEL[d]).join(', ')}.` : '');
}
