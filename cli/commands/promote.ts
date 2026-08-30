// cli/commands/promote.ts — Comparing a candidate against what is in use, and adopting it.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import type { Budget } from '../../core/inference/client.js';
import { foldRepairs } from '../../core/architecture/repair-memory.js';
import { compareOnRule, describeObservedComparison } from '../../core/fidelity/run-observer.js';
import { rankByObserver, describeRanking } from '../../core/fidelity/rule-observer.js';
import * as store from '../../core/state/store.js';
import { selfEvaluatedOnly, rankForPromotion } from '../../core/fidelity/provenance.js';
import { foldJudgements, rationalesFor, agreement, describeAgreement, describeJudgements } from '../../core/fidelity/judgement.js';

import { DATA, die, argv, flag, MODEL, clientFor, numericFlag, skillArg } from '../runtime.js';

// ── promote ─────────────────────────────────────────────────────────────────────────────────
/**
 * SAY NO TO A CANDIDATE, AND HAVE IT REMEMBERED.
 *
 * Without this, a rejection is a thing that happens in a person's head and leaves no trace — so the
 * only outcomes the system can ever learn from are the ones where it was right. `reject` is what
 * makes the g9 case (proposed, built, evaluated, rejected) something the loop knows rather than
 * something a transcript records.
 */
export function reject(): void {
  const name = skillArg();
  const cand = flag('--candidate') ?? die('--candidate <skillVersionHash> required');
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const rec = foldRepairs(store.readEvents(L)).find((r) => r.candidateSkillVersionHash === cand)
    ?? die(`no repair produced ${cand} for ${name}, so there is nothing to reject.`);
  if (rec.outcome !== 'PENDING') die(`${cand} was already ${rec.outcome.toLowerCase()}. That decision stands; this command does not overturn it.`);

  const note = flag('--why') ?? null;
  const generations = store.listInvocations(L).filter((r) => r.skillVersionHash === cand).length;
  const at = new Date().toISOString();
  store.appendEvent(L, { kind: 'REPAIR_SETTLED', repairId: rec.repairId, outcome: 'REJECTED',
    evaluationBasis: { generations: Math.max(generations, 1), instrument: 'HUMAN_EYE', orderInvariant: null },
    at, note });

  // THE SAME DECISION, WRITTEN WHERE IT CAN BE MEASURED AGAINST THE INSTRUMENT. `REPAIR_SETTLED`
  // answers "what happened to this repair"; this answers "which output did the expert prefer on this
  // rule, and why", which is the only question that can ever tell us whether the comparator is
  // imitating the right thing. Rejecting keeps the champion, so the choice is CHAMPION.
  store.appendEvent(L, { kind: 'JUDGEMENT_RECORDED', requirementId: rec.requirementId,
    championSkillVersionHash: rec.sourceSkillVersionHash, candidateSkillVersionHash: cand,
    choice: 'CHAMPION', rationale: note, at });

  console.log(`Rejected ${cand} — ${rec.requirementId}: ${rec.from} -> ${rec.to}.`);
  console.log(`  Recorded against ${rec.evidenceBasis.missContexts} observed miss(es) and ${Math.max(generations, 1)} generation(s).`);
  console.log(`\nThis will not be retried on evidence no stronger than that. It is NOT ruled out: one generation`);
  console.log(`is stochastic, so more independent misses or a better instrument would make it a new question.`);
  if (!note) console.log(`\n  Tip: --why "<what was wrong>" is worth ten seconds — it is what you read next time.`);

  // ── A DIFFERENT STATEMENT, WHICH HAS TO BE MADE DELIBERATELY ────────────────────────────────
  //
  // "This candidate is worse" and "never use self-checks for this rule" are not the same claim, and
  // only the first was made by rejecting. The second is an architectural constraint carrying your
  // authority, so it is a separate flag that says out loud what is being asserted — never something
  // the system infers from a rejection.
  if (argv.includes('--never-this-transition')) {
    const why = note ?? die('--never-this-transition needs --why: a permanent architectural rule should say why.');
    store.appendEvent(L, { kind: 'TRANSITION_FORBIDDEN', requirementId: rec.requirementId,
      from: rec.from, to: rec.to, by: 'expert', reason: why, at });
    console.log(`\nAND you ruled the move out entirely: ${rec.requirementId} will never move ${rec.from} -> ${rec.to}.`);
    console.log(`That is a decision about your architecture rather than about this candidate, so no amount of`);
    console.log(`evidence reopens it. It is yours to withdraw.`);
  }

  console.log(`\nYour active version is unchanged, and so is your standard.`);
}

