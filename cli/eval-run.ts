// cli/eval-run.ts — ONE RUN'S EVALUATION, BUILT FROM ITS RECORD AND THE SKILL'S STORED STATE.
//
// `invoke` calls this once the run is recorded; the result is stored beside the record (core/state/eval-store.ts),
// carried by `--json`, and drawn as the panel (core/eval/summary.ts). Every figure is read from what the run
// recorded or the skill holds: the panel never computes a number the record does not support.

import * as store from '../core/state/store.js';
import * as fstore from '../core/state/fidelity-store.js';
import { verifyText } from '../core/observers/verify.js';
import { featureOf } from '../core/observers/features.js';
import { overlapIndex } from '../core/observers/overlap.js';
import { bandsFor } from '../core/fidelity/profile.js';
import { QUALIFIED_READERS } from '../core/loop/claim-extract.js';
import type { EvalSummary } from '../core/eval/summary.js';
import type { InvocationRecord, StandardVersion } from '../core/state/canonical-state.js';
import type { FidelityProfile } from '../core/fidelity/types.js';
import type { ClaimSensor } from '../core/loop/claim-extract.js';

/** A run of this many words repeated from a served piece of the author's is copying (cli/commands/invoke.ts). */
export const COPY_LIMIT = 12;

export interface RunEvalInput {
  readonly L: store.StoreLayout;
  readonly rec: InvocationRecord;
  readonly std: StandardVersion | null;
  readonly sensor: ClaimSensor | undefined;
  readonly claimsOff: boolean;
  /** answers list specifics by design; the patterns decide work and result claims */
  readonly answers: boolean;
  readonly profile: FidelityProfile | null;
  readonly format: { readonly words: string | null; readonly shape: 'SHAPE' | 'BARE' | null; readonly withheld: number };
  readonly taste: EvalSummary['monitors']['taste'];
  readonly costUsd: number;
  readonly durationMs: number;
  readonly drafts: number;
  readonly applicability: readonly { readonly requirementId: string; readonly status: 'APPLIED' | 'NOT_APPLICABLE' | 'WAIVED'; readonly why?: string }[];
}

/** The claims a run left in the text, cut, and listed, as its repair record says. */
function claimCounts(rec: InvocationRecord): { delivered: number; unconfirmed: number; cut: number; listed: number } {
  const after = rec.repair?.violatedAfter ?? [];
  const listed = rec.repair?.claimsToCheck?.length ?? 0;
  return {
    // The repair record keeps the broken line, not how many claims are on it: at least one.
    delivered: after.includes('UNSOURCED') ? 1 : 0,
    unconfirmed: after.includes('UNSOURCED·inconclusive') ? listed : 0,
    cut: rec.repair?.storiesCut?.length ?? 0,
    listed: after.includes('UNSOURCED·inconclusive') ? 0 : listed,
  };
}

