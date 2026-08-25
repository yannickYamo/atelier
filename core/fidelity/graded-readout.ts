// core/fidelity/graded-readout.ts — READ THE DISTRIBUTION, DO NOT ASK FOR THE SCORE.
//
// THE DEAD END THIS ADDRESSES. Every model-based instrument this programme has built asks for a
// verdict and reads ONE TOKEN. Three of them produced ZERO abstentions across 150 observations, on
// two different question formulations, with the abstention option present in the schema and the
// parser defaulting toward it. The recorded conclusion was that abstention had been ELICITED —
// offered as a refusal to answer rather than produced as an answer — and that a fourth prompt would
// not fix it. That conclusion stands. This is not a fourth prompt.
//
// It is a different READOUT. Asked to place a candidate on a graded scale, a model that genuinely
// cannot separate two outputs puts its mass across neighbouring scores. The spread is COMPUTED, not
// requested, which is the property the deterministic floor has and the model-based instruments did
// not. An enum with four members cannot express spread at all; twenty graded tokens with their
// probabilities can.
//
// WHERE THE IDEA CAME FROM, AND WHAT WAS LEFT BEHIND. Read from a contemporary system that ranks
// sampled agent trajectories pairwise and reads logprobs over a 1-20 scale. Its selection gains are
// real and it reports no calibration, no abstention threshold and no false-positive rate — so what
// is taken here is the readout and not the claim. Its tournament is a cost optimisation for
// best-of-N selection and has no use here. Its positional-bias averaging is weaker than what this
// codebase already does: `run-observer` runs both orientations and reports whether the verdict
// survived the swap, which DETECTS order dependence instead of averaging it away.
//
// AVAILABLE ON SOME PROTOCOLS AND NOT OTHERS. Whether a backend returns per-token probabilities is a
// property of the wire protocol it speaks. This module never names one; `providers/` is where a
// vendor may be named, and the boundary test enforces that.
//
// ─── THIS INSTRUMENT IS UNQUALIFIED AND MUST NOT GATE ──────────────────────────────────────────
//
// Nothing here has been measured against expert labels. A spread that looks like uncertainty may be
// tracking sentence length. The programme's own counter-example is a semantic validator with 100%
// sensitivity and 7% specificity that fired on 28 of 30 expert-perfect cells and improved a metric
// while measuring numeric density. So this REPORTS and never decides, and the report says so.

import type { TokenLogprobs } from '../inference/client.js';

/**
 * ONE TOKEN WIDE, ON PURPOSE.
 *
 * A 1-20 scale reads well to a person and tokenizes as two tokens above nine, and a score split
 * across two tokens has no single distribution over it. Nine points is coarser and it is the widest
 * scale whose every value is one token, which is what makes the reading mean anything at all.
 */
export const SCALE_MIN = 1;
export const SCALE_MAX = 9;

export type GradedReading =
  /** the provider exposed no distribution. Not a weak reading; no reading at all. */
  | { readonly kind: 'UNAVAILABLE'; readonly why: string }
  /** a distribution was read, and here is what it says about its own confidence */
  | {
    readonly kind: 'READ';
    /** probability-weighted score over the scale */
    readonly expected: number;
    /** the score the model actually emitted */
    readonly emitted: number;
    /** normalised entropy of the distribution over scale tokens, 0 (certain) to 1 (uniform) */
    readonly spread: number;
    /** mass on the single most likely score */
    readonly peak: number;
    readonly considered: readonly { readonly score: number; readonly p: number }[];
  };

const digits = (t: string): boolean => /^\d+$/.test(t.trim());

/**
 * FIND THE FIELD, DO NOT GUESS THE TOKEN.
 *
 * A first attempt took the first token that parsed as a number in range. That is wrong, and it was
 * wrong in the way that matters: a JSON payload contains other integers, and a two-digit score is
 * split across two tokens, so the "distribution" it read was the alternatives for a SECOND DIGIT.
 * The number looked exactly like a confidence reading and meant nothing.
 *
 * So the position is located structurally. Walk the emitted tokens accumulating text, find where the
 * accumulation ends at the named field's colon, and read the token that follows. If the field is not
 * found, there is no reading — never a fallback to whatever number appeared first.
 */
