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

import { staleChecks } from '../checks.js';
import * as store from '../../core/state/store.js';
import { degradedStages, describeStages } from '../../core/state/receipt.js';
import { findRecurrences, ruleBreakRates, regressedRules, type VersionBreakRates } from '../../core/mining/recurrence.js';
import { rollbackTo } from './inspect.js';
import { tasteRules } from '../../core/taste/reader.js';
import { tastePermissions, calibrationQueue } from '../../core/taste/calibration.js';
import { coverageOf, DIMENSION_LABEL, DIMENSIONS } from '../../core/taste/dimensions.js';
import { foldRepairs } from '../../core/architecture/repair-memory.js';
import { floorStateFor, runtimeIdentity, MIN_TASKS } from './floor.js';
import { readerModel } from './taste.js';
import { optimize } from './optimize.js';
import { learnTells } from './tells.js';
import { DATA, die, argv, skillArg } from '../runtime.js';
import { cardLine } from '../../core/direct/card.js';
import { titleOf } from '../../core/direct/pieces.js';

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
  const items = findRecurrences({ feedback: store.listFeedback(L), invocations: store.listLearningInvocations(L), requirements: v.requirements,
    standardVersionHash: v.standardVersionHash, proposals });
  // Internal: each measured rule's break rate per version, for the loop, not for the person (below).
  const breakRates = ruleBreakRates(store.listLearningInvocations(L), v.standardVersionHash);
  store.setMining(L, { at: new Date().toISOString(), standardVersionHash: v.standardVersionHash, items, breakRates });
  const healed = undoOwnRegression(L, active, events, breakRates);
  if (healed) digest.push(healed);
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
/**
 * WHAT A SKILL HOLDS, IN ITS OWNER'S WORDS: what the work is for, their method, how they write, the pieces they kept,
 * what they changed for every piece, and how to undo the last change. This is where a person looks to see that what
 * they said was taken in. Everything here is read from what the build and their own commands stored; the machinery's
 * account (versions, receipts, coverage, the floor) is `skillDashboard`, shown with --report.
 */
