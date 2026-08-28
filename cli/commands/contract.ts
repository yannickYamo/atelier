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
import { resolveServedSkill } from './invoke.js';

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
  const outcomes: CaseOutcome[] = [];
  console.log(`\nRunning ${toRun.length} case(s) on the ${onHoldout ? 'HOLDOUT' : 'search'} half.\n`);
  for (const c of toRun) {
    const outcome = await runCase(client, budget, c, async (task) => {
      const r = await client.complete({
        stableBlock: servedText, variableBlock: '', userMessage: task,
        toolName: 'emit_output', toolDescription: 'Produce the requested work.',
        schema: { type: 'object', properties: { output: { type: 'string' } },
          required: ['output'], additionalProperties: false },
        maxTokens: 1200,
      });
      // The schema declares `output` as a string, but a schema is what was ASKED for and a provider
      // may return anything. Coercing an object here would serve "[object Object]" to the reader as
      // though it were the skill's work.
      const out = (r.json as { output?: unknown }).output;
      return typeof out === 'string' ? out : '';
    });
    outcomes.push(outcome);
    const mark = { PASS: 'pass', FAIL: 'FAIL', APPARENT_PASS: 'appears ok',
      APPARENT_FAIL: 'APPEARS WRONG', UNOBSERVED: 'not observed' }[outcome.verdict];
    console.log(`  ${c.caseId}  ${mark.padEnd(14)} ${c.obligationId}`);
  }

  const result = foldOutcomes(suite, active, onHoldout ? 'HOLDOUT' : 'SEARCH', outcomes);
  console.log(`\n${describeContractResult(result)}`);

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
