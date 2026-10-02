// cli/commands/report.ts — ONE RUN, COMPONENT BY COMPONENT, AND HOW A PERSON JUDGED IT.
//
//   atelier report <invocation> [--skill <name>] [--json]    the panel and the trace of one run
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
import { featureOf } from '../../core/observers/features.js';
import type { InvocationRecord } from '../../core/state/canonical-state.js';
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
  const id = positional([]) ?? die('usage: atelier report <invocation> [--skill <name>] [--json]');
  const { L, rec } = locate(id);
  const e = getEval(L, rec.invocationId);
  if (argv.includes('--json')) { console.log(JSON.stringify({ eval: e, trace: traceOf(rec) }, null, 1)); return; }
  console.log(e ? renderPanel(e, { width: process.stdout.columns || 110, color: process.stdout.isTTY && !process.env.NO_COLOR })
    : '(no evaluation was recorded with this run: it ran before Atelier 1.0)');
  console.log('\nTRACE');
  for (const [component, lines] of traceOf(rec)) {
    console.log(`  ${component}`);
    for (const l of lines) console.log(`    ${l}`);
  }
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
