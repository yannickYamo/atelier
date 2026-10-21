// atelier/cli/stages.ts — THE STAGES OF ONE BUILD, AS THEY RUN OR DO NOT. `method` and `new` record before `build`
// runs and `build` records the rest, so the log lives here, outside any one command, and is reset when a build begins.
// What is recorded goes into the build receipt (core/state/receipt.ts) and onto the screen in one line.
import type { BuildStage, StageId } from '../core/state/receipt.js';

let stages: BuildStage[] = [];

export function resetStages(): void { stages = []; }

/** Record a stage once: a second record of the same stage replaces the first (a reading retried, a decision revised). */
export function recordStage(id: StageId, outcome: { ran: true; detail?: string } | { ran: false; why: string; degraded?: true }): void {
  const entry: BuildStage = outcome.ran
    ? { id, ran: true, ...(outcome.detail ? { detail: outcome.detail } : {}) }
    : { id, ran: false, why: outcome.why, ...(outcome.degraded ? { degraded: true as const } : {}) };
  stages = [...stages.filter((s) => s.id !== id), entry];
}

export const stagesSoFar = (): readonly BuildStage[] => stages;
