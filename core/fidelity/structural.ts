// atelier/core/fidelity/structural.ts — THE ACTUATOR FOR PACE AND SOUND.
//
// The repair loop rewrites the spans that break a rule. It cannot merge or split sentences or paragraphs,
// so the layers that live there (paragraph length, how often a paragraph is one sentence, how much
// sentence length varies, commas per sentence) were observable and never controllable, and they were
// exactly the layers an Atelier skill lost to the author.
//
// This is the second actuator. After the counted checks, the steering band furthest outside the author's
// range, among the features a change of FORM can move, is named with its number and the author's range,
// and the text is redrafted once for that and nothing else. The redraft is kept only if:
//
//   it moved the target    the target band's distance fell, no other steering band went out, and the
//                          number in range did not fall
//   it kept the meaning    every figure, negation, qualifier and name the original carried, and nothing
//                          stronger than it claimed (../loop/integrity.ts, the same guard every rewrite
//                          passes), and at least MIN_CONTENT_KEPT of its content words
//   it broke nothing       the caller's check: no REQUIRED rule newly broken, no claim newly flagged
//
// Otherwise the text before the edit is delivered and the attempt is recorded. The edit budget bounds the
// attempts; a stop condition the model does not control. Deterministic except for the one model call.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import { featureOf, LAYER_LABEL } from '../observers/features.js';
import { wordsOf } from '../observers/text.js';
import { spanIntegrity } from '../loop/integrity.js';
import { readFidelity, bandsFor } from './profile.js';
import type { FidelityProfile, FidelityReading } from './types.js';

/**
 * The features a redraft of FORM can move without touching what the text says: paragraphing, sentence
 * boundaries, punctuation, and the over-articulating connectives an imitation adds ("than", "that's",
 * "because" where the sentence stands without it). Negation is left out: it carries meaning.
 */
export const EDITABLE: ReadonlySet<string> = new Set([
  'paragraphP10', 'paragraphP50', 'paragraphP90', 'oneSentenceParagraph', 'sentencesPerParagraph', 'paragraphSpread',
  'sentenceP10', 'sentenceP90', 'sentenceCv', 'cadence', 'commasPerSentence', 'monosyllabicRun', 'readingEase',
  'colon', 'parenthesis', 'than', 'thatsContraction', 'letUs', 'explanatory', 'contrastive', 'triad',
]);

/** A redraft may drop at most this share of the original's content words: a change of form, not of substance. */
export const MIN_CONTENT_KEPT = 0.85;

export interface EditTarget { readonly id: string; readonly direction: 'low' | 'high'; readonly value: number; readonly band: readonly [number, number] }

/** The steering band furthest outside the range among those a change of form can move, or null. */
export function editTarget(reading: FidelityReading, profile: FidelityProfile, tried: ReadonlySet<string> = new Set()): EditTarget | null {
  const { bands } = bandsFor(profile, reading.cls);
  for (const o of reading.outside) {
    if (!EDITABLE.has(o.id) || tried.has(o.id)) continue;
    const b = bands.find((x) => x.id === o.id);
    const v = reading.values[o.id];
    if (b && typeof v === 'number') return { id: o.id, direction: o.direction, value: v, band: b.band };
  }
  return null;
}

const fmt = (x: number): string => (Math.abs(x) >= 10 ? String(Math.round(x)) : String(Math.round(x * 100) / 100));

/** The instruction for one target, in the author's numbers. */
export function editInstruction(t: EditTarget): string {
  const f = featureOf(t.id);
  const label = f?.label ?? t.id;
  const unit = f?.unit === 'per1000' ? ' per 1,000 words' : f?.unit === 'share' ? ' (as a share of the whole)' : '';
  const toward = t.direction === 'high' ? 'less' : 'more';
  return `${label}${f ? ` (${LAYER_LABEL[f.layer]})` : ''}: this text is at ${fmt(t.value)}${unit}; the author's own pieces sit between ${fmt(t.band[0])} and ${fmt(t.band[1])}. `
    + `Change the form so it lands inside that range: ${toward} of it. Do this by changing paragraph breaks, sentence boundaries, punctuation, or by dropping connective words a sentence does not need.`;
}

