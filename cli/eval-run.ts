// cli/eval-run.ts — ONE RUN'S EVALUATION, BUILT FROM ITS RECORD AND THE SKILL'S STORED STATE.
//
// `invoke` calls this once the run is recorded; the result is stored beside the record (core/state/eval-store.ts),
// carried by `--json`, and drawn as the panel (core/eval/summary.ts). Every figure is read from what the run
// recorded or the skill holds: the panel never computes a number the record does not support.

import * as store from '../core/state/store.js';
import * as fstore from '../core/state/fidelity-store.js';
import { acts, type VerifyReport, type RuleCheck } from '../core/observers/verify.js';
import { INCONCLUSIVE, UNREAD, CLAIMS_TO_CHECK, PUBLIC_FACTS } from '../core/loop/run-repair.js';
import { featureOf } from '../core/observers/features.js';
import { overlapIndex, STANDARD_WORDING_PIECES } from '../core/observers/overlap.js';
import { bandsFor } from '../core/fidelity/profile.js';
import { localiseBands } from '../core/fidelity/context.js';
import { QUALIFIED_READERS, DISPUTED_WHY, NO_MATERIAL } from '../core/loop/claim-extract.js';
import type { EvalSummary } from '../core/eval/summary.js';
import { buildRecord } from '../core/eval/record-build.js';
import { standingOf, type EvaluationRecord } from '../core/eval/record.js';
import type { InvocationRecord, StandardVersion } from '../core/state/canonical-state.js';
import type { FidelityProfile } from '../core/fidelity/types.js';
import type { ClaimSensor } from '../core/loop/claim-extract.js';
import type { RequestCoverage } from '../core/loop/context-judge.js';

/** A run of this many words repeated from a served piece of the author's is copying (cli/commands/invoke.ts). */
export const COPY_LIMIT = 12;
/**
 * The run that is a lifted passage FOR THIS AUTHOR: twelve words, or one more than their own pieces share with one
 * another where that is longer (core/observers/overlap.ts, `sharedAmong`). Read from the corpus, never set by kind.
 */
export const copyLimit = (voice: { readonly sharedAmong?: number } | null | undefined): number => Math.max(COPY_LIMIT, (voice?.sharedAmong ?? 0) + 1);

export interface RunEvalInput {
  readonly L: store.StoreLayout;
  readonly rec: InvocationRecord;
  readonly std: StandardVersion | null;
  readonly sensor: ClaimSensor | undefined;
  readonly claimsOff: boolean;
  /** answers list specifics by design; the patterns decide work and result claims */
  readonly answers: boolean;
  /** the kind of work, when the claim check was never measured on it (core/loop/claim-extract.ts, `unmeasuredKind`) */
  readonly unmeasured?: string | null;
  readonly profile: FidelityProfile | null;
  readonly format: { readonly words: string | null; readonly shape: 'SHAPE' | 'BARE' | null; readonly withheld: number };
  readonly taste: EvalSummary['monitors']['taste'];
  readonly costUsd: number;
  /** where the cost went, by purpose, and what the run sent the writer (core/eval/size.ts); both recorded as given */
  readonly spend?: EvalSummary['spend'];
  readonly sent?: EvalSummary['sent'];
  readonly durationMs: number;
  readonly drafts: number;
  readonly applicability: readonly { readonly requirementId: string; readonly status: 'APPLIED' | 'NOT_APPLICABLE' | 'WAIVED'; readonly why?: string }[];
  /** the full check of the delivered text (`checkDraftAsync`, as `verify` runs it); null when it could not run */
  readonly report: VerifyReport | null;
  /** a structured output (an output contract): held by its contract, not by prose rules */
  readonly contract: boolean;
  /** what the request asked for against the delivered text, when it was read (strict delivery) */
  readonly coverage?: RequestCoverage | null;
  /** the length the request states in words, against what was written; null when it states none */
  /** `met` null: the request states a length that could not be held to (another unit, or more than one reading) */
  readonly request?: { readonly asked: string; readonly met: boolean | null; readonly detail: string } | null;
  /** strict delivery: how many redraws were allowed, and whether a nonconformant output was let through by flag */
  readonly strict?: { readonly redraws: number; readonly allowed: boolean } | null;
}

