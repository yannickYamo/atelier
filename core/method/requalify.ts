// atelier/core/method/requalify.ts — THE OWNER'S RULINGS HOLD THE WRITTEN CHECKS AGAIN, WITH NO ONE ASKED.
//
// A written check earns its say on the owner's examples and the edits that break its step (./mutants.ts). Every run the
// owner rules on afterwards (`atelier rate <run> yes|no [--rule <id>]`) is one more case of exactly that kind: a run they
// would ship is one more finished example, which the check must pass; a run they would not ship because it breaks a named
// step is one more edit that breaks that step, which its check must catch and every other written check must not fire on.
// Folding them in is counting, and needs no model: each check is run on each rated text, and held to the same three bars
// (`barred`). A check that now qualifies is enforced from the next run (core/plan/execution-plan.ts), so its findings
// move from the consequence table's untrusted rows to the trusted one (core/eval/consequence.ts) with no owner action.
//
// What the build already counted is not counted twice: a rejection named at or before the moment the check's standing was
// set (`since`) was among the build's own breaks (cli/commands/method.ts, `rejectedOutputs`). Accepted runs are never
// counted at a build, so every one made under a standard holding the step's words is folded in. The standing the build
// gave is kept (`base`), so holding the check again starts from it and gives the same answer every time.

import type { CheckQualification, Requalification, StandardVersion } from '../state/canonical-state.js';
import { measure } from '../observers/registry.js';
import { barred } from './mutants.js';
import { planFor } from '../plan/execution-plan.js';
import * as store from '../state/store.js';
import { latestRatings } from '../state/eval-store.js';

/** One run the owner ruled on: the text, their answer, the step they named, and the steps of the standard it was made under. */
export interface RatedRun {
  readonly invocationId: string;
  readonly ship: boolean;
  /** the words of the step a rejection names; null where it names none */
  readonly ruleStatement: string | null;
  readonly output: string;
  readonly at: string;
  /** the statements of the standard the run was made under */
  readonly under: ReadonlySet<string>;
}

/** One check whose standing changed on the owner's rulings. */
export interface Moved { readonly id: string; readonly statement: string; readonly was: boolean; readonly now: boolean; readonly why: string | null;
  /** the step's weight is REQUIRED in the standard: a check that stops qualifying still blocks until the owner says otherwise */
  readonly required: boolean }

const NONE: CheckQualification = { examples: { passed: 0, read: 0, of: 0 }, own: { caught: 0, of: 0 }, cross: { fired: 0, of: 0 }, qualified: false, why: null };

/**
 * Every written check of `std` held again to the rated runs. `since(id)` is when the check's standing was first set, for
 * a check not held again before. Returns the qualifications and their records to keep beside the standard, and what moved.
 */
export function requalify(std: StandardVersion, runs: readonly RatedRun[], since: (id: string) => string, now: string):
  { readonly qualifications: Record<string, CheckQualification>; readonly requalified: Record<string, Requalification>; readonly moved: readonly Moved[]; readonly changed: boolean } {
  const written = std.requirements.filter((r) => r.authority !== 'EXPERT_REJECTED' && r.measurement?.observer === 'CHECK');
  const qualifications: Record<string, CheckQualification> = { ...(std.qualifications ?? {}) };
  const requalified: Record<string, Requalification> = { ...(std.requalified ?? {}) };
  const moved: Moved[] = []; let changed = false;
  const statements = new Set(written.map((r) => r.statement));
  // Enforced by the step's own weight, whatever its standing: the plan read without the standings beside the standard.
  const byWeight = new Set(planFor({ requirements: std.requirements }).rules.filter((p) => p.enforced).map((p) => p.id));
  for (const r of written) {
    const m = r.measurement;
    if (!m) continue;
    const before = std.requalified?.[r.requirementId];
    // A check marked qualified on itself, with no standing beside the standard, was qualified before standings were kept.
    if (!before && !std.qualifications?.[r.requirementId] && m.params.qualified === 1) continue;
    const base = before?.base ?? std.qualifications?.[r.requirementId] ?? NONE;
    const from = before?.since ?? since(r.requirementId);
    const accepted = runs.filter((x) => x.ship && x.under.has(r.statement));
    const rejected = runs.filter((x) => !x.ship && x.ruleStatement === r.statement && x.at > from);
    const cross = runs.filter((x) => !x.ship && x.ruleStatement !== null && x.ruleStatement !== r.statement && statements.has(x.ruleStatement) && x.at > from);
    if (!accepted.length && !rejected.length && !cross.length) continue;
    // Run on the text alone: a rated run's material is not kept with its rating, so a check that reads the material reads nothing.
    const verdict = (text: string): 'MET' | 'VIOLATED' | 'NOT_APPLICABLE' => measure(text, m, { material: [] }).verdict;
    const onAccepted = accepted.map((x) => verdict(x.output));
    const q = barred({
      examples: { passed: base.examples.passed + onAccepted.filter((v) => v === 'MET').length, read: base.examples.read + onAccepted.filter((v) => v !== 'NOT_APPLICABLE').length, of: base.examples.of + accepted.length },
      own: { caught: base.own.caught + rejected.filter((x) => verdict(x.output) === 'VIOLATED').length, of: base.own.of + rejected.length },
      cross: { fired: base.cross.fired + cross.filter((x) => verdict(x.output) === 'VIOLATED').length, of: base.cross.of + cross.length },
    });
    const ids = (xs: readonly RatedRun[]): string[] => xs.map((x) => x.invocationId).sort();
    const same = before && JSON.stringify([before.accepted, before.rejected, before.cross]) === JSON.stringify([ids(accepted), ids(rejected), ids(cross)]);
    if (same) continue;
    changed = true;
    const was = qualifications[r.requirementId]?.qualified ?? false;
    qualifications[r.requirementId] = q;
    requalified[r.requirementId] = { base, since: from, accepted: ids(accepted), rejected: ids(rejected), cross: ids(cross), at: now };
    if (was !== q.qualified) moved.push({ id: r.requirementId, statement: r.statement, was, now: q.qualified, why: q.why, required: byWeight.has(r.requirementId) });
  }
  return { qualifications, requalified, moved, changed };
}

