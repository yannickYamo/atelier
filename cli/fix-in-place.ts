// cli/fix-in-place.ts — `atelier fix` CHANGES WHAT WAS NAMED AND KEEPS THE REST WORD FOR WORD.
//
// `atelier fix "<what to change>"` writes the run again with `--fix-of <the version of the piece complained of>`. Here the
// run does not draft at all: a reading locates the sentences the person's words are about (core/loop/surgical-fix.ts);
// only those are written again and spliced in by code, so nothing outside them can change; the whole piece is checked
// again against the standard and read against the author's range; and the terminal and the record show the diff
// (sentences changed of total, every span's before and after). Where the reading says the words are about the whole
// piece, or no model can read them, nothing happens here and the run writes the piece again whole, as it always did.
//
// What each fix removes is kept on its record (core/loop/corrections.ts): the next fix of the piece, or a run that writes
// it again whole, may not bring it back.

import * as store from '../core/state/store.js';
import * as fstore from '../core/state/fidelity-store.js';
import { putEval } from '../core/state/eval-store.js';
import type { InvocationRecord, SkillVersion, StandardVersion } from '../core/state/canonical-state.js';
import type { InferenceClient } from '../core/inference/client.js';
import { processSpentUsd } from '../core/inference/client.js';
import { readContext } from '../core/inference/reading.js';
import { sentencesOf } from '../core/observers/text.js';
import { FIX_SCOPE, fixSpans, sentenceDiff } from '../core/loop/surgical-fix.js';
import { removedStretches, reintroducedRuns } from '../core/loop/corrections.js';
import { checkDraftAsync } from '../core/loop/run-repair.js';
import { readFidelity } from '../core/fidelity/profile.js';
import { recordHead } from '../core/eval/certificate.js';
import { deliveryLine } from '../core/eval/consequence.js';
import { stateLine } from '../core/eval/run-card.js';
import { checksFor, contextJudgeModel } from './checks.js';
import { buildRunEval } from './eval-run.js';
import { sha, argv, flag, numericFlag, runFile, contextReaderClient, boundMaterial } from './runtime.js';
import { writeAtomic } from '../core/state/fs-atomic.js';
import { resolve as resolvePath } from 'node:path';

/** Every stretch the fixes of piece `of` have taken out of it so far, oldest first. */
export function removedOfPiece(L: store.StoreLayout, of: string): string[] {
  return [...new Set(store.listInvocations(L).filter((r) => r.fix?.of === of).reverse().flatMap((r) => r.fix?.removed ?? []))];
}

export interface FixInPlace {
  readonly L: store.StoreLayout; readonly sv: SkillVersion; readonly std: StandardVersion; readonly name: string; readonly asked: string;
  /** the version of the piece to change, by its run */
  readonly fixOf: string;
  readonly material: readonly { readonly name: string; readonly text: string }[]; readonly materialText: string;
  /** the writer, made only once the reading has located spans to write */
  readonly writer: () => InferenceClient;
  /** what a run says, as invoke keeps it */
  readonly say: (line: string) => void;
  /** the settings the run was written under, as typed */
  readonly settings: readonly string[];
}

/** Two short lines a person reads of one span changed. */
const shown = (s: string): string => { const one = s.replace(/\s+/g, ' ').trim(); return one.length > 160 ? `${one.slice(0, 157)}…` : one || '(cut)'; };

/**
 * THE FIX, IN PLACE: null when the piece is to be written again whole (the reading says the words are about the whole
 * piece, no model could read them, or the version to fix is not on record); otherwise the piece as changed, the JSON a
 * machine reads, and the run's exit code.
 */
