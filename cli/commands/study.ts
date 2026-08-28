// atelier/cli/commands/study.ts — SEAL A SUITE, OR READ ONE BACK. NO INFERENCE, NO SPEND.
//
// This exists so the machinery a paper reports and the machinery a user runs are reachable through
// the same binary. For two studies they were not: the deciding code lived in a throwaway script and
// `core/contract/` had never executed a study, so a published instrument was not the shipped one.
//
// Execution lives in `studies/harness/run-study.mjs`, which imports these same modules from `dist`
// and decides nothing itself. Sealing and analysis are here because they need no provider, which
// means they can be exercised — and audited — without spending anything.

import { argv, flag, die, numericFlag } from '../runtime.js';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { readJson } from '../../core/state/read-json.js';
import {
  sealStudySuite, toContextRates, analyseStratum, SuiteNotDiverse,
  type StudyContext, type StudyGeneration, type SealedStudySuite, type StudyKind,
} from '../../core/contract/study.js';
import { decompose, describeEstimate, pairedBootstrap } from '../../core/contract/analysis.js';
import { headroomOf, unmeasurableReason, screenCandidate } from '../../core/contract/headroom.js';
import { worstPair } from '../../core/contract/diversity.js';

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

export function study(): void {
  switch (argv[1]) {
    case 'seal': return seal();
    case 'analyse': case 'analyze': return analyse();
    case 'screen': return screen();
    default: die('usage: atelier study <seal|analyse|screen> [options]');
  }
}
