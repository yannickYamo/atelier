// atelier/core/contract/observers/aphorism.ts — CAN ANYTHING TELL WHEN THIS RULE FIRED?
//
// ─── FROZEN BEFORE THE KEY EXISTS, AND THAT IS THE POINT ───────────────────────────────────────
//
// Written and committed BEFORE the expert's labels were collected. An observer tuned after seeing
// the answers reports how well it was tuned, not how well it observes, and there is no way to tell
// the two apart afterwards. The hash below is what a later report cites.
//
// ─── WHAT IS BEING DETECTED, AND WHY IT IS HARD ────────────────────────────────────────────────
//
// The requirement is p6, ratified PREFERRED: "I restate the thesis as a compressed aphorism at
// section boundaries, even after the point has already been argued in full." The previous study's
// endpoint was "does the output carry a numbered list of two or more items" — a property of the
// TEXT, decidable by anyone. This one is a property of the RELATIONSHIP between a sentence and the
// argument around it, and no regex has access to that.
//
// So these are candidates, and the probe exists to find out whether ANY of them is good enough. A
// null result here is a real finding: it would say the p6 endpoint is not observable without a
// human, which blocks the carrier study on instrument design rather than on budget.
//
// ─── THE FAILURE MODE THIS PROGRAMME HAS ALREADY PAID FOR ──────────────────────────────────────
//
// A word list is a proxy for a grammatical pattern and is always one phrasing behind. `contrastive`
// below is exactly that, and it is included BECAUSE it is the obvious thing to reach for — if it
// scores well it is a finding, and if it scores badly that is the finding, but either way it is
// measured rather than assumed.

/** One candidate detector. Named so a report can say WHICH thing was measured. */
export type AphorismDetectorId =
  /** short + ends the passage. Keys on compression alone. */
  | 'BREVITY'
  /** a "not X, but Y" / "X is not Y, it is Z" reversal. The word-list proxy, included to be tested. */
  | 'CONTRASTIVE'
  /** a copular assertion that redefines a term: "pricing IS an operating system" */
  | 'REDEFINITION'
  /** brevity AND (contrastive OR redefinition) */
  | 'COMBINED';

export const APHORISM_DETECTORS: readonly AphorismDetectorId[] = [
  'BREVITY', 'CONTRASTIVE', 'REDEFINITION', 'COMBINED',
];

/** Words, not characters: a long sentence of short words is not compressed. */
const wordCount = (s: string): number => (s.trim().match(/\S+/g) ?? []).length;

/** Compression threshold. From the author's own examples, which run 6-12 words. */
export const BREVITY_MAX_WORDS = 16;

const brevity = (s: string): boolean => {
  const n = wordCount(s);
  return n > 0 && n <= BREVITY_MAX_WORDS;
};

/**
 * "not X, but Y" and its relatives.
 *
 * THE PROXY. It keys on a small set of connectives, so it goes stale the first time the same move is
 * made with different words — which is the documented way this class of detector dies.
 */