export async function fixInPlace(c: FixInPlace): Promise<{ output: string; json: Record<string, unknown>; exit: number } | null> {
  const started = Date.now(); const spentBefore = processSpentUsd();
  const prev: InvocationRecord | null = store.getInvocation(c.L, c.fixOf);
  if (!prev?.output.trim()) { c.say('(The version of the piece to change is not on record, so it is written again whole.)'); return null; }
  const instruction = (flag('--complaint') ?? flag('--correcting') ?? '').trim();
  const of = flag('--corrections-of') ?? prev.fix?.of ?? prev.invocationId;
  const piece = prev.output;
  const sentences = sentencesOf(piece).map((s) => s.text);
  const model = contextJudgeModel();
  const scope = await readContext(FIX_SCOPE, { instruction, sentences }, model ? contextReaderClient() : null, model, { spentUsd: 0, capUsd: 0.05, maxCalls: 1 });
  if (scope.value.kind === 'WHOLE') {
    c.say(scope.by === 'model' ? 'What you asked is about the whole piece, so it is written again whole.'
      : `Which sentences "${instruction.slice(0, 80)}" is about could not be read (${scope.why ?? 'nothing to read'}), so the piece is written again whole.`);
    return null;
  }
  const ids = scope.value.ids;
  const removed = removedOfPiece(c.L, of);
  const budget = { spentUsd: 0, capUsd: numericFlag('--cap', 1), maxCalls: numericFlag('--max-calls', 2 * ids.length + 2) };
  const r = await fixSpans(c.writer(), budget, piece, ids, instruction, removed);
  const diff = sentenceDiff(piece, r.text, ids);
  const spans = r.applied.map((a) => ({ before: a.before, after: a.after })).reverse();
  const removedNow = removedStretches(spans, r.text);
  const lines: string[] = [`Changed ${diff.changed} of ${diff.total} sentences (you named ${ids.length === 1 ? `sentence ${ids[0]}` : `sentences ${ids.join(', ')}`}); ${diff.outside === 0 ? 'nothing outside them changed' : `${diff.outside} outside them changed`}.`];
  for (const s of spans) lines.push(`  - ${shown(s.before)}`, `  + ${shown(s.after)}`);
  for (const v of r.reverted) lines.push(`  (span ${v.id} kept as it was: ${v.lost.join('; ')})`);
  if (r.reintroduced.found.length) lines.push(`Wording an earlier fix took out came back in ${r.reintroduced.rewritten} span(s) and was written again${r.reintroduced.keptAsItWas ? `; ${r.reintroduced.keptAsItWas} span(s) brought it back again and were kept as they were` : ''}: ${r.reintroduced.found.map((x) => `"${shown(x)}"`).join(', ')}.`);
  else if (removed.length) lines.push(`Nothing earlier fixes of this piece took out (${removed.length} stretch(es)) came back.`);
  if (r.work.some((w) => w.outside)) lines.push('(What the writer said outside its work field is kept on the record, never in the piece.)');
  // THE WHOLE PIECE, CHECKED AGAIN: the standard, and the author's range where the skill has one.
  const checks = { ...checksFor(c.L, { material: c.materialText, task: c.asked, context: { request: c.asked, material: c.material }, guardClaims: !argv.includes('--allow-unsourced') }),
    ...(removed.length ? { removed: { phrases: removed, previous: piece } } : {}) };
  const report = await checkDraftAsync(c.name, c.std, r.text, checks).catch(() => null);
  const profile = fstore.getProfile(c.L);
  if (profile) {
    const a = readFidelity(piece, profile); const b = readFidelity(r.text, profile);
    lines.push(b.measured ? `Your range: ${b.inBand} of ${b.measured} of your counted features inside it (before the fix: ${a.inBand} of ${a.measured}).` : 'Your range: none of your counted features steer on this skill yet.');
  }
  const at = new Date().toISOString();
  const back = removed.length ? reintroducedRuns(r.text, removed, piece).map((x) => x.text) : [];
  const rec: InvocationRecord = { ...prev, invocationId: `i${sha(`${c.sv.skillVersionHash}|fix|${prev.invocationId}|${instruction}|${at}`).slice(0, 10)}`, at,
    provenance: 'FIX_EVALUATION', outputHash: sha(r.text), output: r.text, repair: undefined, selection: undefined,
    work: r.work.every((w) => w.delimited) ? { delimited: true, ...(r.work.some((w) => w.outside) ? { outside: r.work.map((w) => w.outside ?? '').filter(Boolean).join('\n\n').slice(0, 2000) } : {}) } : { delimited: false },
    fix: { of, from: prev.invocationId, instruction, by: scope.by, sentences: ids, diff, spans, removed: removedNow, reintroduced: r.reintroduced },
    ...(removed.length ? { corrections: { removed: removed.length, reintroduced: back } } : {}) };
  store.putInvocation(c.L, rec);
  const spent = Math.max(budget.spentUsd, processSpentUsd() - spentBefore);
  let evaluation: ReturnType<typeof buildRunEval> | null = null;
  try {
    evaluation = buildRunEval({ L: c.L, rec, std: c.std, sensor: checks.claimSensor, claimsOff: argv.includes('--allow-unsourced'), answers: checks.format?.claims === 'list', unmeasured: checks.listsBecause ?? null,
      claimAct: checks.claimAct, material: checks.evidence ?? '', profile, format: { words: null, shape: null, withheld: 0 }, taste: null, costUsd: spent, durationMs: Date.now() - started,
      drafts: 1, report, contract: false, applicability: [] });
    putEval(c.L, evaluation);
  } catch (e) { lines.push(`(the evaluation of the fixed piece could not be built: ${(e as Error).message.split('\n')[0]})`); }
  const record = evaluation?.record ?? null;
  if (record) lines.push(`${record.state.replace('_', ' ')} · ${stateLine(record)}${record.delivery ? ` · ${deliveryLine(record.delivery)}` : ''}`);
  for (const l of lines) c.say(l);
  // What `atelier fix` needs to change this piece again: this version, what was asked, and the files given with it.
  writeAtomic(runFile('last-invocation.json'), JSON.stringify({ invocationId: rec.invocationId, skillName: c.name, input: rec.input, at, asked: c.asked,
    with: boundMaterial().filter((m) => m.path).map((m) => ({ name: m.name, path: resolvePath(m.path) })), settings: c.settings, skillVersion: c.sv.skillVersionHash }, null, 1));
  const exit = record?.delivery?.decision === 'BLOCK' ? 1 : 0;
  const json = { ...recordHead({ state: record?.state ?? null, standardVersionHash: c.sv.standardVersionHash, skillVersion: c.sv.skillVersionHash, certificate: rec.settings?.certificate ?? null, record }),
    output: r.text, answer: r.text, invocationId: rec.invocationId, skillVersion: c.sv.skillVersionHash, costUsd: Number(spent.toFixed(4)),
    rulesBroken: [], cut: [], toCheck: [], work: rec.work ?? null, report: lines, eval: evaluation, fix: { ...rec.fix, lines } };
  return { output: r.text, json, exit };
}
