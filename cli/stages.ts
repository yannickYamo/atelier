// atelier/cli/stages.ts — THE STAGES OF ONE BUILD, AS THEY RUN OR DO NOT. `method` and `new` record before `build`
// runs and `build` records the rest, so the log lives here, outside any one command, and is reset when a build begins.
// What is recorded goes into the build receipt (core/state/receipt.ts) and onto the screen in one line.
import type { BuildStage, StageId } from '../core/state/receipt.js';

let stages: BuildStage[] = [];

export function resetStages(): void { stages = []; }

/** The ledger a stage may carry (core/state/receipt.ts): who decided, the calls, an answer cut, what was settled or lost. */
type Ledger = Pick<BuildStage, 'by' | 'calls' | 'truncated' | 'conflicts' | 'failed'>;
/** A stage that ran, whole or degraded (then with why it is), or did not run, with why. */
export type StageOutcome = ({ ran: true; detail?: string; degraded?: true; why?: string } | { ran: false; why: string; degraded?: true }) & Ledger;

/** Record a stage once: a second record of the same stage replaces the first (a reading retried, a decision revised). Only what is known is kept: an absent field is absent. */
export function recordStage(id: StageId, outcome: StageOutcome): void {
  const ledger: Ledger = { ...(outcome.by ? { by: outcome.by } : {}), ...(outcome.calls !== undefined ? { calls: outcome.calls } : {}), ...(outcome.truncated ? { truncated: true as const } : {}),
    ...(outcome.conflicts ? { conflicts: outcome.conflicts } : {}), ...(outcome.failed ? { failed: outcome.failed } : {}) };
  const entry: BuildStage = outcome.ran
    ? { id, ran: true, ...(outcome.detail ? { detail: outcome.detail } : {}), ...(outcome.degraded ? { degraded: true as const, ...(outcome.why ? { why: outcome.why } : {}) } : {}), ...ledger }
    : { id, ran: false, why: outcome.why, ...(outcome.degraded ? { degraded: true as const } : {}), ...ledger };
  stages = [...stages.filter((s) => s.id !== id), entry];
}

export const stagesSoFar = (): readonly BuildStage[] => stages;
