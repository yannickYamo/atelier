// atelier/core/voice/integrity.ts — A VOICE REWRITE MAY CHANGE EVERY WORD AND NO FACT.
//
// A repair rewrites one span and is held to an 85% overlap of content words: it is meant to change little.
// A voice pass is meant to change function words, rhythm and phrasing across a whole paragraph, so that
// bar would refuse every useful rewrite. Here a rewritten paragraph is held to what it must not change:
//
//   facts      the same figures, dates, quotations, links and names on both sides, none added, none lost
//              (../loop/fact-ledger.ts, read with one extractor on both paragraphs)
//   strength   no negation added or lost, no qualifier or modal dropped, no universal, certainty verb,
//              intensifier or cause the content paragraph did not carry (../loop/integrity.ts)
//   copying    no run of COPY_RUN or more words shared with the author's own pieces
//   length     between 0.75 and 1.35 of the content paragraph, in words
//
// A paragraph that fails any one is refused whole and the content paragraph is kept: never a partial
// merge. Stricter than the brief it came from on one point: a qualifier swapped for another ("may" to
// "might") is refused, because the check that would tell a one-step swap from a stronger one is not built.
//
// EVERY CHECK HERE READS PROSE, so each is a detector and will miss a phrasing nobody listed. That is why
// this gate only ever REFUSES a rewrite (the failure costs a paragraph of voice, never a fact), and why the
// assembled text is still read in full by the standard's own checks and the claim reader before it ships.

import { wordsOf } from '../observers/text.js';
import type { overlapIndex } from '../observers/overlap.js';
import { factLedger, type Fact } from '../loop/fact-ledger.js';
import { spanIntegrity } from '../loop/integrity.js';

export const COPY_RUN = 12;
export const LENGTH_RATIO: readonly [number, number] = [0.75, 1.35];

/** `reader`: the word lists passed it and the small model's second read (./reader.ts) found a changed claim */
export type VoiceCheck = 'empty' | 'facts' | 'strength' | 'copying' | 'length' | 'reader';
export interface VoiceVerdict { readonly ok: boolean; readonly check?: VoiceCheck; readonly detail?: string }

const key = (f: Fact): string => `${f.kind}:${f.norm}`;
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Facts in `a` that `b` does not carry. A name is looked for in `b`'s text as well as its ledger: the
 * ledger reads a single capitalised word as a name only mid-sentence, so a rewrite that moves "Stripe" to
 * the start of a sentence would otherwise look like a lost name.
 */
export function factsMissing(a: string, b: string): string[] {
  const inB = new Set(factLedger(b).map(key));
  return factLedger(a).filter((f) => !inB.has(key(f))
    && !(f.kind === 'NAME' && new RegExp(`(?<![A-Za-z])${escapeRe(f.text)}(?![A-Za-z])`).test(b))).map((f) => f.text);
}

/** Whether `voice` may replace `content`. `copied` is an overlap reader over the author's pieces (overlapIndex). */
export function voiceIntegrity(content: string, voice: string, copied: ReturnType<typeof overlapIndex> | null, opts: { strength?: boolean } = {}): VoiceVerdict {
  const before = wordsOf(content).length; const after = wordsOf(voice).length;
  if (!after) return { ok: false, check: 'empty', detail: 'the rewrite came back empty' };
  const ratio = before ? after / before : 0;
  if (ratio < LENGTH_RATIO[0] || ratio > LENGTH_RATIO[1]) return { ok: false, check: 'length', detail: `${after} words for ${before} (${ratio.toFixed(2)} of the original)` };
  const lost = factsMissing(content, voice); const added = factsMissing(voice, content);
  if (lost.length || added.length) {
    return { ok: false, check: 'facts', detail: [lost.length ? `lost: ${lost.slice(0, 3).join(', ')}` : '', added.length ? `added: ${added.slice(0, 3).join(', ')}` : ''].filter(Boolean).join('; ') };
  }
  // The strength word lists can be left out (`strength: false`) so a study can read the gate with a reader in their
  // place (studies/VOICE_GATE_PREREGISTRATION.md). Nothing in the product leaves them out.
  const strength = opts.strength === false ? { ok: true, lost: [] } : spanIntegrity(content, voice, new Set(), false);
  if (!strength.ok) return { ok: false, check: 'strength', detail: strength.lost.slice(0, 3).join('; ') };
  const run = copied ? copied(voice).longestShared : 0;
  if (run >= COPY_RUN) return { ok: false, check: 'copying', detail: `a run of ${run} words is the author's own` };
  return { ok: true };
}
