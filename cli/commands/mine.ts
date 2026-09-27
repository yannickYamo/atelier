// cli/commands/mine.ts — WHAT KEEPS GOING WRONG, PUT TO THE OWNER.
//
//   atelier mine --skill <name> [--phrase]
//   atelier mine --skill <name> --add <n> --materiality required|preferred [--statement "<rule>"]
//
// Reads everything the loop has recorded for a skill (complaints, repairs, refused rewrites) and lists
// what recurs, with the remedy each kind points at (core/mining/recurrence.ts). Nothing is changed by
// listing. A recurring gap becomes a rule only when the owner adds it, in their words or in words they
// approve, through the same path `fix` uses (./addition.ts). `--phrase` asks a model to word a rule for
// a gap that has none yet; its wording is a proposal like any other.

import * as store from '../../core/state/store.js';
import { findRecurrences, type Recurrence } from '../../core/mining/recurrence.js';
import { spend } from '../../core/inference/client.js';
import { addRuleToActive } from './addition.js';
import { DATA, die, argv, flag, skillArg, clientFor, diagnoserModel } from '../runtime.js';

const PHRASE_SYSTEM = `You word ONE rule for a writing standard from complaints its owner made about several outputs.

The complaints say the same thing in different words. Write the rule they imply, as the owner would
state it: one sentence, imperative, specific enough to check, and no broader than the complaints
support. Do not add anything the complaints do not say.`;
const PHRASE_SCHEMA: Record<string, unknown> = { type: 'object', properties: { rule: { type: 'string' } }, required: ['rule'], additionalProperties: false };

export async function mine(): Promise<void> {
  const name = skillArg();
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const active = store.getActive(L) ?? die(`no built skill called "${name}".`);
  const sv = store.getSkillVersion(L, active) ?? die(`skill version ${active} is missing.`);
  const v = store.getStandard(L, sv.standardVersionHash) ?? die(`standard ${sv.standardVersionHash} is missing.`);

  const addRef = flag('--add');
  if (addRef !== undefined) { add(L, name, addRef); return; }

  const proposals = store.readEvents(L).filter((e) => e.kind === 'PROPOSED_CHANGE')
    .map((e) => ({ proposal: String(e.proposal), at: String(e.at), accepted: (e.accepted ?? null) as boolean | null }));
  let items = findRecurrences({ feedback: store.listFeedback(L), invocations: store.listInvocations(L), requirements: v.requirements, proposals });
  if (argv.includes('--phrase')) items = await Promise.all(items.map(async (r) => (r.kind === 'GAP' && !r.proposal ? { ...r, proposal: await phrase(r.complaints) } : r)));
  store.setMining(L, { at: new Date().toISOString(), items });

  if (!items.length) { console.log(`Nothing recurs yet in what ${name} has recorded. One complaint is an anecdote; two that say the same thing are a pattern.`); return; }
  console.log(`What keeps going wrong with ${name}, strongest first:\n`);
  for (const [i, r] of items.entries()) console.log(`${i + 1}. ${describe(r, name, i + 1)}\n`);
}

function describe(r: Recurrence, name: string, n: number): string {
  const quote = (cs: readonly string[]): string => cs.slice(0, 3).map((c) => `"${c.slice(0, 80)}"`).join(', ') + (cs.length > 3 ? ` and ${cs.length - 3} more` : '');
  switch (r.kind) {
    case 'GAP':
      return `A gap: ${r.count} complaints say the same thing and no rule covers it: ${quote(r.complaints)}\n`
        + (r.proposal ? `   Proposed rule: "${r.proposal}"\n   Add it:  atelier mine --skill ${name} --add ${n} --materiality required|preferred`
          : `   Add it in your words:  atelier mine --skill ${name} --add ${n} --materiality required|preferred --statement "<the rule>"\n   (or --phrase to have one proposed)`);
    case 'MISSED_RULE':
      return `A rule that keeps being missed: ${r.requirementId} "${r.statement}", ${r.count} complaints: ${quote(r.complaints)}\n`
        + `   It is not reaching the model. Try another way of carrying it:  atelier optimize --skill ${name}\n`
        + `   or, if the words are the problem:  atelier amend --skill ${name} --rule ${r.requirementId} --statement "..." --reason "..."`;
    case 'BROKEN_DRAFT':
      return `A rule the first draft breaks in ${r.broken} of ${r.runs} runs: ${r.requirementId} "${r.statement}"\n`
        + `   The loop repairs it every time, which costs a rewrite each run. A different carrier may prevent it:  atelier optimize --skill ${name}`;
    case 'LOST_MEANING':
      return `Repairs for ${r.requirementId} "${r.statement}" were refused ${r.refused} times for changing what the text claims\n`
        + `   The rule may conflict with how you qualify claims. Look at it:  atelier amend --skill ${name} --rule ${r.requirementId} --reason "..."`;
  }
}

async function phrase(complaints: readonly string[]): Promise<string | null> {
  try {
    const res = await spend({ spentUsd: 0, capUsd: 0.25, maxCalls: 1 }, 0.03, async () => {
      const x = await clientFor(diagnoserModel()).complete({ stableBlock: PHRASE_SYSTEM, variableBlock: '',
        userMessage: `THE COMPLAINTS\n${complaints.slice(0, 6).map((c) => `- ${c}`).join('\n')}`, toolName: 'emit_rule',
        toolDescription: 'The one rule the complaints imply.', schema: PHRASE_SCHEMA, maxTokens: 300 });
      return { value: x, cost: x.cost };
    });
    const rule = (res.json as { rule?: unknown } | null)?.rule;
    return typeof rule === 'string' && rule.trim() ? rule.trim().slice(0, 300) : null;
  } catch (e) {
    console.log(`(could not phrase a rule: ${(e as Error).message.split('\n')[0]})`);
    return null;
  }
}

function add(L: store.StoreLayout, name: string, ref: string): void {
  const report = store.getMining(L) ?? die(`run atelier mine --skill ${name} first, so --add names an item you have read.`);
  const n = Number(ref);
  const item = Number.isInteger(n) ? report.items[n - 1] : undefined;
  if (!item) return die(`--add takes a number from the last report (1–${report.items.length}).`);
  if (item.kind !== 'GAP') return die(`item ${n} is not a gap: it is about a rule the standard already has, and the remedy listed for it applies.`);
  const m = flag('--materiality')?.toUpperCase();
  if (m !== 'REQUIRED' && m !== 'PREFERRED') return die('--materiality required|preferred: whether the rule binds, or is shown with other forms still acceptable.');
  const statement = flag('--statement') ?? item.proposal ?? die(`item ${n} has no proposed wording: give yours with --statement "<the rule>", or re-run with --phrase.`);
  const added = addRuleToActive(L, name, statement, m, `recurring: ${item.count} complaints, e.g. "${item.complaints[0]}"`);
  console.log(`Added as ${m} — ${added.requirement.requirementId}: ${statement}`);
  console.log(`StandardVersion ${added.standard.standardVersionHash} supersedes ${added.supersedes}. Rebuilt and installed.`);
}
