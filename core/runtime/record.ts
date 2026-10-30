// atelier/core/runtime/record.ts — ONE PLACE A REAL EXECUTION BECOMES EVIDENCE.
//
// `runOnce` generated AND persisted, so the only way to record an invocation was to be the code
// that made the model call — and the host surface makes no model call Atelier can see. Claude Code
// serves the installed package itself; what Atelier gets is the hook's account: the prompt, the
// final message, the transcript. Persisting is therefore its own function, shared by the CLI path
// (which generated the output) and the host path (which witnessed it).
//
// What is recorded per requirement here is DETERMINISTIC — whether the package that produced this
// output is the one that was compiled — at the same grain the CLI path records, because evidence
// that differs by surface in SHAPE would quietly become evidence that cannot be pooled.

import * as store from '../state/store.js';
import type { InvocationRecord, StandardVersion } from '../state/canonical-state.js';
import type { RuntimeBinding } from './binding.js';
import { resolveFromFrozenText, admitsEvidence } from '../measurement/applicability.js';

/**
 * Persist one invocation: the record, the first-run binding, and the per-requirement delivery
 * observations. The record is BUILT by the caller — this function decides nothing about what
 * happened; it makes what happened durable, identically for every surface.
 */
export function persistInvocation(
  L: store.StoreLayout, rec: InvocationRecord, binding: RuntimeBinding, std: StandardVersion | null,
): void {
  store.putInvocation(L, rec);
  // FIRST RUN ESTABLISHES THE BINDING. Every later run of this SkillVersion is compared against it,
  // which is what stops evidence earned on one runtime from being read as evidence about another.
  store.recordBinding(L, rec.skillVersionHash, binding);

  // ── EVERY REAL INVOCATION FEEDS THE EVIDENCE STATE ─────────────────────────────────────────
  //
  // APPLICABILITY GATES EVIDENCE: an UNRESOLVED pair is recorded as such and contributes nothing,
  // because a case nobody established as applicable cannot say whether the rule held.
  const at = rec.at;
  for (const r of std?.requirements ?? []) {
    const app = resolveFromFrozenText(r, rec.inputHash);
    if (!admitsEvidence(app)) {
      store.appendEvent(L, { kind: 'APPLICABILITY_UNRESOLVED', requirementId: r.requirementId,
        contextId: rec.inputHash, invocationId: rec.invocationId, why: app.why, at });
      continue;
    }
    store.putObservation(L, {
      requirementId: r.requirementId, domain: 'DELIVERY', contextId: rec.inputHash, invocationId: rec.invocationId,
      generationIndex: store.listInvocations(L).filter((x) => x.inputHash === rec.inputHash).length - 1,
      verdict: rec.delivery.matched ? 'DELIVERED' : 'NOT_DELIVERED',
      producer: 'delivery-check', producerVersion: '1', authority: 'DETERMINISTIC',
      evidence: { expected: rec.delivery.expectedPackageHash, served: rec.delivery.servedPackageHash }, at });
  }
}
