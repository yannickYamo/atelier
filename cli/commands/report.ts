// cli/commands/report.ts — ONE RUN, COMPONENT BY COMPONENT, AND HOW A PERSON JUDGED IT.
//
//   atelier report <invocation> [--skill <name>] [--json]    the panel and the trace of one run
//   atelier report --skill <name> [--json]                    the skill's evaluation card: what every output is checked by
//   atelier rate <invocation> yes|no ["why"] [--skill <name>] would you ship this as is? (user satisfaction)
//
// The trace is the run's record laid out per component (drafts, selection, the claim check, repair, steering,
// retrieval, the release, applicability), each with what it did and why. It reads the stored record and the
// stored evaluation only: a report never recomputes what the run decided.
//
// A rating is the one measure here a person gives: "would you ship this as is?", yes or no, with a reason. It is
// appended (a later rating of the same run supersedes it), and `atelier eval` reports the share of yes per
// release with its N and interval. Nothing else in Atelier is a measure of satisfaction.

import { describeController } from '../../core/loop/controller.js';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as store from '../../core/state/store.js';
import { getEval, putRating, listEvals, latestRatings, REASON_CODES, type ReasonCode } from '../../core/state/eval-store.js';
import { requalifySkill, movedLine } from '../../core/method/requalify.js';
import { renderPanel } from '../../core/eval/summary.js';
import { renderRunCard } from '../../core/eval/run-card.js';
import { renderSkillCard } from '../../core/eval/skill-card.js';
import { skillCardFor } from '../skill-card.js';
import { reproductionFile } from './reproduce.js';
import { renderReproduction, type ReproductionRecord } from '../../core/eval/reproduce.js';
import { featureOf } from '../../core/observers/features.js';
import type { InvocationRecord, StandardVersion, Requirement } from '../../core/state/canonical-state.js';
import { resolveRule } from '../../core/state/rule-key.js';
import type { EvalSummary } from '../../core/eval/summary.js';
import { DATA, die, argv, flag, positional, positionals, runFile } from '../runtime.js';
import { readJson } from '../../core/state/read-json.js';
import { describeInference } from '../../core/composite/infer.js';
import { describeComposite } from '../../core/composite/selection.js';
import { openLine } from './composite.js';

/** The skill a run belongs to: named, or found by its id across the store. */
/** The skill an answer drafted for the owner belongs to (`d1`…), or null when `id` names none. */
function draftedById(id: string): { L: store.StoreLayout } | null {
  if (!/^d\d+$/.test(id)) return null;
  const named = flag('--skill');
  const skills = named ? [named] : existsSync(join(DATA, 'skills')) ? readdirSync(join(DATA, 'skills')) : [];
  for (const s of skills) { const L: store.StoreLayout = { root: DATA, skillName: s }; if (store.getDrafted(L).some((d) => d.id === id)) return { L }; }
  return null;
}

function locate(id: string): { L: store.StoreLayout; rec: InvocationRecord } {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) die(`"${id}" is not an invocation id (they look like i40a84c1ab).`);
  const named = flag('--skill');
  const skills = named ? [named] : existsSync(join(DATA, 'skills')) ? readdirSync(join(DATA, 'skills')) : [];
  for (const s of skills) {
    const L: store.StoreLayout = { root: DATA, skillName: s };
    const rec = store.getInvocation(L, id);
    if (rec) return { L, rec };
  }
  return die(`no run called ${id}${named ? ` in "${named}"` : ''}. Runs are listed by: atelier history`);
}

/** The skills a command over every skill reads: the one named, or every skill in the store. */
const skillsNamed = (): string[] => { const n = flag('--skill'); return n ? [n] : existsSync(join(DATA, 'skills')) ? readdirSync(join(DATA, 'skills')) : []; };

/**
 * THE RUNS WAITING FOR A PERSON (`atelier report --pending`): every run whose delivery was PERSON (core/eval/consequence.ts)
 * and that nobody has ruled on yet, newest first, each with the rows of the table that sent it there.
 */