/**
 * ORDER TWO VERSIONS FOR YOUR ATTENTION. DECIDES NOTHING.
 *
 * `improve` ends by telling you to run the candidate and compare — which until now meant reading two
 * outputs side by side and forming an impression. This does the reading, on the ONE rule the repair
 * was for, blind and twice with the sides exchanged.
 *
 * It cannot promote and does not try. The instrument has never been checked against the user's own
 * judgement, so its preference is one model's opinion; the only thing the second run establishes is
 * that it is a STABLE opinion rather than a reading of which text came first.
 */
export async function compare(): Promise<void> {
  const name = skillArg();
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const cand = flag('--candidate') ?? die('--candidate <skillVersionHash> required');
  const rule = flag('--rule') ?? die('--rule <requirementId> required — a comparison is ON something, and "which is better overall" is the question that rewards fluency.');

  const runs = store.listInvocations(L);
  const candRun = runs.find((r) => r.skillVersionHash === cand)
    ?? die(`no invocation of ${cand}. Run it first:\n  atelier invoke --skill ${name} --candidate ${cand} "<the same task>"`);
  // the champion run must be THE SAME TASK, or the comparison is between two different questions
  const champRun = runs.find((r) => r.skillVersionHash !== cand && r.inputHash === candRun.inputHash)
    ?? die(`no run of your current version on the same task. A comparison across different tasks compares the tasks.`);

  const sv = store.getSkillVersion(L, cand) ?? die(`no SkillVersion ${cand}.`);
  const std = store.getStandard(L, sv.standardVersionHash) ?? die('standard missing.');
  const req = std.requirements.find((r) => r.requirementId === rule)
    ?? die(`${rule} is not in this standard. Rules: ${std.requirements.map((r) => r.requirementId).join(', ')}`);

  // ── WHAT YOU ALREADY SAID ABOUT THIS RULE ───────────────────────────────────────────────────
  //
  // Shown BEFORE the instrument's reading, on purpose. These are the expert's own words on the same
  // requirement from earlier decisions, and reading them after a machine verdict would be reading
  // them as corroboration. They are the standing context the verdict has to survive.
  const prior = rationalesFor(foldJudgements(store.readEvents(L)), rule);
  if (prior.length) {
    console.log(`\nWhat you have said about ${rule} before:`);
    for (const r of prior.slice(-3)) console.log(`  chose ${r.choice.toLowerCase()} — ${r.rationale}`);
  }

  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 0.3), maxCalls: numericFlag('--max-calls', 8) };
  const client = clientFor(flag('--model') ?? MODEL);
  const c = await compareOnRule(client, budget, candRun.invocationId, candRun.input, req.statement,
    champRun.output, candRun.output);

  // RECORDED WHATEVER IT SAID, including the verdicts that cannot be scored against a human pick.
  // Keeping only the occasions the observer committed would leave a ledger that flatters it.
  store.appendEvent(L, { kind: 'COMPARISON_OBSERVED', requirementId: rule,
    championSkillVersionHash: champRun.skillVersionHash, candidateSkillVersionHash: cand,
    result: c.result, orderInvariant: c.orderInvariant, lengthRatio: c.lengthRatio,
    at: new Date().toISOString() });

  console.log(`\n${describeObservedComparison(c, req.statement)}`);
  // The ranking's first key is a rule-specific proxy, and Atelier has none — so the order is the
  // observer's alone. Printed anyway because the half that still bites without a proxy is the tie
  // report, and a tie at the top means any pick from it is arbitrary.
  const ranked = rankByObserver([
    { candidateId: `candidate:${cand.slice(0, 8)}`, result: c.result, proxy: 'UNKNOWN' },
    { candidateId: `current:${champRun.skillVersionHash.slice(0, 8)}`,
      result: c.result === 'CANDIDATE_COMPLIES_BETTER' ? 'CHAMPION_COMPLIES_BETTER'
        : c.result === 'CHAMPION_COMPLIES_BETTER' ? 'CANDIDATE_COMPLIES_BETTER' : c.result,
      proxy: 'UNKNOWN' },
  ]);
  if (c.orderInvariant) console.log(`${describeRanking(ranked)}\n`);
  console.log(`($${c.costUsd.toFixed(4)})  You decide:  atelier promote --skill ${name} --candidate ${cand} --why "<what made you pick it>"`);
  console.log(`  That reading is now on file. Your decision completes the pair, and the two together are the`);
  console.log(`  only evidence that will ever say whether this instrument agrees with you:  atelier judgements --skill ${name}`);
}

