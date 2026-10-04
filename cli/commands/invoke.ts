// cli/commands/invoke.ts — Serving the package and recording what came back.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import { checksFor, claimInstrumentOf, contextJudgeFor, CLAIMS_MODEL_DEFAULT } from '../checks.js';
import { regressions } from '../../core/loop/repair.js';
import { refineToStandard, checkDraft, checkDraftAsync, enforceClaims, heavyCut, listedClaims, brokenByCut, PUBLIC_FACTS, INCONCLUSIVE } from '../../core/loop/run-repair.js';
import { signalDistance } from '../../core/observers/selection.js';
import { featureOf } from '../../core/observers/features.js';
import { verifyText, type VerifyReport } from '../../core/observers/verify.js';
import { readFidelity } from '../../core/fidelity/profile.js';
import { factLedger, factCoverage, type Fact } from '../../core/loop/fact-ledger.js';
import { steerTowardRange, type Application } from '../../core/fidelity/structural.js';
import { LOOP_SETTINGS, DIVERSITY_TEMPERATURES, type FidelityProfile, type FidelityReading, type FidelityRecord, type ImplementationSettings } from '../../core/fidelity/types.js';
import type { RepairRecord } from '../../core/state/canonical-state.js';
import { releaseFor, implementationBlock } from '../fidelity.js';
import { buildRunEval } from '../eval-run.js';
import { renderPanel, type EvalSummary } from '../../core/eval/summary.js';
import { putEval } from '../../core/state/eval-store.js';
import { retrieve, renderRetrieved } from '../../core/fidelity/retrieval.js';
import { spendOneWithResult, type DraftVariant, type Written } from './improve.js';
import { planSections, sectionBlock, joinSections, MAX_SECTIONS, type SectionPlan } from '../../core/fidelity/sections.js';
import * as fstore from '../../core/state/fidelity-store.js';
import * as vstore from '../../core/state/voice-store.js';
import { decideRegister, registerDistance, registerThreshold, type RegisterDecision } from '../../core/voice/register.js';
import { featureTrait, split, type TransferPolicy } from '../../core/voice/transfer.js';
import { voicePass, MAX_PARAGRAPHS, type VoiceParagraph } from '../../core/voice/pass.js';
import { MIN_PAIRS, type PairBank } from '../../core/voice/pairs.js';
import { typicalityOf, typicalityInContext, type TypicalityCalibration } from '../../core/fidelity/typicality.js';
import { valuesOf } from '../../core/fidelity/profile.js';
import { densityRatio, drawIndex, seedOf } from '../../core/fidelity/sampling.js';
import { scoreDetector } from '../../core/fidelity/stylometry.js';
import { chainOf, sampleSkeleton, skeletonBlock, typicalLength, followed, NEAR_WEIGHT } from '../../core/structure/skeleton.js';
import { readStructure, type StructureMove } from '../../core/structure/moves.js';
import { structureModel } from './fidelity.js';
import { checkClass } from '../../core/observers/doc-class.js';
import { readTaste, tasteRules, describeTaste, applicabilityFor, vetoMisses, type TasteReading } from '../../core/taste/reader.js';
import { tastePermissions } from '../../core/taste/calibration.js';
import { refineTaste } from '../../core/taste/repair.js';
import { overlapIndex, sentencesKept, sentencesAdded } from '../../core/observers/overlap.js';
import { recordTaste, readerModel, readerClient as readerClientFor } from './taste.js';
import { processSpentUsd, type Budget, type InferenceClient } from '../../core/inference/client.js';
import { findOwnershipBreaches, describeBreaches } from '../../core/state/output-ownership.js';
import { assertHistoryNotServed, foldRepairs } from '../../core/architecture/repair-memory.js';
import type { SkillVersion, InvocationSettings } from '../../core/state/canonical-state.js';
import * as store from '../../core/state/store.js';
import { checkSatisfiable, describeSatisfiability, type SatisfiabilityVerdict } from '../../core/state/prerequisite.js';
import { resolveProvenance } from '../../core/fidelity/provenance.js';

import { runOnce, draftMaxTokens } from './improve.js';
import { version } from '../help.js';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { compareBindings, describeMismatch, describeNewSurface, detectResolvedModelDrift, bindingHash } from '../../core/runtime/binding.js';
import { sha, DATA, die, argv, flag, clientAndBinding, describeBinding, numericFlag, positional, boundResources, boundMaterial, assertSkillName, runFile, clientFor } from '../runtime.js';

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
  return resolveServedVersion(L, wanted, flag('--context') ?? '');
}

/** A run of this many words repeated from a served piece of the author's is copying, not an echo of a phrase. */
const LIFTED_RUN = 12;

/**
 * What a SkillVersion serves a model, exactly as `invoke` serves it: SKILL.md and every example file
 * whose condition holds, fenced as reference material. `fix`'s candidate run and the regression floor's
 * runs serve through this too, so a comparison between two versions is never a comparison between two
 * ways of serving them.
 */