export function pendingRuns(L: store.StoreLayout): { invocationId: string; at: string; skill: string; rows: { finding: string; entries: readonly string[] }[] }[] {
  const ruled = new Set(latestRatings(L).map((r) => r.invocationId));
  return listEvals(L).filter((e) => e.record?.delivery?.decision === 'PERSON' && !ruled.has(e.invocationId))
    .map((e) => ({ invocationId: e.invocationId, at: e.at, skill: L.skillName, rows: (e.record?.delivery?.why ?? []).filter((w) => w.action === 'person').map((w) => ({ finding: w.finding, entries: w.entries })) }));
}

export function report(): void {
  if (argv.includes('--pending')) {
    const pending = skillsNamed().flatMap((n) => pendingRuns({ root: DATA, skillName: n })).sort((a, b) => b.at.localeCompare(a.at));
    if (argv.includes('--json')) { console.log(JSON.stringify({ pending }, null, 1)); return; }
    if (!pending.length) { console.log('Nothing waits for you: no run sent to a person is left unruled.'); return; }
    console.log(`${pending.length} run${pending.length === 1 ? '' : 's'} sent to you, newest first. Rule on each: atelier rate <run> yes|no [--rule <id>]`);
    for (const p of pending) console.log(`  ${p.invocationId}  ${p.skill}  ${p.at.slice(0, 16).replace('T', ' ')}  ${p.rows.map((r) => `${r.finding} (${r.entries.join(', ')})`).join('; ')}`);
    return;
  }
  if (argv.includes('--requalify')) {
    // THE OWNER'S RULINGS HOLD THE WRITTEN CHECKS AGAIN (core/method/requalify.ts): counting, no model.
    const all = skillsNamed().map((n) => ({ n, r: requalifySkill({ root: DATA, skillName: n }) }));
    if (argv.includes('--json')) { console.log(JSON.stringify({ requalified: all.map((x) => ({ skill: x.n, held: x.r.held, moved: x.r.moved })) }, null, 1)); return; }
    for (const { n, r } of all) console.log(`${n}: ${r.held} written check${r.held === 1 ? '' : 's'} held to your rulings${r.moved.length ? '' : '; none moved'}.${r.moved.map((m) => `\n  ${movedLine(m)}`).join('')}`);
    return;
  }
  // With no run named and no skill either: the last run made in this project, which is the one a person means.
  const last = runFile('last-invocation.json');
  const id = positional([]) ?? (!flag('--skill') && existsSync(last) ? readJson<{ invocationId: string }>(last, { what: 'the last run' }).invocationId : undefined);
  // NO RUN NAMED: THE SKILL ITSELF. What every output of it is checked by, as recorded when it was built.
  if (!id) {
    const name = flag('--skill') ?? die('usage: atelier report <invocation> | atelier report --skill <name> [--json]');
    const card = skillCardFor({ root: DATA, skillName: name }) ?? die(`no built skill called "${name}".`);
    // The last reproduction on held-back cases, when one was run (`atelier reproduce`): kept beside the skill, and
    // said to be of an earlier version when the skill has been built again since.
    const repro = existsSync(reproductionFile({ root: DATA, skillName: name })) ? readJson<ReproductionRecord>(reproductionFile({ root: DATA, skillName: name }), { what: 'the reproduction record' }) : null;
    // A SKILL COMBINING SEVERAL VOICES: how the combination was inferred (core/composite/infer.ts), whole.
    const composite = store.getComposite({ root: DATA, skillName: name });
    const inference = composite?.inference ?? null;
    if (argv.includes('--json')) { console.log(JSON.stringify({ ...card, ...(repro ? { reproduction: repro } : {}), ...(inference ? { composite: inference } : {}) }, null, 1)); return; }
    console.log(renderSkillCard(card, process.stdout.columns || 110));
    // A SKILL OF SEVERAL VOICES: what instructs from whom and how each clash stands, then, when it was inferred, every
    // weight and every reason. An older composite built with questions still open says so.
    if (composite) {
      const std = store.getStandard({ root: DATA, skillName: name }, card.standardVersion);
      const req = new Map((std?.requirements ?? []).map((r) => [r.requirementId, r]));
      console.log(`\nTHE COMPOSITE\n${describeComposite(composite, (id) => req.get(id)?.statement ?? id, (id) => req.get(id)?.measurement ?? undefined).map((l) => `  ${l}`).join('\n')}`);
      const open = openLine(composite).trim();
      if (open) console.log(`  ${open}`);
    }
    if (inference) {
      const outcome = new Map((composite?.decisions ?? []).map((d) => [d.id, d.outcome === 'SELECTED' ? (d.mergedInto ? 'in range' : 'taken') : d.outcome === 'HABIT' ? 'habit' : d.outcome === 'REJECTED' ? 'aside' : 'open']));
      console.log(describeInference(inference, (id) => outcome.get(id)).join('\n'));
    }
    if (repro) console.log(`\n${renderReproduction(repro)}${repro.skillVersion === card.skillVersion ? '' : `\n  (read on version ${repro.skillVersion.slice(0, 8)}; the skill has been built again since: atelier reproduce --skill ${name})`}`);
    return;
  }
  const { L, rec } = locate(id);
  const e = getEval(L, rec.invocationId);
  if (argv.includes('--json')) { console.log(JSON.stringify({ eval: e, trace: [...traceOf(rec), ...costOf(e)] }, null, 1)); return; }
  // The evaluation as the run showed it (core/eval/run-card.ts), then the engine's own account of the same run.
  if (e?.record) console.log(`${renderRunCard({ record: e.record, costUsd: e.costUsd, seconds: e.durationMs / 1000, drafts: e.drafts, done: [], invocationId: e.invocationId }, process.stdout.columns || 110).join('\n')}\n`);
  console.log(e ? renderPanel(e, { width: process.stdout.columns || 110, color: process.stdout.isTTY && !process.env.NO_COLOR })
    : '(no evaluation was recorded with this run: it ran before Atelier 1.0)');
  console.log('\nTRACE');
  for (const [component, lines] of [...traceOf(rec), ...costOf(e)]) {
    console.log(`  ${component}`);
    for (const l of lines) console.log(`    ${l}`);
  }
}

