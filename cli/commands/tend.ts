// cli/commands/tend.ts — ONE COMMAND FOR EVERYTHING BELOW THE STANDARD, AND ONE PAGE FOR WHERE IT STANDS.
//
//   atelier tend --skill <name> [--cap <usd>] [--auto]     look after a skill: mine, read, improve
//   atelier status --skill <name>                          where the skill stands, on one page
//
// The loop has several parts (failure mining, the taste reader, the regression floor, the optimizer),
// and each has its own command for when you want to drive it. `tend` runs them in order, within one
// budget, and ends with a digest of what happened and what is waiting for you:
//
//   1. mine        what keeps going wrong (core/mining/recurrence.ts); recorded for `mine --add`
//      tells       the machine-writing phrases this skill's own uses repeat (cli/commands/tells.ts)
//   2. taste       what the reader has earned, and how many readings wait for your label
//   3. floor       whether a change could install itself (cli/commands/floor.ts)
//   4. optimize    one round, only when the floor is EARNED (a round that could install nothing is
//                  left to `atelier optimize`, which you run by hand); with --auto, a winner the
//                  promotion gate allows is installed. After an install the floor must be re-earned
//                  for the new version, and the digest says so.
//
// It never changes what "good" means: nothing here adds, removes or rewords a rule. Run it by hand, or
// on a schedule, for example weekly from cron:
//
//   0 9 * * 1  cd /path/to/project && atelier tend --skill house-style --cap 5 --auto >> ~/.atelier/tend.log 2>&1

import * as store from '../../core/state/store.js';
import { findRecurrences } from '../../core/mining/recurrence.js';
import { tasteRules } from '../../core/taste/reader.js';
import { tastePermissions, calibrationQueue } from '../../core/taste/calibration.js';
import { coverageOf, DIMENSION_LABEL, DIMENSIONS } from '../../core/taste/dimensions.js';
import { foldRepairs } from '../../core/architecture/repair-memory.js';
import { floorStateFor, runtimeIdentity, MIN_TASKS } from './floor.js';
import { readerModel } from './taste.js';
import { optimize } from './optimize.js';
import { learnTells } from './tells.js';
import { DATA, die, argv, skillArg } from '../runtime.js';

export async function tend(): Promise<void> {
  const name = skillArg();
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const active = store.getActive(L) ?? die(`no built skill called "${name}".`);
  const sv = store.getSkillVersion(L, active) ?? die(`skill version ${active} is missing.`);
  const v = store.getStandard(L, sv.standardVersionHash) ?? die(`standard ${sv.standardVersionHash} is missing.`);
  const digest: string[] = [];

  // 1. What keeps going wrong.
  const events = store.readEvents(L);
  const proposals = events.filter((e) => e.kind === 'PROPOSED_CHANGE')
    .map((e) => ({ proposal: String(e.proposal), at: String(e.at), accepted: (e.accepted ?? null) as boolean | null,
      ...(Array.isArray(e.feedbackIds) ? { feedbackIds: e.feedbackIds as string[] } : {}) }));
  const items = findRecurrences({ feedback: store.listFeedback(L), invocations: store.listInvocations(L), requirements: v.requirements,
    standardVersionHash: v.standardVersionHash, proposals });
  store.setMining(L, { at: new Date().toISOString(), standardVersionHash: v.standardVersionHash, items });
  digest.push(items.length ? `${items.length} recurring problem(s); the strongest: ${items[0].kind.toLowerCase().replace(/_/g, ' ')}. See: atelier mine --skill ${name}`
    : 'nothing recurs in what has been recorded');

  // 1b. What this skill's own drafts keep saying that its author never does (core/observers/tell-lexicon.ts):
  // learned again from every recorded use, free, so the check grows with the skill instead of a list.
  const learned = await learnTells(L, name);
  if (learned) digest.push(`machine-writing phrases: ${learned.after} learned from ${learned.drafts} use(s) on ${learned.topics} topic(s)${learned.after !== learned.before ? ` (was ${learned.before})` : ''}`);

  // 2. The taste reader.
  const rules = tasteRules(v);
  const perms = tastePermissions(rules, events, readerModel());
  const waiting = calibrationQueue(rules, events, readerModel()).length;
  digest.push(`taste reader: ${perms.veto.size ? `acts on ${perms.veto.size} of ${rules.length} rule(s)` : `reports on ${rules.length} rule(s), acts on none yet`}`
    + (waiting ? `; ${waiting} reading(s) wait for your label (atelier taste --skill ${name} --calibrate)` : ''));

  // 3. The floor, and 4. one round of search, only where it could install something.
  const floor = store.getFloor(L);
  const st = floorStateFor(L, active, runtimeIdentity());
  const setUp = floor.contract && floor.tasks.length >= MIN_TASKS;
  digest.push(`regression floor: ${st.state}${st.state === 'EARNED' ? '' : ` (${st.why})`}`
    + (st.state === 'EARNED' ? '' : setUp ? `; re-earn it for this version: atelier floor --skill ${name} --setup` : `; set it up once: atelier floor --skill ${name} --setup`));
  if (st.state === 'EARNED') {
    const promote = argv.includes('--auto') || argv.includes('--promote');
    console.log('── optimize ──');
    const started = new Date().toISOString();
    await optimize({ promote });
    const round = store.readEvents(L).filter((e) => e.kind === 'OPTIMIZE_ROUND' && String(e.at) >= started).at(-1);
    const promoted = typeof round?.promoted === 'string' ? round.promoted : null;
    digest.push(!round ? 'optimize found nothing to try this round'
      : promoted ? `installed ${promoted}; the previous version remains: atelier rollback --skill ${name} --to ${active}. `
        + `The floor must be re-earned for the new version before anything else installs itself: atelier floor --skill ${name} --setup`
        : 'no change installed this round');
  }
  const pending = foldRepairs(store.readEvents(L)).filter((r) => r.outcome === 'PENDING');
  if (pending.length) digest.push(`${pending.length} candidate(s) wait for your decision (atelier promote / atelier reject)`);

  store.appendEvent(L, { kind: 'TENDED', at: new Date().toISOString(), active, digest });
  console.log(`\n── ${name}, tended ──\n${digest.map((d) => `  · ${d}`).join('\n')}`);
}

