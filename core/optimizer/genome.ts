// atelier/core/optimizer/genome.ts — WHAT A SEARCH MAY CHANGE: ONLY WHAT THE COMPILER DERIVES.
//
// Prompt optimizers (GEPA, SkillOpt, SSO) search over the text of the prompt itself, and the text of a
// prompt is also where the objective lives. A search that can rewrite "never use em dashes" into
// something easier to satisfy will find that it scores better, and it will be right, and it will
// have moved the target.
//
// Atelier's search space is narrower by construction and larger than "carriers only": everything the
// compiler derives deterministically from a ratified standard plus a small set of settings. The package
// is always REBUILT from the standard, never edited, so no point in this space can change what a rule
// says, whether it is required, or when it applies (Constraint B, asserted where a candidate is minted).
//
//   carriers   how each rule reaches the model: stated (PROSE), checked against the draft (SELF_CHECK),
//              shown (EXAMPLE), or enforced as a shape (OUTPUT_CONTRACT). Legal values come from the
//              rule's own typed properties (../architecture/replace-carrier.ts), never its materiality.
//   exemplar   whether the owner's exemplar piece ships (only when there is one)
//   contrast   whether the write-this-not-that pairs ship (only when there are any)
//
// One mutation changes one gene. SkillOpt's edit budget, taken literally: a candidate that changes one
// thing can be credited or blamed for one thing.

import type { Carrier, SkillArchitecture } from '../architecture/compile.js';
import type { Requirement, StandardVersion } from '../state/canonical-state.js';
import { eligibleCarriers } from '../architecture/replace-carrier.js';

export interface Genome {
  /** requirementId → carrier, for every rule carried alone by one component */
  readonly carriers: Readonly<Record<string, Carrier>>;
  readonly exemplar: boolean;
  readonly contrast: boolean;
}

export type Mutation =
  | { readonly kind: 'CARRIER'; readonly requirementId: string; readonly from: Carrier; readonly to: Carrier }
  | { readonly kind: 'EXEMPLAR'; readonly on: boolean }
  | { readonly kind: 'CONTRAST'; readonly on: boolean };

/** The genome a built version expresses. Rules sharing a component are left out: moving one would split them. */
export function genomeOf(arch: SkillArchitecture, files: Readonly<Record<string, string>>): Genome {
  const carriers: Record<string, Carrier> = {};
  for (const c of arch.components) if (c.carries.length === 1 && c.carrier !== 'NONE') carriers[c.carries[0]] = c.carrier;
  return { carriers, exemplar: 'examples/exemplar.md' in files, contrast: 'examples/contrast.md' in files };
}

/** Every single-gene change that is legal from here. */
export function mutationsOf(g: Genome, v: StandardVersion, available: { exemplar: boolean; contrast: boolean }): Mutation[] {
  const byId = new Map(v.requirements.map((r) => [r.requirementId, r]));
  const out: Mutation[] = [];
  for (const [id, from] of Object.entries(g.carriers)) {
    const r = byId.get(id);
    if (!r || r.authority === 'EXPERT_REJECTED' || r.materiality === 'INCIDENTAL') continue;
    for (const to of eligibleCarriers(r)) if (to !== from) out.push({ kind: 'CARRIER', requirementId: id, from, to });
  }
  if (available.exemplar) out.push({ kind: 'EXEMPLAR', on: !g.exemplar });
  if (available.contrast) out.push({ kind: 'CONTRAST', on: !g.contrast });
  return out;
}

export const describeMutation = (m: Mutation, rules?: ReadonlyMap<string, Requirement>): string =>
  m.kind === 'CARRIER' ? `${m.requirementId}${rules?.get(m.requirementId) ? ` ("${rules.get(m.requirementId)!.statement.slice(0, 50)}")` : ''}: ${m.from} → ${m.to}`
    : m.kind === 'EXEMPLAR' ? `${m.on ? 'ship' : 'drop'} the exemplar`
      : `${m.on ? 'ship' : 'drop'} the contrast examples`;

export const mutationKey = (m: Mutation): string =>
  m.kind === 'CARRIER' ? `C|${m.requirementId}|${m.from}|${m.to}` : `${m.kind}|${m.on}`;
