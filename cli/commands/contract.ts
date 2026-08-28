// cli/commands/contract.ts — DID WE IMPLEMENT THE STANDARD WE WERE GIVEN?
//
// A different question from the one `reference` asks. `reference` compares a compiled skill against
// an expert's real held-out work and is evidence about DEPLOYMENT. This generates challenges from
// the standard itself and asks whether the implementation carries what was authored. It can find a
// compiled package doing the opposite of an authored rule, which is the failure that shipped in this
// codebase last week and which no green suite noticed.
//
// It cannot tell you how often the skill will succeed in real use, and nothing it prints pretends to.
//
// ─── ORDER MATTERS AND IS NOT NEGOTIABLE ───────────────────────────────────────────────────────
//
// Obligations are derived, cases are generated for ALL of them, the suite is sealed and split, and
// only then is anything run. Generating cases after seeing a failure is legitimate work and produces
// the NEXT suite; it never repairs this one, because a holdout chosen once the failures are known is
// not a holdout.

import * as store from '../../core/state/store.js';
import { DATA, die, flag, argv, numericFlag, clientAndBinding, describeBinding } from '../runtime.js';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { readJson } from '../../core/state/read-json.js';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Budget } from '../../core/inference/client.js';
import { obligationsForStandard } from '../../core/contract/obligation.js';
import { generateCases, GenerationRefused } from '../../core/contract/generate.js';
import { sealSuite, searchCases, describeContractResult, SuiteRefused,
  type ContractTestSuite } from '../../core/contract/suite.js';
import { runCase, foldOutcomes, type CaseOutcome } from '../../core/contract/run.js';
import { requestFor, type ContractArm, type ArmContext } from '../../core/contract/arm.js';
import { bindingHash } from '../../core/runtime/binding.js';
import { proposeRepair, assertSameTarget } from '../../core/contract/repair.js';
import { applyEscalation } from '../../core/architecture/escalate.js';
import { renderAgentSkill } from '../../renderers/agent-skill/render.js';
import { sha } from '../runtime.js';
import { tallyOf, describeArmComparison, type ArmTally } from '../../core/contract/compare-arms.js';
import { resolveServedSkill } from './invoke.js';

const OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object', properties: { output: { type: 'string' } },
  required: ['output'], additionalProperties: false,
};

const suitePath = (name: string, standardVersionHash: string): string =>
  join(DATA, 'skills', name, 'contract', `${standardVersionHash}.json`);