export function resolveServedVersion(L: store.StoreLayout, wanted: string, context: string): ServedSkill {
  const sv = store.getSkillVersion(L, wanted) ?? die(`SkillVersion ${wanted} is missing from the store.`);
  const pkg = store.getPackage(L, sv.materializedHash)
    ?? die(`package ${sv.materializedHash} is not in the store — this SkillVersion was built before packages were persisted, so what it served cannot be reconstructed. Rebuild it.`);
  const skillMd = pkg.files['SKILL.md'] ?? die('the stored package has no SKILL.md.');

  const ctxFlag = context.toLowerCase();
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
      + `Everything up to the end marker shows how the author works, or how this skill's rules apply\n`
      + `(a "write this, not that" file is model-written, never the author's). It is context for you, never\n`
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
/** One draft's counts, as `invoke --drafts N` ranks them. */
export interface DraftScore {
  readonly req: number; readonly taste: number; readonly tells: number; readonly all: number; readonly signal: number | null; readonly style: number;
  /** steering features outside the author's range, and how far in total (core/fidelity/profile.ts); 0 without a profile */
  readonly outside?: number; readonly outsideBy?: number;
  /** the style detector's P(model-written), when the skill has one: a tie-breaker, never more */
  readonly detector?: number | null;
  /** how many of the facts the person supplied the draft uses (../../core/loop/fact-ledger.ts): only supplied facts count */
  readonly facts?: number;
}

/**
 * THE ORDER DRAFTS ARE CHOSEN IN. REQUIRED rules first: the owner said an output breaking one is worse,
 * and that is a count. The taste reader's VETO misses come second, because the reader is a model's
 * reading, calibrated but still a reading; it ranked first, so a draft breaking a REQUIRED rule could
 * win on the reader's opinion — a judge's taste outranking the owner's rule, which the comment on the
 * choice said could not happen. Then machine-writing moves, all rules, the author's signals (an unread
 * distance ranks last), and style (higher margin is better).
 */
export const draftOrder = (a: DraftScore, b: DraftScore): number =>
  a.req - b.req || a.taste - b.taste || a.tells - b.tells || a.all - b.all
  // THE AUTHOR'S RANGE, AFTER THE RULES. How many steering features fall outside the range the author's own
  // pieces span, then by how much: never a pull toward their average (core/fidelity/types.ts).
  || (a.outside ?? 0) - (b.outside ?? 0) || (a.outsideBy ?? 0) - (b.outsideBy ?? 0)
  // THE PERSON'S FACTS USED. Real writing carries more specifics than an imitation written from the same
  // facts; the way to that density is using what was supplied, so only ledger facts count. Specific-looking
  // text that was not supplied earns nothing here and is the claim floor's to cut.
  || (b.facts ?? 0) - (a.facts ?? 0)
  || (a.signal ?? Infinity) - (b.signal ?? Infinity) || b.style - a.style
  // The detector is a monitor: it only breaks what is left, and only on a clear difference.
  || detectorTie(a.detector ?? null, b.detector ?? null);

// Bucketed to tenths so the order stays transitive: a threshold on the difference made 0.00 ≈ 0.08 ≈ 0.16 with 0.00 < 0.16.
const detectorTie = (a: number | null, b: number | null): number => (a !== null && b !== null ? Math.round(a * 10) - Math.round(b * 10) : 0);

export async function invoke(): Promise<void> {
  // FOR A PROGRAM, THE ANSWER ALONE ON STDOUT. The report, notices and cost were printed around the answer,
  // so a caller could not take the answer cleanly. With --answer-only or --json every line a person reads
  // goes to stderr, and stdout carries the answer, or one JSON object, and nothing else.
  const machine = argv.includes('--json') ? 'json' as const : argv.includes('--answer-only') ? 'answer' as const : null;
  const log = console.log;
  if (machine) console.log = (...a: unknown[]) => { console.error(...a); };
  try { await invokeRun(machine); } finally { console.log = log; }
}

async function invokeRun(machine: 'json' | 'answer' | null): Promise<void> {
  const started = Date.now();
  const name = assertSkillName(flag('--skill') ?? argv[1] ?? die('usage: atelier invoke --skill <name> "<your task>"'));
  const asked = flag('--task') ?? positional([name])
    ?? die('give it something to write: atelier invoke --skill <name> "<your task>"');
  const { L, sv, servedText, servedHash, contractFile, delivery } = resolveServedSkill(name);
  // A standard measures one kind of document; asking it for another is refused before anything is spent.
  const cls = checkClass(store.getDocClass(L), flag('--class'));
  if (!cls.ok) die(cls.why);
  const { material, materialText, task } = taskWithMaterial(L, asked);

  // ── CAN THIS STANDARD BE EXECUTED TRUTHFULLY ON THIS INVOCATION ───────────────────────────
  //
  // BEFORE the model, before the budget, before anything is spent. A REQUIRED rule whose evidence is
  // not bound cannot be satisfied honestly, and the model will satisfy it anyway by inventing the
  // evidence: a standard requiring "one counted observation from our own records" produced "I pulled
  // our last 200 tickets. 63% of them are…" from a runtime holding no tickets.
  const std = store.getStandard(L, sv.standardVersionHash);
  const satisfiable = checkSatisfiable(std?.requirements ?? [], boundResources());
  const shortfall = describeSatisfiability(satisfiable);
  if (satisfiable.kind === 'MISSING_REQUIRED_EVIDENCE') die(shortfall ?? 'a REQUIRED rule needs material this invocation does not bind');
  const report = new RunReport();
  if (shortfall) report.detail(shortfall);
  // Rules that cannot fire without material the person has not bound: said once, near the top, and read
  // by the taste reader as waiting rather than missed.
  const waiting = waitingForMaterial(satisfiable);

  // A skill built from someone's corpus writes TWO drafts by default and keeps the better one: the
  // author's habits and the machine-writing count choose between drafts and nothing else can use them.
  // `--drafts 1` turns this off.
  // THE IMPLEMENTATION RELEASE (cli/fidelity.ts): how many drafts, how many structural edits, which of the
  // author's passages and which experience notes are served. Below the standard, recorded with the output.
  const fid = std && !argv.includes('--no-fidelity') ? releaseFor(L, sv) : null;
  // `--fidelity` runs the full loop for this run (LOOP_SETTINGS), over whatever the release says.
  const runSettings = fid ? (argv.includes('--fidelity') ? { ...fid.release.settings, ...LOOP_SETTINGS } : fid.release.settings) : null;
  // THE VOICE LAYER (core/voice), only for a skill whose owner declared the corpus's register under this
  // standard (`atelier voice register`). Without that policy nothing below runs and the skill is as it was.
  const storedPolicy = fid && std ? vstore.getPolicy(L) : null;
  const policy = storedPolicy?.standardVersionHash === std?.standardVersionHash ? storedPolicy : null;
  const register = policy ? decideRegister(policy.corpusRegisters, asked, flag('--register')) : null;
  if (flag('--register') && !policy) die(`--register needs the corpus's own register first: atelier voice register --skill ${name} <register>`);
  const voiceFlag = flag('--voice');
  if (voiceFlag && !['incontext', 'off'].includes(voiceFlag)) die(`--voice is incontext or off, got "${voiceFlag}".`);
  const voiceMode: 'incontext' | 'off' = voiceFlag ? (voiceFlag === 'incontext' ? 'incontext' : 'off') : runSettings?.voice ?? 'off';
  const bank = voiceMode === 'incontext' && fid ? vstore.getBank(L) : null;
  if (voiceFlag === 'incontext' && !policy) die(`the voice pass needs the corpus's register declared first: atelier voice register --skill ${name} <register>`);
  if (voiceFlag === 'incontext' && (!bank || bank.pairs.length < MIN_PAIRS)) die(`the voice pass needs a pair bank of at least ${MIN_PAIRS} pairs: atelier voice pairs --skill ${name}`);
  // Never out of register: pairs carry the whole voice of the register they were written in.
  const voiceRuns = voiceMode === 'incontext' && policy !== null && register?.status !== 'out' && bank !== null && bank.pairs.length >= MIN_PAIRS
    && contractFile === null && !argv.includes('--no-repair');
  // ONE MORE DRAFT UNTIL THE SHAPE IS THE AUTHOR'S (`--until-typical <p>`): after the output is checked, its
  // typicality is read (core/fidelity/typicality.ts); below the target, another draft is written and checked, up
  // to --shape-rounds. Steers on the control instrument only; the two-sample test that evaluates never sees it.
  const shapeTarget = flag('--until-typical') === undefined ? null : numericFlag('--until-typical', 0.2);
  if (shapeTarget !== null && !(shapeTarget > 0 && shapeTarget < 1)) die(`--until-typical takes a share between 0 and 1 (how typical of your own pieces), got ${flag('--until-typical')}.`);
  if (shapeTarget !== null && !fid?.typicality) die(`--until-typical needs the skill's typicality calibration: rebuild it from its corpus, or run atelier fidelity --skill ${name} --calibrate-from <folder of your pieces>.`);
  // AND UNTIL THE STYLE DETECTOR READS IT AS YOURS (`--until-author <p>`): the detector is the instrument that
  // separates an author's pieces from model text where one-text typicality does not (decision 0010), so it is the
  // control the loop steers on; the counted-feature two-sample test that evaluates never sees it.
  const authorTarget = flag('--until-author') === undefined ? null : numericFlag('--until-author', 0.5);
  if (authorTarget !== null && !(authorTarget > 0 && authorTarget < 1)) die(`--until-author takes a probability between 0 and 1, got ${flag('--until-author')}.`);
  if (authorTarget !== null && !fid?.profile.detector) die(`--until-author needs the skill's style detector, trained at discovery against model drafts; rebuild ${name} from its corpus.`);
  const shapeRounds = shapeTarget === null && authorTarget === null ? 0 : Math.floor(numericFlag('--shape-rounds', 3));
  if ((shapeTarget !== null || authorTarget !== null) && shapeRounds < 1) die('--shape-rounds must be at least 1: each round is one more draft.');
  if (shapeRounds > 0 && argv.includes('--no-repair')) die('--until-typical and --until-author check each round before keeping it, and --no-repair turns the checks off: drop one of them.');
  // PLAN-FIRST (`--structure plan`, core/structure/skeleton.ts): each draft is written against its own skeleton of
  // paragraph moves, sampled from the author's chain with their pieces nearest the request counted more.
  const structureFlag = flag('--structure');
  if (structureFlag && structureFlag !== 'plan') die(`--structure takes plan, got "${structureFlag}".`);
  const authorStructure = structureFlag && fid ? fstore.getStructure(L, fid.profile.hash) : null;
  if (structureFlag && !authorStructure) die(`--structure plan needs your pieces read for structure first: atelier fidelity --skill ${name} --read-structure-from <folder of your pieces>`);
  if (structureFlag && argv.includes('--sections')) die('--structure plan and --sections both decide the shape of the piece: use one.');
  const selectFlag = flag('--select');
  if (selectFlag && !['sample', 'best'].includes(selectFlag)) die(`--select is sample or best, got "${selectFlag}".`);
  const sampling = (selectFlag ?? runSettings?.selection ?? 'best') === 'sample' && Boolean(fid?.profile.detector);
  if (selectFlag === 'sample' && !fid?.profile.detector) report.say('(--select sample needs the skill\'s style detector, trained at discovery; drafts are chosen the usual way.)');
  const nDrafts = Math.max(1, Math.floor(numericFlag('--drafts', runSettings ? runSettings.drafts : store.getVoice(L)?.pieces?.length ? 2 : 1)));
  const editBudget = runSettings && !argv.includes('--no-repair') ? Math.max(0, Math.floor(numericFlag('--edits', runSettings.editBudget))) : 0;
  const taste = std && !argv.includes('--no-taste') ? TasteSession.open(L, std, asked, waiting) : null;
  // The bounds grow with the drafts and the taste reader's calls, and a request the cap cannot cover is
  // refused before anything is spent rather than failing halfway with nothing delivered.
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', Math.max(1.0, 0.3 * nDrafts + 0.15 * editBudget + 0.4
      + (argv.includes('--sections') ? 0.1 * MAX_SECTIONS * nDrafts : 0)) + (voiceRuns ? 0.03 * MAX_PARAGRAPHS : 0) + shapeRounds * (0.3 + 0.15 * editBudget + (voiceRuns ? 0.03 * MAX_PARAGRAPHS : 0))),
    // Edits come last; their calls are reserved on top of the repair's (up to five), so a release's edit
    // budget is not silently starved by the rewrites before it.
    // Long form by section: a plan, and up to MAX_SECTIONS calls per draft instead of one.
    maxCalls: numericFlag('--max-calls', nDrafts + editBudget + 4 + (editBudget ? 5 : 0) + (taste?.callsFor(nDrafts) ?? 0)
      + (argv.includes('--sections') ? 1 + MAX_SECTIONS * nDrafts : 0) + (voiceRuns ? MAX_PARAGRAPHS + 4 : 0) + shapeRounds * (1 + 5 + editBudget + (voiceRuns ? MAX_PARAGRAPHS + 4 : 0) + (taste?.callsFor(1) ?? 0)) + (structureFlag ? 2 : 0)) };
  if (nDrafts * 0.2 > budget.capUsd) die(`--drafts ${nDrafts} needs roughly $${(nDrafts * 0.2).toFixed(2)} and the cap is $${budget.capUsd.toFixed(2)}. Nothing was spent. Raise --cap or ask for fewer drafts.`);
  taste?.bind(budget);
  // Made before any draft is paid for: building the reader's client can refuse a configuration, and a
  // refusal after the drafts were written would cost the person their output.
  if (taste?.acts) taste.client();
  const { client, binding } = checkedBinding(L, sv);

  // ASKED FOR, NOT INVENTED. A story, a named source or a figure the person did not supply is cut from
  // the output (core/loop/claims.ts). Said before anything is spent, with how to supply the real ones.
  const needsLine = materialLine(satisfiable, material.length > 0, !argv.includes('--allow-unsourced'), name);
  if (needsLine) report.say(needsLine);
  if (nDrafts > 1 && (!std || contractFile !== null)) {
    console.log(`(--drafts ${nDrafts} does not apply here: ${!std ? 'the standard is missing' : 'this skill has an output contract, so there is one shape to produce'}; writing one draft.)`);
  }
  const spentBefore = processSpentUsd();
  // ASKED ONLY FOR WHAT CAN BE DONE HONESTLY. A move that needs material nobody bound ("name the design
  // alternative we rejected") was still sent, and the writer met it by inventing: 16 "we considered / we
  // rejected" lines against 7 without the skill. Such rules are withheld from this run's prompt and named
  // in the record; the compiled skill is untouched. A REQUIRED one applies only under a condition (a
  // general one refused the run above), so it is also not counted against this output.
  const withheld = std ? std.requirements.filter((q) => waiting.has(q.requirementId)).map((q) => q.statement) : [];
  const waived = new Map<string, string>();
  for (const q of std?.requirements ?? []) if (waiting.has(q.requirementId)) waived.set(q.requirementId, 'the material it needs is not bound');
  // OUT OF REGISTER, ONLY WHAT THE OWNER'S POLICY CARRIES (core/voice/transfer.ts). A rule learned from blog
  // posts is evidence about blog posts: asked for a contract, a rule whose transfer is unknown is withheld from
  // the prompt and from the count for this run, and named. Nothing is waived in register.
  const traits = std && policy && register?.status === 'out' ? split(policy, std.requirements.filter((q) => q.authority !== 'EXPERT_REJECTED').map((q) => q.requirementId)) : null;
  if (traits && std && register) {
    for (const q of std.requirements) {
      if (!traits.unknown.includes(q.requirementId) || waived.has(q.requirementId)) continue;
      waived.set(q.requirementId, `out of register (${register.request} vs ${register.corpus.join(', ')}): not marked to carry`);
      withheld.push(q.statement);
    }
    report.say(`Out of register (${register.request}; your pieces are ${register.corpus.join(', ')}): ${traits.carried.length} rule(s) carried by your policy, ${traits.unknown.length} withheld. Mark what should carry with: atelier voice transfer --skill ${name} --add <rule id>`);
  }
  // THE REQUEST SETS THE LENGTH WHEN IT SAYS ONE. "I want a detailed explanation" met a learned "my pieces
  // run about 100 words" and lost; so did "one line, please" against a long one. The learned length is
  // withheld from this run's prompt when the request asks for detail or brevity, and said in the record.
  // Read by the context judge when there is one (core/loop/context-judge.ts); the word patterns are the floor.
  // On the run's own budget, so its calls count against the cap the person set.
  const judge = !argv.includes('--allow-unsourced') ? contextJudgeFor(budget) : undefined;
  const intent = judge ? await judge.requestIntent(asked) : null;
  // The judge's reading and the word pattern together: either one finding a stated length or format counts.
  const lengthAsked = intent?.length ?? requestedLength(asked);
  const lengthLine = lengthAsked ? servedText.split('\n').find((l) => /^My (?:pieces of this kind|answers usually) run about /.test(l.trim())) : undefined;
  if (lengthLine) withheld.push(lengthLine.trim());
  // AND ITS FORMAT, WHEN IT STATES ONE. "Return only the code block" met a learned "end every piece with a
  // line starting Next:" and lost in 3 of 3 trials. The request is the one thing in the room written today:
  // when it asks for a SHAPE (code, JSON, a number, one line, yes or no, a list), the skill's presentation
  // rules are withheld from the prompt and from the count for this run, and named.
  // A BARE request is not a shape. "Return only the post" asks for no preamble, not for a post without the
  // author's paragraphs: read as a shape, it switched off every pace and rhythm rule on exactly the long
  // pieces those rules exist for. Then the standard stays whole and only the wrapping is dropped.
  const formatAsked = intent?.format ?? requestedFormat(asked);
  const shape = formatAsked ? formatShape(formatAsked) : null;
  let presentationWithheld = 0;
  if (formatAsked && shape === 'SHAPE' && std) {
    const p = presentationRules(std.requirements);
    presentationWithheld = p.measured.length + p.prose.length;
    for (const q of p.measured) waived.set(q.requirementId, `the request states its own format ("${formatAsked}")`);
    withheld.push(...p.prose.map((q) => q.statement));
    report.say(`The request states its own format ("${formatAsked}"): ${p.measured.length + p.prose.length} presentation rule(s) withheld for this run.`);
  }
  const checks = { ...checksFor(L, { material: materialText, task: asked, guardClaims: !argv.includes('--allow-unsourced'), placeholders: argv.includes('--placeholders'), ...(judge ? { judge } : {}) }),
    ...(waived.size ? { waived } : {}) };
  // DRAFTS THAT DIFFER (core/fidelity/types.ts, `diversity`): each draft its own temperature and its own slice of
  // the author's closest passages, so the shared block carries only the notes.
  const diverse = Boolean(runSettings?.diversity) && nDrafts > 1 && fid !== null;
  const impl = fid && runSettings ? implementationBlock({ ...fid.release, settings: diverse ? { ...runSettings, retrievalK: 0 } : runSettings }, fid.index, asked) : { text: '', retrieved: [] };
  const pool = diverse && fid?.index && runSettings && runSettings.retrievalK > 0 ? retrieve(fid.index, asked, runSettings.retrievalK * nDrafts) : [];
  // A run whose flags changed what the release would have done is recorded with the settings that ran and
  // no release: credited to the release, it would make the settings search compare arms that never ran.
  // Compared, not inferred from flags: `--fidelity` on a release that already runs the loop overrides nothing,
  // and `--sections` changes what ran though it changes no setting.
  const ran = runSettings ? { ...runSettings, drafts: nDrafts, editBudget } : null;
  const rel = fid?.release.settings;
  const overridden = !ran || !rel || argv.includes('--sections') || argv.includes('--no-repair')
    || ran.drafts !== rel.drafts || ran.editBudget !== rel.editBudget || ran.retrievalK !== rel.retrievalK || ran.notesCap !== rel.notesCap
    || Boolean(ran.diversity) !== Boolean(rel.diversity) || voiceMode !== (rel.voice ?? 'off') || shapeTarget !== null || authorTarget !== null || sampling !== (rel.selection === 'sample' && Boolean(fid?.profile.detector)) || Boolean(structureFlag);
  const trace: FidelityTrace = { drafts: [], edits: [], variants: [] };
  // Out of register the author's range steers only on the features the policy carries; the rest are read, not steered by.
  const steerProfile = fid && policy && register?.status === 'out' ? carriedProfile(fid.profile, policy) : fid?.profile ?? null;
  // What each draft call was given, by the index it was asked for; the record keeps only the calls that came back
  // (selectDraft), with the temperature the provider was actually sent.
  const retrievedFor: number[][] = [];
  const variantOf = (i: number): DraftVariant => {
    const mine = pool.filter((_, j) => j % nDrafts === i).slice(0, runSettings?.retrievalK ?? 0);
    retrievedFor[i] = mine;
    return { temperature: DIVERSITY_TEMPERATURES[i % DIVERSITY_TEMPERATURES.length], stableExtra: mine.length && fid?.index ? `\n\n${renderRetrieved(fid.index, mine)}` : '' };
  };
  // The facts the person supplied, in the request and the bound material: what a draft may be specific with.
  const ledger = factLedger(materialText);
  const servedForRun = `${withheld.length ? withoutRules(servedText, withheld) : servedText}${impl.text}`;
  const deliveryForRun = withheld.length ? { ...delivery, withheldRules: withheld } : delivery;
  const taskForRun = shape === 'SHAPE' ? `${task}\n\n(The request's own format instruction overrides any presentation rule in the skill: follow the request exactly.)`
    : shape === 'BARE' ? `${task}\n\n(Deliver only the piece itself: no preamble, no note about it, no commentary after it.)` : task;
  // LONG FORM BY SECTION (core/fidelity/sections.ts), behind --sections: planned once, each section written with
  // the whole standard served, joined, then checked and steered as one piece. Not for a structured output.
  const sectionWriter = argv.includes('--sections') && contractFile === null
    ? writeBySections({ client, budget, servedText: servedForRun, task: taskForRun, trace })
    : authorStructure && contractFile === null ? writeByPlan({ client, budget, servedText: servedForRun, task: taskForRun, trace,
      plans: plansFor(authorStructure, fid?.index ? retrieve(fid.index, asked, 6).map((k) => fid.index?.passages[k]?.piece ?? '') : [], asked, nDrafts) }) : null;
  // ONE CLAIM VERDICT PER RUN. The report the repair counted on the text it delivered (two reads agreed, and each
  // sentence's verdict held for the run by claimMemory) is the one the panel shows: a fresh read of the same text
  // is another sample of a noisy reader, and two samples of one run disagreed (7, 2 and 5 flags in a live test).
  let delivered: Delivered | null = null;
  const keepDelivered = (refine: (draft: string) => Promise<Delivered>) => async (draft: string): Promise<Delivered> => (delivered = await refine(draft));
  const rec = await runOnce(L, sv, servedForRun, servedHash, deliveryForRun, taskForRun, client, budget, binding,
    resolveProvenance(flag('--provenance'), process.env), contractFile,
    flag('--task') ? 'FLAG' : 'POSITIONAL',
    std && !argv.includes('--no-repair') ? keepDelivered(withStructureRead(withShape(withVoice(withEdits(refineDraft({ client, budget, name, std, checks, taste }), fid && (editBudget > 0 || argv.includes('--fidelity')) ? { client, budget, name, std, checks, profile: fid.profile, editBudget, trace, taste } : null),
      voiceRuns && bank && fid ? { client, budget, name, std, checks, bank, copied: fid.index ? overlapIndex(fid.index.passages.map((p) => p.text)) : null, trace, taste } : null),
      shapeRounds > 0 && fid ? { client, budget, calibration: fid.typicality, detector: fid.profile.detector, target: shapeTarget, authorTarget, rounds: shapeRounds, servedText: servedForRun, task: taskForRun, trace, taste } : null),
      authorStructure ? { budget, trace } : null)) : null,
    std && nDrafts > 1 ? withSections(selectDraft({ n: nDrafts, name, std, checks, taste, signals: store.getSignals(L), profile: steerProfile, trace, ledger, sampling, ...(diverse ? { variant: variantOf, retrievedFor } : {}) }), sectionWriter)
      : sectionWriter ? { n: 1, write: sectionWriter, choose: () => ({ index: 0, why: '' }) } : null,
    std && checks.guardClaims !== false ? async (text: string) => {
      const r = await checkDraftAsync(name, std, text, checks);
      return (r.checked.find((c) => c.requirementId === 'UNSOURCED' && c.materiality === 'REQUIRED')?.result.spans ?? []).map((sp) => sp.text);
    } : null, settingsFor(checks, taste, nDrafts),
    // A structured output is JSON, not prose: no reading of it means anything against a prose range.
    fid && std && contractFile === null ? (output: string) => fidelityRecord(fid, output, trace, impl.retrieved, applicability(name, std, output, waived, withheld), ledger,
      { ...(runSettings ?? fid.release.settings), drafts: nDrafts, editBudget, ...(voiceMode === 'incontext' ? { voice: 'incontext' as const } : { voice: undefined }),
        ...(sampling ? { selection: 'sample' as const } : { selection: undefined }) }, overridden,
      policy && register ? { L, policy, register, traits, mode: voiceMode,
        note: voiceMode === 'incontext' && !voiceRuns ? (register.status === 'out' ? 'not run out of register: pairs carry the whole voice of the register they were written in'
          : !bank || bank.pairs.length < MIN_PAIRS ? `not run: the pair bank holds fewer than ${MIN_PAIRS} pairs (atelier voice pairs)` : 'not run on this kind of output') : null } : null, asked) : null);

  reportDrift(report, L, sv, rec);
  if (!machine) console.log(`\n${rec.output}\n`);
  reportChecks(report, rec, std, checks);
  const tasteMonitor = taste ? await taste.report(report, rec, name) : null;
  reportIntegrity(report, rec, cls.ok ? cls.note : null, std, L);
  reportFidelity(report, rec);
  reportRestyle(report, rec.output, material);
  const spent = finish(report, { rec, sv, name, task, budget, spentBefore });
  // THE EVALUATION OF THIS RUN (core/eval/summary.ts): stored beside the record, carried by --json, and drawn as
  // the panel on a terminal (or with --panel); --quiet leaves it out of the terminal, never out of the record.
  // FAULT-ISOLATED: the evaluation never costs the person a paid output. If it cannot be built, the run is
  // delivered as it stands and says so.
  let evaluation: EvalSummary | null = null;
  try {
    // The full check of the delivered text, as `verify` runs it: the verdict is counted on what ships, whatever
    // repair did or did not record (--no-repair records nothing). The claim reader reads it from cache.
    // Read fresh only when no repair ran (--no-repair) or the text changed after it.
    const kept = delivered as Delivered | null;
    const finalReport = !std || contractFile !== null ? null : kept?.output === rec.output ? kept.report
      : await checkDraftAsync(name, std, rec.output, checks).catch(() => null);
    evaluation = buildRunEval({ L, rec, std, sensor: checks.claimSensor, claimsOff: argv.includes('--allow-unsourced'),
      answers: checks.format?.claims === 'list', profile: fid?.profile ?? null,
      format: { words: formatAsked ?? null, shape, withheld: presentationWithheld }, taste: tasteMonitor, costUsd: spent,
      durationMs: Date.now() - started, drafts: nDrafts, report: finalReport, contract: contractFile !== null,
      applicability: rec.fidelity?.applicability ?? (std ? applicability(name, std, rec.output, waived, withheld) : []) });
  } catch (e) {
    report.say(`(the evaluation of this run could not be built: ${(e as Error).message.split('\n')[0]})`);
  }
  if (evaluation) putEval(L, evaluation);
  const showPanel = evaluation && !argv.includes('--quiet') && (argv.includes('--panel') || (!machine && process.stdout.isTTY));
  if (showPanel && evaluation) console.log(`\n${renderPanel(evaluation, { width: process.stdout.columns || 110, color: !process.env.NO_COLOR && process.stdout.isTTY && !machine })}\n`);
  if (machine === 'answer') process.stdout.write(`${rec.output}\n`);
  if (machine === 'json') {
    process.stdout.write(`${JSON.stringify({
      output: rec.output, invocationId: rec.invocationId, skillVersion: sv.skillVersionHash, costUsd: Number(spent.toFixed(4)),
      rulesBroken: rec.repair?.violatedAfter ?? [], cut: rec.repair?.storiesCut ?? [], toCheck: rec.repair?.claimsToCheck ?? [],
      withheld: rec.delivery.withheldRules ?? [], report: report.lines, eval: evaluation,
      ...(rec.fidelity ? { fidelity: { release: rec.fidelity.release, inBand: rec.fidelity.reading?.inBand ?? null, measured: rec.fidelity.reading?.measured ?? null,
        outside: rec.fidelity.reading?.outside.map((o) => o.id) ?? [], detector: rec.fidelity.reading?.detector?.p ?? null,
        edits: rec.fidelity.edits ?? [], applicability: rec.fidelity.applicability ?? [] } } : {}),
    }, null, 1)}\n`);
  }
}