export const EDIT_SYSTEM = `You change the FORM of a text, never its content.

You will get a text and one measured target about its form (paragraph length, sentence length, punctuation, connective words). Rewrite the text so it meets the target.

Hard limits:
- Keep every fact, figure, name, date, quotation, claim and qualifier exactly. Add none.
- Keep the order of the argument and every point it makes.
- Do not add a sentence that says something new. Do not add a heading, a list or a conclusion.
- Change only paragraph breaks, sentence boundaries, punctuation, and connective words a sentence does not need.

Return the whole text.`;

const SCHEMA = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } as const;

/** The share of the original's content words (4+ letters) the redraft still carries, counted with multiplicity. */
export function contentKept(original: string, redraft: string): number {
  const bag = (t: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (const w of wordsOf(t)) { const k = w.toLowerCase(); if (k.length >= 4) m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  };
  const a = bag(original); const b = bag(redraft);
  let total = 0; let kept = 0;
  for (const [w, n] of a) { total += n; kept += Math.min(n, b.get(w) ?? 0); }
  return total ? kept / total : 1;
}

/** Whether a redraft moved its target without pushing another band out or losing ground overall. */
export function movedTarget(before: FidelityReading, after: FidelityReading, target: string): boolean {
  const d = (r: FidelityReading): number => r.outside.find((o) => o.id === target)?.distance ?? 0;
  const outBefore = new Set(before.outside.map((o) => o.id));
  const newlyOut = after.outside.filter((o) => !outBefore.has(o.id));
  return d(after) < d(before) && newlyOut.length === 0 && after.inBand >= before.inBand;
}

export interface EditOutcome {
  readonly text: string;
  readonly reading: FidelityReading;
  readonly edits: { target: string; kept: boolean; why: string }[];
}

/**
 * Up to `budget.edits` redrafts, each against the worst editable band still outside, each kept only on the
 * terms in the header. `breaksNothing(before, after)` is the caller's check against the standard (no
 * REQUIRED rule newly broken, no claim newly flagged); it is asked only of a redraft that already passed
 * the target and meaning checks.
 */
export async function editTowardRange(
  client: InferenceClient, budget: Budget, text: string, profile: FidelityProfile, maxEdits: number,
  breaksNothing: (before: string, after: string) => Promise<boolean>,
): Promise<EditOutcome> {
  let current = text; let reading = readFidelity(text, profile);
  const edits: { target: string; kept: boolean; why: string }[] = [];
  const tried = new Set<string>();
  for (let i = 0; i < maxEdits; i++) {
    const t = editTarget(reading, profile, tried);
    if (!t) break;
    tried.add(t.id);
    let redraft: string | null;
    try {
      const res = await spend(budget, 0.05, async () => {
        const x = await client.complete({ stableBlock: EDIT_SYSTEM, variableBlock: '',
          userMessage: `THE TARGET\n${editInstruction(t)}\n\nTHE TEXT\n"""\n${current}\n"""`,
          toolName: 'emit_text', toolDescription: 'Return the whole text, its form changed to meet the target.', schema: SCHEMA, maxTokens: 12000, temperature: 0 });
        return { value: x, cost: x.cost };
      });
      const out = (res.json as { text?: unknown } | null)?.text;
      redraft = typeof out === 'string' && out.trim() ? out.trim() : null;
    } catch (e) {
      edits.push({ target: t.id, kept: false, why: `the redraft could not run (${(e as Error).message.split('\n')[0]})` });
      break;
    }
    if (!redraft) { edits.push({ target: t.id, kept: false, why: 'the redraft came back empty' }); continue; }
    const after = readFidelity(redraft, profile);
    if (!movedTarget(reading, after, t.id)) { edits.push({ target: t.id, kept: false, why: 'it did not bring the target closer without pushing another feature out' }); continue; }
    const integrity = spanIntegrity(current, redraft, new Set(), false);
    if (!integrity.ok) { edits.push({ target: t.id, kept: false, why: `it changed what the text claims (${integrity.lost.slice(0, 3).join(', ')})` }); continue; }
    const kept = contentKept(current, redraft);
    if (kept < MIN_CONTENT_KEPT) { edits.push({ target: t.id, kept: false, why: `it dropped ${Math.round((1 - kept) * 100)}% of the content words` }); continue; }
    if (!(await breaksNothing(current, redraft))) { edits.push({ target: t.id, kept: false, why: 'it broke a rule of the standard or added a claim' }); continue; }
    edits.push({ target: t.id, kept: true, why: `${t.id} moved toward the author's range` });
    current = redraft; reading = after;
  }
  return { text: current, reading, edits };
}
