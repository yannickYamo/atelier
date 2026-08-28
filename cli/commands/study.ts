// atelier/cli/commands/study.ts — SEAL A SUITE, OR READ ONE BACK. NO INFERENCE, NO SPEND.
//
// This exists so the machinery a paper reports and the machinery a user runs are reachable through
// the same binary. For two studies they were not: the deciding code lived in a throwaway script and
// `core/contract/` had never executed a study, so a published instrument was not the shipped one.
//
// Execution lives in `studies/harness/run-study.mjs`, which imports these same modules from `dist`
// and decides nothing itself. Sealing and analysis are here because they need no provider, which
// means they can be exercised — and audited — without spending anything.

import { argv, flag, die, numericFlag, DATA } from '../runtime.js';
import { isGeneralScope } from '../../core/state/canonical-state.js';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { readJson } from '../../core/state/read-json.js';
import {
  sealStudySuite, toContextRates, analyseStratum, SuiteNotDiverse,
  type StudyContext, type StudyGeneration, type SealedStudySuite, type StudyKind,
} from '../../core/contract/study.js';
import { decompose, describeEstimate, pairedBootstrap } from '../../core/contract/analysis.js';
import { headroomOf, unmeasurableReason, screenCandidate } from '../../core/contract/headroom.js';
import { worstPair } from '../../core/contract/diversity.js';
import { profileAll, detectAll, type HumanLabel } from '../../core/contract/observers/aphorism.js';
import { checkMechanismExposure, describeExposure, type ExposureFacts } from '../../core/contract/mechanism-exposure.js';
import { ablateCarrier, assertSemanticClosure, describeAblation, AblationRefused } from '../../core/contract/carrier-ablation.js';
import { compileArchitecture } from '../../core/architecture/compile.js';
import * as store from '../../core/state/store.js';
import type { StandardVersion } from '../../core/state/canonical-state.js';

function seal(): void {
  const src = flag('--contexts') ?? die('usage: atelier study seal --contexts <file.json> --out <file.json>');
  const out = flag('--out') ?? die('--out <file.json> required');
  const frozenAt = flag('--frozen-at') ?? new Date().toISOString();
  const { contexts, decisions = [] } = readJson<{ contexts: StudyContext[]; decisions?: [] }>(
    src, { requireKeys: ['contexts'], what: 'the context list' });

  let sealed: SealedStudySuite;
  try {
    sealed = sealStudySuite(contexts, decisions, frozenAt);
  } catch (e) {
    if (e instanceof SuiteNotDiverse) die(e.message);
    throw e;
  }
  writeAtomic(out, JSON.stringify(sealed, null, 1));

  const w = worstPair(contexts.map((c) => ({ id: c.contextId, task: c.task })));
  console.log(`sealed ${sealed.contexts.length} contexts -> ${sealed.suiteHash}`);
  console.log(`  frozen at        ${sealed.frozenAt}`);
  console.log(`  diversity        threshold ${sealed.diversity.threshold}, `
    + `${sealed.diversity.decisions.filter((d) => !d.accepted).length} candidates rejected`);
  console.log(`  worst pair       ${w ? `${w.a}/${w.b} at ${w.overlap.toFixed(3)}` : 'n/a'}`);
  console.log('\nOnce sealed, nothing may be added, removed or reworded. The rejection ledger travels');
  console.log('with the suite so what the gate excluded stays auditable.');
}