/**
 * The task as served: what was asked, plus the person's standing material for this skill (`atelier
 * material`) and anything bound for this task (`--with`), the only places a first-person story or a cited
 * figure in the output may come from. The request itself is material too: a story typed into the task
 * is theirs to tell.
 */
function taskWithMaterial(L: store.StoreLayout, asked: string): { material: readonly { name: string; text: string }[]; materialText: string; task: string } {
  const material = [...store.getMaterial(L), ...boundMaterial()];
  const materialText = [asked, ...material.map((m) => m.text)].join('\n\n');
  const task = material.length
    ? `${asked}\n\n${material.map((m) => `<material name="${m.name}">\n${m.text}\n</material>`).join('\n\n')}`
    : asked;
  return { material, materialText, task };
}

/**
 * WHICH RUNTIME, AND IS IT THE ONE THIS VERSION'S EVIDENCE CAME FROM. The delivery check proves the bytes
 * are the ones on record; this proves who reads them. A person may run their skill on another model (that
 * is the point of owning the standard), but knowingly, on a fresh record, never inheriting conclusions
 * drawn on another binding. Deterministic, and before the call.
 */
function checkedBinding(L: store.StoreLayout, sv: SkillVersion): ReturnType<typeof clientAndBinding> {
  const found = clientAndBinding('target');
  const { binding } = found;
  const verdict = compareBindings(store.expectedBinding(L, sv.skillVersionHash, binding), binding);
  if (verdict.kind === 'TARGET_BINDING_MISMATCH' && !argv.includes('--accept-new-binding')) {
    die(describeMismatch(verdict, sv.skillVersionHash));
  }
  if (verdict.kind === 'TARGET_BINDING_MISMATCH') {
    console.log(`\nRunning on a new runtime binding — ${describeBinding(binding)}.`);
    console.log(`Observations from here are recorded against this binding and are not evidence about the other one.`);
    // The style detector learned the habits of the model the skill was built with; another family's are not its.
    if (fstore.getProfile(L)?.detector) console.log(`The style detector was trained on the model this skill was built with, so its readings on this one mean little. Rebuild the skill with this model to retrain it.`);
    console.log('');
    // Recorded now, not when the run completes: the next invoke on this binding is a configuration the
    // person already said yes to, and must not be refused again.
    store.recordBinding(L, sv.skillVersionHash, binding);
    store.appendEvent(L, { kind: 'BINDING_ACCEPTED', at: new Date().toISOString(), skillVersionHash: sv.skillVersionHash, bindingHash: bindingHash(binding) });
  }
  if (verdict.kind === 'BINDING_UNRECORDED') {
    const note = describeNewSurface(binding, store.bindingsElsewhere(L, sv.skillVersionHash, binding));
    if (note) console.log(`(${note})`);
  }
  return found;
}