/** The rated runs of a skill, each with the steps of the standard it was made under. */
export function ratedRuns(L: store.StoreLayout): RatedRun[] {
  const runs = new Map(store.listLearningInvocations(L).map((x) => [x.invocationId, x]));
  const underOf = new Map<string, ReadonlySet<string>>();
  const under = (skillVersionHash: string): ReadonlySet<string> => {
    const had = underOf.get(skillVersionHash); if (had) return had;
    const sv = store.getSkillVersion(L, skillVersionHash); const std = sv ? store.getStandard(L, sv.standardVersionHash) : null;
    const set = new Set((std?.requirements ?? []).map((q) => q.statement)); underOf.set(skillVersionHash, set); return set;
  };
  return latestRatings(L).flatMap((rating) => {
    const run = runs.get(rating.invocationId);
    if (!run?.output.trim()) return [];
    const words = rating.ruleStatement ?? (rating.rule ? (() => { const sv = store.getSkillVersion(L, run.skillVersionHash); const std = sv ? store.getStandard(L, sv.standardVersionHash) : null; return std?.requirements.find((q) => q.requirementId === rating.rule)?.statement ?? null; })() : null);
    return [{ invocationId: rating.invocationId, ship: rating.ship, ruleStatement: rating.ship ? null : words, output: run.output, at: rating.at, under: under(run.skillVersionHash) }];
  });
}

/**
 * WHEN A CHECK'S STANDING WAS SET: the minting of the earliest standard, back along the versions this one supersedes, that
 * carries the same standing for it. Rulings before then were the build's to count.
 */
export function standingSince(L: store.StoreLayout, std: StandardVersion, id: string): string {
  const same = JSON.stringify(std.qualifications?.[id] ?? null);
  let at = std.mintedAt; let prev = std.supersedes ? store.getStandard(L, std.supersedes) : null;
  for (let hops = 0; prev && hops < 200 && JSON.stringify(prev.qualifications?.[id] ?? null) === same && prev.requirements.some((r) => r.requirementId === id); hops++) {
    at = prev.mintedAt; prev = prev.supersedes ? store.getStandard(L, prev.supersedes) : null;
  }
  return at;
}

/** Hold the active standard's written checks again to the owner's rulings, and keep what they earned beside it. */
export function requalifySkill(L: store.StoreLayout, now = new Date().toISOString()): { readonly moved: readonly Moved[]; readonly held: number } {
  const active = store.getActive(L); const sv = active ? store.getSkillVersion(L, active) : null;
  const std = sv ? store.getStandard(L, sv.standardVersionHash) : null;
  if (!std) return { moved: [], held: 0 };
  const r = requalify(std, ratedRuns(L), (id) => standingSince(L, std, id), now);
  if (r.changed) store.putQualifications(L, std.standardVersionHash, { qualifications: r.qualifications, requalified: r.requalified });
  return { moved: r.moved, held: Object.keys(r.requalified).length };
}

/** One line a moved check, for the person. */
export const movedLine = (m: Moved): string => m.now
  ? `${m.id} "${m.statement.slice(0, 60)}": its check now qualifies on your rulings, so a run that fails it is repaired, then blocked, not sent to you.`
  : m.required ? `${m.id} "${m.statement.slice(0, 60)}": its check no longer qualifies on your rulings (${m.why ?? 'see atelier report --skill'}); the step is required in your standard, so it still blocks: atelier amend --rule ${m.id} if it should not.`
    : `${m.id} "${m.statement.slice(0, 60)}": its check no longer qualifies on your rulings (${m.why ?? 'see atelier report --skill'}), so its findings go to you again.`;
