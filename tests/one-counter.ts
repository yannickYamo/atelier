// tests/one-counter.ts — ONE STEP COUNTER PER RUN, ASSERTED ON A RECORD.
//
// Every model-calling or text-changing repair action of a run passes through the controller's one counter: the span
// rewrites, the carrier rewrites, the drafts written again and the trims alike. Read on a record, that is two facts,
// each worked out here from the documented contract and never from the code under test:
//   1. the model-calling steps the record shows are exactly the model calls the scripted writer answered for them;
//   2. the steps counted (every chosen step; a hand-off, a step that could not run, the claim cut and the mechanical
//      fixes are not steps) never exceed the documented limit of four a run, the steps carried in as history included.
import { expect } from 'vitest';
import type { ControllerDecisionRecord, ControllerRecord } from '../core/state/canonical-state.js';

/** The documented default: at most four steps a run, across every draft. */
export const MAX_STEPS = 4;
const MODEL = new Set(['rewrite', 'carrier-rewrite', 'redraft', 'trim']);
const NOT_A_STEP = new Set(['cut', 'mechanical']);
const took = (d: ControllerDecisionRecord): boolean => d.outcome !== 'handed to a redraft' && d.outcome !== 'could not run';

/** The model-calling steps a record shows as taken. */
export const modelStepsOn = (r: ControllerRecord | undefined): number => (r?.decisions ?? []).filter((d) => MODEL.has(d.action) && took(d)).length;
/** The steps a record counts against the limit. */
export const stepsOn = (decisions: readonly ControllerDecisionRecord[]): number => decisions.filter((d) => !NOT_A_STEP.has(d.action) && took(d)).length;

/**
 * The record of one scripted scenario holds both facts: `calls` is how many model calls the scenario's writer answered
 * for repair steps (counted by the scenario, not read from the record); `history` is what the run carried in.
 */
export function expectOneCounter(r: ControllerRecord | undefined, calls: number, history: readonly ControllerDecisionRecord[] = [], max = MAX_STEPS): void {
  expect(modelStepsOn(r), 'model-calling steps recorded = model calls taken').toBe(calls);
  expect(stepsOn([...history, ...(r?.decisions ?? [])]), `steps counted ≤ ${max}`).toBeLessThanOrEqual(max);
}