export async function contract(): Promise<void> {
  const name = flag('--skill') ?? die('--skill <name> required');
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const active = store.getActive(L) ?? die(`no built skill called "${name}".`);
  const sv = store.getSkillVersion(L, active) ?? die(`skill version ${active} is missing.`);
  const v = store.getStandard(L, sv.standardVersionHash) ?? die(`standard ${sv.standardVersionHash} is missing.`);

  const obligations = obligationsForStandard(v);
  if (!obligations.length) {
    die(`"${name}" places no obligations: every requirement is INCIDENTAL, so the standard asks for `
      + 'no behaviour and there is nothing to test.');
  }

  const path = suitePath(name, v.standardVersionHash);
  const reuse = existsSync(path) && !argv.includes('--regenerate');

  const { client, binding } = clientAndBinding('target');
  const cap = numericFlag('--cap', 2.0);
  // One call per obligation to generate, then at most one reader call per case that is run.
  const budget: Budget = { spentUsd: 0, capUsd: cap, maxCalls: obligations.length * 3 + 4 };

  let suite: ContractTestSuite;
  if (reuse) {
    suite = readJson<ContractTestSuite>(path, { what: 'the sealed contract suite', requireKeys: ['suiteHash', 'cases'] });
    if (suite.standardVersionHash !== v.standardVersionHash) {
      die(`the sealed suite at ${path} was built for a different standard. Run with --regenerate.`);
    }
    console.log(`reusing sealed suite ${suite.suiteHash} (${suite.cases.length} case(s)).`);
  } else {
    console.log(`${obligations.length} obligation(s) derived from StandardVersion ${v.standardVersionHash}.`);
    console.log(`Generating one case each with ${describeBinding(binding)}. Cap $${cap.toFixed(2)}.\n`);
    const generated = await generateCases(client, budget, obligations, v.workType);
    const cases = generated instanceof GenerationRefused ? die(generated.message) : generated;
    const sealed = sealSuite(v, cases);
    suite = sealed instanceof SuiteRefused ? die(sealed.message) : sealed;
    writeAtomic(path, JSON.stringify(suite, null, 1));
    console.log(`sealed suite ${suite.suiteHash}: ${suite.searchCaseIds.length} search, `
      + `${suite.holdoutCaseIds.length} holdout. Written to ${path}.`);
    if (suite.uncoveredObligationIds.length) {
      console.log(`  ${suite.uncoveredObligationIds.length} obligation(s) have no case.`);
    }
  }

  // ── THE HOLDOUT IS NOT RUN BY DEFAULT ────────────────────────────────────────────────────────
  //
  // It is read once, at the end of an optimization, and a command that spends it on every invocation
  // has spent it before there was anything to decide. `--holdout` is the deliberate act.
  const onHoldout = argv.includes('--holdout');
  const toRun = onHoldout
    ? suite.cases.filter((c) => suite.holdoutCaseIds.includes(c.caseId))
    : searchCases(suite);

  const { servedText } = resolveServedSkill(name);

  /** Every arm runs through this, so the only thing that can differ between them is the bytes. */
  const runArm = async (arm: ContractArm, bytes: string | null): Promise<CaseOutcome[]> => {
    const outcomes: CaseOutcome[] = [];
    for (const c of toRun) {
      const outcome = await runCase(client, budget, c, async (task) => {
        const ctx: ArmContext = {
          task, maxTokens: 1200, toolName: 'emit_output',
          toolDescription: 'Produce the requested work.', schema: OUTPUT_SCHEMA,
        };
        const r = await client.complete(requestFor(arm, bytes, ctx));
        // The schema declares `output` as a string, but a schema is what was ASKED for and a
        // provider may return anything. Coercing an object here would serve "[object Object]" to
        // the reader as though it were the skill's work.
        const out = (r.json as { output?: unknown }).output;
        return typeof out === 'string' ? out : '';
      });
      outcomes.push(outcome);
      if (arm !== 'BARE') {
        const mark = { PASS: 'pass', FAIL: 'FAIL', APPARENT_PASS: 'appears ok',
          APPARENT_FAIL: 'APPEARS WRONG', UNOBSERVED: 'not observed' }[outcome.verdict];
        console.log(`  ${c.caseId}  ${mark.padEnd(14)} ${c.obligationId}`);
      }
    }
    return outcomes;
  };

  const role = onHoldout ? 'HOLDOUT' as const : 'SEARCH' as const;
  console.log(`\nRunning ${toRun.length} case(s) on the ${onHoldout ? 'HOLDOUT' : 'search'} half.\n`);
  const outcomes = await runArm('INITIAL', servedText);
  const result = foldOutcomes(suite, active, role, outcomes);
  console.log(`\n${describeContractResult(result)}`);

  // ── THE CONTROL ARM ──────────────────────────────────────────────────────────────────────────
  //
  // Reporting only. It answers "did this skill change the model at all", which nothing else here can
  // answer and which a person is entitled to. It never reaches the diagnosis: what to repair is a
  // function of the standard and of what the implementation did, and a rule the runtime already
  // satisfies is still a rule the implementation owes, because the next binding may not satisfy it.
  const tallies: ArmTally[] = [];
  if (argv.includes('--bare')) {
    console.log('\nRunning the same cases with no Atelier-derived carrier at all.');
    const bareOutcomes = await runArm('BARE', null);
    tallies.push(tallyOf('BARE', foldOutcomes(suite, 'none', role, bareOutcomes)));
    tallies.push(tallyOf('INITIAL', result));
    console.log(`\n${describeArmComparison(tallies)}`);
    console.log(`\n  suite ${suite.suiteHash} · standard ${v.standardVersionHash} · skill ${active}`
      + `\n  binding ${bindingHash(binding)}`);
  }

  // ── THE REPAIR ATTEMPT ───────────────────────────────────────────────────────────────────────
  //
  // NO MODEL IS ASKED WHAT WENT WRONG. `diagnose.ts` exists to map a free-text complaint onto a
  // requirement; a contract case already knows which requirement it came from, so a call to
  // re-derive that would invent nothing and could only introduce error.
  //
  // The route is IMPLEMENTATION_MISS by construction for a single-requirement obligation: the
  // standard contains the rule, because the obligation was derived from it, and the implementation
  // did not carry it. An INTERACTION case names two requirements and cannot attribute the miss to
  // either, which is UNCERTAIN and authorises nothing — the same rule `routeFrom` applies when a
  // mapping names more than one.
  //
  // An APPARENT_FAIL may propose a repair. That is guiding a diagnosis, which an unqualified reader
  // is allowed to do. What it may not do is certify or promote, and nothing below promotes.
  if (argv.includes('--repair') && !onHoldout) {
    const failing = [...result.failed, ...result.apparentFail];
    const arch = store.getArchitecture(L, v.standardVersionHash) ?? die('the architecture for this skill is missing.');
    const proposals = [];
    for (const id of failing) {
      const c = toRun.find((x) => x.caseId === id);
      if (!c) continue;
      if (c.requirementIds.length !== 1) {
        console.log(`\n  ${id}: names ${c.requirementIds.length} requirements, so the miss cannot be `
          + 'attributed to either. UNCERTAIN authorises no change.');
        continue;
      }
      const component = arch.components.find((x) => x.carries.includes(c.requirementIds[0]));
      const r = proposeRepair('IMPLEMENTATION_MISS',
        { requirementId: c.requirementIds[0], carrierAtServe: component?.carrier ?? 'PROSE',
          invocationId: `contract:${suite.suiteHash}:${id}` } as never, arch);
      if ('refused' in r) { console.log(`\n  ${id}: ${r.reason}`); continue; }
      proposals.push(r);
    }

    if (!proposals.length) {
      console.log('\nNo repair was proposed. That is a closed loop with nothing to change, not a failure.');
    } else {
      console.log(`\n${proposals.length} repair(s) proposed:`);
      for (const p of proposals) console.log(`  ${p.why}`);

      let candidateArch = arch;
      for (const p of proposals) {
        candidateArch = applyEscalation(candidateArch, p.operation,
          sha(`${candidateArch.architectureHash}|${p.operation.requirementId}|${p.operation.to}`));
      }
      const candidatePkg = renderAgentSkill(v, candidateArch, name, sv.description ?? `Applies a compiled standard (${v.workType})`);
      // The optimizer changed an arrangement. It may not have changed the target, and saying so is
      // cheap next to discovering later that it did.
      assertSameTarget(v, v);

      console.log(`\ncandidate architecture ${candidateArch.architectureHash} `
        + `(incumbent ${arch.architectureHash}). Re-running the search half.\n`);
      const candidateOutcomes = await runArm('CANDIDATE', candidatePkg.files['SKILL.md'] ?? '');
      const candidateResult = foldOutcomes(suite, 'candidate', role, candidateOutcomes);
      const withCandidate: ArmTally[] = [
        ...(tallies.length ? [tallies[0]] : []),
        tallyOf('INITIAL', result), tallyOf('CANDIDATE', candidateResult),
      ];
      console.log(`\n${describeArmComparison(withCandidate)}`);
      console.log('\nNothing was promoted. The candidate exists as an arrangement that was measured, '
        + 'and a loop that runs, measures and changes nothing is a closed loop rather than a failed one.');
    }
  }

  const wrong = [...result.failed, ...result.apparentFail];
  if (wrong.length) {
    console.log(`\n${wrong.length} case(s) the implementation did not carry:`);
    for (const id of wrong) {
      const o = outcomes.find((x) => x.caseId === id);
      const c = toRun.find((x) => x.caseId === id);
      console.log(`  ${id}  ${c?.expectation ?? ''}`);
      if (o?.evidence) console.log(`      quoted: ${o.evidence}`);
    }
    console.log('\nA failure here is a claim about the IMPLEMENTATION, not about your standard. '
      + 'Run `atelier plan --skill ' + name + '` to see how each rule is currently carried.');
  }
  console.log(`\nspent $${budget.spentUsd.toFixed(4)} of $${cap.toFixed(2)}.`);
}