export function buildRunEval(x: RunEvalInput): EvalSummary {
  const { rec, std } = x;
  const waived = new Set(x.applicability.filter((a) => a.status === 'WAIVED').map((a) => a.requirementId));
  const final = x.report;
  // REQUIRED RULES: every REQUIRED line of the full check of the delivered text (the standard's own rules, the
  // format's hard limits, the learned machine phrases), less those this run waived. The claim lines are their
  // own gate below. A structured output is held by its contract, not by prose rules.
  const req = x.contract ? [] : (final?.checked ?? []).filter((c) => acts(c) && c.result.verdict !== 'NOT_APPLICABLE'
    && !waived.has(c.requirementId) && !c.requirementId.startsWith('UNSOURCED'));
  const broken = req.filter((c) => c.result.verdict === 'VIOLATED').map((c) => ({ id: c.requirementId, detail: c.result.detail, label: shortLabel(c.statement) }));
  // THE CLAIM GATE, counted on the delivered text: spans still flagged on the gating line, spans unconfirmed,
  // whether the qualified reader could run; cut from the repair record.
  const line = (id: string): RuleCheck | undefined => final?.checked.find((c) => c.requirementId === id);
  const spans = (id: string): number => line(id)?.result.verdict === 'VIOLATED' ? line(id)?.result.spans.length ?? 0 : 0;
  const unread = Boolean(line(UNREAD));
  const state: EvalSummary['gates']['claims']['state'] = x.claimsOff ? 'off' : x.contract ? 'checked' : (!std || !final || unread) ? 'not-checked' : 'checked';
  const counts = x.contract ? { delivered: 0, unconfirmed: 0, cut: 0, listed: 0 } : {
    delivered: spans('UNSOURCED'), unconfirmed: spans(INCONCLUSIVE), cut: rec.repair?.storiesCut?.length ?? 0,
    listed: spans(CLAIMS_TO_CHECK) + spans(PUBLIC_FACTS) - disputedIn(line(PUBLIC_FACTS)), disputed: disputedIn(line(PUBLIC_FACTS)),
  };
  // The reader's repeatability on this very text (two reads, ./claim-extract.ts): served from the run's cache.
  const agreement = x.contract || state !== 'checked' ? null : x.sensor?.reading(rec.output)?.agreement ?? null;
  // The measured rates belong to one model at one prompt version, and only when it is the one deciding (not in an
  // answer, where patterns decide what is cut): no borrowed rates for an unqualified reader or the pattern check.
  const version = x.sensor?.version ?? null;
  const deciding = x.sensor?.qualified && x.sensor.gate === 'reader' && !x.sensor.degraded && !x.answers && !x.unmeasured;
  const q = deciding && version ? QUALIFIED_READERS.find((r) => r.version === version && r.measured && (x.sensor?.instrument.includes(r.model) ?? false)) : undefined;
  // COPYING: the longest run of words shared with a piece of the author's the skill serves.
  const voice = store.getVoice(x.L);
  const served = [...(voice?.passages ?? []), ...(voice?.pieces ?? [])];
  // Wording found in three or more pieces of the corpus is the author's standard wording, and is not counted.
  const longest = served.length ? overlapIndex(served, voice?.standardWording ?? [])(rec.output).longestShared : null;
  const formatLine = line('FORMAT');

  // WITH NO RECORD (a structured output held by its contract, or no standard at all) the engine's own bar stands:
  // these reasons decide nothing where a record exists.
  const reasons: string[] = [];
  if (broken.length) reasons.push(`${broken.length} required rule${broken.length === 1 ? '' : 's'} broken (${broken.map((b) => `${b.id} "${b.label}"`).join(', ')})`);
  if (state === 'off') reasons.push('invented claims not checked: turned off for this run (--allow-unsourced)');
  if (state === 'not-checked') reasons.push(std ? 'invented claims not checked: the claim reader could not run' : 'no standard to check against');
  if (state === 'checked' && counts.delivered) reasons.push(`${counts.delivered} invented claim(s) delivered`);
  if (state === 'checked' && counts.unconfirmed) reasons.push(`${counts.unconfirmed} specific(s) unconfirmed: confirm them or bind your material`);
  if (longest !== null && longest >= copyLimit(voice)) reasons.push(`a ${longest}-word run copied from your pieces`);
  if (x.request?.met === false) reasons.push(`the length the request asks for was not met (${x.request.detail})`);
  // THE RECORD (core/eval/record.ts): the same facts, each with what was observed of it, judged in one place.
  const record = x.contract || !std ? undefined : recordForText({ L: x.L, std, text: rec.output, report: final, sensor: x.sensor, claimsOff: x.claimsOff, answers: x.answers, unmeasured: x.unmeasured ?? null,
    waived: new Map(x.applicability.filter((a) => a.status === 'WAIVED').map((a) => [a.requirementId, a.why ?? 'set aside for this run'])), request: x.request ?? null, cut: counts.cut });
  // THE YES/NO KEPT WITH THE RUN IS THE RECORD'S (core/eval/record.ts, `standingOf`): nothing required was seen to
  // fail and every check finished. It is not "verified", and it is decided nowhere but there.
  const standing = record ? standingOf(record) : { deliverable: reasons.length === 0, reasons };

  // FIDELITY: the delivered text's reading, beside the author's held-back pieces read the same way.
  const reading = rec.fidelity?.reading ?? null;
  const p = x.profile;
  const fidelity: EvalSummary['fidelity'] = reading && p ? (() => {
    const ctx = rec.fidelity?.context ?? null;
    const base = bandsFor(p, reading.cls).bands;
    const bands = ctx ? localiseBands(base, ctx) : base;
    const band = (id: string): readonly [number, number] | null => bands.find((b) => b.id === id)?.band ?? null;
    const edits = rec.fidelity?.edits ?? [];
    return {
      inBand: reading.inBand, measured: reading.measured, baseline: p.baseline ?? null,
      pieces: Math.max(0, ...p.bands.filter((b) => b.cls === 'all').map((b) => b.n)), profile: p.hash,
      outside: reading.outside.slice(0, 3).map((o) => ({ id: o.id, label: featureOf(o.id)?.label.split(' (')[0] ?? o.id, value: reading.values[o.id] ?? null, band: band(o.id) })),
      facts: rec.fidelity?.coverage ? { used: rec.fidelity.coverage.used, supplied: rec.fidelity.coverage.supplied } : null,
      edits: { tried: edits.filter((e) => e.target !== '-').length, kept: edits.filter((e) => e.kept).length },
      ...(reading.typicality ? { typicality: { p: reading.typicality.p, distance: reading.typicality.distance,
        ...(reading.typicality.pieces ? { pieces: reading.typicality.pieces } : {}), ...(reading.typicality.weighted ? { weighted: true } : {}),
        ...(reading.typicality.beyond ? { beyond: true, farthest: reading.typicality.farthest ?? 0 } : {}) } } : {}),
      ...(ctx ? { context: { nearest: ctx.pieces.slice(0, 3).map((x) => x.id), nEff: ctx.nEff, lambda: ctx.lambda } } : {}),
      ...(rec.fidelity?.sampled ? { sampled: { among: rec.fidelity.sampled.among } } : {}),
      ...(rec.fidelity?.structure ? { structure: { moves: rec.fidelity.structure.plans[0]?.length ?? 0, followed: rec.fidelity.structure.followed } } : {}),
      ...(rec.fidelity?.shape ? (() => {
        const sh = rec.fidelity.shape; const kept = sh.rounds.find((r) => r.kept);
        return { shape: { target: sh.target, ...(sh.authorTarget !== undefined ? { authorTarget: sh.authorTarget } : {}), written: sh.rounds.length, kept: kept?.round ?? 0, p: kept?.p ?? 0, author: kept?.author ?? null } };
      })() : {}),
    };
  })() : null;
  const qual = p ? fstore.getQualification(x.L, p.hash) : null;
  const detectorQ = qual?.instruments.find((i) => i.kind === 'detector');
  const notMeasured = [
    'argument, stance and content (read by the taste reader, a monitor)',
    fidelity ? `voice beyond the ${fidelity.measured} counted features` : 'your range (this skill has no fidelity profile: build it from a corpus)',
  ];
  const vr = rec.fidelity?.voice ?? null;
  // CONTEXT: read from the record alone. The register decision when the owner declared one for the corpus; the
  // nearness the run read and what it used it for.
  const nr = rec.fidelity?.nearness ?? null;
  const context: EvalSummary['context'] = vr || nr ? {
    register: vr ? { status: vr.register.status, request: vr.register.request, corpus: vr.register.corpus, source: vr.register.source, words: vr.register.words ?? null } : null,
    subject: nr ? { source: nr.source, reader: nr.reader ?? null, fellBack: nr.fellBack ?? null, near: nr.pieces.length, of: nr.of, nEff: nr.nEff, thin: nr.thin,
      nearest: nr.pieces.slice(0, 3).map((x) => ({ id: x.id, grade: x.grade ?? null })), usedFor: nr.usedFor } : null,
  } : undefined;
  if (vr?.register.status === 'out') notMeasured.push('fidelity in another register: not measurable from this corpus, your policy was applied');
  return {
    schema: 1, invocationId: rec.invocationId, skill: x.L.skillName, skillVersion: rec.skillVersionHash, at: rec.at,
    release: rec.fidelity?.release ?? null, model: rec.observedRuntime.resolvedModel ?? rec.runtimeBinding.requestedModel ?? null,
    drafts: x.drafts, costUsd: Math.round(x.costUsd * 10000) / 10000, ...(x.spend ? { spend: x.spend } : {}), ...(x.sent ? { sent: x.sent } : {}), durationMs: Math.round(x.durationMs),
    result: { conformant: standing.deliverable, reasons: [...standing.reasons] }, ...(record ? { record } : {}),
    gates: {
      required: { held: req.length - broken.length, applicable: req.length, broken, ...(x.contract ? { contract: true } : {}) },
      claims: { state, ...counts, agreement, instrument: x.sensor?.instrument ?? null, answers: x.answers, ...(x.unmeasured ? { unmeasured: x.unmeasured } : {}),
        measured: q?.measured ? { caught: q.measured.caught, planted: q.measured.planted, leftAlone: q.measured.leftAlone, clean: q.measured.clean, on: q.measured.on } : null },
      copying: longest === null ? null : { longest, limit: copyLimit(voice) },
      format: { kind: x.format.shape === 'SHAPE' ? 'shape' : x.format.shape === 'BARE' ? 'bare' : 'none', words: x.format.words, withheld: x.format.withheld,
        held: formatLine ? formatLine.result.verdict !== 'VIOLATED' : null },
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
      ...(x.coverage ? { coverage: { asked: x.coverage.parts.length, given: x.coverage.parts.filter((p) => p.covered === true).length,
        missing: x.coverage.parts.filter((p) => p.covered === false).map((p) => p.words), unclear: x.coverage.parts.filter((p) => p.covered === null).length } } : {}),
    },
    ...(x.strict ? { delivery: { mode: 'strict' as const, delivered: standing.deliverable || x.strict.allowed, redraws: x.strict.redraws } } : {}),
    ...(vr ? { voice: { mode: vr.mode, register: { status: vr.register.status, request: vr.register.request, corpus: vr.register.corpus, distance: vr.register.distance },
      carried: vr.carried.length, notCarried: vr.notCarried.length,
      passed: (vr.paragraphs ?? []).filter((p) => p.kept).length, refused: (vr.paragraphs ?? []).filter((p) => !p.kept && p.check !== 'not-tried').length,
      bank: vr.bank ?? null, note: vr.note ?? null } } : {}),
    ...(context ? { context } : {}),
    notMeasured,
  };
}

