// atelier/core/voice/reader.ts — DID THE REWRITE CHANGE WHAT IS CLAIMED: A SECOND READ, BY A SMALL MODEL.
//
// The voice integrity gate (./integrity.ts) holds a rewritten paragraph to its facts and its strength with word
// lists and a fact ledger. Every one of those reads prose, so each misses the phrasing nobody listed: "the tests
// pass" rewritten as "the tests always pass" trips the list; "we think this holds" rewritten as "this holds" may
// not. Whether two paragraphs claim the same thing is a reading, so a small model reads it as well.
//
// IT CAN ONLY REFUSE, like the gate it sits behind. A finding must quote the words it is about, and code checks
// the quote is in the paragraph it names; a finding that quotes nothing real is dropped. No model, an error or an
// unreadable answer returns null, and the word lists' verdict stands alone, as before.
//
// Qualified against planted changes by studies/VOICE_GATE_PREREGISTRATION.md.

import { spend, type Budget, type InferenceClient } from '../inference/client.js';

export const VOICE_READER_VERSION = 'voice-gate-1';

export type ClaimChangeKind = 'added' | 'dropped' | 'strength';
export interface ClaimChange { readonly kind: ClaimChangeKind; readonly quote: string }

export const VOICE_READER_SYSTEM = `You compare a paragraph (ORIGINAL) with a rewrite of it (REWRITE). The rewrite may change every word and the order of the sentences. It must not change what is claimed. List each place where it does:

- "added": the rewrite states a fact, figure, name, example, cause or claim the original does not make. Quote the words from the REWRITE.
- "dropped": the original states a fact, figure, name, condition or claim the rewrite no longer makes. Quote the words from the ORIGINAL.
- "strength": the rewrite makes a claim stronger, weaker, more certain, less certain, more general, or the opposite of what the original says (a hedge removed, "some" become "all", "may" become "will", a negation added or lost). Quote the words from the REWRITE.

The same claim in other words is not a change. A different tone, rhythm or sentence length is not a change. If the rewrite claims exactly what the original claims, return an empty list. Quote exactly, a few words each.`;
const SCHEMA = { type: 'object', properties: { changes: { type: 'array', items: { type: 'object',
  properties: { kind: { type: 'string', enum: ['added', 'dropped', 'strength'] }, quote: { type: 'string' } }, required: ['kind', 'quote'], additionalProperties: false } } },
  required: ['changes'], additionalProperties: false };

const flat = (s: string): string => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

/** The changes in a model's answer that quote words really in the paragraph they name. Null when the answer holds no list. */
export function changesOf(content: string, voice: string, raw: unknown): ClaimChange[] | null {
  const list = (raw as { changes?: unknown } | null)?.changes;
  if (!Array.isArray(list)) return null;
  const c = flat(content); const v = flat(voice);
  const out: ClaimChange[] = [];
  for (const x of list as { kind?: unknown; quote?: unknown }[]) {
    if (x.kind !== 'added' && x.kind !== 'dropped' && x.kind !== 'strength') continue;
    const q = typeof x.quote === 'string' ? flat(x.quote) : '';
    if (q.length < 2 || !(x.kind === 'dropped' ? c : v).includes(q)) continue;
    // "Added" words the original also holds, or "dropped" words the rewrite still holds, are no change.
    if ((x.kind === 'added' && c.includes(q)) || (x.kind === 'dropped' && v.includes(q))) continue;
    out.push({ kind: x.kind, quote: (x.quote as string).trim() });
  }
  return out;
}

/** What the rewrite changed in what is claimed, or null when the reader could not answer (the caller keeps its own verdict). */
export async function readClaimChanges(client: InferenceClient, budget: Budget, content: string, voice: string): Promise<ClaimChange[] | null> {
  try {
    const raw = await spend(budget, 0.01, async () => {
      const x = await client.complete({ stableBlock: VOICE_READER_SYSTEM, variableBlock: '', userMessage: `<original>\n${content}\n</original>\n\n<rewrite>\n${voice}\n</rewrite>`,
        toolName: 'emit_changes', toolDescription: 'Return what the rewrite changed in what is claimed.', schema: SCHEMA, maxTokens: 500, temperature: 0 });
      return { value: x.json, cost: x.cost };
    });
    return changesOf(content, voice, raw);
  } catch { return null; }
}
