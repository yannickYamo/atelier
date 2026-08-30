// atelier/core/ratification/grounding.ts — IS THIS RULE IN THE PERSON'S OWN WORDS? DECIDED HERE,
// DETERMINISTICALLY, NEVER BY THE MODEL THAT PROPOSED IT.
//
// The front door splits a sentence into rules with one model call, and the model reports per rule
// whether the person "actually said this" (`faithful`). That flag routed authority: faithful became
// EXPERT_AUTHORED, and EXPERT_AUTHORED instructs. So the system that proposed the rule also graded
// its own transcription — the exact laundering path Atelier exists to close, one call from the
// front door.
//
// Say the person writes "keep answers concise" and the splitter returns "never use more than three
// bullets" with faithful: true. Nothing in the person's text says bullets, or three. If that flag
// were authority, an invented numeric constraint would bind as the person's own words.
//
// So the flag is evidence for display, and THIS check is the authority rule: a rule is grounded
// when its normative content can be found in the text the person supplied, mechanically. The model
// must also point at the span it transcribed, and the span must actually be there. Anything that
// fails is still proposed — it is simply the machine's reading, and it takes the person's explicit
// approval (and their declared materiality) to bind.
//
// The check is deliberately dumb. Light suffix folding, a glue-word list, verbatim numbers. A
// paraphrase a human would accept can fail it; that costs one approval click, while the opposite
// error costs an invented rule wearing the person's name. Failing safe is the design.

/** Words that carry no normative content on their own; free to appear or vanish in a restatement. */
const GLUE = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'so', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with',
  'is', 'are', 'be', 'being', 'been', 'do', 'does', 'did', 'it', 'its', 'this', 'that', 'these',
  'those', 'i', 'you', 'your', 'my', 'me', 'we', 'our', 'they', 'their', 'there', 'when', 'if',
  'then', 'than', 'as', 'not', 'no', 'never', 'always', 'should', 'must', 'will', 'would', 'can',
  'could', 'may', 'might', 'have', 'has', 'had', 'any', 'all', 'each', 'every', 'one', 'ones',
  'thing', 'things', 'work', 'make', 'use', 'get', 'keep', 'more', 'most', 'less', 'least', 'very',
  'up', 'out', 'into', 'over', 'about', 'general',
]);

/** Lowercase, strip punctuation, fold the commonest English suffixes so "steps" grounds "step". */
const norm = (w: string): string => {
  let x = w.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const suf of ['ing', 'edly', 'ed', 'es', 's', 'ly']) {
    if (x.length > 3 + suf.length && x.endsWith(suf)) { x = x.slice(0, -suf.length); break; }
  }
  return x;
};

const contentWords = (text: string): string[] =>
  text.split(/\s+/).map(norm).filter((w) => w.length > 1 && !GLUE.has(w));

const numbers = (text: string): string[] => text.match(/\d+(?:\.\d+)?/g) ?? [];

const squash = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim();

export interface GroundingVerdict {
  readonly grounded: boolean;
  /** which part of the check failed, for the preview's "MY READING" label — never for authority */
  readonly why: 'GROUNDED' | 'SPAN_NOT_IN_TEXT' | 'WORDS_NOT_IN_SPAN' | 'NUMBER_NOT_IN_SPAN';
}

/**
 * A rule is grounded in the user's text iff:
 *   (a) the span the model claims to have transcribed is verbatim in that text (whitespace aside);
 *   (b) every content word of the statement — and of a non-GENERAL condition — appears in the span;
 *   (c) every number in the statement appears verbatim in the span.
 */
export function groundedInUserText(
  rule: { statement: string; appliesWhen: string; sourceSpan: string }, userText: string,
): GroundingVerdict {
  const span = squash(rule.sourceSpan);
  if (!span || !squash(userText).includes(span)) return { grounded: false, why: 'SPAN_NOT_IN_TEXT' };

  const spanWords = new Set(contentWords(span));
  const claimed = [
    ...contentWords(rule.statement),
    ...(rule.appliesWhen.trim().toUpperCase() === 'GENERAL' ? [] : contentWords(rule.appliesWhen)),
  ];
  if (claimed.some((w) => !spanWords.has(w))) return { grounded: false, why: 'WORDS_NOT_IN_SPAN' };

  const spanNumbers = new Set(numbers(span));
  if (numbers(rule.statement).some((n) => !spanNumbers.has(n))) return { grounded: false, why: 'NUMBER_NOT_IN_SPAN' };

  return { grounded: true, why: 'GROUNDED' };
}