function analyse(): void {
  const suite = readJson<SealedStudySuite>(flag('--suite') ?? die('--suite <sealed.json> required'),
    { requireKeys: ['suiteHash', 'contexts'], what: 'the sealed suite' });
  const { generations } = readJson<{ generations: StudyGeneration[] }>(
    flag('--results') ?? die('--results <results.json> required'),
    { requireKeys: ['generations'], what: 'the study results' });
  const seed = numericFlag('--seed', 20_260_828);

  const arms = [...new Set(generations.map((g) => g.arm))].sort();
  const control = flag('--control') ?? arms[0] ?? die('no arms in the results');
  const invalid = generations.filter((g) => g.validity !== 'COMPLETE');

  console.log(`suite ${suite.suiteHash}  arms ${arms.join(', ')}  control ${control}`);
  console.log(`invalid generations ${invalid.length}/${generations.length}`
    + (invalid.length ? ` — never scored, never rerun` : ''));

  for (const kind of ['SHOULD_FIRE', 'SHOULD_NOT_APPLY'] as StudyKind[]) {
    const ids = new Set(suite.contexts.filter((c) => c.kind === kind).map((c) => c.contextId));
    const rows = toContextRates(generations.filter((g) => ids.has(g.contextId)));
    if (rows.length === 0) continue;
    console.log(`\n${kind} — n=${rows.length} contexts, the independent unit`);

    const prose = flag('--prose'); const compiled = flag('--compiled');
    if (prose && compiled) {
      // THE DECOMPOSITION. A two-arm study cannot separate "the rules helped" from "the compiler
      // helped", and only the second is a claim about this product.
      const d = decompose(rows, { bare: control, prose, compiled }, { seed });
      console.log(`  the standard  ${describeEstimate(d.standardEffect)}`);
      console.log(`  the compiler  ${describeEstimate(d.compilerEffect)}`);
      console.log(`  total         ${describeEstimate(d.totalEffect)}`);
    } else {
      for (const a of arms.filter((x) => x !== control)) {
        console.log(`  ${describeEstimate(pairedBootstrap(rows, a, control, { seed }))}`);
      }
    }

    // MEASURABILITY IS ASKED PER DIRECTION. A control at ceiling destroys a lift question and is the
    // ideal baseline for a harm one; a single ceiling rule would be wrong half the time.
    const stratum = analyseStratum(suite, generations, kind, arms.at(-1) ?? control, control, { seed });
    const why = unmeasurableReason(headroomOf(stratum.controlRate, rows.length),
      kind === 'SHOULD_FIRE' ? 'LIFT' : 'HARM');
    console.log(`  control rate  ${stratum.controlRate.toFixed(3)}`);
    if (why) console.log(`  ${why}`);
  }

  console.log('\nStrata are reported separately and are never averaged: they have different');
  console.log('denominators and answer different questions.');
}

function screen(): void {
  // Calibration: which candidate behaviour is even worth studying. BARE only, so it is cheap.
  const { candidates } = readJson<{
    candidates: { behaviourId: string; activation: number; restraint: number; contexts: number }[];
  }>(flag('--candidates') ?? die('--candidates <file.json> required'),
    { requireKeys: ['candidates'], what: 'the calibration candidates' });
  const rows = candidates;
  for (const r of rows) {
    const v = screenCandidate({
      behaviourId: r.behaviourId,
      activation: headroomOf(r.activation, r.contexts),
      restraint: headroomOf(r.restraint, r.contexts),
    });
    console.log(`${v.qualifies ? 'QUALIFIES' : 'rejected '}  ${r.behaviourId.padEnd(28)} ${v.why}`);
  }
  console.log('\nCalibration selects a behaviour and sizes the study. It contributes no figure to the');
  console.log('confirmatory comparison, and its contexts are burned rather than reused.');
}

/**
 * May a study on this standard claim to test a carrier at all?
 *
 * Static: no inference, no spend. Compiles the standard, reports every requirement's carrier, and
 * runs the eight exposure conditions against the named target. A FAIL is a finding, not an obstacle
 * — the reportable sentence is that the available standards do not permit a valid test.
 */
