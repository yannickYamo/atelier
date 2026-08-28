// atelier/core/contract/carrier-ablation.ts — CHANGE ONE CARRIER. CHANGE NOTHING ELSE.
//
// ─── WHY NOT A GLOBAL FORCE-PROSE ──────────────────────────────────────────────────────────────
//
// The obvious ablation rewrites every non-PROSE component to PROSE. On a standard carrying an
// EXAMPLE and a SELF_CHECK that tests both mechanisms at once, and a win cannot be attributed to
// either. It also contradicts the eligibility gate, which requires the study to NAME the mechanism
// it tests before firing. So the ablation is targeted: one requirement's carrier is replaced, every
// other compiler decision is left exactly as the compiler made it.
//
//     FULL      r1 PROSE   r2 EXAMPLE   r3 SELF_CHECK   r4 PROSE
//     ABLATED   r1 PROSE   r2 PROSE     r3 SELF_CHECK   r4 PROSE
//                          ^^^^^^^^ the only difference
//
// Then FULL - ABLATED isolates the EXAMPLE carrier on r2, and r3 stays in both arms as part of the
// held-constant background rather than becoming a second treatment.
//
// ─── THE ABLATION MUST NOT BE A STRAWMAN ───────────────────────────────────────────────────────
//
// Dropping a carrier must not drop what the carrier was carrying. If a requirement's shape was
// expressed as an OUTPUT_CONTRACT and the ablation simply omits it, the arms differ in WHAT is
// required, and a win says only that saying more helps. `assertSemanticClosure` refuses that: both
// arms must carry the same requirement ids with the same statements, differing only in mechanism.

import type { StandardVersion } from '../state/canonical-state.js';
import type { SkillArchitecture, ArchitectureComponent, Carrier } from '../architecture/compile.js';
import { compileArchitecture } from '../architecture/compile.js';
import { createHash } from 'node:crypto';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

export class AblationRefused extends Error {}

export interface Ablation {
  readonly architecture: SkillArchitecture;
  readonly targetRequirementId: string;
  readonly originalCarrier: Carrier;
  readonly ablatedCarrier: Carrier;
  /** every component id whose carrier is unchanged — the held-constant background */
  readonly unchangedComponentIds: readonly string[];
}

/**
 * Replace ONE requirement's carrier, leaving every other component byte-identical.
 *
 * Refuses when the target is not carried by the architecture, or is already the ablated carrier —
 * an ablation that changes nothing would produce two identical arms and a guaranteed null.
 */
export function ablateCarrier(
  v: StandardVersion, targetRequirementId: string, to: Carrier = 'PROSE',
): Ablation {
  const full = compileArchitecture(v);
  const target = full.components.find((c) => c.carries.includes(targetRequirementId));
  if (!target) {
    throw new AblationRefused(
      `no component carries ${targetRequirementId}, so there is nothing to ablate. `
      + `Components carry: ${full.components.flatMap((c) => c.carries).join(', ')}`);
  }
  if (target.carrier === to) {
    throw new AblationRefused(
      `${targetRequirementId} is already carried as ${to}. An ablation that changes nothing produces `
      + 'two identical arms and a guaranteed null that would read as "the mechanism does not help".');
  }
  if (target.carries.length > 1) {
    // A component carrying several requirements cannot be ablated for one of them without changing
    // the others, which is the attribution loss this module exists to avoid.
    throw new AblationRefused(
      `the component carrying ${targetRequirementId} also carries ${target.carries.filter((x) => x !== targetRequirementId).join(', ')}. `
      + 'Ablating it would change more than the named requirement.');
  }

  const components: ArchitectureComponent[] = full.components.map((c) =>
    c === target
      ? { ...c, carrier: to, sensor: to === 'PROSE' ? 'NONE' : c.sensor,
          rationale: `ABLATION: this requirement is carried as ${to} instead of ${c.carrier}, so that `
            + `${c.carrier} is the only thing that differs from the full compilation. Study arm only.` }
      : c);

  return {
    architecture: {
      architectureHash: sha(JSON.stringify(components.map((c) => [c.id, c.carries, c.carrier, c.sensor, c.gateRole]))),
      standardVersionHash: full.standardVersionHash,
      components,
    },
    targetRequirementId,
    originalCarrier: target.carrier,
    ablatedCarrier: to,
    unchangedComponentIds: full.components.filter((c) => c !== target).map((c) => c.id),
  };
}

/**
 * THE FAIRNESS CHECK, ENFORCED RATHER THAN INTENDED.
 *
 * Both arms must oblige the same things. Only the mechanism realising one of them may differ, and
 * exactly one component may differ at all — a second difference is a second treatment.
 */
export function assertSemanticClosure(full: SkillArchitecture, ablated: Ablation): void {
  const norm = (a: SkillArchitecture): string[] =>
    a.components.map((c) => `${c.carries.join('+')}|${c.gateRole}`).sort();
  const a = norm(full); const b = norm(ablated.architecture);
  if (a.join('\n') !== b.join('\n')) {
    throw new AblationRefused(
      'the arms do not carry the same requirements under the same gate roles, so this compares '
      + 'more-standard against less-standard rather than one realisation against another.');
  }
  const differing = full.components.filter((c, i) => c.carrier !== ablated.architecture.components[i]!.carrier);
  if (differing.length !== 1) {
    throw new AblationRefused(
      `${differing.length} components differ in carrier; a targeted ablation must differ in exactly one. `
      + `Differing: ${differing.map((c) => c.id).join(', ')}`);
  }
  if (!differing[0]!.carries.includes(ablated.targetRequirementId)) {
    throw new AblationRefused('the differing component is not the named target.');
  }
}

export const describeAblation = (ab: Ablation): string =>
  `ABLATE ${ab.targetRequirementId}: ${ab.originalCarrier} -> ${ab.ablatedCarrier}\n`
  + `  held constant: ${ab.unchangedComponentIds.length} components\n`
  + `  architecture ${ab.architecture.architectureHash}\n`
  + `  FULL - ABLATED isolates the ${ab.originalCarrier} carrier on this one requirement.`;
