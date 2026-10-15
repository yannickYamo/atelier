// tests/one-counter.ts — ONE STEP COUNTER PER RUN, ASSERTED ON A RECORD.
//
// Every model-calling or text-changing repair action of a run passes through the controller's one counter: the span
// rewrites, the carrier rewrites, the drafts written again and the trims alike. Read on a record, that is two facts,
// each worked out here from the documented contract and never from the code under test:
//   1. the model-calling steps the record shows are exactly the model calls the scripted writer answered for them;
//   2. the steps counted (every chosen step; a hand-off, a step that could not run, the claim cut and the mechanical
//      fixes are not steps) never exceed the documented limit of four a run, the steps carried in as history included.
//      A step the limit or the budget refused is on the record as 'refused', and is no step.
import { expect } from 'vitest';
import type { ControllerDecisionRecord, ControllerRecord } from '../core/state/canonical-state.js';

/** The documented default: at most four steps a run, across every draft. */
export const MAX_STEPS = 4;
const MODEL = new Set(['rewrite', 'carrier-rewrite', 'redraft', 'trim', 'coverage', 'voice', 'taste', 'claim-redraft']);
const NOT_A_STEP = new Set(['cut', 'mechanical']);
const took = (d: ControllerDecisionRecord): boolean => d.outcome !== 'handed to a redraft' && d.outcome !== 'could not run' && d.outcome !== 'refused';

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

/**
 * THE RUN'S ONE LEDGER, read off a scripted run through the binary (core/loop/controller.ts, rule B): the model-calling
 * steps recorded, over every shape round when there are rounds, are exactly the repair calls the backend answered
 * (counted by the test from the backend's log, never from the record), and the steps of each run, or of each round under
 * --until-typical, never exceed the limit.
 */
export function expectLedger(r: ControllerRecord | undefined, repairCalls: number, max = MAX_STEPS): void {
  const runs = r?.rounds?.length ? r.rounds.map((x) => x.decisions) : [r?.decisions ?? []];
  const model = runs.reduce((n, ds) => n + ds.filter((d) => MODEL.has(d.action) && took(d)).length, 0);
  expect(model, 'model-calling steps recorded = repair calls the backend answered').toBe(repairCalls);
  for (const ds of runs) expect(stepsOn(ds), `steps counted per run or round ≤ ${max}`).toBeLessThanOrEqual(max);
}