/**
 * ADOPT A CANDIDATE. MOVES A POINTER. MINTS NOTHING.
 *
 * If promotion built anything, the person would be adopting an artifact they never saw — and the
 * provenance bug Atelier exists to prevent would live in the adoption step itself. So promote reads
 * an existing SkillVersion and writes `active.json`. That is all it does.
 *
 * IT REFUSES A CANDIDATE NOBODY RAN. "The exact package evaluated is the exact package promoted" is
 * only checkable if an evaluation happened, and the record of an evaluation is an InvocationRecord
 * against that SkillVersion. Without one there is no evidence the person saw anything, and adopting
 * on the strength of a diff they were shown in a terminal is not the same claim.
 */
export function promote(): void {
  const name = skillArg();
  const cand = flag('--candidate') ?? die('--candidate <skillVersionHash> required');
  // ── A PROMOTION WITHOUT A REASON IS A LABEL WITH NO LEARNING SIGNAL ──────────────────────────
  //
  // This command already refuses a candidate nobody ran, on the grounds that promotion adopts what a
  // person EVALUATED and a pointer move is not evidence anyone looked. The same argument reaches one
  // step further: on a rule no automatic check can measure, the person IS the sensor, and a sensor
  // that records which way it moved but not what it saw cannot be checked against anything.
  //
  // It is also the cheapest thing in the system. One sentence, once per promotion, is the entire cost
  // of the only expert-labelled corpus this project will ever have.
  const why = flag('--why') ?? die('--why "<what made you pick it>" is required.\n'
    + '  Promotion is your judgement on a rule nothing else can measure, so your reason is the reading.\n'
    + '  It is read back to you the next time you compare on the same rule, and it is what makes the\n'
    + '  observer checkable against you at all:  atelier judgements --skill ' + name);
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const sv = store.getSkillVersion(L, cand) ?? die(`no SkillVersion ${cand} for ${name}.`);
  const prevActive = store.getActive(L);

  const runs = store.listInvocations(L).filter((r) => r.skillVersionHash === cand);
  if (!runs.length) {
    die(`${cand} has never been invoked. Promotion adopts what a person evaluated, and there is no record of anyone running this. Do that first:\n  atelier invoke --skill ${name} --candidate ${cand} "<the same task>"`);
  }
  // AND NOT ONLY BY THE PROCESS THAT MADE IT. "Someone ran it" was satisfied by a search harness
  // invoking its own candidate — the optimizer's account of its own work, standing in for evidence a
  // person saw something.
  if (selfEvaluatedOnly(runs.map((r) => r.provenance))) {
    die(`PROMOTION REFUSED: every run of ${cand} was made by the optimizer evaluating its own candidate.\n`
      + `That is the process that produced it reporting on itself. Run it yourself and look at the output:\n`
      + `  atelier invoke --skill ${name} --candidate ${cand} "<the same task>"`);
  }
  // the strongest available account anchors the package-identity check, not whichever came back first
  const evaluated = rankForPromotion(runs)[0];
  if (evaluated.servedPackageHash !== sv.materializedHash) {
    die(`PROMOTION REFUSED: invocation ${evaluated.invocationId} served package ${evaluated.servedPackageHash} but ${cand} claims ${sv.materializedHash}. The thing that was evaluated is not the thing being promoted.`);
  }

  const prevSv = prevActive ? store.getSkillVersion(L, prevActive) : null;
  if (prevSv && prevSv.standardVersionHash !== sv.standardVersionHash) {
    die(`PROMOTION REFUSED: ${cand} is bound to StandardVersion ${sv.standardVersionHash} but ${prevActive} is bound to ${prevSv.standardVersionHash}. Promoting would silently move what good means; that is not what this command does.`);
  }

  // ── WHICH RULE IS THIS A JUDGEMENT ABOUT? JOINED, NEVER GUESSED ──────────────────────────────
  //
  // A comparison is ON something and a promotion is of a whole package, so the rules this decision is
  // evidence about are the ones actually compared on this exact pair. Those are read from the log.
  // `--rule` names one explicitly when you promoted without comparing; the repair's own requirement is
  // the last fallback. When none of the three yields a rule, nothing rule-specific is written, because
  // a judgement filed against a requirement nobody examined is a fabricated label.
  const events = store.readEvents(L);
  const compared = foldJudgements(events)
    .filter((r) => r.observer && r.candidateSkillVersionHash === cand
      && r.championSkillVersionHash === (prevActive ?? ''))
    .map((r) => r.requirementId);
  const promotedRepair = foldRepairs(events).find((r) => r.candidateSkillVersionHash === cand && r.outcome === 'PENDING');
  const explicitRule = flag('--rule');
  const rules = explicitRule ? [explicitRule]
    : compared.length ? compared
      : promotedRepair ? [promotedRepair.requirementId] : [];

  store.setActive(L, cand);
  const at = new Date().toISOString();
  if (promotedRepair) {
    store.appendEvent(L, { kind: 'REPAIR_SETTLED', repairId: promotedRepair.repairId, outcome: 'PROMOTED',
      evaluationBasis: { generations: runs.length, instrument: 'HUMAN_EYE', orderInvariant: null },
      at, note: why });
  }
  for (const requirementId of rules) {
    store.appendEvent(L, { kind: 'JUDGEMENT_RECORDED', requirementId,
      championSkillVersionHash: prevActive ?? '', candidateSkillVersionHash: cand,
      choice: 'CANDIDATE', rationale: why, at });
  }
  store.appendEvent(L, { kind: 'PROMOTED', at, skillVersionHash: cand,
    supersededActive: prevActive, evaluatedInvocation: evaluated.invocationId, packageHash: sv.materializedHash });

  console.log(`\nPromoted ${cand}.`);
  console.log(`  evaluated on   ${evaluated.invocationId}  (package ${evaluated.servedPackageHash})`);
  console.log(`  promoted       package ${sv.materializedHash}  — the same one, which is the point`);
  console.log(`  StandardVersion ${sv.standardVersionHash}  — unchanged`);
  console.log(`  previous       ${prevActive ?? '(none)'} remains in history:  atelier rollback --to ${prevActive ?? ''}`);
  if (rules.length) {
    console.log(`\n  Your reason is on file against ${rules.join(', ')}. You will see it the next time you compare on`);
    console.log(`  ${rules.length > 1 ? 'those rules' : 'that rule'}, and it is now one row in:  atelier judgements --skill ${name}`);
  } else {
    console.log(`\n  Your reason was recorded with the promotion but not against any rule, because nothing named what`);
    console.log(`  this decision was about. Compare first, or pass --rule <requirementId>, and it becomes a row that`);
    console.log(`  can be checked against the observer.`);
  }
}

// ── judgements ──────────────────────────────────────────────────────────────────────────────
/**
 * THE LEDGER, AND THE ONE MEASUREMENT IT MAKES POSSIBLE.
 *
 * `compare` writes what the instrument said. `promote --why` and `reject --why` write what you said.
 * This joins them and shows where they landed, which is the first time in this project that the
 * comparator can be checked against the expert it is imitating rather than described as unchecked.
 *
 * It reports cells and withholds a rate below a stated floor, and above that floor it prints the rate
 * with the two things it does not establish attached to the same paragraph. The disagreements are the
 * point: a row where the observer preferred one output and you preferred the other, with your reason
 * beside it, is the only artefact that says what the instrument is actually measuring.
 */
export function judgements(): void {
  const name = skillArg();
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const records = foldJudgements(store.readEvents(L));
  const rule = flag('--rule');
  const shown = rule ? records.filter((r) => r.requirementId === rule) : records;
  if (rule && !shown.length) die(`no judgements recorded against ${rule}. Rules with rows: ${[...new Set(records.map((r) => r.requirementId))].join(', ') || '(none)'}`);

  console.log(describeJudgements(shown));
  console.log(describeAgreement(agreement(shown)));
}