// ── THE TASTE READER (docs/TASTE.md) ────────────────────────────────────────────────────────────
//
// The rules no count can check are read on every output, twice and with quotes, and the reading is
// recorded. Only rules where the reader has EARNED VETO from the owner's labels let it act: rewrite a
// passage it quotes, and prefer drafts that miss fewer of them. A rule waiting for material is never
// acted on: with nothing bound, a rewrite toward "give the real figure" could only invent one.
//
// The reader never costs the person their output: if it fails, the draft is delivered as the counted
// checks left it, and the failure is said.

class TasteSession {
  /** readings by text, so a draft read to rank it is not read again to repair or record it */
  private readonly readings = new Map<string, TasteReading[]>();
  /** what went wrong with the reader, said after the output */
  readonly notes: string[] = [];
  /** the reading of the delivered text, when the repair already made it */
  taken: readonly TasteReading[] | null = null;
  private budget: Budget | null = null;
  private decided: Promise<boolean[]> | null = null;
  private reader: InferenceClient | null = null;

  private constructor(
    private readonly L: store.StoreLayout, private readonly std: Standard, readonly asked: string,
    private readonly waiting: ReadonlySet<string>, readonly veto: ReadonlySet<string>,
  ) {}

  /** A session when the standard has reading-based rules; null when there is nothing to read. */
  static open(L: store.StoreLayout, std: Standard, asked: string, waiting: ReadonlySet<string>): TasteSession | null {
    const rules = tasteRules(std);
    if (!rules.length) return null;
    const earned = tastePermissions(rules, store.readEvents(L), readerModel());
    return new TasteSession(L, std, asked, waiting, withoutWaiting(earned.veto, rules, waiting));
  }

  /** Whether the reader has earned the right to act on any rule this run. */
  get acts(): boolean { return this.veto.size > 0; }

  /**
   * Calls reserved in the ceiling from the start, so a repair is never dropped for want of one: every
   * output is read twice; once it acts, each draft, the repaired one and a rewrite too (3 per draft, 7 more).
   */
  callsFor(nDrafts: number): number { return this.acts ? 3 * nDrafts + 7 : 3; }

  bind(budget: Budget): void { this.budget = budget; }

  /** The reader's client, made once for the run. */
  client(): InferenceClient { return (this.reader ??= readerClientFor()); }

  private get meter(): Budget { return this.budget ?? die('the taste reader was used before its budget was set'); }

  /** Applicability depends on the task alone: decided once for every draft and re-read. */
  applies(): Promise<boolean[]> { return (this.decided ??= applicabilityFor(this.client(), this.meter, this.std, this.asked)); }

  async read(text: string): Promise<TasteReading[]> {
    const had = this.readings.get(text);
    if (had) return had;
    const r = await readTaste(this.client(), this.meter, this.std, text, this.asked, await this.applies());
    this.readings.set(text, r);
    return r;
  }

  /**
   * How many VETO-holding rules each draft misses, for ranking. If the reader fails, every draft counts
   * zero, so they are ranked by count alone, and that is said.
   */
  async misses(drafts: readonly string[]): Promise<number[]> {
    try { return await Promise.all(drafts.map(async (d) => vetoMisses(await this.read(d), this.veto).length)); } catch (e) {
      this.notes.push(`the taste reader could not rank the drafts (${(e as Error).message.split('\n')[0]}); ranked by count`);
      return drafts.map(() => 0);
    }
  }

  /** Recorded on every output, said in one line. */
  async report(report: RunReport, rec: Invocation, name: string): Promise<TasteMonitor | null> {
    return reportTaste(report, { L: this.L, std: this.std, rec, asked: this.asked, budget: this.meter, tasteOn: true,
      tasteTaken: this.taken, readings: this.readings, tasteNotes: this.notes, permissions: { veto: this.veto }, waiting: this.waiting, name });
  }
}

interface DraftContext { readonly name: string; readonly std: Standard; readonly checks: Checks; readonly taste: TasteSession | null }

/**
 * CHECKED BEFORE IT IS DELIVERED. Every measured rule is counted on the draft, and only the spans that
 * break a REQUIRED one are rewritten, at most twice (plus one ACCURACY pass first), each rewrite kept only
 * if it breaks nothing that held. Then, where the taste reader has earned it, the passages it quotes as
 * missing a VETO rule are rewritten and kept only if the reader confirms them. An invented claim is cut
 * in code at every step, never reworded, and the report is counted on the text that ships.
 */
function refineDraft(c: DraftContext & { readonly client: InferenceClient; readonly budget: Budget }) {
  return async (draft: string) => {
    const r = await refineToStandard(c.client, c.budget, c.name, c.std, draft, 2, c.checks);
    const taste = c.taste;
    if (!taste?.acts) return { output: r.output, repair: r.repair, report: r.report };
    let t: Awaited<ReturnType<typeof refineTaste>>;
    try {
      t = await refineTaste(c.client, taste.client(), c.budget, c.name, c.std, r.output, await taste.read(r.output), taste.veto, taste.asked, c.checks, await taste.applies());
    } catch (e) {
      taste.notes.push(`the taste reader could not run before delivery (${(e as Error).message.split('\n')[0]}); delivered as the counted checks left it`);
      return { output: r.output, repair: r.repair, report: r.report };
    }
    taste.taken = t.readings;
    if (!t.targeted.length || t.output === r.output) return { output: r.output, repair: r.repair, report: r.report };
    // THE REPORT IS THE DELIVERED TEXT'S. The taste rewrite changed the text after the counted checks
    // read it, so the text is held to the claim floor again and every figure below is counted on it.
    const final = await enforceClaims(c.name, c.std, t.output, c.checks);
    // A cut that breaks the tasted text: deliver the draft the counted checks already cleared instead.
    if (final.cut.length && brokenByCut(t.output, final.text)) {
      taste.notes.push('the taste rewrite added claims that could not be cut without breaking it; delivered as the counted checks left it');
      return { output: r.output, repair: r.repair, report: r.report };
    }
    const fixed = { targeted: t.targeted, fixed: t.fixed, why: t.why };
    const cut = [...(r.repair?.storiesCut ?? []), ...final.cut];
    const base = r.repair ?? { passes: 0, violatedBefore: [], violatedAfter: [], originalOutputHash: sha(draft), draft, why: t.why };
    const toCheck = [...new Set([...(r.repair?.claimsToCheck ?? []), ...final.listed, ...listedClaims(final.report)])];
    return { output: final.text, report: final.report, repair: { ...base, violatedAfter: brokenIn(final.report), taste: fixed, ...(cut.length ? { storiesCut: cut } : {}),
      claimsToCheck: toCheck.length ? toCheck : undefined } };
  };
}

/** The REQUIRED rules a report finds broken. */
const brokenIn = (r: Awaited<ReturnType<typeof checkDraftAsync>>): string[] =>
  r.checked.filter((x) => x.materiality === 'REQUIRED' && x.result.verdict === 'VIOLATED').map((x) => x.requirementId);

/**
 * SEVERAL DRAFTS, THE BEST BY COUNT (`draftOrder`): the fewest REQUIRED rules broken, then the fewest
 * VETO rules read as missed (when the reader has earned any), machine-writing moves, rules of any weight,
 * distance from the author's signals, and style. A count picks it, never a judge's taste: the reader
 * breaks ties between drafts that break the same REQUIRED rules, and never outranks one.
 */
function selectDraft(c: DraftContext & { readonly n: number; readonly signals: ReturnType<typeof store.getSignals>; readonly profile: FidelityProfile | null; readonly trace: FidelityTrace; readonly ledger: readonly Fact[]; readonly variant?: (i: number) => DraftVariant; readonly retrievedFor?: readonly number[][]; readonly sampling?: boolean }) {
  return { n: c.n, ...(c.variant ? { variant: c.variant } : {}), choose: async (drafts: readonly string[], written?: readonly { readonly index: number; readonly temperatureSent: number | null }[]) => {
    if (c.variant && written) c.trace.variants = written.map((w) => ({ index: w.index, temperature: w.temperatureSent, retrieved: c.retrievedFor?.[w.index] ?? [] }));
    const tasteMissed = c.taste?.acts ? await c.taste.misses(drafts) : drafts.map(() => 0);
    const reports = await Promise.all(drafts.map((d) => checkDraftAsync(c.name, c.std, d, c.checks)));
    const profile = c.profile;
    const readings = profile ? drafts.map((d) => readFidelity(d, profile)) : [];
    c.trace.drafts.push(...readings);
    const scored = drafts.map((d, i) => ({ i, ...draftScore(reports[i], c.std, d, c.signals, readings[i] ?? null),
      ...(c.ledger.length ? { facts: factCoverage(d, c.ledger).used.length } : {}), taste: tasteMissed[i] }));
    scored.sort(draftOrder);
    let best = scored[0];
    // SAMPLED, NOT THE ARGMAX, among the drafts the rules cannot separate (core/fidelity/sampling.ts): drawn by how
    // much likelier each is the author's than the model's, so outputs keep the author's spread.
    const tied = c.sampling ? scored.filter((s) => s.req === best.req && s.taste === best.taste && s.tells === best.tells && s.detector !== null && s.detector !== undefined) : [];
    if (tied.length > 1) {
      const weights = tied.map((s) => Math.round(densityRatio(s.detector ?? 0.5) * 1000) / 1000);
      const seed = seedOf(tied.map((s) => drafts[s.i]));
      const k = drawIndex(weights, seed);
      best = tied[k];
      c.trace.sampled = { among: tied.length, weights, seed, chosen: best.i };
    }
    const drawn = tied.length > 1 ? `; drawn from ${tied.length} tied drafts in proportion to how likely each is yours` : '';
    const range = readings[best.i] ? `, ${readings[best.i].inBand} of ${readings[best.i].measured} measured features in your range` : '';
    return { index: best.i, why: `${c.taste?.acts ? `${best.taste} taste rule(s) read as missed, ` : ''}${best.req} REQUIRED rule(s) broken, ${best.tells} machine-writing move(s), ${best.all} rule(s) of any weight${range}${c.signals.length && !readings.length ? `, ${best.signal ?? 'unknown distance'} from your signals` : ''}${best.style ? `, style margin ${best.style}` : ''} — ${drawn ? `one of ${drafts.length}${drawn}` : `the best of ${drafts.length}`}` };
  } };
}