const CLAIM_LINES = [INCONCLUSIVE, UNREAD, CLAIMS_TO_CHECK, PUBLIC_FACTS];
const isClaimLine = (id: string): boolean => id.startsWith('UNSOURCED') || CLAIM_LINES.includes(id);

/**
 * THE RECORD OF ONE TEXT AGAINST ONE STANDARD (core/eval/record.ts), from the check of it. `invoke` builds it for
 * the text it delivers and `verify` for the text it is handed: one function, so the two cannot say different things
 * about the same words under the same standard.
 */
export function recordForText(x: { L: store.StoreLayout; std: StandardVersion; text: string; report: VerifyReport | null; sensor: ClaimSensor | undefined; claimsOff: boolean; answers: boolean;
  unmeasured: string | null; waived?: ReadonlyMap<string, string>; request?: { asked: string; met: boolean | null; detail: string } | null; cut?: number }): EvaluationRecord {
  const line = (id: string): RuleCheck | undefined => x.report?.checked.find((c) => c.requirementId === id);
  const spans = (id: string): number => (line(id)?.result.verdict === 'VIOLATED' ? line(id)?.result.spans.length ?? 0 : 0);
  const state = x.claimsOff ? 'off' as const : !x.report || line(UNREAD) ? 'not-checked' as const : 'checked' as const;
  // WHETHER THE CLAIM CHECK MAY DECIDE IS DECIDED ONCE (core/loop/claim-extract.ts, `listsBecause`): where it may,
  // what it finds lands on the gating line and fails the text; where it may not, it is listed. The record says the same.
  // (And where the check did fail the text on its gating line, it decided: the record cannot say less than the check.)
  const deciding = !x.unmeasured || spans('UNSOURCED') > 0;
  const voice = store.getVoice(x.L); const served = [...(voice?.passages ?? []), ...(voice?.pieces ?? [])];
  const shared = served.length ? overlapIndex(served, voice?.standardWording ?? [], { words: true })(x.text) : null;
  return buildRecord({
    requirements: x.std.requirements, waived: x.waived ?? new Map(), request: x.request ?? null,
    checked: x.report ? x.report.checked.filter((c) => !isClaimLine(c.requirementId)).map((c) => ({ id: c.requirementId, statement: c.statement, required: acts(c), verdict: c.result.verdict, detail: c.result.detail })) : null,
    claims: { state, bound: x.unmeasured !== NO_MATERIAL || spans('UNSOURCED') > 0, qualified: deciding, why: x.unmeasured,
      delivered: spans('UNSOURCED'), open: spans(INCONCLUSIVE) + spans(CLAIMS_TO_CHECK) + spans(PUBLIC_FACTS), cut: x.cut ?? 0, unconfirmed: spans(INCONCLUSIVE) },
    // Wording found in three or more pieces of the corpus is the author's standard wording, and is not counted.
    copying: shared ? { longest: shared.longestShared, limit: copyLimit(voice), tellable: (voice?.lengthPieces ?? voice?.pieces?.length ?? 0) >= STANDARD_WORDING_PIECES, ...(shared.longestWords ? { words: shared.longestWords } : {}) } : null,
    replaced: new Set(x.request ? x.std.requirements.filter((r) => x.waived?.has(r.requirementId) && r.measurement?.observer === 'LENGTH' && !r.measurement.params.in).map((r) => r.requirementId) : []),
  });
}

/** Flags on the public-facts line that only one of the two reads raised. */
function disputedIn(l: RuleCheck | undefined): number {
  if (l?.result.verdict !== 'VIOLATED') return 0;
  return l.result.spans.filter((sp) => (sp as { why?: string }).why === DISPUTED_WHY).length;
}

/** A rule's statement cut to a short label at a word boundary: enough to say what the rule is. */
export function shortLabel(statement: string, max = 48): string {
  const s = statement.replace(/\s+/g, ' ').trim().replace(/[.:]$/, '');
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2)).replace(/[,;:]$/, '')}…`;
}
