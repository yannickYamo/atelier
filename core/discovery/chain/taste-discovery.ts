// atelier/core/discovery/chain/taste-discovery.ts — THE TYPES THE LIVE CHAIN SHARES. THE LADDER IS GONE.
//
// This file held the taste-discovery chain's priority ladder: a deterministic fold of recurrence,
// discrimination and boundary evidence into ADVISORY / SUPPORTING / CORE, and the blueprint assembly
// on top of it. It was reachable only through `import type`, so the reachability census counted it
// as live while none of its logic ever ran — and the ladder's only route above ADVISORY was the
// discrimination channel, which is dark by policy, so wiring it would have capped every rule at advice.
//
// Deleted on the owner's ruling (2026-09-26): the product's path from evidence to weight is now the
// review screen's suggestion (`core/ratification/suggest.ts`) and the person's ruling, and the
// measurable part of anti-genericness is a counted rule (`core/observers/derive.ts`). What remains
// here are the types the discovery chain and the boundary probes still use.

import type { ConstructScope } from './construct-scope.js';
import type { Predicate } from './taste-factor.js';

/** A model-proposed taste factor — a HYPOTHESIS about the standard, never a requirement. */
export interface TasteFactorHypothesis {
  readonly proposedId: string;
  readonly description: string;            // "expert appears to prefer concise directional recommendations"
  readonly constructScope: ConstructScope;
  readonly appliesWhen: readonly Predicate[]; // conditional — taste is Q(y|x,S_u)
  /** a verbatim span showing the rule happening, when the proposer offered a locatable one */
  readonly quote?: string;
  readonly provenance: { readonly proposedBy: string; readonly fromGoldens: readonly string[] };
}

// ── External evidence inputs (per context — conditional) ──
export interface GoldenObservation { readonly contextId: string; readonly applicable: boolean; readonly present: boolean; }

export type BoundaryLevel = 'TOO_LITTLE' | 'ACCEPTABLE' | 'TOO_MUCH' | 'INDIFFERENT';
export interface BoundaryLabel { readonly contextId: string; readonly preferredLevel: BoundaryLevel; } // expert verdict near the boundary

/** A boundary probe the system generates for the expert to label (active boundary learning). */
export interface BoundaryProbe {
  readonly factorId: string;
  readonly contextId: string;
  readonly variants: readonly { readonly level: Exclude<BoundaryLevel, 'INDIFFERENT'>; readonly ref: string }[];
}
