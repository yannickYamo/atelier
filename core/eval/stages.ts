// atelier/core/eval/stages.ts — THE RUN, STAGE BY STAGE, READ OFF ITS RECORD.
//
// A run is a sequence of stages (request read, questions, plan, served prompt, drafts, selection, repair, verdict, fix),
// and the record already keeps most of what each stage produced. For a month the output alone was judged, and when it
// lost, the stage at fault was guessed. Read stage by stage on 26 October 2026, the loss was at the first draft, the
// plan cost the most, and selection chose the worse draft seven times in ten; repair moved nothing. This module makes
// that read a function of the record, so a folder of runs can be read the same way on any day.
//
// Two rules from the record's own design and from what went wrong before:
//   - A stage says who decided it (code, a model, the floor, or off). A reading that fell to its floor is a fact of the
//     run, not a line in a log nobody reads (the persona reading fell to its floor on every long build for a week).
//   - Every count here is by code on the stored text. A judge may read the texts a stage keeps; it never supplies the
//     counts, and the first failing hard check is reported before any judged difference (a run that gets further
//     reports more, and reads worse, while being better).
//
// WHAT IS SERVED IS CHECKED ON THE BYTES. A layer counts as present or absent by the markers the composer itself writes
// into the served prompt (cli/served.ts, core/loop/piece-plan.ts, core/loop/questions.ts, core/loop/execution-brief.ts),
// never by the flag that was meant to turn it off. The markers are fixed strings of Atelier's own; this is a parser of
// Atelier's form, not a reading of anyone's meaning.
import { createHash } from 'node:crypto';
import type { InvocationRecord } from '../state/canonical-state.js';
import { DASH, findTells } from '../observers/tells.js';
import { proseSentencesOf, proseWordsOf } from '../observers/text.js';
import { FOR_THIS_REQUEST } from '../fidelity/request-notes.js';

export const RUN_STAGES = ['intake', 'readings', 'material', 'questions', 'plan', 'served', 'drafts', 'selection', 'repair', 'verdict', 'fix'] as const;
export type RunStageId = (typeof RUN_STAGES)[number];
export type StageBy = 'code' | 'model' | 'floor' | 'off' | 'unknown';
export type Count = number | string | boolean | null;

export interface StageEntry {
  readonly id: RunStageId;
  /** who decided this stage: code, a model, the floor a failed reading fell to, off (not run), or unknown (older record) */
  readonly by: StageBy;
  /** the text this stage produced, where the record keeps one (the first draft, the delivered text, the unchosen drafts) */
  readonly texts: readonly string[];
  /** counts by code on the record and its texts; a judge never writes one */
  readonly counts: Readonly<Record<string, Count>>;
  /** a hard check this stage failed, by code, or null */
  readonly failed: string | null;
  readonly note: string | null;
}

/** THE LAYERS OF A SERVED PROMPT, by the composer's own markers. */
export interface ServedBlocks {
  readonly persona: boolean;
  readonly repertoire: boolean;
  readonly examples: number;
  readonly forThisRequest: boolean;
  readonly plan: boolean;
  readonly answers: boolean;
  readonly assumed: boolean;
  readonly brief: boolean;
  readonly points: boolean;
  readonly latitude: boolean;
}
export interface ServedLayers { readonly hash: string; readonly bytes: number; readonly blocks: ServedBlocks }