/** Deterministic operator applications tried per output when the loop runs: free, so bounded only to bound time. */
const OPERATOR_TRIES = 24;

/** What the inner loop saw, gathered during the run and written with the record. */
interface FidelityTrace { structure?: NonNullable<FidelityRecord['structure']>; sampled?: NonNullable<FidelityRecord['sampled']>; shape?: NonNullable<FidelityRecord['shape']>; voice?: { bank: string; paragraphs: readonly VoiceParagraph[]; note?: string }; drafts: FidelityReading[]; edits: (Application | { target: string; kept: boolean; why: string })[]; variants: { index: number; temperature: number | null; retrieved: number[] }[]; plan?: SectionPlan }

/**
 * THE SECOND ACTUATOR, AFTER THE COUNTED CHECKS (core/fidelity/structural.ts). The repaired draft is
 * redrafted for form against the worst band still outside the author's range, at most `editBudget` times.
 * A redraft is held to the same terms as a span repair (core/loop/repair.ts, `regressions`): no rule of the
 * standard broken that was not, none broken in more places, no claim flagged that was not. And the report
 * that ships is counted again on the text that ships.
 *
 * Not run when the claim reader has degraded (a redraft would be checked for invented claims by the weaker
 * pattern check only), nor when the taste reader holds VETO (its readings, recorded and calibrated on, would
 * describe a text that is no longer the output, and a redraft could undo what its own repair fixed).
 */
/** What a refine step delivers: the text, its repair record, and the report counted on that very text. */
interface Delivered { readonly output: string; readonly repair: RepairRecord | null; readonly report: VerifyReport }

function withEdits(refine: (draft: string) => Promise<Delivered>,
  e: { client: InferenceClient; budget: Budget; name: string; std: Standard; checks: Checks; profile: FidelityProfile; editBudget: number; trace: FidelityTrace; taste: TasteSession | null } | null) {
  if (!e) return refine;
  return async (draft: string) => {
    const r = await refine(draft);
    const reader = e.checks.claimSensor;
    if (e.taste?.acts) { e.trace.edits.push({ target: '-', kept: false, why: 'not tried: the taste reader holds VETO on this skill, and an edit would change the text it read' }); return r; }
    if (reader?.degraded) { e.trace.edits.push({ target: '-', kept: false, why: 'not tried: the claim reader could not run, so a redraft could not be checked for invented claims' }); return r; }
    // A profile built before the operators has no effect matrix: nothing tells an operator which way it moves.
    if (!e.profile.effects) e.trace.edits.push({ target: '-', kept: false, why: 'no operators: this skill\'s profile predates them; rebuild the skill to measure their effects' });
    const breaksNothing = async (before: string, after: string): Promise<boolean> => {
      const b = await checkDraftAsync(e.name, e.std, before, e.checks);
      const a = await checkDraftAsync(e.name, e.std, after, e.checks);
      if (reader?.degraded) return false;
      return editKeepsStandard(b, a);
    };
    let edited: Awaited<ReturnType<typeof steerTowardRange>>;
    // Deterministic operators are free and tried first, up to OPERATOR_TRIES; the edit budget is the number of
    // one-sentence model rewrites for over-articulation.
    // Operator candidates are screened by the deterministic checks (no claim reader); the final text is read in full below.
    const screen = (before: string, after: string): Promise<boolean> => {
      const offline = { ...e.checks, claimSensor: undefined };
      return Promise.resolve(editKeepsStandard(checkDraft(e.name, e.std, before, offline), checkDraft(e.name, e.std, after, offline)));
    };
    try { edited = await steerTowardRange(e.client, e.budget, r.output, e.profile, { operators: OPERATOR_TRIES, sentences: e.editBudget }, breaksNothing, screen); } catch (err) {
      e.trace.edits.push({ target: '-', kept: false, why: `the structural edit could not run (${(err as Error).message.split('\n')[0]})` });
      return r;
    }
    e.trace.edits.push(...edited.applications);
    const keptN = edited.applications.filter((x) => x.kept).length;
    if (edited.text === r.output) return r;
    // THE REPORT IS THE DELIVERED TEXT'S, as after every rewrite: recounted on the edited text, with the full
    // checks (the claim reader included). If that full read finds anything worse than before the steering, the
    // steering is undone: the operators were screened by the deterministic checks only.
    const final = await checkDraftAsync(e.name, e.std, edited.text, e.checks);
    if (!editKeepsStandard(await checkDraftAsync(e.name, e.std, r.output, e.checks), final) || reader?.degraded) {
      e.trace.edits.push({ target: '-', kept: false, why: 'the steered text, read in full, was worse than before it; the text before steering was delivered' });
      return r;
    }
    const stillListed = (r.repair?.claimsToCheck ?? []).filter((c) => edited.text.includes(c.slice(0, 60)));
    const toCheck = [...new Set([...stillListed, ...listedClaims(final)])];
    // The draft the model wrote is kept in the record whether or not a rule was repaired, so a comparison of
    // drafts (core/fidelity/experience.ts) reads the text the reading was taken on.
    const base = r.repair ?? { passes: 0, violatedBefore: [], violatedAfter: [], originalOutputHash: sha(draft), draft, why: 'every REQUIRED measured rule holds' };
    const { claimsToCheck: _old, ...rest } = base;
    return { output: edited.text, report: final, repair: { ...rest, violatedAfter: brokenIn(final),
      ...(toCheck.length ? { claimsToCheck: toCheck } : {}),
      why: `${base.why}; ${keptN} structural edit(s) toward your range` } };
  };
}

/**
 * THE VOICE PASS, LAST (core/voice/pass.ts). After the counted checks and any steering, each prose paragraph is
 * rewritten in the author's voice from the skill's pair bank, gated alone (facts, strength, length, copying),
 * and the assembled text is read again in full: if anything in the standard got worse, or a claim is flagged
 * that was not, the whole pass is undone and the text before it is delivered. Not run where an edit is not
 * (the taste reader holds VETO, or the claim reader could not run).
 */
function withVoice(refine: (draft: string) => Promise<Delivered>,
  v: { client: InferenceClient; budget: Budget; name: string; std: Standard; checks: Checks; bank: PairBank; copied: ReturnType<typeof overlapIndex> | null; trace: FidelityTrace; taste: TasteSession | null } | null) {
  if (!v) return refine;
  return async (draft: string) => {
    const r = await refine(draft);
    const notRun = (note: string): Delivered => { v.trace.voice = { bank: v.bank.hash, paragraphs: [], note }; return r; };
    if (v.taste?.acts) return notRun('not run: the taste reader holds VETO on this skill, and a rewrite would change the text it read');
    if (v.checks.claimSensor?.degraded) return notRun('not run: the claim reader could not run, so a rewrite could not be checked for invented claims');
    let passed: Awaited<ReturnType<typeof voicePass>>;
    try { passed = await voicePass(v.client, v.budget, r.output, v.bank, v.copied); } catch (err) {
      return notRun(`could not run (${(err as Error).message.split('\n')[0]})`);
    }
    v.trace.voice = { bank: v.bank.hash, paragraphs: passed.paragraphs };
    if (passed.text === r.output) return r;
    const final = await checkDraftAsync(v.name, v.std, passed.text, v.checks);
    if (!editKeepsStandard(await checkDraftAsync(v.name, v.std, r.output, v.checks), final) || v.checks.claimSensor?.degraded) {
      v.trace.voice = { bank: v.bank.hash, note: 'undone: the rewritten text, read in full, was worse than before it; the text before the voice pass was delivered',
        paragraphs: passed.paragraphs.map((p) => (p.kept ? { ...p, kept: false, why: 'undone with the pass: the assembled text did not keep the standard' } : p)) };
      return r;
    }
    const keptN = passed.paragraphs.filter((p) => p.kept).length;
    const stillListed = (r.repair?.claimsToCheck ?? []).filter((c) => passed.text.includes(c.slice(0, 60)));
    const toCheck = [...new Set([...stillListed, ...listedClaims(final)])];
    const base = r.repair ?? { passes: 0, violatedBefore: [], violatedAfter: [], originalOutputHash: sha(draft), draft, why: 'every REQUIRED measured rule holds' };
    const { claimsToCheck: _old, ...rest } = base;
    return { output: passed.text, report: final, repair: { ...rest, violatedAfter: brokenIn(final),
      ...(toCheck.length ? { claimsToCheck: toCheck } : {}),
      why: `${base.why}; ${keptN} paragraph(s) rewritten in your voice` } };
  };
}

/**
 * ONE MORE DRAFT UNTIL THE SHAPE IS THE AUTHOR'S. The checked output is read for its typicality (one calibrated
 * number) and, when the profile has one, by the style detector (P(author)); while a target is unmet and rounds
 * remain, a fresh draft is written and put through the same checks and repair. The output kept breaks the fewest
 * REQUIRED rules, then reads most likely the author's, then is most typical: the rules always outrank the shape.
 * A round that fails costs that round, never the output already delivered.
 */
/** One shape round: its delivered text, its draft, its readings, and the trace it alone produced. */
interface ShapeRound { d: Delivered; draft: string; p: number; author: number | null; broken: number; edits: FidelityTrace['edits']; voice: FidelityTrace['voice']; taken: readonly TasteReading[] | null }

