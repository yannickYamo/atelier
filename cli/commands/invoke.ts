// cli/commands/invoke.ts — Serving the package and recording what came back.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import type { Budget } from '../../core/inference/client.js';
import { findOwnershipBreaches, describeBreaches } from '../../core/state/output-ownership.js';
import { assertHistoryNotServed, foldRepairs } from '../../core/architecture/repair-memory.js';
import type { SkillVersion } from '../../core/state/canonical-state.js';
import * as store from '../../core/state/store.js';
import { checkSatisfiable, describeSatisfiability } from '../../core/state/prerequisite.js';
import { resolveProvenance } from '../../core/fidelity/provenance.js';

import { runOnce } from './improve.js';
import { compareBindings, describeMismatch, detectResolvedModelDrift } from '../../core/runtime/binding.js';
import { sha, DATA, die, argv, flag, clientAndBinding, describeBinding, numericFlag, positional, boundResources, assertSkillName } from '../runtime.js';

// ── invoke ──────────────────────────────────────────────────────────────────────────────────
/**
 * RUN THE SKILL, FOR REAL, AND RECORD WHAT RAN.
 *
 * This is the first execution surface Atelier has ever owned, and it exists because nothing else
 * can answer the question a repair depends on: *what exact implementation produced the output the
 * person disliked?* Until now a skill was built, installed, and then left; whatever happened next
 * happened inside a host Atelier never saw.
 *
 * ─── IT SERVES THE STORED PACKAGE. IT DOES NOT RE-DERIVE ONE. ───────────────────────────────────
 *
 * `study test` builds its arm by re-rendering rule statements out of the standard — no architecture,
 * no carriers, no sections. That is a second, quieter renderer, and anything measured through it is
 * measured on an artefact the product never installs. Doing the same here would make every carrier
 * escalation invisible to the very loop built to exercise it. So the bytes come from the package on
 * record, and the hash of what we serve is checked against the hash the SkillVersion claims.
 *
 * That check IS `deliveryEvidence`. It is also the whole of the DELIVERY_FAILURE route: a tampered
 * or stale artefact is caught here, deterministically, before any model is asked anything.
 */
/**
 * What a skill serves, resolved once and shared.
 *
 * EXTRACTED rather than copied. The held-out reference test needs to generate from exactly the payload
 * `invoke` generates from — same package, same routing, same delivery proof — and a second composition
 * path would be two owners of one question. If they ever disagreed, the reference result would describe
 * a payload no user ever received, which is the confound this whole module exists to rule out.
 */
export interface ServedSkill {
  readonly L: store.StoreLayout;
  readonly sv: SkillVersion;
  readonly servedText: string;
  readonly servedHash: string;
  readonly contractFile: string | null;
  readonly delivery: ReturnType<typeof deliveryOf>;
}

const deliveryOf = (materializedHash: string, servedHash: string, files: string[], servedExamples: string[], withheld: string[]) => ({
  expectedPackageHash: materializedHash, servedPackageHash: servedHash,
  matched: servedHash === materializedHash, servedFiles: files, servedExamples, withheldByContext: withheld
});