export function buildRunEval(x: RunEvalInput): EvalSummary {
  const { rec, std } = x;
  // REQUIRED RULES: the standard's own measured rules on the delivered text, less those this run waived.
  const waived = new Set(x.applicability.filter((a) => a.status === 'WAIVED').map((a) => a.requirementId));
  const v = std ? verifyText(x.L.skillName, std, rec.output) : null;
  const req = (v?.checked ?? []).filter((c) => c.materiality === 'REQUIRED' && c.result.verdict !== 'NOT_APPLICABLE' && !waived.has(c.requirementId));
  const broken = req.filter((c) => c.result.verdict === 'VIOLATED').map((c) => ({ id: c.requirementId, detail: c.result.detail.slice(0, 80) }));
  // The claim floor's failures are their own gate, whatever repair recorded.
  const counts = claimCounts(rec);
  const unread = (rec.repair?.violatedAfter ?? []).includes('UNSOURCED·unread') || Boolean(x.sensor?.degraded && x.sensor.qualified && !x.answers);
  const state: EvalSummary['gates']['claims']['state'] = x.claimsOff ? 'off' : unread ? 'not-checked' : 'checked';
  const version = x.sensor?.version ?? null;
  const q = version ? QUALIFIED_READERS.find((r) => r.version === version && r.measured) : undefined;
  // COPYING: the longest run of words shared with a piece of the author's the skill serves.
  const voice = store.getVoice(x.L);
  const served = [...(voice?.passages ?? []), ...(voice?.pieces ?? [])];
  const longest = served.length ? overlapIndex(served)(rec.output).longestShared : null;

  const reasons: string[] = [];
  if (broken.length) reasons.push(`${broken.length} required rule${broken.length === 1 ? '' : 's'} broken (${broken.map((b) => b.id).join(', ')})`);
  if (state === 'not-checked') reasons.push('invented claims not checked: the claim reader could not run');
  if (state === 'checked' && counts.delivered) reasons.push('an invented claim was delivered');
  if (state === 'checked' && counts.unconfirmed) reasons.push(`${counts.unconfirmed} specific(s) unconfirmed: confirm them or bind your material`);
  if (longest !== null && longest >= COPY_LIMIT) reasons.push(`a ${longest}-word run copied from your pieces`);

  // FIDELITY: the delivered text's reading, beside the author's held-back pieces read the same way.
  const reading = rec.fidelity?.reading ?? null;
  const p = x.profile;
  const fidelity: EvalSummary['fidelity'] = reading && p ? (() => {
    const { bands } = bandsFor(p, reading.cls);
    const band = (id: string): readonly [number, number] | null => bands.find((b) => b.id === id)?.band ?? null;
    const edits = rec.fidelity?.edits ?? [];
    return {
      inBand: reading.inBand, measured: reading.measured, baseline: p.baseline ?? null,
      pieces: Math.max(0, ...p.bands.filter((b) => b.cls === 'all').map((b) => b.n)), profile: p.hash,
      outside: reading.outside.slice(0, 3).map((o) => ({ id: o.id, label: featureOf(o.id)?.label.split(' (')[0] ?? o.id, value: reading.values[o.id] ?? null, band: band(o.id) })),
      facts: rec.fidelity?.coverage ? { used: rec.fidelity.coverage.used, supplied: rec.fidelity.coverage.supplied } : null,
      edits: { tried: edits.filter((e) => e.target !== '-').length, kept: edits.filter((e) => e.kept).length },
    };
  })() : null;
  const qual = p ? fstore.getQualification(x.L, p.hash) : null;
  const detectorQ = qual?.instruments.find((i) => i.kind === 'detector');
  const notMeasured = [
    'argument, stance and content (read by the taste reader, a monitor)',
    fidelity ? `voice beyond the ${fidelity.measured} counted features` : 'your range (this skill has no fidelity profile: build it from a corpus)',
  ];
  return {
    schema: 1, invocationId: rec.invocationId, skill: x.L.skillName, at: rec.at,
    release: rec.fidelity?.release ?? null, model: rec.observedRuntime.resolvedModel ?? rec.runtimeBinding.requestedModel ?? null,
    drafts: x.drafts, costUsd: Math.round(x.costUsd * 10000) / 10000, durationMs: Math.round(x.durationMs),
    result: { conformant: reasons.length === 0, reasons },
    gates: {
      required: { held: req.length - broken.length, applicable: req.length, broken },
      claims: { state, ...counts, instrument: x.sensor?.instrument ?? null, answers: x.answers,
        measured: q?.measured ? { caught: q.measured.caught, planted: q.measured.planted, leftAlone: q.measured.leftAlone, clean: q.measured.clean, on: q.measured.on } : null },
      copying: longest === null ? null : { longest, limit: COPY_LIMIT },
      format: { kind: x.format.shape === 'SHAPE' ? 'shape' : x.format.shape === 'BARE' ? 'bare' : 'none', words: x.format.words, withheld: x.format.withheld },
      applicability: {
        applied: x.applicability.filter((a) => a.status === 'APPLIED').length,
        notApplicable: x.applicability.filter((a) => a.status === 'NOT_APPLICABLE').length,
        waived: x.applicability.filter((a) => a.status === 'WAIVED').map((a) => ({ id: a.requirementId, why: a.why ?? 'no reason recorded' })),
      },
    },
    fidelity,
    monitors: {
      detector: reading?.detector ? { p: reading.detector.p, families: reading.detector.families ?? [], qualified: detectorQ ? detectorQ.result.passes : null } : null,
      taste: x.taste,
    },
    notMeasured,
  };
}
