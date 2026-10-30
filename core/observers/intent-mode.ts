// atelier/core/observers/intent-mode.ts — WHAT THE PERSON WANTS THE SKILL FOR: TO PRODUCE, TO GUARD, OR TO ANSWER.
//
// The mode moves only the default weight of a rule (core/ratification/suggest.ts): a skill that answers people inside
// a policy keeps every rule as the policy, a gate holds outputs to the standard, and a skill that produces new work
// requires only what the evidence makes strong. It was read off the person's words by four word lists (replying,
// people, checks, produces) and their order: "draft replies to customer emails" was answering, "write a support
// article" was producing. A sentence can say either in words the lists never held. So the mode is a reading
// (core/inference/reading.ts): the reader says which of the three the sentence asks for and quotes the words that say
// it; code keeps the answer only with a quote from the sentence; the word lists are the floor; an empty intent is
// decided by code (producing, as it always was).

import type { Reading } from '../inference/reading.js';
import { modeFromIntent, type SkillMode } from '../ratification/suggest.js';
import { quoteIsReal } from '../taste/reader.js';

export interface IntentInput { readonly intent: string }
export interface IntentMode { readonly mode: SkillMode; readonly why: string }

export const INTENT_MODE_SYSTEM = `You read one sentence in which a person says what they want a writing skill for, and say which of three things it asks for:

- GENERATE: produce new work in a voice or to a standard (write, draft, compose posts, essays, articles, papers, pages; "in my voice", "like my newsletter").
- GUARD: hold work to a standard (ensure, enforce, check, audit, review for compliance, lint, make sure every output follows the rules). The skill is a gate on work that exists or is produced elsewhere.
- RESPOND: answer people inside a policy (reply to customers, users, tickets, emails, messages; support; "always answer this way"). The work is a reply to someone.

"Write a support article" produces a document about support: GENERATE. "Draft replies to customer emails" answers people, though it begins with a writing verb: RESPOND. "Review every post before it goes out" is a gate: GUARD. Answer with the mode and a short quote copied exactly from the sentence that shows it.`;

export const INTENT_MODE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { mode: { type: 'string', enum: ['GENERATE', 'GUARD', 'RESPOND'] }, quote: { type: 'string' } },
  required: ['mode', 'quote'], additionalProperties: false,
};

/** What each mode means for the rules kept, said to the person. */
export const WHY: Readonly<Record<SkillMode, string>> = {
  RESPOND: 'you described answering people, so every rule you keep is a policy the answers must follow',
  GUARD: 'you described holding outputs to the standard, so the rules you keep default to required',
  GENERATE: 'you described producing new work, so rules default to required only where the evidence is strong',
};

export const INTENT_MODE: Reading<IntentInput, IntentMode> = {
  id: 'intent-mode', version: '1',
  system: INTENT_MODE_SYSTEM, schema: INTENT_MODE_SCHEMA,
  toolName: 'emit_intent_mode', toolDescription: 'Which of GENERATE, GUARD or RESPOND the sentence asks for, with the words that say it.',
  maxTokens: 200, estimateUsd: 0.005,
  prompt(input) { return `The sentence:\n${input.intent.trim()}`; },
  // Nothing said is nothing to read: producing new work, as it always was.
  decide(input) { return input.intent.trim() ? null : { mode: 'GENERATE', why: WHY.GENERATE }; },
  ground(raw, input) {
    const r = raw as { mode?: unknown; quote?: unknown } | null;
    if (!r || (r.mode !== 'GENERATE' && r.mode !== 'GUARD' && r.mode !== 'RESPOND')) return null;
    if (typeof r.quote !== 'string' || !quoteIsReal(r.quote, input.intent)) return null;
    return { mode: r.mode, why: WHY[r.mode] };
  },
  floor(input) { const f = modeFromIntent(input.intent); return { mode: f.mode, why: f.why }; },
};