const MARK = {
  persona: /(?:^|\n)How I sound \(/,
  repertoire: /(?:^|\n)Moves I make in some pieces, not most \(/,
  example: /=== REFERENCE MATERIAL — PRIVATE CONTEXT, NOT PART OF YOUR OUTPUT ===|(?:^|\n)<example(?:\s|>)/g,
  plan: /(?:^|\n)The plan for this piece \(write the piece from it/,
  answers: /(?:^|\n)Before writing I settled these \(my answers; write from them\):/,
  assumed: /(?:^|\n)Not settled: nobody answered these, so each is a working assumption/,
  brief: /(?:^|\n)For this request, my method's steps that apply: /,
  points: /(?:^|\n)(?:The notes (?:below|above) are points|These points are the material for this piece)/,
  latitude: /(?:^|\n)(?:Latitude|How strictly this is held)\b/,
} as const;

export const hashOf = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** The layers a served prompt holds, read off its bytes. */
export function servedLayersOf(served: string): ServedLayers {
  const examples = (served.match(/(?:^|\n)<example(?:\s|>)/g) ?? []).length;
  return {
    hash: hashOf(served), bytes: Buffer.byteLength(served, 'utf8'),
    blocks: {
      persona: MARK.persona.test(served), repertoire: MARK.repertoire.test(served),
      examples: examples || (served.includes('=== REFERENCE MATERIAL') ? 1 : 0),
      forThisRequest: served.includes(FOR_THIS_REQUEST.trim()),
      plan: MARK.plan.test(served), answers: MARK.answers.test(served), assumed: MARK.assumed.test(served),
      brief: MARK.brief.test(served), points: MARK.points.test(served), latitude: MARK.latitude.test(served),
    },
  };
}

export interface TextCounts {
  readonly words: number; readonly sentences: number; readonly medianSentence: number | null; readonly shortShare: number | null;
  readonly dashes: number; readonly tells: number;
}
/** Counts on one text, by code: words, sentences, the median sentence, the share of sentences of five words or fewer, dashes, tells. */
export function textCounts(text: string): TextCounts {
  const ss = proseSentencesOf(text);
  const lens = ss.map((s) => s.words).sort((a, b) => a - b);
  const median = lens.length ? (lens.length % 2 ? lens[(lens.length - 1) / 2] : (lens[lens.length / 2 - 1] + lens[lens.length / 2]) / 2) : null;
  const re = new RegExp(DASH.source, DASH.flags.includes('g') ? DASH.flags : `${DASH.flags}g`);
  return { words: proseWordsOf(text), sentences: ss.length, medianSentence: median,
    shortShare: ss.length ? Math.round((100 * ss.filter((s) => s.words <= 5).length) / ss.length) / 100 : null,
    dashes: (text.match(re) ?? []).length, tells: findTells(text).length };
}

/** The share of `after`'s sentences not found in `before`, by sentence text: what a pass changed. */
export function changedShare(before: string, after: string): number | null {
  const was = new Set(proseSentencesOf(before).map((s) => s.text.trim()));
  const now = proseSentencesOf(after).map((s) => s.text.trim());
  if (!now.length) return null;
  return Math.round((100 * now.filter((s) => !was.has(s)).length) / now.length) / 100;
}

const prefixed = (p: string, c: TextCounts): Record<string, Count> =>
  Object.fromEntries(Object.entries(c).map(([k, v]) => [`${p}.${k}`, v]));

/** THE STAGES OF ONE RUN, read off its record and nothing else. An older record says `unknown` where it kept nothing. */
/** What was decided about the output, from the evaluation stored beside the record (the record itself is written before the decision and never rewritten). */
export interface Decided { readonly delivery?: { readonly decision: string; readonly budget?: { readonly budget: number; readonly shipsGood: number; readonly steered: readonly unknown[] } } | null }

export function stagesOf(r: InvocationRecord, decided: Decided = {}): StageEntry[] {
  const out: StageEntry[] = [];
  const entry = (e: Omit<StageEntry, 'texts' | 'counts' | 'failed' | 'note'> & Partial<StageEntry>): void => { out.push({ texts: [], counts: {}, failed: null, note: null, ...e }); };
  const s = r.settings; const cert = s?.certificate;
  // intake: the request and how the run was asked for, and the kind of run the passes' conditions read (core/loop/profile.ts)
  const pf = s?.profile;
  entry({ id: 'intake', by: 'code', texts: [r.input], counts: { words: proseWordsOf(r.input), drafts: s?.flags.drafts ?? null, surface: r.invocationSurface, source: r.request.source,
    ...(pf ? { 'profile.structured': pf.structured, 'profile.stated.length': pf.stated.length, 'profile.stated.shape': pf.stated.shape, 'profile.stated.parts': pf.stated.parts,
      'profile.pieces.range': pf.pieces.range, 'profile.pieces.pairs': pf.pieces.pairs, 'profile.pieces.skeleton': pf.pieces.skeleton, 'profile.pieces.examples': pf.pieces.examples,
      'profile.register': pf.register, 'profile.judge': pf.judge } : {}) } });
  // readings: what was read of the request before anything was written
  const brief = s?.flags.brief; const moves = brief?.moves;
  entry({ id: 'readings', by: brief?.by ?? (s ? 'off' : 'unknown'),
    counts: { 'brief.applies': brief?.applies.length ?? null, 'brief.setAside': brief?.setAside.length ?? null, 'brief.unresolved': brief?.unresolved?.length ?? null,
      'moves.by': moves?.by ?? null, 'moves.placed': moves?.placed.length ?? null, 'latitude.run': cert?.latitude?.run ?? null, 'latitude.setBy': cert?.latitude?.setBy ?? null,
      worksOn: r.worksOn ?? null } });
  // material: what the writer was given to write from, and what the delivered work copied of it
  const cp = r.copied;
  entry({ id: 'material', by: cp ? 'code' : r.worksOn ? 'code' : 'off', counts: { 'copied.runs': cp?.runs ?? null, 'copied.longest': cp?.longest ?? null, 'copied.repairAt': cp?.repairAt ?? null,
    'corrections.removed': r.corrections?.removed ?? null, 'corrections.reintroduced': r.corrections?.reintroduced.length ?? null },
    failed: cp && cp.longest >= cp.repairAt ? `a copied stretch of ${cp.longest} words stands (repaired at ${cp.repairAt})` : r.corrections?.reintroduced.length ? 'a corrected phrase came back' : null });
  // questions: what only the author knows, asked or assumed
  const pw = r.prewrite;
  const byPerson = pw?.answers.filter((a) => a.by === 'person').length ?? 0; const byDefault = pw?.answers.filter((a) => a.by === 'default').length ?? 0;
  entry({ id: 'questions', by: pw ? pw.questionsBy : 'unknown', texts: pw?.questions.map((q) => `${q.id}: ${q.ask}`) ?? [],
    counts: { asked: pw?.questions.length ?? null, byPerson, byDefault, told: pw?.answers.filter((a) => a.by === 'told').length ?? null,
      angleAsked: pw ? pw.questions.some((q) => q.id === 'angle') : null } });
  // plan: the piece's plan, and how much of the material it carried
  const plan = pw?.plan ?? null;
  entry({ id: 'plan', by: pw ? pw.planBy : 'unknown', texts: plan ? [[`Angle: ${plan.angle}`, ...plan.points.map((p, i) => `Point ${i + 1}: ${p.point}`)].join('\n')] : [],
    counts: { use: plan?.use ?? null, points: plan?.points.length ?? null, leftOut: plan?.leftOut.length ?? null, changes: pw?.planChanges ?? null }, note: pw?.noPlan ?? null });
  // served: the prompt the writer was given, by its layers
  const sv = r.served;
  entry({ id: 'served', by: sv ? 'code' : 'unknown', counts: sv ? { hash: sv.hash, bytes: sv.bytes, ...Object.fromEntries(Object.entries(sv.blocks).map(([k, v]) => [`block.${k}`, v])) } : {} });
  // drafts: what was written, before anything was chosen or repaired
  const sel = r.selection; const first = r.repair?.draft ?? null;
  entry({ id: 'drafts', by: 'model', texts: first ? [first] : [], counts: { written: sel?.written ?? sel?.drafts ?? 1, failed: sel?.failed?.length ?? 0, spared: sel?.spared ?? null,
    ...(first ? prefixed('first', textCounts(first)) : {}) } });
  // selection: which draft was kept, and the ones that were not
  entry({ id: 'selection', by: sel && sel.drafts > 1 ? 'code' : 'off', texts: sel?.unchosen ?? [],
    counts: { drafts: sel?.drafts ?? 1, chosen: sel?.chosen ?? 0, unchosen: sel?.unchosen?.length ?? 0, truncated: sel?.unchosenTruncated ?? false, why: sel?.why ?? null } });
  // repair: every pass after the draft, and what it changed; the route says which passes the chain composed (core/loop/route.ts)
  const rp = r.repair;
  const ctl = rp?.controller;
  entry({ id: 'repair', by: rp ? (rp.passes > 0 || (rp.edits?.accepted ?? 0) > 0 || ctl?.decisions.length ? 'model' : 'off') : 'off', texts: [r.output],
    counts: { passes: rp?.passes ?? 0, violatedBefore: rp?.violatedBefore.length ?? 0, violatedAfter: rp?.violatedAfter.length ?? 0, accepted: rp?.edits?.accepted ?? null, rejected: rp?.edits?.rejected ?? null,
      'controller.decisions': ctl?.decisions.length ?? null, 'controller.stopped': ctl?.stoppedBecause ?? null, 'taste.fixed': rp?.taste?.fixed.length ?? null, meaningLost: rp?.meaningLost?.length ?? null,
      changedShare: first ? changedShare(first, r.output) : null, ...prefixed('out', textCounts(r.output)), outside: r.work?.outside ? proseWordsOf(r.work.outside) : 0,
      ...Object.fromEntries((s?.route?.passes ?? []).map((p) => [`route.${p.name}`, p.on])) },
    failed: rp?.violatedAfter.length ? `${rp.violatedAfter.length} required rule(s) still broken after repair: ${rp.violatedAfter.join(', ')}` : null, note: rp?.why ?? null });
  // verdict: what was decided about the output, and why
  // INTERRUPTIONS: what the run asked of the person, before the work (questions) and after it (held for review, or
  // blocked). Counted beside the false-stop budget, and read like it: a rise is a regression.
  const dv = decided.delivery ?? null; const decision = dv?.decision ?? cert?.delivery ?? null; const budget = dv?.budget ?? null;
  const stopped = decision === 'PERSON' || decision === 'BLOCK' ? 1 : 0;
  entry({ id: 'verdict', by: cert ? 'code' : 'unknown', counts: { delivery: decision, why: cert?.why ?? null, 'checks.total': cert?.checks.total ?? null, 'checks.counted': cert?.checks.counted ?? null,
    'checks.writtenQualified': cert?.checks.writtenQualified ?? null, withheld: r.delivery.withheldRules?.length ?? 0, matched: r.delivery.matched,
    'budget.allowed': budget?.budget ?? null, 'budget.shipsGood': budget ? Math.round(budget.shipsGood * 1000) / 1000 : null, 'budget.steered': budget?.steered.length ?? null,
    interruptions: cert || dv ? (pw?.questions.length ?? 0) + stopped : null },
    failed: decision === 'BLOCK' ? `blocked: ${cert?.why ?? ''}` : !r.delivery.matched ? 'the served package did not match the expected one' : null });
  // fix: a fix in place, held to the person's words
  const fx = r.fix;
  entry({ id: 'fix', by: fx ? fx.by : 'off', texts: fx?.spans.map((p) => `- ${p.before}\n+ ${p.after}`) ?? [],
    counts: { changed: fx?.diff.changed ?? null, outside: fx?.diff.outside ?? null, total: fx?.diff.total ?? null, unchanged: fx?.unchanged?.length ?? null, reintroduced: fx?.reintroduced.found.length ?? null },
    failed: fx && fx.diff.outside > 0 ? `${fx.diff.outside} sentence(s) changed outside the ones named` : fx?.reintroduced.found.length ? 'a removed phrase came back' : null });
  return out;
}

/** The first stage whose hard check failed, in run order: read before any judged difference. */
export const failedStage = (stages: readonly StageEntry[]): StageEntry | null => stages.find((s) => s.failed) ?? null;

/** One line per stage for the screen. */
export function renderStages(stages: readonly StageEntry[]): string[] {
  const show = (v: Count): string => v === null ? '–' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v);
  return stages.map((s) => {
    const counts = Object.entries(s.counts).filter(([, v]) => v !== null && v !== '').map(([k, v]) => `${k}=${show(v)}`).join(' ');
    return `${s.id.padEnd(10)} ${s.by.padEnd(7)} ${counts}${s.failed ? `  ✗ ${s.failed}` : ''}${s.note ? `  (${s.note})` : ''}`;
  });
}