const contrastive = (s: string): boolean =>
  // `it` bare as well as `it's`: "this is not a tooling problem, it is a decision problem" is the
  // same move and the first draft missed it. Corrected BEFORE any label existed — the freeze is
  // against the expert's answers, not against fixing an obvious hole in the pattern.
  /\bnot\b[^.!?]*\b(but|they|it'?s?|its)\b/i.test(s)
  || /\brather than\b/i.test(s)
  || /\binstead of\b/i.test(s)
  || /\bisn'?t\b[^.!?]*\b(it|they)\b/i.test(s);

/**
 * A copular redefinition: "pricing is an operating system, not a price tag".
 *
 * Distinct from CONTRASTIVE because the move can be made without any negation at all — "trust is a
 * latency problem" — and a detector that required negation would miss exactly those.
 */
const redefinition = (s: string): boolean =>
  /\b\w+\s+(is|are|was|were)\s+(a|an|the|not)\b/i.test(s) && wordCount(s) <= BREVITY_MAX_WORDS + 6;

const RUN: Record<AphorismDetectorId, (s: string) => boolean> = {
  BREVITY: brevity,
  CONTRASTIVE: contrastive,
  REDEFINITION: redefinition,
  COMBINED: (s) => brevity(s) && (contrastive(s) || redefinition(s)),
};

export const detect = (id: AphorismDetectorId, passage: string): boolean => RUN[id](passage);

/** Every detector's verdict on one passage, so a probe scores them all from one pass. */
export const detectAll = (passage: string): Record<AphorismDetectorId, boolean> =>
  Object.fromEntries(APHORISM_DETECTORS.map((d) => [d, detect(d, passage)])) as Record<AphorismDetectorId, boolean>;

// ─── SCORING AGAINST A HUMAN KEY ──────────────────────────────────────────────────────────────

export type HumanLabel = 'YES' | 'NO' | 'UNSURE';

export interface DetectorProfile {
  readonly detector: AphorismDetectorId;
  /** labelled YES or NO. UNSURE is excluded from accuracy and reported separately. */
  readonly decided: number;
  readonly agree: number;
  /** said fired where the expert said no. The permissive direction. */
  readonly falsePass: number;
  /** said not fired where the expert said yes. The conservative direction. */
  readonly falseFail: number;
  readonly agreement: number;
  /** of the passages the expert called YES, how many did it catch */
  readonly recall: number;
  /** of the passages it called fired, how many the expert agreed with */
  readonly precision: number;
}

/**
 * UNSURE IS EXCLUDED, NOT COUNTED AS NO.
 *
 * Folding abstention into the negative class silently converts "the expert could not tell" into
 * "the expert said it did not happen", which is the same false-negative manufacture that turned a
 * truncated observation into evidence against a rule. It is reported as its own number instead.
 */
export function profileDetector(
  id: AphorismDetectorId, cases: readonly { readonly passage: string; readonly label: HumanLabel }[],
): DetectorProfile {
  const decided = cases.filter((c) => c.label !== 'UNSURE');
  let agree = 0; let fp = 0; let ff = 0; let truePos = 0; let said = 0; let actualYes = 0;
  for (const c of decided) {
    const fired = detect(id, c.passage);
    const yes = c.label === 'YES';
    if (yes) actualYes += 1;
    if (fired) said += 1;
    if (fired === yes) { agree += 1; if (yes) truePos += 1; }
    else if (fired && !yes) fp += 1;
    else ff += 1;
  }
  return {
    detector: id, decided: decided.length, agree, falsePass: fp, falseFail: ff,
    agreement: decided.length ? agree / decided.length : 0,
    recall: actualYes ? truePos / actualYes : 0,
    precision: said ? truePos / said : 0,
  };
}

export const profileAll = (
  cases: readonly { readonly passage: string; readonly label: HumanLabel }[],
): DetectorProfile[] => APHORISM_DETECTORS.map((d) => profileDetector(d, cases));

// ─── THE MODEL JUDGE ───────────────────────────────────────────────────────────────────────────
//
// Written and frozen AFTER the structural detectors were scored and BEFORE this one was, because
// the structural result is what motivates it: on a balanced human key of 20 decided passages, every
// pattern detector scored below the majority-class baseline and two caught none of the twelve
// positives. Compression alone does not identify the move — p6 is a claim about a sentence's
// RELATIONSHIP to the argument before it, and no regex has access to that.
//
// So the question goes to something that can read both. The risk is documented and specific: the
// last model-based reader in this programme abstained 29% of the time and produced SEVENTEEN false
// passes against ZERO false fails. It under-reports exactly the failures a study exists to find. If
// this one repeats that profile, the carrier study inherits a permissive instrument and any null it
// produces is uninterpretable.
//
// Three things are done differently because of that result:
//   - the judge is shown the PRECEDING TEXT, because the question is unanswerable without it and the
//     old reader was asked to rule on an output in isolation;
//   - abstention is an ANSWER rather than an escape hatch, offered on equal footing;
//   - it is asked what the sentence DOES, never whether it is good — the earlier instruments that
//     produced zero abstentions were all asked for a quality verdict.

export const APHORISM_JUDGE_SYSTEM = `You are shown a passage from an essay: some sentences of argument, then ONE sentence that follows them.

Answer one question about the final sentence, and nothing else.

DOES THE FINAL SENTENCE COMPRESS THE ARGUMENT THAT PRECEDES IT INTO A SHORT, MEMORABLE RESTATEMENT?

The test: could you delete the final sentence and lose nothing except the punch?
  - It re-lands a point already made, in fewer words          -> YES
  - It adds information, evidence, or moves the argument on   -> NO
  - You genuinely cannot tell                                 -> UNSURE

Do NOT judge whether the sentence is good, well written, or characteristic of the author. A sentence
can be excellent, vivid and entirely typical of the writer while doing something other than
compressing — introducing evidence, for instance, or opening a new point. Those are NO.

UNSURE is a real answer and carries no penalty. Use it when the preceding text does not give you
enough to decide, rather than guessing.`;

export const APHORISM_JUDGE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['YES', 'NO', 'UNSURE'] },
    // Bounded, because the only free field is what can push a response past its budget — the defect
    // that made a truncated observation into a silent negative earlier in this programme.
    why: { type: 'string', maxLength: 300 },
  },
  required: ['verdict', 'why'],
  additionalProperties: false,
};

export const judgePrompt = (before: string, target: string): string =>
  `THE ARGUMENT SO FAR:\n${before}\n\nTHE FINAL SENTENCE:\n${target}\n\nAnswer now.`;

/** A judge's reading, kept beside the expert's so the two can be compared case by case. */
export interface JudgedCase {
  readonly id: string;
  readonly expert: HumanLabel;
  readonly judge: HumanLabel;
}

export interface JudgeProfile {
  /** both ruled; abstention on EITHER side is excluded rather than scored as disagreement */
  readonly decidedByBoth: number;
  readonly agree: number;
  readonly agreement: number;
  /** judge said YES where the expert said NO. The permissive direction. */
  readonly falsePass: number;
  /** judge said NO where the expert said YES */
  readonly falseFail: number;
  readonly judgeAbstained: number;
  readonly expertAbstained: number;
}

/**
 * ABSTENTION ON EITHER SIDE LEAVES THE ACCURACY DENOMINATOR.
 *
 * Counting a judge's UNSURE as a disagreement would punish exactly the behaviour that makes an
 * instrument honest, and counting it as agreement would reward saying nothing. It is reported as its
 * own number and excluded from the rest.
 */
export function profileJudge(cases: readonly JudgedCase[]): JudgeProfile {
  const both = cases.filter((c) => c.expert !== 'UNSURE' && c.judge !== 'UNSURE');
  let agree = 0; let fp = 0; let ff = 0;
  for (const c of both) {
    if (c.expert === c.judge) agree += 1;
    else if (c.judge === 'YES') fp += 1;
    else ff += 1;
  }
  return {
    decidedByBoth: both.length, agree,
    agreement: both.length ? agree / both.length : 0,
    falsePass: fp, falseFail: ff,
    judgeAbstained: cases.filter((c) => c.judge === 'UNSURE').length,
    expertAbstained: cases.filter((c) => c.expert === 'UNSURE').length,
  };
}
