// atelier/core/state/receipt.ts — WHAT A BUILD RAN, WHAT IT COULD NOT, AND WHAT IT WAS BUILT FROM.
//
// A skill version is identified by its architecture and its package (cli/commands/build.ts): two builds that emit the
// same files are the same version, whatever read them. What each build read, with which model, and which stages it
// ran or skipped and why, is a fact about the build and not about the files, so it is kept beside the version, keyed by
// the version's hash, and never inside it. Three skills were once built with no persona and nothing in their record said
// so; one lost its persona to a failed call and said so only in a line of the build log. The receipt is where that is
// recorded for `status` to show and for a later build to repair.
import { createHash } from 'node:crypto';

export type StageId = 'method' | 'persona' | 'work-form' | 'scope' | 'counted' | 'profile' | 'signals' | 'contrast';

export interface BuildStage {
  readonly id: StageId;
  /** the stage ran and produced what it produces */
  readonly ran: boolean;
  /** when it did not run: why, in plain words (no model set up, too few pieces, the call failed) */
  readonly why?: string;
  /** when it ran: what it produced, in a few words (20 points; 12 pieces; documents) */
  readonly detail?: string;
  /** the stage was expected to run and failed: the skill is built without what it would have given */
  readonly degraded?: true;
}

export interface BuildReceipt {
  readonly schema: 1;
  /** sha256 over everything below but `builtAt`: the same build decisions give the same receipt hash */
  readonly receiptHash: string;
  readonly skillVersionHash: string;
  readonly standardVersionHash: string;
  readonly architectureHash: string;
  readonly packageHash: string;
  /** the sealed corpus the standard was read from, when there was one */
  readonly corpusHash: string | null;
  /** the method note served with the skill, when there was one */
  readonly methodHash: string | null;
  /** the models that read at this build, by role (persona, context reader), as configured */
  readonly models: Readonly<Record<string, string>>;
  readonly stages: readonly BuildStage[];
  readonly builtAt: string;
}

export const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** The receipt with its hash: over every field but the time, so a rebuild that decided the same is the same receipt. */
export function receiptOf(body: Omit<BuildReceipt, 'receiptHash' | 'schema'>): BuildReceipt {
  const { builtAt, ...hashed } = body;
  const receiptHash = sha(JSON.stringify({ schema: 1, ...hashed, stages: [...hashed.stages].sort((a, b) => a.id.localeCompare(b.id)) }));
  return { schema: 1, receiptHash, ...hashed, builtAt };
}

/** The stages a build expected and lost: what the skill was built without. */
export const degradedStages = (r: Pick<BuildReceipt, 'stages'>): BuildStage[] => r.stages.filter((s) => s.degraded);

const LABEL: Readonly<Record<StageId, string>> = {
  method: 'method', persona: 'persona', 'work-form': 'work form', scope: 'scope', counted: 'counted rules',
  profile: 'author profile', signals: 'signals', contrast: 'model contrast',
};

const ORDER: readonly StageId[] = ['method', 'counted', 'work-form', 'persona', 'scope', 'profile', 'signals', 'contrast'];

/** One line for the screen, in the order a build reads: each stage, ran with its detail or not with its reason. */
export function describeStages(stages: readonly BuildStage[]): string {
  const sorted = [...stages].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  return `Stages: ${sorted.map((s) => `${LABEL[s.id]} ${s.ran ? `✓${s.detail ? ` (${s.detail})` : ''}` : `— ${s.why ?? 'not run'}`}`).join(' · ')}`;
}
