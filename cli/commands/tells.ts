// cli/commands/tells.ts — THE MACHINE-WRITING PHRASES THIS SKILL LEARNED TO CATCH, AND THE OWNER'S SAY OVER THEM.
//
//   atelier tells --skill <name>                         what is checked, and where it came from
//   atelier tells --skill <name> --learn [--probe <n>]    learn from this skill's own drafts (its past uses,
//                                                        plus n new drafts on your own titles, a model call each)
//   atelier tells --skill <name> --add "<phrase>"...      a phrase you know reads as machine-written
//   atelier tells --skill <name> --strike "<phrase>"...   a learned phrase that is in fact yours
//
// The standard's machine-tell rule says such moves go (core/observers/contrast.ts); this list is the
// sensor that finds them in this skill's own output (core/observers/tell-lexicon.ts). It is implementation,
// not standard: learning or editing it changes what is caught, never what "good" means.

import * as store from '../../core/state/store.js';
import { deriveTellLexicon, TELL_MIN_TOPICS, type TellDraft } from '../../core/observers/tell-lexicon.js';
import type { Budget } from '../../core/inference/client.js';
import { DATA, die, argv, flagAll, numericFlag, skillArg, clientAndBinding, loadSession } from '../runtime.js';
import { resolveServedVersion } from './invoke.js';
import { spendOneWithResult } from './improve.js';
import { readCorpus } from './floor.js';
import { existsSync } from 'node:fs';

/** The author's pieces this skill was built from, when they can still be read. */
function corpusOf(name: string): string[] {
  const s = loadSession();
  const source = s.source && existsSync(s.source) && (s.skillName === null || s.skillName === name) ? s.source : null;
  // Reserved pieces count too: a phrase the author used anywhere is theirs.
  return source ? [...readCorpus(source), ...(s.reservation?.reserved ?? []).map((u) => u.artifact)] : [];
}

/** Learn the lexicon from the skill's recorded uses and, optionally, probe drafts. Returns what changed. */
export async function learnTells(L: store.StoreLayout, name: string, probe = 0, budget?: Budget): Promise<{ before: number; after: number; drafts: number; topics: number } | null> {
  const corpus = corpusOf(name);
  if (!corpus.length) return null;
  const drafts: TellDraft[] = store.listInvocations(L).map((i) => ({ task: i.input, text: i.repair?.draft ?? i.output }));
  if (probe > 0) {
    const active = store.getActive(L) ?? die(`no built skill called "${name}".`);
    const served = resolveServedVersion(L, active, '');
    const titles = [...new Set(corpus.map((t) => (/^#\s+(.+)$/m.exec(t)?.[1] ?? '').trim()).filter((x) => x.length > 3))];
    const tasks = store.getFloor(L).tasks.length ? store.getFloor(L).tasks : titles.map((t) => `Write a piece titled "${t}".`);
    const { client } = clientAndBinding('target');
    const b = budget ?? { spentUsd: 0, capUsd: numericFlag('--cap', 3), maxCalls: probe };
    for (const task of tasks.slice(0, probe)) drafts.push({ task, text: (await spendOneWithResult(client, b, served.servedText, task)).piece });
  }
  const t = store.getTells(L);
  const lex = deriveTellLexicon(drafts, corpus);
  store.setTells(L, { ...t, learned: lex.terms, at: lex.at, drafts: lex.drafts, topics: lex.topics });
  return { before: t.learned.length, after: lex.terms.length, drafts: lex.drafts, topics: lex.topics };
}

export async function tells(): Promise<void> {
  const name = skillArg();
  const L: store.StoreLayout = { root: DATA, skillName: name };
  if (!store.getActive(L)) die(`no built skill called "${name}".`);
  const add = flagAll('--add'); const strike = flagAll('--strike');
  if (add.length || strike.length) {
    const t = store.getTells(L); const norm = (x: string): string => x.trim().toLowerCase();
    store.setTells(L, { ...t, added: [...new Set([...t.added, ...add.map(norm)])], struck: [...new Set([...t.struck, ...strike.map(norm)])] });
    console.log(`${add.length} added, ${strike.length} struck.`);
  }
  if (argv.includes('--learn')) {
    const probe = Math.max(0, Math.floor(numericFlag('--probe', 0)));
    const r = await learnTells(L, name, probe)
      ?? die('the pieces this skill was built from are not readable here, so there is nothing to compare its drafts with.');
    console.log(r.topics < TELL_MIN_TOPICS
      ? `Only ${r.topics} topic(s) in ${r.drafts} draft(s): a phrase must recur across ${TELL_MIN_TOPICS} before it counts. Use the skill more, or add --probe ${TELL_MIN_TOPICS + 3}.`
      : `Learned ${r.after} phrase(s) from ${r.drafts} draft(s) on ${r.topics} topic(s) (was ${r.before}).`);
  }
  const t = store.getTells(L); const active = store.activeTells(t);
  const hasRule = store.getStandard(L, store.getSkillVersion(L, store.getActive(L)!)!.standardVersionHash)?.requirements
    .some((r) => r.measurement?.observer === 'PATTERN_RATE' && (r.measurement.params.pattern as string[] | undefined)?.[0] === 'MACHINE_TELL');
  console.log(`Machine-writing phrases checked for ${name}: ${active.length} (${t.learned.length} learned${t.at ? ` from ${t.drafts} draft(s) on ${t.topics} topic(s)` : ''}, ${t.added.length} added by you, ${t.struck.length} struck).`);
  if (!hasRule) console.log('  This standard has no machine-tell rule, so the list is kept but not checked. Rebuild from your corpus to propose one.');
  for (const x of active.slice(0, 60)) console.log(`  · ${x}`);
}
