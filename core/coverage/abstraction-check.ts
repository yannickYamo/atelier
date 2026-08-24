// atelier/core/coverage/abstraction-check.ts — DID THE ABSTRACTION ACTUALLY ABSTRACT?
//
// A candidate's `invariant` is supposed to state the decision so a DIFFERENT surface could satisfy
// it. Sometimes it does not: "three parallel constructions" and "colon-delimited lists" are
// realizations sitting in the invariant's slot, and the failure is invisible — both read exactly
// like rules.
//
// ─── WHY THIS IS A MODEL CALL AND NOT A PATTERN ────────────────────────────────────────────────
//
// The first version matched a regex for counts, punctuation words and syntax terms. It worked on the
// cases it was written against, which is the whole problem: it was written AFTER seeing which
// abstractions failed on one corpus, so it encodes that corpus's failure modes rather than the
// property. "Two parallel constructions" is caught; "a pair of parallel constructions" is not.
//
// The property — is this stated at the level of the decision or of its surface? — is a semantic
// judgment, and a semantic judgment gets a semantic instrument. A pattern is only the better choice
// where the property is genuinely lexical and the answer must be exact; this is neither.
//
// The verdict is ADVISORY. It flags wording for the author to restate; it never rejects a candidate
// and never changes a materiality. An unqualified instrument is fine for that and would not be fine
// for anything that decided something.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import { asText } from '../discovery/text.js';

export interface AbstractionVerdict {
  readonly abstracted: boolean;
  /** what is still surface-level, in terms the author can act on. Empty when abstracted. */
  readonly stillSurface: string;
}

const SYSTEM = `A statement of a decision an author makes when writing.

Is it stated at the level of the DECISION, or of one SURFACE FORM the decision happened to take?

THE TEST: if the author made the same decision tomorrow and expressed it completely differently,
would this statement still describe what they did?

  abstracted   yes — it names what is being achieved, and other forms could achieve it
  surface      no — it names a count, a mark of punctuation, a syntax, or one specific wording,
               so a different expression of the same decision would fall outside it

Be strict about the test and lenient about phrasing. A statement may mention a form as an example and
still be abstracted; it is surface-level only when the form is doing the defining.`;

const SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    abstracted: { type: 'boolean' },
    stillSurface: { type: 'string' },
  }, required: ['abstracted', 'stillSurface'], additionalProperties: false,
};

export async function checkAbstraction(
  client: InferenceClient, budget: Budget, invariant: string,
): Promise<AbstractionVerdict> {
  const r = await spend(budget, 0.01, async () => {
    const x = await client.complete({
      stableBlock: SYSTEM, variableBlock: invariant,
      userMessage: 'Answer now. If surface-level, say in one phrase what is doing the defining.',
      toolName: 'emit_verdict', toolDescription: 'Is this the decision or one of its forms?',
      schema: SCHEMA, maxTokens: 300,
    });
    return { value: x, cost: x.cost };
  });
  const j = r.json as { abstracted?: boolean; stillSurface?: string } | null;
  const abstracted = j?.abstracted !== false;
  return { abstracted, stillSurface: abstracted ? '' : (asText(j?.stillSurface) || 'a surface form is doing the defining') };
}

/** What this verdict may do, kept explicit because an advisory flag is easy to promote by accident. */
export const ABSTRACTION_CHECK_AUTHORITY = {
  maySupport: ['flagging wording for the author to restate'],
  mayNeverSupport: ['rejecting a candidate', 'changing a materiality', 'blocking ratification'],
  why: 'the instrument is unqualified. It can usefully point at a sentence; it cannot decide anything '
    + 'about the behaviour the sentence is trying to describe.',
} as const;