/**
 * WHERE THE RUN'S COST WENT AND WHAT IT SENT, from the stored evaluation: one line per purpose with its calls and
 * the tokens the provider counted, then the words served. A run recorded before these were kept adds nothing.
 */
export function costOf(e: EvalSummary | null): [string, string[]][] {
  if (!e?.spend && !e?.sent) return [];
  const lines: string[] = [];
  const k = (x: number): string => x.toLocaleString('en-US');
  for (const l of e.spend ?? []) {
    lines.push(`${l.purpose}: $${l.usd.toFixed(4)} · ${l.calls} call${l.calls === 1 ? '' : 's'}${l.inputTokens + l.outputTokens > 0 ? ` · ${k(l.inputTokens)} tokens in, ${k(l.outputTokens)} out` : ''}`);
  }
  // The total is the run's own figure; a difference from the lines is said, never absorbed.
  const summed = (e.spend ?? []).reduce((n, l) => n + l.usd, 0);
  if (e.spend && Math.abs(summed - e.costUsd) >= 0.0001) lines.push(`${summed < e.costUsd ? 'not attributed' : 'counted in the lines and not in the total'}: $${Math.abs(e.costUsd - summed).toFixed(4)} against the run's $${e.costUsd.toFixed(4)}`);
  if (e.sent) lines.push(`sent to the writer: ${k(e.sent.skill)} words of skill · ${k(e.sent.added)} added for this request (your nearest passages, notes) · ${k(e.sent.request)} of request`);
  return [['cost and size', lines]];
}