/** One page: the standard, what it covers, what checks it, and what is waiting. */
export function skillDashboard(name: string): void {
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const active = store.getActive(L) ?? die(`no built skill called "${name}".`);
  const sv = store.getSkillVersion(L, active) ?? die(`skill version ${active} is missing.`);
  const v = store.getStandard(L, sv.standardVersionHash) ?? die(`standard ${sv.standardVersionHash} is missing.`);
  const events = store.readEvents(L);
  const live = v.requirements.filter((r) => r.authority !== 'EXPERT_REJECTED');
  const rules = tasteRules(v);
  const perms = tastePermissions(rules, events, readerModel());
  const cov = coverageOf(v.requirements);
  const st = floorStateFor(L, active, runtimeIdentity());
  const pending = foldRepairs(events).filter((r) => r.outcome === 'PENDING');
  const lastTend = events.filter((e) => e.kind === 'TENDED').at(-1);
  console.log(`${name}  ·  version ${active}  ·  standard ${v.standardVersionHash}`);
  console.log(`  rules          ${live.length}: ${live.filter((r) => r.measurement).length} counted, ${rules.length} read by the taste reader`);
  // WHAT THE ONE HUMAN ACT WAS. Pressing Enter accepts every suggested ruling, so "you approved every rule"
  // and "you took the machine's suggestions" can be the same act. The ledger records which; say it.
  const took = (store.getLedger(L, v.standardVersionHash)?.records ?? []).map((r) => r.ruling?.took).filter((t) => t !== undefined);
  if (took.length) {
    const n = (k: string): number => took.filter((t) => t === k).length;
    console.log(`  your rulings   ${n('SUGGESTION')} took the suggestion, ${n('OVERRIDE')} overrode it, ${n('NO_SUGGESTION')} had none`);
  }
  console.log(`  covers         ${[...Object.keys(DIMENSION_LABEL)].filter((d) => d !== 'UNSORTED' && !cov.gaps.includes(d as never)).length} of ${DIMENSIONS.length} dimensions${cov.gaps.length ? `; nothing about ${cov.gaps.map((d) => DIMENSION_LABEL[d]).join(', ')}` : ''}`);
  console.log(`  taste reader   ${perms.veto.size ? `acts on ${perms.veto.size} rule(s)` : 'reports only'}; ${calibrationQueue(rules, events, readerModel()).length} reading(s) to label`);
  console.log(`  floor          ${st.state}`);
  console.log(`  uses           ${store.listInvocations(L).length} recorded`);
  console.log(`  waiting        ${pending.length} candidate(s)`);
  console.log(`  last tended    ${lastTend ? String(lastTend.at) : 'never (atelier tend --skill ' + name + ')'}`);
}