export function resolveServedSkill(name: string): ServedSkill {
  const L: store.StoreLayout = { root: DATA, skillName: name };
  // A CANDIDATE is served by explicit id and is NOT active. That asymmetry is the product: a person
  // must be able to run the thing being proposed WITHOUT it having been adopted first.
  const wanted = flag('--candidate') ?? store.getActive(L) ?? die(`no active version for ${name}. Build it first.`);
  const sv = store.getSkillVersion(L, wanted) ?? die(`SkillVersion ${wanted} is missing from the store.`);
  const pkg = store.getPackage(L, sv.materializedHash)
    ?? die(`package ${sv.materializedHash} is not in the store — this SkillVersion was built before packages were persisted, so what it served cannot be reconstructed. Rebuild it.`);
  const skillMd = pkg.files['SKILL.md'] ?? die('the stored package has no SKILL.md.');

  const ctxFlag = (flag('--context') ?? '').toLowerCase();
  const cmap = pkg.files['context-map.json']
    ? (JSON.parse(pkg.files['context-map.json']) as { components: { requirementId: string; appliesWhen: string }[] })
    : { components: [] };
  const conditional = new Map(cmap.components.map((c) => [c.requirementId, c.appliesWhen]));
  const exampleFiles = Object.keys(pkg.files).filter((f) => f.startsWith('examples/'));
  const withheld: string[] = [];
  const servedExamples = exampleFiles.filter((f) => {
    const id = f.slice('examples/'.length, -'.md'.length);
    const cond = conditional.get(id);
    if (!cond) return true;
    if (ctxFlag && cond.toLowerCase().includes(ctxFlag)) return true;
    withheld.push(f); return false;
  });
  // ── A BOUNDARY, BECAUSE THE OLD FRAMING ANSWERED THE WRONG QUESTION ──────────────────────────
  //
  // This block opened with `# How the author works — examples` and said "these are instances, not
  // instructions". That is a statement about AUTHORITY — whether the model must comply. It says
  // nothing about OUTPUT OWNERSHIP, which is what was actually going wrong: the model treated the
  // section as part of the document it was writing and continued it, appending the skill's own
  // requirement text to the user's deliverable in roughly half of generations.
  //
  // So the block is fenced rather than headed, and says what it is FOR rather than only what it is
  // NOT. No heading to continue, and an explicit statement that the deliverable starts after it.
  const exampleBlock = servedExamples.length
    ? `\n\n=== REFERENCE MATERIAL — PRIVATE CONTEXT, NOT PART OF YOUR OUTPUT ===\n\n`
      + `Everything up to the end marker shows how the author works. It is context for you, never\n`
      + `content for the reader: do not reproduce, continue, quote, enumerate, summarise or mention\n`
      + `any of it unless the user explicitly asks about the skill itself. These are instances rather\n`
      + `than instructions — where one is marked NOT required, an output that does otherwise is not\n`
      + `wrong.\n\n${servedExamples.map((f) => pkg.files[f]).join('\n\n- - -\n\n')}`
      + `\n\n=== END REFERENCE MATERIAL — the work you produce begins fresh from here ===`
    : '';
  const contractFile = pkg.files['contracts/output.schema.json'] ?? null;
  const servedText = `${skillMd}${exampleBlock}`;
  // WHAT WAS TRIED ON THE WAY TO A SKILL IS NOT PART OF THE SKILL. Nobody ratified it, and
  // independent measurement says showing an accumulated knowledge layer to the component doing the
  // work makes the work worse (63.7% -> 60.9%, arXiv 2608.27454) while showing it to the component
  // proposing changes makes it better. Checked here rather than trusted, because the two live in
  // the same store and one careless template is all it would take.
  assertHistoryNotServed(servedText, foldRepairs(store.readEvents(L)));
  const servedHash = sha(JSON.stringify(pkg.files));
  const delivery = deliveryOf(sv.materializedHash, servedHash, Object.keys(pkg.files), servedExamples, withheld);
  if (!delivery.matched) {
    die(`DELIVERY FAILURE: SkillVersion ${sv.skillVersionHash} expects package ${sv.materializedHash} but the stored artefact hashes to ${servedHash}. Nothing was invoked. The implementation on disk is not the implementation on record.`);
  }
  return { L, sv, servedText, servedHash, contractFile, delivery };
}

