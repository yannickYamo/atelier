// atelier/core/method/draft-examples.ts — TEN ANSWERS DRAFTED FOR THE OWNER TO KEEP OR REJECT.
//
// A skill built from rules alone (`atelier skill "<rules>"`) has no finished example: a check a model writes for a rule
// can be read but never qualified, so it reports and blocks nothing. The owner may not have ten finished pieces to give,
// and they can always say yes or no to one. So `--draft-examples` has the writer draft ten answers to requests the skill
// would get, following the rules; each is kept for the owner to rate (`atelier rate d3 yes|no`). What they keep is the
// skill's finished work to qualify its checks on at the next build; what they reject, naming the rule it breaks
// (`--rule`), is an edit that breaks that rule, beside the mutants. Nothing drafted is a rule, and nothing is kept
// until the owner says so.

import type { Reading } from '../inference/reading.js';

export interface DraftInput { readonly purpose: string; readonly rules: readonly string[]; readonly n: number }
export interface DraftedPair { readonly request: string; readonly answer: string }

export const DRAFT_EXAMPLES: Reading<DraftInput, DraftedPair[]> = {
  id: 'draft-examples', version: '1',
  system: 'You write example work for a person who stated how it must be done, so they can say which examples are right. For each example, write a realistic request the work would answer and the whole answer, following every rule. Vary the requests: easy and hard, short and long, the common case and the edge case. Write the answers as finished work, never as notes about it.',
  schema: { type: 'object', properties: { examples: { type: 'array', items: { type: 'object', properties: { request: { type: 'string' }, answer: { type: 'string' } }, required: ['request', 'answer'], additionalProperties: false } } }, required: ['examples'], additionalProperties: false },
  toolName: 'emit_draft_examples', toolDescription: 'Example requests and the whole answer to each, following the rules.',
  maxTokens: 12000, estimateUsd: 0.15,
  prompt(i) { return `What the work is: ${i.purpose}\n\nThe rules:\n${i.rules.map((r, n) => `${n + 1}. ${r}`).join('\n')}\n\nWrite ${i.n} examples.`; },
  decide(i) { return i.rules.length && i.n > 0 ? null : []; },
  ground(raw, i) {
    const r = raw as { examples?: unknown } | null;
    const ok = (Array.isArray(r?.examples) ? r.examples as { request?: unknown; answer?: unknown }[] : [])
      .filter((x) => typeof x.request === 'string' && x.request.trim() && typeof x.answer === 'string' && x.answer.trim())
      .map((x) => ({ request: (x.request as string).trim(), answer: (x.answer as string).trim() })).slice(0, i.n);
    return ok.length ? ok : null;
  },
  floor() { return []; },
};