function eligibility(): void {
  const name = flag('--skill') ?? die('usage: atelier study eligibility --skill <name> --target <requirementId>');
  const target = flag('--target') ?? die('--target <requirementId> required — a study must NAME the mechanism it tests');
  const L: store.StoreLayout = { root: DATA, skillName: name };
  // Resolved through the ACTIVE SkillVersion rather than guessed: the standard a study must audit is
  // the one the skill actually serves, not the newest one on disk.
  const active = store.getActive(L) ?? die(`${name} has no active SkillVersion — build it first.`);
  const svHash = flag('--standard')
    ?? store.getSkillVersion(L, active)?.standardVersionHash
    ?? die(`the active SkillVersion ${active} names no standard.`);
  const v: StandardVersion = store.getStandard(L, svHash) ?? die(`standard ${svHash} is missing.`);

  const full = compileArchitecture(v);
  console.log(`standard ${v.standardVersionHash} — ${full.components.length} components\n`);
  for (const c of full.components) {
    console.log(`  ${c.carries.join('+').padEnd(18)} ${c.carrier.padEnd(16)} ${c.gateRole}`);
  }

  let ablated;
  try {
    ablated = ablateCarrier(v, target, 'PROSE');
    assertSemanticClosure(full, ablated);
  } catch (e) {
    if (e instanceof AblationRefused) die(`\nablation refused: ${e.message}`);
    throw e;
  }
  console.log(`\n${describeAblation(ablated)}`);

  const r = v.requirements.find((x) => x.requirementId === target);
  const facts: ExposureFacts = {
    targetRequirementId: target,
    targetCarrier: ablated.originalCarrier,
    targetAuthority: r?.authority ?? 'UNKNOWN',
    // GENERAL scope needs no instrument to decide applicability, which is why it is preferred.
    applicabilityBasis: r && isGeneralScope(r.appliesWhen) ? 'GENERAL' : 'MODEL_JUDGED',
    // Supplied by the caller until a sealed suite exists to count against; a study reads it from there.
    contextsExercisingTarget: numericFlag('--contexts-exercising', 0),
    observationMode: flag('--observation') ?? 'STRUCTURAL',
    controlCarrier: ablated.ablatedCarrier,
    // Proven from an invocation record, never assumed. Absent evidence is absent delivery.
    deliveredAtRuntime: argv.includes('--delivery-proven'),
    normativeSetsMatch: true,
  };
  console.log(`\n${describeExposure(checkMechanismExposure(facts))}`);
}

/**
 * Score candidate observers against a HUMAN-SEALED key.
 *
 * The direction matters and is the whole reason this runs before a suite is built. An endpoint that
 * no instrument can observe is a study blocked on instrument design, and learning that costs a
 * labelling session rather than a sealed suite and several hundred generations.
 *
 * The key is the expert's. No model votes here: a model-labelled key would make this a measurement
 * of agreement between two model judgments, which is not what an accuracy number is read as.
 */
function observe(): void {
  const passages = readJson<{ id: string; text: string }[]>(
    flag('--candidates') ?? die('--candidates <passages.json> required'), { what: 'the passages' });
  const labels = readJson<{ id: string; label: HumanLabel }[]>(
    flag('--key') ?? die('--key <labels.json> required — the expert\'s labels, not a model\'s'),
    { what: 'the human key' });

  const byId = new Map(passages.map((p) => [p.id, p.text]));
  const cases = labels
    .filter((l) => byId.has(l.id))
    .map((l) => ({ passage: byId.get(l.id)!, label: l.label }));
  const unsure = cases.filter((c) => c.label === 'UNSURE').length;

  console.log(`${cases.length} labelled passage(s); ${cases.length - unsure} decided, ${unsure} unsure.`);
  console.log('UNSURE is excluded from accuracy rather than counted as NO — folding abstention into');
  console.log('the negative class converts "could not tell" into "did not happen".\n');
  console.log('  detector       agree   recall   prec.   false-pass   false-fail');
  for (const p of profileAll(cases)) {
    console.log(`  ${p.detector.padEnd(14)} ${p.agreement.toFixed(2).padStart(5)}   `
      + `${p.recall.toFixed(2).padStart(5)}   ${p.precision.toFixed(2).padStart(5)}   `
      + `${String(p.falsePass).padStart(10)}   ${String(p.falseFail).padStart(10)}`);
  }
  console.log('\nA detector with high agreement and many FALSE PASSES is permissive: it under-reports');
  console.log('exactly the failures a study exists to find. Read the two columns, never the agreement alone.');

  if (argv.includes('--per-passage')) {
    console.log('\nper passage:');
    for (const l of labels) {
      const t = byId.get(l.id);
      if (!t) continue;
      const d = detectAll(t);
      console.log(`  ${l.id}  expert=${l.label.padEnd(6)} ` +
        Object.entries(d).map(([k, v]) => `${k}=${v ? 'Y' : 'n'}`).join(' ') + `  ${t.slice(0, 60)}`);
    }
  }
}

export function study(): void {
  switch (argv[1]) {
    case 'observe': return observe();
    case 'eligibility': return eligibility();
    case 'seal': return seal();
    case 'analyse': case 'analyze': return analyse();
    case 'screen': return screen();
    default: die('usage: atelier study <eligibility|observe|seal|analyse|screen> [options]');
  }
}