function withShape(refine: (draft: string) => Promise<Delivered>,
  s: { client: InferenceClient; budget: Budget; calibration: TypicalityCalibration | null; detector: FidelityProfile['detector']; target: number | null; authorTarget: number | null;
    rounds: number; servedText: string; task: string; trace: FidelityTrace; taste: TasteSession | null } | null) {
  if (!s) return refine;
  return async (draft: string) => {
    const score = (d: Delivered): { p: number; author: number | null; broken: number } => {
      const scored = s.detector ? scoreDetector(s.detector, d.output) : null;
      return { p: (s.calibration ? typicalityOf(d.output, s.calibration)?.p : null) ?? 0, author: scored ? Math.round((1 - scored.p) * 1000) / 1000 : null, broken: brokenIn(d.report).length };
    };
    const met = (t: { p: number; author: number | null; broken: number }): boolean => t.broken === 0
      && (s.target === null || t.p >= s.target) && (s.authorTarget === null || (t.author ?? 0) >= s.authorTarget);
    // EACH ROUND KEEPS ITS OWN TRACE. The structural edits, the voice pass and the taste reading a round produced
    // describe that round's text; the record must carry the kept round's, never the last one's.
    const editsBefore = s.trace.edits.length;
    const run = async (text: string): Promise<ShapeRound> => {
      s.trace.edits.splice(editsBefore); s.trace.voice = undefined; if (s.taste) s.taste.taken = null;
      const d = await refine(text);
      return { d, draft: text, ...score(d), edits: s.trace.edits.slice(editsBefore), voice: s.trace.voice, taken: s.taste?.taken ?? null };
    };
    const tried: ShapeRound[] = [await run(draft)];
    let note: string | undefined;
    for (let round = 1; round <= s.rounds && !tried.some(met); round++) {
      try {
        const w = await spendOneWithResult(s.client, s.budget, s.servedText, s.task, null, '', {});
        tried.push(await run(w.piece));
      } catch (err) {
        note = `round ${round} could not run (${(err as Error).message.split('\n')[0]}); the best output so far was delivered`;
        break;
      }
    }
    const better = (a: ShapeRound, b: ShapeRound): boolean => b.broken < a.broken
      || (b.broken === a.broken && ((b.author ?? 0) > (a.author ?? 0) || ((b.author ?? 0) === (a.author ?? 0) && b.p > a.p)));
    const best = tried.reduce((a, b) => (better(a, b) ? b : a));
    s.trace.edits.splice(editsBefore, s.trace.edits.length - editsBefore, ...best.edits);
    s.trace.voice = best.voice;
    if (s.taste) s.taste.taken = best.taken;
    if (!note && !met(best)) note = 'no round met the target; the output that broke the fewest rules and read most like yours was delivered';
    s.trace.shape = { target: s.target ?? 0, ...(s.authorTarget !== null ? { authorTarget: s.authorTarget } : {}),
      rounds: tried.map((t, k) => ({ round: k, draft: sha(t.draft), p: t.p, author: t.author, broken: t.broken, kept: t === best })), ...(note ? { note } : {}) };
    // A LATER ROUND'S OUTPUT CARRIES ITS OWN DRAFT. The run's selection record describes round 0's drafts; the kept
    // round's draft is recorded on the repair record, which a round that needed no repair would otherwise lack.
    if (best !== tried[0] && !best.d.repair) {
      return { ...best.d, repair: { passes: 0, violatedBefore: [], violatedAfter: brokenIn(best.d.report), originalOutputHash: sha(best.draft), draft: best.draft,
        why: `shape round ${tried.indexOf(best)} of ${tried.length - 1}, kept for its shape; every REQUIRED measured rule as counted` } };
    }
    return best.d;
  };
}

/**
 * ONE SKELETON PER DRAFT (core/structure/skeleton.ts), from the author's chain with the pieces nearest the request
 * counted NEAR_WEIGHT times; seeded by the request and the draft's index, so a run replays and drafts differ.
 */
function plansFor(s: NonNullable<ReturnType<typeof fstore.getStructure>>, near: readonly string[], asked: string, n: number): StructureMove[][] {
  const chain = chainOf(s.pieces.map((p) => p.moves), s.pieces.map((p) => (near.includes(p.id) ? NEAR_WEIGHT : 1)));
  return Array.from({ length: Math.max(1, n) }, (_, i) => sampleSkeleton(chain, typicalLength(s.chain), seedOf([asked, String(i)])));
}

/** Each draft written against its own skeleton; the skeletons are recorded whether or not the draft is kept. */
function writeByPlan(c: { client: InferenceClient; budget: Budget; servedText: string; task: string; trace: FidelityTrace; plans: StructureMove[][] }) {
  c.trace.structure = { plans: c.plans, read: null, followed: null };
  return (i: number, v: DraftVariant): Promise<Written> => spendOneWithResult(c.client, c.budget, c.servedText, c.task, null, skeletonBlock(c.plans[i % c.plans.length]), v);
}

/**
 * READ THE DELIVERED TEXT'S STRUCTURE, LAST. Two small-model reads (core/structure/moves.ts): what each paragraph of
 * the output does, and how much of the delivered skeleton it followed. Reported; never changes the text. A reader
 * that cannot run costs the reading, never the output.
 */
function withStructureRead(refine: (draft: string) => Promise<Delivered>, s: { budget: Budget; trace: FidelityTrace } | null) {
  if (!s) return refine;
  return async (draft: string) => {
    const d = await refine(draft);
    const st = s.trace.structure;
    if (!st) return d;
    try {
      const r = await readStructure(clientFor(structureModel()), s.budget, d.output);
      // Scored against the skeleton it follows best: the run records which DRAFT won, and each draft had its own plan.
      const best = r ? st.plans.reduce((a, p) => ((followed(p, r.moves) ?? 0) > (followed(a, r.moves) ?? 0) ? p : a), st.plans[0]) : st.plans[0];
      s.trace.structure = { ...st, read: r?.moves ?? null, followed: r ? followed(best, r.moves) : null, ...(r ? {} : { note: 'the delivered text had too few paragraphs to read' }) };
    } catch (err) {
      s.trace.structure = { ...st, note: `the structure reader could not run (${(err as Error).message.split('\n')[0]})` };
    }
    return d;
  };
}

/**
 * HOW TYPICAL OF YOU, ON THIS KIND OF SUBJECT (core/fidelity/typicality.ts, `typicalityInContext`): the author's
 * pieces nearest the request (the retrieval index's top passages) count NEAR_WEIGHT times in the reference.
 */
function contextTypicality(output: string, fid: NonNullable<ReturnType<typeof releaseFor>>, asked: string): ReturnType<typeof typicalityOf> {
  const cal = fid.typicality;
  if (!cal) return null;
  const near = new Set(fid.index ? retrieve(fid.index, asked, 6).map((k) => fid.index?.passages[k]?.piece ?? '') : []);
  return near.size ? typicalityInContext(valuesOf(output), cal, (id) => (near.has(id) ? NEAR_WEIGHT : 1)) : typicalityOf(output, cal);
}

/** The profile with every steering feature the policy does not carry set to MONITOR: read, never steered by. */
function carriedProfile(p: FidelityProfile, policy: TransferPolicy): FidelityProfile {
  return { ...p, bands: p.bands.map((b) => (b.role !== 'MONITOR' && policy.states[featureTrait(b.id)] === undefined ? { ...b, role: 'MONITOR' as const } : b)) };
}

/**
 * Whether an edit kept the standard, on the same terms as a span repair: nothing that held now broken, nothing
 * broken in more places (core/loop/repair.ts, `regressions`), and no claim flagged that was not flagged before.
 */
export function editKeepsStandard(before: VerifyReport, after: VerifyReport): boolean {
  const flagged = (x: VerifyReport): Set<string> => new Set(x.checked.filter((c) => c.requirementId.startsWith('UNSOURCED')).flatMap((c) => c.result.spans.map((sp) => sp.text.trim())));
  const was = flagged(before);
  return regressions(before, after).length === 0 && [...flagged(after)].every((t) => was.has(t));
}

/**
 * Each draft written section by section on one shared plan: the plan is made once, at the first draft. If the
 * plan cannot be made, the draft is written whole, and the record says so.
 */
function writeBySections(c: { client: InferenceClient; budget: Budget; servedText: string; task: string; trace: FidelityTrace }) {
  let plan: Promise<SectionPlan | null> | null = null;
  return async (_i: number, v: DraftVariant): Promise<Written> => {
    plan ??= planSections(c.client, c.budget, c.servedText, c.task).then((p) => { c.trace.plan = p; return p; }, (e: unknown) => {
      c.trace.edits.push({ target: '-', kept: false, why: `written whole: the section plan could not be made (${(e as Error).message.split('\n')[0]})` });
      return null;
    });
    const p = await plan;
    if (!p) return spendOneWithResult(c.client, c.budget, c.servedText, c.task, null, '', v);
    const parts: Written[] = [];
    // The section instruction rides in the user message: the served skill stays one cacheable block across
    // sections, and the task the record binds stays the task asked.
    for (let k = 0; k < p.sections.length; k++) parts.push(await spendOneWithResult(c.client, c.budget, c.servedText, c.task, null, sectionBlock(p, k).trim(), v));
    return { ...parts[parts.length - 1], piece: joinSections(p, parts.map((x) => x.piece)) };
  };
}

/** A selection that writes its drafts by section when a section writer is given. */
function withSections<T extends object>(select: T, write: ((i: number, v: DraftVariant) => Promise<Written>) | null): T {
  return write ? { ...select, write } : select;
}

/** The fidelity record of one run: the release, the readings, the edits, the passages and the applicability manifest. */
function fidelityRecord(fid: NonNullable<ReturnType<typeof releaseFor>>, output: string, trace: FidelityTrace, retrieved: readonly number[],
  applicability: FidelityRecord['applicability'], ledger: readonly Fact[], settings: ImplementationSettings, overridden: boolean,
  voice: { L: store.StoreLayout; policy: TransferPolicy; register: RegisterDecision; traits: { carried: string[]; unknown: string[] } | null; mode: 'off' | 'incontext'; note: string | null } | null = null,
  asked = ''): FidelityRecord {
  const cov = ledger.length ? factCoverage(output, ledger) : null;
  // The lexical distance is a monitor, read on the delivered text against the corpus's own threshold (computed
  // once per retrieval index and kept).
  let distance: RegisterDecision['distance'] = null;
  if (voice && fid.index) {
    let t = vstore.getThreshold(voice.L, fid.index.hash);
    if (!t) { t = { threshold: registerThreshold(fid.index) }; vstore.setThreshold(voice.L, fid.index.hash, t.threshold); }
    distance = registerDistance(fid.index, output, t.threshold);
  }
  return {
    release: overridden ? null : fid.release.id, settings, profileHash: fid.profile.hash,
    // Nothing of ours is sampled: the drafts are the model's, and every choice after them is deterministic.
    seed: 0,
    reading: { ...readFidelity(output, fid.profile), ...(fid.typicality ? { typicality: contextTypicality(output, fid, asked) } : {}) },
    ...(trace.shape ? { shape: trace.shape } : {}),
    ...(trace.sampled ? { sampled: trace.sampled } : {}),
    ...(trace.structure ? { structure: trace.structure } : {}),
    ...(trace.drafts.length ? { drafts: trace.drafts } : {}),
    ...(trace.edits.length ? { edits: trace.edits } : {}),
    ...(retrieved.length ? { retrieved: [...retrieved] } : {}),
    ...(trace.variants.length ? { variants: trace.variants } : {}),
    ...(trace.plan ? { plan: trace.plan.sections.map((x) => x.title) } : {}),
    ...(cov ? { coverage: { supplied: ledger.length, used: cov.used.length, per100: cov.per100, authorPer100: fid.profile.factDensity ?? null } } : {}),
    applicability,
    ...(voice ? { voice: { policy: voice.policy.hash, register: { ...voice.register, distance }, carried: voice.traits?.carried ?? [], notCarried: voice.traits?.unknown ?? [],
      mode: voice.mode, ...(trace.voice ? { bank: trace.voice.bank, paragraphs: trace.voice.paragraphs } : {}),
      ...(trace.voice?.note ?? voice.note ? { note: trace.voice?.note ?? voice.note ?? undefined } : {}) } } : {}),
  };
}

/**
 * THE APPLICABILITY MANIFEST: every requirement of the standard, and what it was to this output. WAIVED,
 * with the reason, when this run withheld it (a request's own shape, material not bound); NOT_APPLICABLE
 * when its measurement says the text is outside what it can judge (too short, no such section); APPLIED
 * otherwise, served and, where it carries a measurement, checked. A study that finds a rule missing from
 * this list, or waived without a reason, has found a confound.
 */