const positionOfField = (logprobs: readonly TokenLogprobs[], field: string): number | null => {
  let acc = '';
  for (let i = 0; i < logprobs.length; i++) {
    acc += logprobs[i].token;
    // tolerate whitespace the tokenizer may or may not attach to the colon
    if (/"\s*:\s*$/.test(acc) && acc.replace(/\s+/g, '').endsWith(`"${field}":`)) {
      for (let k = i + 1; k < logprobs.length; k++) {
        const t = logprobs[k].token.trim();
        if (t === '') continue;
        return digits(t) ? k : null;
      }
      return null;
    }
  }
  return null;
};

export function readGraded(
  logprobs: readonly TokenLogprobs[] | null | undefined, field = 'confidence',
): GradedReading {
  if (!logprobs?.length) {
    return { kind: 'UNAVAILABLE',
      why: 'this backend returned no token distribution. Some inference protocols expose per-token '
        + 'probabilities and some do not, and a forced function call carries none on any of them — the '
        + 'distribution belongs to emitted content. This reading is therefore available on certain '
        + 'runtimes and modes and absent on others, which is a property of the protocol rather than a '
        + 'failure of the run.\n'
        + '    To get it: a backend that returns token probabilities, asked in schema mode rather than '
        + 'through a forced function call (--structured-output json-schema).' };
  }
  const at = positionOfField(logprobs, field);
  if (at === null) {
    return { kind: 'UNAVAILABLE',
      why: `no single-token "${field}" value was located in the emitted payload. A score split across `
        + 'two tokens has no single distribution to read, and reading one anyway would report the '
        + 'alternatives for a digit as if they were alternatives for a judgement.' };
  }

  const tok = logprobs[at];
  const alts = new Map<number, number>();
  for (const a of [{ token: tok.token, logprob: tok.logprob }, ...tok.top]) {
    if (!digits(a.token)) continue;
    const v = Number(a.token.trim());
    if (v < SCALE_MIN || v > SCALE_MAX) continue;
    alts.set(v, Math.max(alts.get(v) ?? -Infinity, a.logprob));
  }
  if (!alts.size) return { kind: 'UNAVAILABLE', why: 'no in-range score alternatives were reported at that position.' };

  const raw = [...alts.entries()].map(([score, lp]) => ({ score, p: Math.exp(lp) }));
  const total = raw.reduce((n, x) => n + x.p, 0);
  if (total <= 0) return { kind: 'UNAVAILABLE', why: 'the reported probabilities summed to zero.' };

  // RENORMALISED over in-range score tokens only. The backend reports whatever was likeliest at that
  // position, which can include punctuation and out-of-range numbers; those say nothing about where
  // on the scale the model sat and would otherwise inflate the apparent spread.
  const considered = raw.map((x) => ({ score: x.score, p: x.p / total })).sort((a, b) => b.p - a.p);
  const expected = considered.reduce((n, x) => n + x.score * x.p, 0);
  const peak = considered[0].p;

  // Normalised Shannon entropy, divided by log(k) so a two-way tie and a nine-way tie both read 1.
  const k = considered.length;
  const h = -considered.reduce((n, x) => n + (x.p > 0 ? x.p * Math.log(x.p) : 0), 0);
  const spread = k > 1 ? h / Math.log(k) : 0;

  return { kind: 'READ', expected, emitted: Number(tok.token.trim()), spread, peak, considered };
}

/**
 * What a person reads. States the reading and states that it decides nothing.
 *
 * DELIBERATELY NO THRESHOLD. Picking a spread above which the instrument "abstains" is the move that
 * would turn an unqualified reading into a gate, and it would be chosen by looking at the data. The
 * number is shown; what it means has to be measured against expert labels first.
 */
export function describeGraded(r: GradedReading): string {
  if (r.kind === 'UNAVAILABLE') return `  confidence reading: unavailable — ${r.why}`;
  const top = r.considered.slice(0, 4).map((x) => `${x.score}:${(x.p * 100).toFixed(0)}%`).join('  ');
  return `  confidence reading: emitted ${r.emitted}, expected ${r.expected.toFixed(1)} on ${SCALE_MIN}-${SCALE_MAX}\n`
    + `    spread ${r.spread.toFixed(2)} (0 certain, 1 undecided) · peak ${(r.peak * 100).toFixed(0)}% · ${top}\n`
    + '    UNQUALIFIED. This has never been measured against expert labels and decides nothing here.\n'
    + '    A wide spread may mean the model could not separate the two, or may mean something else\n'
    + '    entirely — an earlier instrument in this programme scored 7% specificity while looking\n'
    + '    exactly this confident.';
}