export async function invoke(): Promise<void> {
  const name = assertSkillName(flag('--skill') ?? argv[1] ?? die('usage: atelier invoke --skill <name> "<your task>"'));
  const task = flag('--task') ?? positional([name])
    ?? die('give it something to write: atelier invoke --skill <name> "<your task>"');
  const { L, sv, servedText, servedHash, contractFile, delivery } = resolveServedSkill(name);
  // ── CAN THIS STANDARD BE EXECUTED TRUTHFULLY ON THIS INVOCATION ───────────────────────────
  //
  // BEFORE the model, before the budget, before anything is spent. A REQUIRED rule whose evidence is
  // not bound cannot be satisfied honestly, and the model will satisfy it anyway by inventing the
  // evidence — measured, not feared: a standard requiring "one counted observation from our own
  // records" produced "I pulled our last 200 tickets. 63% of them are…" from a runtime holding no
  // tickets. Deterministic, so it is decided here rather than observed afterwards.
  const std = store.getStandard(L, sv.standardVersionHash);
  const satisfiable = checkSatisfiable(std?.requirements ?? [], boundResources());
  const shortfall = describeSatisfiability(satisfiable);
  if (satisfiable.kind === 'MISSING_REQUIRED_EVIDENCE') die(shortfall!);
  if (shortfall) console.log(shortfall);

  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 1.0), maxCalls: numericFlag('--max-calls', 8) };

  // ── WHICH RUNTIME, AND IS IT THE ONE THIS VERSION'S EVIDENCE CAME FROM ────────────────────
  //
  // The delivery check above proves the BYTES are the ones on record. It has nothing to say about who
  // is reading them, and for a while nothing did: the same package served by a frontier model and by a
  // 7B model on a laptop produced two records that differed only in a string nobody compared.
  //
  // Deterministic, and before the call. A person may absolutely run their skill on a different model —
  // that is the point of owning the standard rather than renting it — but they should do it knowingly,
  // on a fresh record, rather than inheriting conclusions drawn somewhere else.
  const { client, binding } = clientAndBinding('target');
  const verdict = compareBindings(store.expectedBinding(L, sv.skillVersionHash), binding);
  if (verdict.kind === 'TARGET_BINDING_MISMATCH' && !argv.includes('--accept-new-binding')) {
    die(describeMismatch(verdict, sv.skillVersionHash));
  }
  if (verdict.kind === 'TARGET_BINDING_MISMATCH') {
    console.log(`\nRunning on a new runtime binding — ${describeBinding(binding)}.`);
    console.log(`Observations from here are recorded against this binding and are not evidence about the other one.\n`);
  }

  // ORGANIC USE IS THE DEFAULT AND IS CAPTURED WITHOUT ANYONE REMEMBERING. A harness declares
  // itself via ATELIER_PROVENANCE; a person doing real work types nothing extra.
  // THE CONTRACT GOES IN. It used to be listed in the delivery metadata and then ignored by the very
  // call the metadata described, which is how a carrier can be installed, hashed, verified and dark all
  // at once. `runOnce` hands it to the provider as the schema and hashes what was actually sent.
  const rec = await runOnce(L, sv, servedText, servedHash, delivery, task, client, budget, binding,
    resolveProvenance(flag('--provenance'), process.env), contractFile,
    flag('--task') ? 'FLAG' : 'POSITIONAL');

  // A PROVIDER-SIDE VERSION FLIP UNDER AN UNCHANGED CONFIGURATION. Reported, never fatal: the user
  // changed nothing, and refusing to run would punish them for someone else's release.
  const prior = store.listInvocations(L)
    .filter((i) => i.skillVersionHash === sv.skillVersionHash && i.invocationId !== rec.invocationId)
    .map((i) => i.observedRuntime).find((o) => o?.bindingHash === rec.observedRuntime.bindingHash) ?? null;
  const drift = detectResolvedModelDrift(prior, rec.observedRuntime);
  if (drift.drifted) {
    console.log(`\nRESOLVED MODEL DRIFT — ${drift.why}.`);
    console.log(`Nothing you set has changed. What has changed is what answers to it, so earlier observations`);
    console.log(`on this binding describe a model that is no longer the one serving you.\n`);
  }

  console.log(`\n${rec.output}\n`);
  // Checked on the OUTPUT, never the served bytes — those legitimately contain every marker, and
  // passing them in would report a breach on every invocation.
  const breaches = findOwnershipBreaches(rec.output);
  if (breaches.length) console.log(describeBreaches(breaches));
  console.log(`─────────────────────────────────────────────────────────────`);
  if (rec.delivery.outputContract) {
    const c = rec.delivery.outputContract;
    console.log(`output contract ${c.artifact} — ${c.enforced ? 'constrained this generation' : 'DID NOT REACH THE PROVIDER'}`);
  }
  console.log(`invocation ${rec.invocationId}  ·  SkillVersion ${sv.skillVersionHash}${flag('--candidate') ? ' (CANDIDATE, not active)' : ''}  ·  $${budget.spentUsd.toFixed(4)}`);
  console.log(`If that was not right:  atelier improve --skill ${name} --invocation ${rec.invocationId}`);
}