export function applicability(name: string, std: Standard, output: string, waived: ReadonlyMap<string, string>, withheld: readonly string[]): NonNullable<FidelityRecord['applicability']> {
  const v = verifyText(name, std, output);
  const verdict = new Map(v.checked.map((c) => [c.requirementId, c.result.verdict]));
  const conditional = new Map(v.conditional.map((c) => [c.requirementId, c.appliesWhen]));
  return std.requirements.filter((q) => q.authority !== 'EXPERT_REJECTED').map((q) => {
    const why = waived.get(q.requirementId) ?? (withheld.includes(q.statement) ? 'withheld from this run\'s prompt' : null);
    if (why) return { requirementId: q.requirementId, status: 'WAIVED' as const, why };
    if (verdict.get(q.requirementId) === 'NOT_APPLICABLE') return { requirementId: q.requirementId, status: 'NOT_APPLICABLE' as const, why: 'outside what its measurement can judge in this text' };
    const cond = conditional.get(q.requirementId);
    return { requirementId: q.requirementId, status: 'APPLIED' as const, ...(cond ? { why: `served; applies when ${cond}` } : {}) };
  });
}

/** One line on where the output landed against the author's range; the rest is in the details file. */
function reportFidelity(report: RunReport, rec: Invocation): void {
  const f = rec.fidelity;
  if (!f?.reading) return;
  const kept = (f.edits ?? []).filter((e) => e.kept).length;
  const out = f.reading.outside.slice(0, 3).map((o) => featureOf(o.id)?.label ?? o.id);
  report.say(`In your range on ${f.reading.inBand} of ${f.reading.measured} measured features${out.length ? `; furthest outside: ${out.join('; ')}` : ''}${kept ? ` (${kept} structural edit(s) kept)` : ''}.`);
  if (f.coverage) report.detail(`used ${f.coverage.used} of the ${f.coverage.supplied} fact(s) you supplied: ${f.coverage.per100} specifics per 100 words${f.coverage.authorPer100 !== null ? ` (your pieces carry ${f.coverage.authorPer100})` : ''}`);
  report.detail(`implementation release ${f.release ?? 'none'} · profile ${f.profileHash ?? 'none'}${f.reading.detector ? ` · style detector ${f.reading.detector.version}: P(model-written) ${f.reading.detector.p}` : ''}`);
  for (const e of f.edits ?? []) report.detail(`    ${e.actuator ?? 'edit'} on ${e.target}${e.before !== undefined ? ` (${e.before ?? '-'} to ${e.after ?? '-'})` : ''}: ${e.kept ? 'kept' : 'not kept'}, ${e.why}`);
  for (const a of f.applicability ?? []) if (a.status !== 'APPLIED') report.detail(`    ${a.requirementId}: ${a.status.toLowerCase().replace('_', ' ')}${a.why ? `, ${a.why}` : ''}`);
}

/** One draft's counts. An unread signal distance is null: unknown is not "on target", so it ranks last. */
function draftScore(r: Awaited<ReturnType<typeof checkDraftAsync>>, std: Standard, draft: string, signals: ReturnType<typeof store.getSignals>, reading: FidelityReading | null = null): Omit<DraftScore, 'taste'> {
  const style = r.checked.find((c) => std.requirements.find((q) => q.requirementId === c.requirementId)?.measurement?.observer === 'STYLE_DISTANCE')?.result.value ?? 0;
  return {
    ...(reading ? { outside: reading.outside.length, outsideBy: Math.round(reading.outside.reduce((n, o) => n + o.distance, 0) * 1000) / 1000, detector: reading.detector?.p ?? null } : {}),
    req: r.checked.filter((c) => c.materiality === 'REQUIRED' && c.result.verdict === 'VIOLATED').length,
    all: r.checked.filter((c) => c.result.verdict === 'VIOLATED' && c.requirementId !== PUBLIC_FACTS).length,
    tells: r.checked.filter((c) => c.pattern === 'MACHINE_TELL').reduce((n, c) => n + c.result.spans.length, 0),
    signal: signalDistance(draft, signals),
    style,
  };
}

/** What this run was configured with, beyond the binding and the package: enough to re-run a study arm from its record. */
function settingsFor(checks: Checks, taste: TasteSession | null, nDrafts: number): InvocationSettings {
  const temperature = flag('--temperature') === undefined ? undefined : Number(flag('--temperature'));
  return {
    atelierVersion: version(),
    claimInstrument: checks.claimSensor?.instrument ?? null,
    // Read when the record is written, after the run: a reader that degraded mid-run says so here.
    get claim() { return claimInstrumentOf(checks); },
    tasteVeto: [...(taste?.veto ?? [])].sort(),
    learnedTellsHash: sha(JSON.stringify(checks.learnedTells ?? [])),
    formatProfile: checks.format?.id ?? null,
    contextJudge: checks.judge ? `${process.env.ATELIER_CLAIMS_MODEL ?? CLAIMS_MODEL_DEFAULT} (context judge, report-only)` : null,
    maxTokens: draftMaxTokens(),
    ...(temperature === undefined ? {} : { temperature }),
    flags: { drafts: nDrafts, noTaste: argv.includes('--no-taste'), allowUnsourced: argv.includes('--allow-unsourced'), placeholders: argv.includes('--placeholders') },
  };
}

/**
 * THE WHOLE COST, and the record. The writer's budget and the claim reader's are separate meters; what
 * this run spent on either is the process total since generation began.
 */
function finish(report: RunReport, r: { rec: Invocation; sv: SkillVersion; name: string; task: string; budget: Budget; spentBefore: number }): number {
  const spent = Math.max(r.budget.spentUsd, processSpentUsd() - r.spentBefore);
  const reader = spent - r.budget.spentUsd;
  report.detail(`invocation ${r.rec.invocationId}  ·  SkillVersion ${r.sv.skillVersionHash}${flag('--candidate') ? ' (CANDIDATE, not active)' : ''}  ·  $${spent.toFixed(4)}${reader > 0 ? ` (claim reader $${reader.toFixed(4)})` : ''}`);
  writeAtomic(runFile('last-invocation.json'), JSON.stringify({ invocationId: r.rec.invocationId, skillName: r.name, input: r.task, at: r.rec.at }, null, 1));
  const details = runFile('last-invocation.txt');
  report.write(details);
  console.log(`$${spent.toFixed(2)} · everything this run checked: ${details} · not right? atelier fix "<what was wrong>"`);
  return spent;
}

// ── WHAT A RUN SAYS, AND WHERE ──────────────────────────────────────────────────────────────────
//
// A 498-word post arrived inside 1,728 words of report: the prerequisite block, 26 cut claims one per
// line, the repair account, the draft choice, and a reader with no authority listing five misses. The
// person could not find the one line that mattered. So a run prints the post and at most a few lines:
// what still breaks the standard (never hidden), what was cut, what the taste reader saw, and anything
// that went wrong. Everything else is written, in full, beside the run record, and the path is printed.

type Invocation = Awaited<ReturnType<typeof runOnce>>;
type Checks = ReturnType<typeof checksFor>;
type Standard = NonNullable<ReturnType<typeof store.getStandard>>;

/** The run's report: `say` is read now and kept; `detail` is kept for the file only. */
class RunReport {
  private readonly kept: string[] = [];
  /** everything the run said and kept, for --json */
  get lines(): readonly string[] { return this.kept; }
  say(line: string): void { console.log(line); this.kept.push(line); }
  detail(line: string): void { this.kept.push(line); }
  write(path: string): void { writeAtomic(path, `${this.kept.join('\n')}\n`); }
}

/** The rules that cannot fire on this invocation because material they need is not bound. */
export function waitingForMaterial(v: SatisfiabilityVerdict): ReadonlySet<string> {
  return new Set(v.kind === 'DEGRADED' ? v.missing.map((m) => m.requirementId) : []);
}

/** The taste reader's VETO, less the rules waiting for material: those have nothing to be repaired toward. */
export function withoutWaiting(veto: ReadonlySet<string>, rules: readonly { rule: { requirementId: string }; key: string }[], waiting: ReadonlySet<string>): Set<string> {
  const waitingKeys = new Set(rules.filter((r) => waiting.has(r.rule.requirementId)).map((r) => r.key));
  return new Set([...veto].filter((k) => !waitingKeys.has(k)));
}

/**
 * THE ONE LINE ABOUT MATERIAL, near the top. Names the exact `--with` that lets waiting rules fire:
 * a prerequisite is matched by name, so a generic "bind your notes" would not have cleared it.
 */
export function materialLine(v: SatisfiabilityVerdict, materialBound: boolean, guardClaims: boolean, name: string): string | null {
  const cut = guardClaims ? 'any story, source or figure the draft invents is cut' : null;
  if (v.kind === 'DEGRADED') {
    const ids = [...new Set(v.missing.map((m) => m.requirementId))];
    const binds = [...new Set(v.missing.map((m) => `--with ${m.prerequisite.name}=<file>`))];
    return `${ids.length} rule(s) need your real specifics to fire (${ids.join(', ')}). Add them: ${binds.join(' ')}${cut ? `; meanwhile ${cut}` : ''}.`;
  }
  if (!materialBound && cut) return `No notes of yours are bound, so ${cut}. Add yours: --with notes=<file>, or atelier material --skill ${name} <file>.`;
  return null;
}

/**
 * A PROVIDER-SIDE VERSION FLIP UNDER AN UNCHANGED CONFIGURATION. Reported, never fatal: the user changed
 * nothing, and refusing to run would punish them for someone else's release.
 */
function reportDrift(report: RunReport, L: store.StoreLayout, sv: SkillVersion, rec: Invocation): void {
  const prior = store.listInvocations(L)
    .filter((i) => i.skillVersionHash === sv.skillVersionHash && i.invocationId !== rec.invocationId)
    .map((i) => i.observedRuntime).find((o) => o?.bindingHash === rec.observedRuntime.bindingHash) ?? null;
  const drift = detectResolvedModelDrift(prior, rec.observedRuntime);
  if (!drift.drifted) return;
  report.say(`\nRESOLVED MODEL DRIFT — ${drift.why}.`);
  report.say(`Nothing you set has changed. What has changed is what answers to it, so earlier observations`);
  report.say(`on this binding describe a model that is no longer the one serving you.\n`);
}