/** The record, component by component, in the order the run went through them. */
export function traceOf(rec: InvocationRecord): [string, string[]][] {
  const out: [string, string[]][] = [];
  const f = rec.fidelity;
  const sel = rec.selection;
  out.push(['request', [`"${rec.input.split('\n')[0].slice(0, 100)}"`, `at ${rec.at} · model ${rec.observedRuntime.resolvedModel ?? rec.runtimeBinding.requestedModel ?? 'unknown'}`]]);
  if (f) out.push(['release', [`${f.release ?? 'none (the run overrode its release)'} · profile ${f.profileHash ?? 'none'}`,
    ...(f.settings ? [`ran: ${f.settings.drafts} draft(s), ${f.settings.editBudget} sentence rewrite(s), ${f.settings.retrievalK} passage(s), ${f.settings.notesCap} note(s)${f.settings.diversity ? ', drafts made to differ' : ''}`] : []),
    ...(f.plan ? [`written by section: ${f.plan.join(' / ')}`] : [])]]);
  if (f?.retrieved?.length || f?.variants?.length) out.push(['retrieval', [
    ...(f.retrieved?.length ? [`passages served: ${f.retrieved.join(', ')}`] : []),
    ...(f.variants ?? []).map((v) => `draft ${v.index}: temperature ${v.temperature ?? 'provider default'}, passages ${v.retrieved.join(', ') || 'none'}`)]]);
  if (sel) out.push(['drafts and selection', [`${sel.written ?? sel.drafts} of ${sel.drafts} written; kept draft ${sel.chosen}: ${sel.why}`,
    ...(sel.failed ?? []).map((x) => `failed: ${x}`),
    ...(f?.drafts ?? []).map((d, i) => `draft ${i}: ${d.inBand} of ${d.measured} features in range${d.outside.length ? `; outside: ${d.outside.slice(0, 3).map((o) => o.id).join(', ')}` : ''}`)]]);
  const r = rec.repair;
  if (r) {
    out.push(['claim check', [
      `${r.storiesCut?.length ?? 0} cut · ${r.claimsToCheck?.length ?? 0} listed to check`,
      ...(r.storiesCut ?? []).map((c) => `cut: "${c.slice(0, 100)}"`),
      ...(r.claimsToCheck ?? []).slice(0, 8).map((c) => `check: "${c.slice(0, 100)}"`)]]);
    out.push(['repair', [`before: ${r.violatedBefore.join(', ') || 'nothing broken'} · after: ${r.violatedAfter.join(', ') || 'nothing broken'} · ${r.passes} pass(es)`, r.why,
      ...(r.integrityReverted?.length ? [`${r.integrityReverted.length} rewrite(s) refused for changing what the text claims`] : [])]]);
    // Every step the controller chose, in order: what it was expected to move and cost, what it did, and why it stopped.
    if (r.controller) out.push(['repair steps', describeController(r.controller)]);
  }
  if (f?.edits?.length) out.push(['steering', f.edits.map((e) => `${e.actuator ?? 'edit'} on ${featureOf(e.target)?.label.split(' (')[0] ?? e.target}${e.before !== undefined ? ` (${e.before ?? '-'} to ${e.after ?? '-'})` : ''}: ${e.kept ? 'kept' : 'not kept'}, ${e.why}`)]);
  if (f?.reading) out.push(['delivered', [`${f.reading.inBand} of ${f.reading.measured} features in range${f.coverage ? ` · used ${f.coverage.used} of ${f.coverage.supplied} supplied facts` : ''}`]]);
  const notApplied = (f?.applicability ?? []).filter((a) => a.status !== 'APPLIED');
  if (notApplied.length) out.push(['applicability', notApplied.map((a) => `${a.requirementId}: ${a.status.toLowerCase().replace('_', ' ')}${a.why ? `, ${a.why}` : ''}`)]);
  return out;
}

