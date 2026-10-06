// atelier/core/fidelity/structural.ts — THE ACTUATORS FOR PACE AND SOUND, AND WHAT THEY MAY KEEP.
//
// The repair loop rewrites the spans that break a rule; it cannot move paragraph pace, sentence variation or
// over-explaining, which are exactly the layers a skill lost to its author. 0.8 tried one actuator for them, a
// whole-text "redraft for form", and B6 kept none of its 20 attempts: asked to change rhythm without changing
// content, the model changed content and the guards refused it. This file replaces it with two narrower ones:
//
//   1. OPERATORS (./operators.ts). Deterministic re-punctuation of the words already there, chosen by the
//      measured effect of each operator on the feature furthest outside the author's range (the effect matrix,
//      built at discovery on the model's own drafts). No model call; tried site by site.
//   2. ONE SENTENCE AT A TIME, for over-articulation ("than", "that's", explanatory and contrastive
//      connectives), which no re-punctuation reaches: the sentence that carries most of it is rewritten as a
//      plain assertion, by a model, under the same span integrity guard every repair passes.
//
// Every change is kept only if the target feature moved toward the band, no other steering feature left its
// band, and the caller's check says the standard broke nothing. Every application, kept or not, is recorded
// with the feature before and after, so a study can say which actuator moved what.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import { featureOf } from '../observers/features.js';
import { spanIntegrity } from '../loop/integrity.js';
import { readFidelity } from './profile.js';
import { applyOperator, operatorsToward, sitesOf, keepsWords, proseSentences, type OperatorId } from './operators.js';
import type { FidelityProfile, FidelityReading } from './types.js';

/** What one application did: the actuator, the target, the feature before and after, and whether it was kept. */
export interface Application {
  readonly actuator: OperatorId | 'sentence-rewrite';
  readonly target: string;
  readonly before: number | null;
  readonly after: number | null;
  readonly kept: boolean;
  readonly why: string;
}

/** Whether a change moved its target toward the band without pushing another steering feature out or losing ground overall. */
export function movedTarget(before: FidelityReading, after: FidelityReading, target: string): boolean {
  const d = (r: FidelityReading): number => r.outside.find((o) => o.id === target)?.distance ?? 0;
  const outBefore = new Set(before.outside.map((o) => o.id));
  const newlyOut = after.outside.filter((o) => !outBefore.has(o.id));
  return d(after) < d(before) && newlyOut.length === 0 && after.inBand >= before.inBand;
}

/** The features over-articulation shows in, which only a sentence rewrite can move. Negation is left out: it carries meaning. */
export const ARTICULATION: ReadonlySet<string> = new Set(['explanatory', 'than', 'thatsContraction', 'contrastive', 'letUs']);

/** The connective words a sentence rewrite for each feature may drop: the rewrite's license, and nothing more. */
const LICENSE: Readonly<Record<string, readonly string[]>> = {
  explanatory: ['because', 'since', 'so that', 'which means', "that's why", 'this is why', 'the reason', 'in other words', 'that is'],
  than: ['than', 'rather than', 'more than', 'less than'],
  thatsContraction: ["that's", 'that is'],
  contrastive: ['but', 'however', 'instead', 'rather', 'whereas', 'yet', 'although'],
  letUs: ["let's", 'let me', 'let us'],
};

export const SENTENCE_SYSTEM = `You rewrite ONE sentence so it asserts instead of explaining or contrasting.

You get the sentence and the connective words you may drop (such as "because", "than", "that's", "but").
Rewrite it as a plain statement, as a writer who asserts and narrates would. Drop the explaining or
contrasting framing; keep what the sentence says.

Hard limits:
- Keep every figure, name, date, quotation, negation ("not", "never", "no") and qualifier ("may", "most").
- Add no fact and no claim. Do not merge it with any other sentence.
- Return the one sentence only.`;

const SCHEMA = { type: 'object', properties: { sentence: { type: 'string' } }, required: ['sentence'], additionalProperties: false } as const;

/** The sentence that carries most of `feature`: the one whose removal lowers it most. Null when none lowers it. */
export function carrier(text: string, feature: string): { s: string; at: number } | null {
  const f = featureOf(feature);
  const base = f?.measure(text) ?? null;
  if (!f || base === null) return null;
  let best: { s: string; at: number; drop: number } | null = null;
  // Prose sentences only, split the way the operators split: never a heading, a list, a quotation or code.
  for (const x of proseSentences(text).filter((y) => y.s.split(/\s+/).length >= 4)) {
    const v = f.measure(text.slice(0, x.at) + text.slice(x.at + x.s.length));
    if (v !== null && base - v > (best?.drop ?? 0)) best = { ...x, drop: base - v };
  }
  return best ? { s: best.s, at: best.at } : null;
}

/** Sites one operator is tried at for one target before the next operator is tried. */
export const SITES_PER_OPERATOR = 4;

export interface SteerBudget {
  /** deterministic operator applications that may be tried (free) */
  readonly operators: number;
  /** one-sentence model rewrites that may be tried (each a model call) */
  readonly sentences: number;
}

export interface SteerOutcome { readonly text: string; readonly reading: FidelityReading; readonly applications: Application[] }