export function skillPage(name: string): void {
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const active = store.getActive(L) ?? die(`no built skill called "${name}".`);
  const sv = store.getSkillVersion(L, active) ?? die(`skill version ${active} is missing.`);
  const v = store.getStandard(L, sv.standardVersionHash) ?? die(`standard ${sv.standardVersionHash} is missing.`);
  const one = (t: string, n = 110): string => { const x = t.replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1).trimEnd()}…` : x; };
  const list = (title: string, xs: readonly string[], most: number): void => {
    if (!xs.length) return;
    console.log(`\n  ${title}`);
    for (const x of xs.slice(0, most)) console.log(`    - ${one(x)}`);
    if (xs.length > most) console.log(`    and ${xs.length - most} more`);
  };
  const card = store.getCard(L); const voice = store.getVoice(L);
  const said = card ? cardLine(card).replace(/^This work: /, '') : '';
  console.log(name);
  console.log(`  For: ${said ? said : 'not said yet'}   (say it: atelier amend --skill ${name} --card "kind=…; reader=…; purpose=…")`);
  if (voice?.pieces?.length) console.log(`  Built from ${voice.corpusPieces ?? voice.pieces.length} of your pieces${voice.lengthSpan ? `, ${voice.lengthSpan[0]} to ${voice.lengthSpan[1]} words each` : ''}.`);
  const live = v.requirements.filter((r) => r.authority !== 'EXPERT_REJECTED');
  const yours = live.filter((r) => r.provenance !== 'MACHINE_DISCOVERED');
  list('Your rules, in your words', yours.map((r) => r.statement), 12);
  list('How you write', (voice?.persona?.points ?? []).map((pt) => pt.description).filter(Boolean), 6);
  list('Also held on every new piece', live.filter((r) => r.provenance === 'MACHINE_DISCOVERED').map((r) => r.statement), 6);
  const kept = store.getKept(L);
  list(`Pieces you kept (${kept.length}): new pieces are written from these first`, [...kept].reverse().map((k) => `${k.request ?? titleOf(k.text) ?? 'a piece of yours'}  (${k.at.slice(0, 10)}${k.edits.length ? `, with ${k.edits.length} of your edits` : ''})`), 5);
  // WHAT CHANGED SINCE THE BUILD, newest first: each change of the rules with the person's own reason, and the way back.
  const rows = store.history(L);
  const changes = rows.filter((h, i) => h.standard?.reason && rows.findIndex((x) => x.skillVersion.standardVersionHash === h.skillVersion.standardVersionHash) === i);
  list(`What you changed for every piece (${changes.length})`, changes.map((h) => `${h.standard?.reason ?? ''}  (${h.skillVersion.builtAt.slice(0, 10)})`), 5);
  const at = rows.findIndex((h) => h.active); const before = at >= 0 ? rows[at + 1] : undefined;
  if (before) console.log(`\n  Undo the last change: atelier rollback --skill ${name} --to ${before.skillVersion.skillVersionHash}`);
  const receipt = store.getReceipt(L, active); const lost = receipt ? degradedStages(receipt) : [];
  if (lost.length) console.log(`\n  Part of the build did not finish (${lost.map((x) => x.id).join(', ')}). Finish it: atelier build --name ${name} --persona auto`);
  console.log(`\n  Write with it: atelier run "<the task>" --skill ${name}   ·   change it for every piece: atelier fix "<what was wrong>" --always`);
}

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
  // WHAT THE BUILD RAN AND WHAT IT LOST (core/state/receipt.ts): a persona lost to a failed call is said here until a
  // later build reads it, with the command that does.
  // A REBUILD'S RECEIPT (cli/runtime.ts `carryReceipt`) carries the build's stages under the new version and names the command
  // that rebuilt it from which version; one carried from a version with no receipt has no stages, and says so.
  const receipt = store.getReceipt(L, active); const lost = receipt ? degradedStages(receipt) : [];
  if (receipt?.stages.length) console.log(`  stages         ${describeStages(receipt.stages).replace(/^Stages: /, '')}`);
  const rebuilt = receipt?.rebuilt ? `; rebuilt by ${receipt.rebuilt.by} from ${receipt.rebuilt.from ?? 'no earlier version'}${receipt.stages.length ? '' : ', which has no receipt (built before receipts were kept)'}` : '';
  // `--persona auto` reads the persona, its moves and the scope again; a method stage lost part of its checks is repaired by building from the method again.
  const repair = lost.some((x) => x.id === 'persona' || x.id === 'moves' || x.id === 'scope') ? `. Repair: atelier build --name ${name} --persona auto` : '';
  console.log(`  build          ${receipt ? `receipt ${receipt.receiptHash}${lost.length ? `; built without: ${lost.map((x) => `${x.id} (${x.why})`).join(', ')}${repair}` : receipt.stages.length ? '; complete' : ''}${rebuilt}` : 'no receipt (built before receipts were kept)'}`);
  const stale = staleChecks(L);
  if (stale) console.log(`  checks         ${stale}`);
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
  console.log(`  uses           ${store.listLearningInvocations(L).length} recorded`);
  console.log(`  waiting        ${pending.length} candidate(s)`);
  const carry = store.getCarry(L);
  if (carry) console.log(`  evolve         ${carry.standardVersion === v.standardVersionHash ? `carries ${carry.drafts} draft(s)${carry.note.trim() ? ' and a note on what drafts leave out' : ''}, adopted ${carry.adoptedAt.slice(0, 10)}` : store.CARRY_RETIRED}`);
  console.log(`  last tended    ${lastTend ? String(lastTend.at) : 'never (atelier tend --skill ' + name + ')'}`);
}

/**
 * SELF-IMPROVEMENT THAT CAN UNDO ITSELF. `tend --auto` may install a version the search found; if later
 * uses show that version breaking a measured rule clearly more often than the one it replaced
 * (core/mining/recurrence.ts, regressedRules), the install is undone. Only an install the loop made
 * itself (AUTO_PROMOTE) is undone, and only with --auto: a version a person promoted is theirs. Returns
 * the digest line, or null.
 */
function undoOwnRegression(L: store.StoreLayout, active: string, events: readonly Record<string, unknown>[], rates: readonly VersionBreakRates[]): string | null {
  if (!argv.includes('--auto')) return null;
  const installed = [...events].reverse().find((e) => e.kind === 'PROMOTED' && e.skillVersionHash === active);
  const previous = typeof installed?.supersededActive === 'string' ? installed.supersededActive : null;
  if (installed?.authority !== 'AUTO_PROMOTE' || !previous) return null;
  const worse = regressedRules(rates, active, previous);
  if (!worse.length) return null;
  const why = worse.map((w) => `${w.requirementId} broke in ${Math.round(w.after * 100)}% of first drafts, against ${Math.round(w.before * 100)}% before`).join('; ');
  const r = rollbackTo(L, previous, `an automatic install made a rule break more often: ${why}`);
  return r.ok ? `undid its own install of ${active}: it made the drafts worse (${why}); ${previous} is active again`
    : `its own install of ${active} made the drafts worse (${why}) but could not be undone: ${r.why}`;
}
