// atelier/core/inference/reading.ts — A CONTEXT READING: A SMALL MODEL READS, CODE GROUNDS AND DECIDES.
//
// A regular expression on a name decided what kind of work a skill was: "code review" matched the pattern for
// replies, and a skill for sectioned review documents was served the voice of a chat assistant ("write against
// assumptions you state, say how to check it") that no example of the author's carries. A word list cannot see
// the examples; a reading can. So every decision that turns on what words MEAN (not on what can be counted) is
// made here the same way the persona, the scope and the holds-back readings already are:
//
//   1. where the evidence is decisive on its own, code decides and no model is asked (`decide`);
//   2. otherwise a small model reads the material and answers in a fixed shape (`system`, `schema`);
//   3. code grounds the answer (`ground`): a quote that is not in the material drops its finding, an answer
//      outside the shape is no answer; what survives is the decision;
//   4. with no model, or a reading code could not ground, the floor decides (`floor`): the old word pattern,
//      kept only as what to do when nothing better can be known, and said as such (`by: 'floor'`).
//
// Every reading is versioned and evaluated against labelled cases (bench/readings/) before it decides anything:
// a reading is non-deterministic, so the eval runs each case several times and the pass line is stated before
// the run. The record of a decision says who made it (code, the model, or the floor), so a run can be read back.

import type { Budget, InferenceClient, SpendPurpose } from './client.js';
import { spend } from './client.js';

export type DecidedBy = 'code' | 'model' | 'floor';

export interface Reading<I, T> {
  /** stable id, the eval's name for it */
  readonly id: string;
  /** bumped whenever the prompt, the schema or the grounding changes: a decision records it */
  readonly version: string;
  readonly system: string;
  readonly schema: Record<string, unknown>;
  readonly toolName: string;
  readonly toolDescription: string;
  readonly maxTokens: number;
  /** the dollar estimate one call is held to before it is made */
  readonly estimateUsd: number;
  /** what the model is shown for this input */
  prompt(input: I): string;
  /** code's own verdict where the evidence is decisive; null when a model must read */
  decide(input: I): T | null;
  /** the model's answer, grounded against the input; null when nothing in it can be trusted */
  ground(raw: unknown, input: I): T | null;
  /** the decision when no model read, or nothing it said could be grounded */
  floor(input: I): T;
}

export interface Decision<T> {
  readonly value: T;
  readonly by: DecidedBy;
  /** `<reading id>-<version>:<model>` when a model read; the reading id and version alone otherwise */
  readonly reader: string;
  /** why the floor decided, when it did */
  readonly why?: string;
}

/**
 * One reading, decided. `client` null means no model is set up: code or the floor decides. A call that fails is a
 * floor decision with its reason, never an exception: a reading is never the reason a build or a run stops.
 */
export async function readContext<I, T>(reading: Reading<I, T>, input: I, client: InferenceClient | null, model: string | null, budget: Budget, purpose: SpendPurpose = 'other'): Promise<Decision<T>> {
  const tag = `${reading.id}-${reading.version}`;
  const decided = reading.decide(input);
  if (decided !== null) return { value: decided, by: 'code', reader: tag };
  if (!client || !model) return { value: reading.floor(input), by: 'floor', reader: tag, why: 'no model set up' };
  try {
    const raw = await spend(budget, reading.estimateUsd, async () => {
      const x = await client.complete({ stableBlock: reading.system, variableBlock: '', userMessage: reading.prompt(input),
        toolName: reading.toolName, toolDescription: reading.toolDescription, schema: reading.schema, maxTokens: reading.maxTokens, temperature: 0 });
      return { value: x.json, cost: x.cost };
    }, purpose);
    const value = reading.ground(raw, input);
    if (value === null) return { value: reading.floor(input), by: 'floor', reader: `${tag}:${model}`, why: 'the reading could not be grounded in the material' };
    return { value, by: 'model', reader: `${tag}:${model}` };
  } catch (e) {
    return { value: reading.floor(input), by: 'floor', reader: `${tag}:${model}`, why: `the reader could not be asked: ${(e as Error).message.split('\n')[0]}` };
  }
}
