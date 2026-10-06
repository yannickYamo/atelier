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

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as store from '../../core/state/store.js';
import { getEval, putRating } from '../../core/state/eval-store.js';
import { renderPanel } from '../../core/eval/summary.js';
import { renderSkillCard } from '../../core/eval/skill-card.js';
import { skillCardFor } from '../skill-card.js';
import { featureOf } from '../../core/observers/features.js';
import type { InvocationRecord } from '../../core/state/canonical-state.js';
import type { EvalSummary } from '../../core/eval/summary.js';
import { DATA, die, argv, flag, positional, positionals } from '../runtime.js';

/** The skill a run belongs to: named, or found by its id across the store. */
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

export function report(): void {
  const id = positional([]);
  // NO RUN NAMED: THE SKILL ITSELF. What every output of it is checked by, as recorded when it was built.
  if (!id) {
    const name = flag('--skill') ?? die('usage: atelier report <invocation> | atelier report --skill <name> [--json]');
    const card = skillCardFor({ root: DATA, skillName: name }) ?? die(`no built skill called "${name}".`);
    console.log(argv.includes('--json') ? JSON.stringify(card, null, 1) : renderSkillCard(card, process.stdout.columns || 110));
    return;
  }
  const { L, rec } = locate(id);
  const e = getEval(L, rec.invocationId);
  if (argv.includes('--json')) { console.log(JSON.stringify({ eval: e, trace: [...traceOf(rec), ...costOf(e)] }, null, 1)); return; }
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
  }
  if (f?.edits?.length) out.push(['steering', f.edits.map((e) => `${e.actuator ?? 'edit'} on ${featureOf(e.target)?.label.split(' (')[0] ?? e.target}${e.before !== undefined ? ` (${e.before ?? '-'} to ${e.after ?? '-'})` : ''}: ${e.kept ? 'kept' : 'not kept'}, ${e.why}`)]);
  if (f?.reading) out.push(['delivered', [`${f.reading.inBand} of ${f.reading.measured} features in range${f.coverage ? ` · used ${f.coverage.used} of ${f.coverage.supplied} supplied facts` : ''}`]]);
  const notApplied = (f?.applicability ?? []).filter((a) => a.status !== 'APPLIED');
  if (notApplied.length) out.push(['applicability', notApplied.map((a) => `${a.requirementId}: ${a.status.toLowerCase().replace('_', ' ')}${a.why ? `, ${a.why}` : ''}`)]);
  return out;
}

export function rate(): void {
  const [id, answer, ...why] = positionals();
  if (!id || !answer) die('usage: atelier rate <invocation> yes|no ["why"]');
  const ship = /^(y|yes|ship|1|true)$/i.test(answer) ? true : /^(n|no|0|false)$/i.test(answer) ? false : die(`answer yes or no: would you ship this as is? (got "${answer}")`);
  const { L, rec } = locate(id);
  putRating(L, { invocationId: rec.invocationId, ship, why: why.join(' ').trim() || null, at: new Date().toISOString(), release: rec.fidelity?.release ?? null });
  console.log(`Recorded: ${ship ? 'yes, you would ship' : 'no, you would not ship'} ${rec.invocationId} as is.${ship ? '' : ' To correct the skill: atelier fix "<what was wrong>"'}`);
}