/** A rule named by its id, key or number in a standard, with its words; or, where none is, the rules it could name. */
export function ruleNamed(requirements: readonly Requirement[], ref: string): { id: string; statement: string } | { error: string } {
  const r = resolveRule(requirements, ref);
  if ('rule' in r) return { id: r.rule.requirementId, statement: r.rule.statement };
  return { error: `no rule "${ref}" in the standard this was made under. Name one of:\n${requirements.map((q) => `  ${q.requirementId}: ${q.statement}`).join('\n')}` };
}

export function rate(): void {
  const [id, answer, ...why] = positionals();
  if (!id || !answer) die('usage: atelier rate <invocation> yes|no ["why"]');
  const ship = /^(y|yes|ship|1|true)$/i.test(answer) ? true : /^(n|no|0|false)$/i.test(answer) ? false : die(`answer yes or no: would you ship this as is? (got "${answer}")`);
  // THE RULE A REJECTED OUTPUT BREAKS, when the owner names it: the output joins that rule's mutants at the next build.
  // Named in the standard the output was made under, and kept by its words: ids move when the skill is built again.
  const ref = flag('--rule') ?? null;
  const named = (std: StandardVersion | null): { rule: string | null; ruleStatement: string | null } => {
    if (ref === null || !std) return { rule: ref, ruleStatement: null };
    const r = ruleNamed(std.requirements.filter((q) => q.authority !== 'EXPERT_REJECTED'), ref);
    return 'error' in r ? die(r.error) : { rule: r.id, ruleStatement: r.statement };
  };
  // AN ANSWER DRAFTED FOR THE OWNER (`atelier skill --draft-examples`, ids d1…): kept or rejected, for the next build.
  const drafted = draftedById(id);
  if (drafted) {
    const active = store.getActive(drafted.L); const sv = active ? store.getSkillVersion(drafted.L, active) : null;
    const { rule, ruleStatement } = named(sv ? store.getStandard(drafted.L, sv.standardVersionHash) : null);
    store.setDrafted(drafted.L, store.getDrafted(drafted.L).map((d) => (d.id === id ? { ...d, kept: ship, why: why.join(' ').trim() || null, rule, ruleStatement } : d)));
    const all = store.getDrafted(drafted.L);
    console.log(`Recorded: ${id} ${ship ? 'kept as finished work of yours' : `rejected${rule ? `, as breaking ${rule}` : ''}`}. ${all.filter((d) => d.kept === null).length} drafted answer(s) left to rate. Build again to qualify the skill's checks on the ones you kept: atelier skill --yes --name ${drafted.L.skillName}`);
    return;
  }
  const { L, rec } = locate(id);
  // optional reasons from the closed list: --reason missing-necessary,too-long
  const said = (flag('--reason') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const bad = said.filter((x) => !(REASON_CODES as readonly string[]).includes(x));
  if (bad.length) die(`unknown reason ${bad.join(', ')}: use any of ${REASON_CODES.join(', ')}`);
  const reasons = said as ReasonCode[];
  const madeUnder = store.getSkillVersion(L, rec.skillVersionHash);
  const { rule, ruleStatement } = ship ? { rule: null, ruleStatement: null } : named(madeUnder ? store.getStandard(L, madeUnder.standardVersionHash) : null);
  putRating(L, { invocationId: rec.invocationId, ship, why: why.join(' ').trim() || null, at: new Date().toISOString(), release: rec.fidelity?.release ?? null, ...(reasons.length ? { reasons } : {}), ...(rule ? { rule, ...(ruleStatement ? { ruleStatement } : {}) } : {}) });
  console.log(`Recorded: ${ship ? 'yes, you would ship' : 'no, you would not ship'} ${rec.invocationId} as is.${ship ? '' : ' To have it written again: atelier fix "<what was wrong>" (add --always to change the skill for every run)'}`);
  // YOUR RULING HOLDS THE WRITTEN CHECKS AGAIN, NOW (core/method/requalify.ts): a check that qualifies on it decides the next run.
  for (const m of requalifySkill(L).moved) console.log(movedLine(m));
}