/** The counted checks and the invented-claim check: a rule still broken is always said, and so is a cut. */
function reportChecks(report: RunReport, rec: Invocation, std: Standard | null, checks: Checks): void {
  if (rec.selection) report.detail(`wrote ${rec.selection.drafts} drafts and kept one: ${rec.selection.why}.`);
  const repairOff = argv.includes('--no-repair');
  const r = rec.repair;
  if (r) {
    report.detail(`checked against the standard: ${r.violatedBefore.length} REQUIRED rule(s) broken in the draft (${r.violatedBefore.join(', ')}); `
      + `${r.passes} rewrite pass(es) of only the spans that broke them; ${r.violatedAfter.length ? `still broken: ${r.violatedAfter.join(', ')}` : 'all now hold'}.`);
    const heavy = r.storiesCut ? heavyCut(r.draft ?? '', r.storiesCut) : null;
    if (heavy) report.say(`Warning: ${heavy}.`);
    const unconfirmed = r.violatedAfter.includes(INCONCLUSIVE);
    const others = r.violatedAfter.filter((x) => x !== INCONCLUSIVE);
    if (unconfirmed) report.say('Not checked, not passed: so many specifics were flagged at once that the check could not tell general knowledge from invention. They are left in and listed in the details; confirm each one, or bind your material (--with notes=<file>), before this is used.');
    if (others.length) report.say(`Still broken after repair: ${others.join(', ')}. ${r.why}`);
    if (!r.violatedAfter.length && !heavy) report.say(`Checked: every REQUIRED measured rule holds${r.violatedBefore.length ? ` (${r.violatedBefore.join(', ')} fixed by rewriting only the spans that broke them)` : ''}.`);
    if (r.integrityReverted?.length) {
      report.detail(`${r.integrityReverted.length} rewrite(s) refused because they changed what the text claims; the original wording was kept:`);
      for (const k of r.integrityReverted) report.detail(`    ${k}`);
    }
  } else if (std?.requirements.some((q) => q.measurement) && !repairOff) {
    report.say('Checked: every REQUIRED measured rule holds.');
  }
  // Which instrument read the draft for invented claims. A reader that failed mid-run, or an unqualified
  // one made to cut by override, is said; that an unqualified reader only reports is standing status.
  const sensor = checks.claimSensor;
  if (sensor && !repairOff) {
    report.detail(`invented-claim check: ${sensor.instrument}.`);
    const alarming = sensor.degraded || (sensor.gate === 'reader' && !sensor.qualified);
    for (const n of sensor.notes) {
      const line = `(invented-claim check: ${n})`;
      if (alarming) report.say(line); else report.detail(line);
    }
  }
  if (r?.claimsToCheck?.length) {
    report.say(`${r.claimsToCheck.length} specific(s) are not in your material: left in for you to check before you use this (listed in the details).`);
    for (const c of r.claimsToCheck) report.detail(`    check: "${c.slice(0, 160)}"`);
  }
  if (r?.storiesCut?.length) {
    report.say(`Cut ${r.storiesCut.length} invented stor(ies), quotation(s) or figure(s); your own would fit where they were (listed in the details).`);
    for (const c of r.storiesCut) report.detail(`    cut: "${c.slice(0, 160)}"`);
  }
}

interface TasteContext {
  readonly L: store.StoreLayout; readonly std: Standard | null; readonly rec: Invocation; readonly asked: string; readonly budget: Budget;
  readonly tasteOn: boolean; readonly tasteTaken: readonly TasteReading[] | null; readonly readings: ReadonlyMap<string, TasteReading[]>;
  readonly tasteNotes: readonly string[]; readonly permissions: { veto: ReadonlySet<string> } | null;
  readonly waiting: ReadonlySet<string>; readonly name: string;
}

/**
 * The taste reader: recorded on every output, said in one line. A rule waiting for material is reported
 * as waiting, never as missed. The reader never costs the person their output: a failure is said.
 */
type TasteMonitor = NonNullable<EvalSummary['monitors']['taste']>;

async function reportTaste(report: RunReport, t: TasteContext): Promise<TasteMonitor | null> {
  for (const n of t.tasteNotes) report.say(`(${n}.)`);
  if (!t.tasteOn || !t.std) return null;
  const rules = new Map(t.std.requirements.map((q) => [q.requirementId, q]));
  try {
    const taken = t.tasteTaken ?? t.readings.get(t.rec.output) ?? null;
    const { readings: read, permissions: earned, held } = await recordTaste(t.L, t.std, t.rec.output, t.asked, t.rec.invocationId, t.budget, taken);
    // A held-back reading shows nothing that names a rule, the taste repair included.
    if (t.rec.repair?.taste) report.say(held ? 'taste repair: details held back with the reading.' : `taste repair: ${t.rec.repair.taste.why}.`);
    report.detail(describeTaste(read, rules, t.permissions?.veto ?? earned.veto, held, t.waiting));
    // A held-back reading is blind on purpose: nothing about it is shown, the panel included.
    if (held) return null;
    const missed = read.filter((x) => x.verdict === 'MISSED' && !t.waiting.has(x.requirementId)).length;
    const waiting = read.filter((x) => t.waiting.has(x.requirementId)).length;
    const status = t.permissions?.veto.size ? 'it acts on the rules your labels gave it' : `reporting only until you label it: atelier taste --skill ${t.name} --calibrate`;
    report.say(`Taste reader: ${missed} of ${read.length} reading-based rule(s) read as missed${waiting ? `, ${waiting} waiting for your material` : ''} (${status}).`);
    const trials = earned.pooled.trials;
    return { followed: read.filter((x) => x.verdict === 'FOLLOWED' && !t.waiting.has(x.requirementId)).length, missed,
      unclear: read.filter((x) => x.verdict === 'UNCLEAR' && !t.waiting.has(x.requirementId)).length, waiting,
      labelled: trials ? { right: earned.pooled.confirmed, of: trials } : null, acts: Boolean(t.permissions?.veto.size) };
  } catch (e) {
    if (t.rec.repair?.taste) report.say(`taste repair: ${t.rec.repair.taste.why}.`);
    report.say(`(the taste reader could not run: ${(e as Error).message.split('\n')[0]})`);
    return null;
  }
}

/**
 * A RESTYLE, SAID AS ONE. When the draft keeps most of the sentences of something it was given, it is
 * that text restyled: its structure and narrator came with it, and the voice can only move as far as
 * the sentences did. Said in one line, with the way to a voice: new pieces written from notes.
 */
function reportRestyle(report: RunReport, output: string, material: readonly { name: string; text: string }[]): void {
  const kept = material.map((m) => ({ name: m.name, text: m.text, share: sentencesKept(output, m.text) })).sort((a, b) => b.share - a.share)[0];
  if (!kept || kept.share < 0.5) return;
  report.say(`Restyle of "${kept.name}": ${Math.round(kept.share * 100)}% of its sentences kept nearly as written, so its structure and rhythm came with it. For the voice, write a new piece from notes.`);
  // AN ADDED ARGUMENT IS NOT AN INVENTED FACT, AND NOTHING ELSE CATCHES IT: every sentence with no
  // counterpart in the source is listed for the person to approve or cut before publishing.
  const added = sentencesAdded(output, kept.text);
  if (!added.length) return;
  report.say(`${added.length} sentence(s) have no counterpart in "${kept.name}", which can mean a new argument: check them before publishing (listed in the details).`);
  for (const a of added) report.detail(`    added: "${a.slice(0, 200)}"`);
}

/** Copying, text that is not the deliverable, and an output contract that did not reach the provider: said. */
function reportIntegrity(report: RunReport, rec: Invocation, classNote: string | null | undefined, std: Standard | null, L: store.StoreLayout): void {
  if (classNote && std?.requirements.some((q) => q.measurement)) report.detail(`(${classNote})`);
  // THE AUTHOR'S PIECES ARE FOR VOICE, NOT FOR COPYING. The skill serves some of the author's own
  // writing (core/compiler/voice.ts); an output that repeats a long run of it verbatim has lifted it.
  const voice = store.getVoice(L);
  const served = [...(voice?.passages ?? []), ...(voice?.pieces ?? [])];
  if (served.length) {
    const lifted = overlapIndex(served)(rec.output).longestShared;
    if (lifted >= LIFTED_RUN) report.say(`(the output repeats ${lifted} words in a row from one of your passages the skill carries: that is copying, not voice. Rewrite that sentence.)`);
  }
  // Checked on the OUTPUT, never the served bytes — those legitimately contain every marker, and
  // passing them in would report a breach on every invocation.
  const breaches = findOwnershipBreaches(rec.output);
  if (breaches.length) report.say(describeBreaches(breaches));
  const c = rec.delivery.outputContract;
  if (c?.enforced) report.detail(`output contract ${c.artifact} — constrained this generation`);
  else if (c) report.say(`output contract ${c.artifact} — DID NOT REACH THE PROVIDER`);
}

/**
 * The served skill without the lines that state `statements`: a rule's line and the indented lines that
 * belong to it (its "Checked:" line, its record comment), or a move's list item. Matched on the start of
 * each statement, as the renderer writes it.
 */
export function withoutRules(skillMd: string, statements: readonly string[]): string {
  const heads = statements.map((st) => st.trim().slice(0, 60)).filter((h) => h.length >= 12);
  const out: string[] = []; let dropping = false;
  for (const line of skillMd.split('\n')) {
    if (heads.some((h) => line.includes(h))) { dropping = true; continue; }
    if (dropping && /^\s{2,}\S/.test(line)) continue;
    dropping = false;
    out.push(line);
  }
  return out.join('\n');
}

/** Whether the request itself asks for a long or a short answer, in so many words; null when it does not. */
export function requestedLength(task: string): 'LONG' | 'SHORT' | null {
  if (/\b(?:in detail|detailed|in[- ]depth|thorough(?:ly)?|comprehensive|step[- ]by[- ]step|walk me through|explain (?:fully|everything)|long(?:er)? (?:answer|explanation|version))\b/i.test(task)) return 'LONG';
  if (/\b(?:brief(?:ly)?|short(?:er)? (?:answer|version|reply)|one[- ]line(?:r)?|in (?:a|one) sentence|tl;?dr|quick answer|keep it short)\b/i.test(task)) return 'SHORT';
  return null;
}

/**
 * Whether the request states its own output format in so many words ("return only the code block",
 * "just the number", "JSON only", "yes or no"), and the words that said it; null when it does not.
 */
export function requestedFormat(task: string): string | null {
  const m = /\b(?:(?:return|give me|reply with|respond with|output|answer with)\s+(?:only|just)\b[^.?!\n]{0,40}|only (?:the|a|one)\s+(?:code|code block|number|json|sql|command|answer|list|diff|function)\b|just (?:the|a)\s+(?:code|number|json|command|answer|diff)\b|no (?:explanation|prose|commentary|preamble|extra text)\b|json only\b|yes or no\b|one[- ]line answer\b)/i.exec(task);
  return m ? m[0].trim() : null;
}

/**
 * WHAT KIND OF FORMAT A REQUEST STATES. A SHAPE is an output that is not a piece of prose in the author's
 * presentation: code, JSON, SQL, a command, a diff, a number, one line, yes or no, a list or table. Anything
 * else the request says about its format ("return only the post", "no preamble", "just the text") is BARE:
 * it removes what wraps the piece, and the piece keeps the standard.
 */
export function formatShape(words: string): 'SHAPE' | 'BARE' {
  return /\b(?:code|snippet|json|sql|yaml|csv|command|diff|patch|function|number|figure|yes or no|yes\/no|one[- ]line|single line|one sentence|list|bullets?|table|regex)\b/i.test(words) ? 'SHAPE' : 'BARE';
}

/** Observers whose rules shape how an output is presented, not what it says. */
const PRESENTATION = new Set(['PRESENCE', 'OPENING', 'CLOSING', 'PARAGRAPH_LENGTH', 'SENTENCE_LENGTH', 'FRAGMENT_SHARE', 'HEADINGS', 'RHYTHM', 'DISTRIBUTION']);
/** Prose rules about presentation: where a piece starts or ends, its lines, lists, headings, length. */
const PRESENTATION_WORDS = /\b(?:end(?:s|ing)?|clos(?:e|es|ing)|open(?:s|ing)?|start(?:s|ing)?|first line|last line|lines?|bullets?|lists?|headings?|paragraphs?|words? long|length|format|next:)/i;

/** The rules a request that states its own format overrides: measured presentation rules, and prose ones. */
export function presentationRules(requirements: readonly { requirementId: string; statement: string; measurement?: { observer: string } | null }[]): {
  measured: typeof requirements; prose: typeof requirements } {
  return {
    measured: requirements.filter((q) => q.measurement && PRESENTATION.has(q.measurement.observer)),
    prose: requirements.filter((q) => !q.measurement && PRESENTATION_WORDS.test(q.statement)),
  };
}
