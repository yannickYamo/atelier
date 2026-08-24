// atelier/core/compiler/apply.ts — TURNING A PROPOSAL INTO EDITS TO SOMEONE ELSE'S SKILL.
//
// This is the step that makes case 2 real. Everything before it reads and reports: the package is
// typed (`intake/package.ts`), the rules are discovered, the proposal says what would change. Until
// this ran, `build` ignored all of it and installed a NEW skill beside the user's — a useful
// diagnostic, and not the thing that was asked for.
//
// ─── WHY THE ENTRY POINT IS THE DEFAULT, AND WHY THAT IS NOT A HEURISTIC ───────────────────────
//
// A new rule lands in the component the host always loads. That is the same lean-carrier bias the
// historical compiler applied — the leanest placement that can express the requirement, with heavier
// ones requiring recorded evidence — and here "leanest" has an unusually clean meaning: it is the
// only placement whose reachability needs no companion change. A reference document is one pointer
// away from being dark, and choosing it without a reason would be buying that risk for nothing.
//
// So this module never picks a location by guessing what the rule is "about". It places in the entry
// point and lets `planPlacement` refuse anything the host could not see.
//
// ─── EVERY REFUSAL SURVIVES TO THE REPORT ──────────────────────────────────────────────────────
//
// A rule that cannot be placed is not dropped. Silently skipping it would produce a build that
// claims to serve a standard while quietly omitting part of it — and the omission would surface
// later as a behavioural miss, sending the next diagnosis after a model that never received the
// rule. That is the delivery confound, manufactured on purpose.
//
// ─── AND NOTHING IS WRITTEN WITHOUT AN UNDO ────────────────────────────────────────────────────
//
// `atelier rollback` moves a pointer between versions Atelier built. It has no authority over a
// package it did not create, so editing a user's own files needs its own undo, and the undo has to
// be produced by the same pass that produces the edits — an undo assembled afterwards can only
// record what it believes happened.
//
// Pure module — zero I/O. The caller reads the files, calls this, and writes the result.

import { planPlacement, applyEdit, type PlacementEdit } from './placement.js';
import type { ProposedRule } from './proposal.js';
import type { AdaptedComponent } from '../intake/package.js';

export interface PlannedEdit {
  readonly requirementId: string;
  readonly path: string;
  readonly edit: PlacementEdit;
  readonly why: string;
}

export interface PlacementRefusal {
  readonly requirementId: string;
  readonly text: string;
  readonly reason: string;
}

/** Exactly what is needed to put the package back, produced by the pass that changes it. */
export interface UndoRecord {
  readonly skillName: string;
  readonly packageRoot: string;
  /** path → the bytes BEFORE anything was written */
  readonly before: Readonly<Record<string, string>>;
}

export interface ImprovementPlan {
  readonly edits: readonly PlannedEdit[];
  readonly refused: readonly PlacementRefusal[];
  /** changes elsewhere the edits need to become servable — never applied automatically */
  readonly companions: readonly string[];
  /** post-edit content per path, so the caller writes bytes this module already probed */
  readonly resulting: Readonly<Record<string, string>>;
  readonly undo: UndoRecord;
}

/** The component a new rule is written into: the entry point the host always loads. */
export function entryComponentOf(components: readonly AdaptedComponent[]): AdaptedComponent | null {
  return components.find((c) => c.kind === 'skill_methodology' && c.improvable) ?? null;
}

/**
 * Plan every change in a proposal against a real package.
 *
 * Edits ACCUMULATE against the running content rather than each being planned against the original.
 * Two rules landing in one file both compute their post-edit state from the same starting bytes
 * otherwise, and the second write silently discards the first — a build that reports two changes and
 * delivers one.
 */
export function planImprovement(
  skillName: string,
  packageRoot: string,
  changes: readonly ProposedRule[],
  components: readonly AdaptedComponent[],
  contents: ReadonlyMap<string, string>,
): ImprovementPlan {
  const entry = entryComponentOf(components);
  const edits: PlannedEdit[] = [];
  const refused: PlacementRefusal[] = [];
  const companions = new Set<string>();
  const before: Record<string, string> = {};
  const working = new Map(contents);

  if (!entry) {
    return {
      edits: [], companions: [], resulting: {},
      refused: changes.map((c) => ({ requirementId: c.requirementId, text: c.text,
        reason: 'this package has no entry point Atelier may write to — without one there is nowhere a rule is guaranteed to be read' })),
      undo: { skillName, packageRoot, before: {} },
    };
  }

  for (const change of changes) {
    const current = working.get(entry.path) ?? '';
    const result = planPlacement(entry.kind === 'UNKNOWN' ? 'skill_methodology' : entry.kind, {
      requirementId: change.requirementId,
      requirementText: change.text,
      path: entry.path,
      currentContent: current,
      // the entry point IS the file being edited here, so its own running content is the entry content
      entryContent: current,
    });

    if (!result.ok) {
      refused.push({ requirementId: change.requirementId, text: change.text, reason: result.reason });
      continue;
    }
    if (!(entry.path in before)) before[entry.path] = contents.get(entry.path) ?? '';
    working.set(entry.path, applyEdit(current, result.edit));
    edits.push({ requirementId: change.requirementId, path: entry.path, edit: result.edit, why: result.reachability.why });
    for (const c of result.companions) companions.add(c);
  }

  const resulting: Record<string, string> = {};
  for (const path of Object.keys(before)) resulting[path] = working.get(path) ?? '';

  return { edits, refused, companions: [...companions], resulting, undo: { skillName, packageRoot, before } };
}

/** The heading a planned edit introduces, read back off the bytes rather than recomputed. */
function headingOf(e: PlannedEdit): string {
  const m = /^##\s+(.+)$/m.exec(e.edit.replace);
  return m ? m[1] : e.requirementId;
}

/** What the user reads before the bytes land. */
export function describeImprovement(plan: ImprovementPlan, skillName: string): string {
  if (!plan.edits.length && !plan.refused.length) {
    return `**${skillName}** already carries everything your examples imply. Nothing to write.\n`;
  }

  let out = '';
  if (plan.edits.length) {
    // GROUPED BY FILE. The first version printed one line per rule, so four rules landing in one
    // file produced the same path and the same rationale four times — output that looks like four
    // decisions and reports one. The rules are what differ, so the rules are what gets listed.
    const byPath = new Map<string, PlannedEdit[]>();
    for (const e of plan.edits) byPath.set(e.path, [...(byPath.get(e.path) ?? []), e]);

    out += `Writing ${plan.edits.length} rule(s) into your skill, across ${byPath.size} file(s):\n\n`;
    for (const [path, es] of byPath) {
      out += `  ${path}  — ${es[0].edit.rationale}\n`;
      for (const e of es) out += `      ${headingOf(e)}\n`;
    }
    out += `\n`;
  }

  if (plan.refused.length) {
    // Loud, because a silently dropped rule becomes a behavioural miss later and sends the next
    // diagnosis after a model that never received it.
    out += `**${plan.refused.length} rule(s) could NOT be written, and were not:**\n\n`;
    for (const r of plan.refused) out += `  ${r.text}\n    ${r.reason}\n`;
    out += `\nThese are still in your standard. They are simply not in the skill yet.\n\n`;
  }

  if (plan.companions.length) {
    out += `Before these take effect, they need:\n\n`;
    for (const c of plan.companions) out += `  ${c}\n`;
    out += `\nAtelier does not make these changes for you — they are edits to how your skill is wired.\n\n`;
  }

  return out;
}