/**
 * STEER TOWARD THE AUTHOR'S RANGE. For the steering feature furthest outside: the operators whose measured
 * effect moves it the right way, site by site, until one is kept or all are tried; for an over-articulation
 * feature, a sentence rewrite of its carrier. Then the next feature. `breaksNothing(before, after)` is the
 * caller's check against the standard, asked of every change before it is kept.
 */
export async function steerTowardRange(
  client: InferenceClient | null, budget: Budget | null, text: string, profile: FidelityProfile, limits: SteerBudget,
  breaksNothing: (before: string, after: string) => Promise<boolean>,
  /** the cheaper check for operator candidates (deterministic rules only); `breaksNothing` when absent */
  screen?: (before: string, after: string) => Promise<boolean>,
): Promise<SteerOutcome> {
  let current = text; let reading = readFidelity(text, profile);
  const applications: Application[] = [];
  let ops = limits.operators; let calls = limits.sentences;
  const settled = new Set<string>();
  const valueOf = (r: FidelityReading, id: string): number | null => r.values[id] ?? null;
  const record = (actuator: Application['actuator'], target: string, before: FidelityReading, after: FidelityReading | null, kept: boolean, why: string): void => {
    applications.push({ actuator, target, before: valueOf(before, target), after: after ? valueOf(after, target) : null, kept, why });
  };
  for (;;) {
    const target = reading.outside.find((o) => !settled.has(o.id));
    if (!target || (ops <= 0 && calls <= 0)) break;
    settled.add(target.id);
    let moved = false;
    // 1. Operators, by measured effect. Only what is known to move this feature this way is tried.
    for (const op of profile.effects ? operatorsToward(profile.effects, target.id, target.direction) : []) {
      if (moved || ops <= 0) break;
      // At most SITES_PER_OPERATOR tries of one operator on one target: one that keeps failing gives way to the next.
      const n = Math.min(sitesOf(op, current), SITES_PER_OPERATOR);
      for (let k = 0; k < n && ops > 0 && !moved; k++) {
        const next = applyOperator(op, current, k);
        if (next === null || next === current) continue;
        ops -= 1;
        const after = readFidelity(next, profile);
        // THE WORDS FIRST. An operator re-punctuates; anything else it did is a defect, refused before it is weighed.
        if (!keepsWords(current, next) || !spanIntegrity(current, next, new Set(['and']), false).ok) { record(op, target.id, reading, after, false, 'it changed the words, so it is refused'); continue; }
        if (!movedTarget(reading, after, target.id)) { record(op, target.id, reading, after, false, 'it did not bring the target closer without pushing another feature out'); continue; }
        // Screened by the deterministic checks only: an operator keeps every word, so it cannot add a claim, and a
        // model read of every candidate would spend the claim reader's budget on texts never delivered.
        if (!(await (screen ?? breaksNothing)(current, next))) { record(op, target.id, reading, after, false, 'it broke a rule of the standard'); continue; }
        record(op, target.id, reading, after, true, `${target.id} moved toward the author's range`);
        current = next; reading = after; moved = true;
      }
    }
    // 2. A sentence rewrite, for over-articulation only, and only with a model to call.
    if (!moved && ARTICULATION.has(target.id) && target.direction === 'high' && client && budget && calls > 0) {
      const c = carrier(current, target.id);
      if (c) {
        calls -= 1;
        let rewrite: string | null = null;
        try {
          const res = await spend(budget, 0.02, async () => {
            const x = await client.complete({ stableBlock: SENTENCE_SYSTEM, variableBlock: '',
              userMessage: `THE SENTENCE\n${c.s}\n\nYOU MAY DROP\n${(LICENSE[target.id] ?? []).join(', ')}`,
              toolName: 'emit_sentence', toolDescription: 'Return the one rewritten sentence.', schema: SCHEMA, maxTokens: 600, temperature: 0 });
            return { value: x, cost: x.cost, usage: x };
          }, 'steering');
          const out = (res.json as { sentence?: unknown } | null)?.sentence;
          rewrite = typeof out === 'string' && out.trim() ? out.trim() : null;
        } catch (e) {
          record('sentence-rewrite', target.id, reading, null, false, `the rewrite could not run (${(e as Error).message.split('\n')[0]})`);
        }
        if (rewrite) {
          const integrity = spanIntegrity(c.s, rewrite, new Set(LICENSE[target.id] ?? []), false);
          const next = current.slice(0, c.at) + rewrite + current.slice(c.at + c.s.length);
          const after = readFidelity(next, profile);
          if (!integrity.ok) record('sentence-rewrite', target.id, reading, after, false, `it changed what the sentence claims (${integrity.lost.slice(0, 3).join(', ')})`);
          else if (!movedTarget(reading, after, target.id)) record('sentence-rewrite', target.id, reading, after, false, 'it did not bring the target closer without pushing another feature out');
          else if (!(await breaksNothing(current, next))) record('sentence-rewrite', target.id, reading, after, false, 'it broke a rule of the standard or added a claim');
          else {
            record('sentence-rewrite', target.id, reading, after, true, `${target.id} moved toward the author's range`);
            // the same feature may still be out: its next carrier gets the next call
            current = next; reading = after; settled.delete(target.id);
          }
        }
      }
    }
  }
  return { text: current, reading, applications };
}
