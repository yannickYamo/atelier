// atelier/core/state/receipt.ts — WHAT A BUILD RAN, WHAT IT COULD NOT, AND WHAT IT WAS BUILT FROM.
//
// A skill version is identified by its architecture and its package (cli/commands/build.ts): two builds that emit the
// same files are the same version, whatever read them. What each build read, with which model, and which stages it
// ran or skipped and why, is a fact about the build and not about the files, so it is kept beside the version, keyed by
// the version's hash, and never inside it. Three skills were once built with no persona and nothing in their record said
// so; one lost its persona to a failed call and said so only in a line of the build log. The receipt is where that is
// recorded for `status` to show and for a later build to repair.
import { createHash } from 'node:crypto';

export type StageId = 'method' | 'persona' | 'moves' | 'work-form' | 'scope' | 'counted' | 'profile' | 'signals' | 'contrast';

/** Who decided a stage: code on the pieces, a model's reading, the floor (no model, or a reading that failed or could not be grounded), or the owner switching it off. */
export type StageBy = 'code' | 'model' | 'floor' | 'off';

export interface BuildStage {
  readonly id: StageId;
  /** the stage ran and produced what it produces */
  readonly ran: boolean;
  /** when it did not run: why, in plain words (no model set up, too few pieces, the call failed); when it ran degraded: what it lost */
  readonly why?: string;
  /** when it ran: what it produced, in a few words (20 points; 12 pieces; documents) */
  readonly detail?: string;
  /** the stage was expected to run and failed, whole or in part: the skill is built without what it would have given */
  readonly degraded?: true;
  // THE LEDGER, for the screen and for a bench script: a reading that fell to its floor is visible here, never only
  // in a log. Each field is present only where it is known, so a stage recorded without them hashes as it did.
  /** who decided */
  readonly by?: StageBy;
  /** for a reading: how many model calls it made */
  readonly calls?: number;
  /** a reading's answer was cut at the token limit, in at least one call */
  readonly truncated?: true;
  /** what the stage settled between two sources (an owner's ban over an examples' rate), one line each */
  readonly conflicts?: readonly string[];
  /** what the stage asked for and did not get, one line each (a written check that failed, with its step and why) */
  readonly failed?: readonly string[];
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
  /** the author's move profile this build read or kept (core/compiler/moves.ts), by its content hash; null when none */
  readonly movesHash?: string | null;
  /** a rebuild (a rule added, an amend, a confirm, a repair candidate): the version it carries from and the command that made it; absent on a build */
  readonly rebuilt?: { readonly from: string | null; readonly by: string };
  readonly stages: readonly BuildStage[];
  readonly builtAt: string;
}

export const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

/**
 * THE IDENTITY OF A PACKAGE: one hash over its served files, by sorted name. The renderer, the install marker, the
 * verifier and the store all compute this one, so an untouched install matches the package that wrote it whatever
 * order the renderer put the files in (it once hashed them in writing order, the marker by name, and every rebuild
 * moved Atelier's own install aside as foreign).
 */
export const packageHashOf = (files: Readonly<Record<string, string>>): string =>
  sha(JSON.stringify(Object.fromEntries(Object.keys(files).sort().map((k) => [k, files[k]]))));

/**
 * The receipt with its hash: over every field but the time, so a rebuild that decided the same is the same receipt. How
 * many calls a reading made and whether an answer was cut are facts of the run, not decisions (a rebuild that keeps a
 * persona read before made no call for it): they are on the receipt and outside its hash.
 */
export function receiptOf(body: Omit<BuildReceipt, 'receiptHash' | 'schema'>): BuildReceipt {
  const { builtAt, ...hashed } = body;
  const decided = [...hashed.stages].sort((a, b) => a.id.localeCompare(b.id)).map(({ calls: _c, truncated: _t, ...rest }) => { void _c; void _t; return rest; });
  const receiptHash = sha(JSON.stringify({ schema: 1, ...hashed, stages: decided }));
  return { schema: 1, receiptHash, ...hashed, builtAt };
}

/** The stages a build expected and lost: what the skill was built without. */
export const degradedStages = (r: Pick<BuildReceipt, 'stages'>): BuildStage[] => r.stages.filter((s) => s.degraded);

const LABEL: Readonly<Record<StageId, string>> = {
  method: 'method', persona: 'persona', moves: 'moves', 'work-form': 'work form', scope: 'scope', counted: 'counted rules',
  profile: 'author profile', signals: 'signals', contrast: 'model contrast',
};

const ORDER: readonly StageId[] = ['method', 'counted', 'work-form', 'persona', 'moves', 'scope', 'profile', 'signals', 'contrast'];

/**
 * One line for the screen, in the order a build reads: each stage, ran with its detail or not with its reason. What the
 * ledger adds is said where it is a floor the owner should see: a stage that ran and lost part of what it asked (its
 * why), a decision that fell to the floor or was switched off, an answer cut at the token limit. Who decided by code or
 * by a model is on the receipt and not repeated here.
 */
export function describeStages(stages: readonly BuildStage[]): string {
  const sorted = [...stages].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const notes = (s: BuildStage): string[] => [
    ...(s.ran && s.degraded && s.why ? [s.why] : []),
    ...(s.by === 'floor' ? ['the floor'] : s.by === 'off' ? ['switched off'] : []),
    ...(s.truncated ? ['an answer cut at the token limit'] : []),
  ];
  const one = (s: BuildStage): string => {
    const n = notes(s);
    if (s.ran) { const inside = [s.detail, ...n].filter((x): x is string => Boolean(x)); return `${LABEL[s.id]} ✓${inside.length ? ` (${inside.join('; ')})` : ''}`; }
    return `${LABEL[s.id]} — ${s.why ?? 'not run'}${n.length ? ` (${n.join('; ')})` : ''}`;
  };
  return `Stages: ${sorted.map(one).join(' · ')}`;
}
