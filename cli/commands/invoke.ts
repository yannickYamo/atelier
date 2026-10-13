// cli/commands/invoke.ts — Serving the package and recording what came back.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import { existsSync, readFileSync } from 'node:fs';
import { methodReading, methodLine } from '../../core/eval/obligations.js';
import type { CheckContext } from '../../core/observers/registry.js';
import { checksFor, claimInstrumentOf, contextJudgeFor, smallReaderFor, CLAIMS_MODEL_DEFAULT } from '../checks.js';
import { regressions } from '../../core/loop/repair.js';
import { refineToStandard, checkDraft, checkDraftAsync, enforceClaims, heavyCut, listedClaims, brokenByCut, PUBLIC_FACTS, INCONCLUSIVE } from '../../core/loop/run-repair.js';
import { signalDistance } from '../../core/observers/selection.js';
import { featureOf } from '../../core/observers/features.js';
import { acts, verifyText, type VerifyReport } from '../../core/observers/verify.js';
import { readFidelity } from '../../core/fidelity/profile.js';
import { factLedger, factCoverage, type Fact } from '../../core/loop/fact-ledger.js';
import { steerTowardRange, type Application } from '../../core/fidelity/structural.js';
import { LOOP_SETTINGS, DIVERSITY_TEMPERATURES, type FidelityProfile, type FidelityReading, type FidelityRecord, type ImplementationSettings } from '../../core/fidelity/types.js';
import type { RepairRecord, Requirement } from '../../core/state/canonical-state.js';
import { releaseFor, implementationBlock } from '../fidelity.js';
import { buildRunEval } from '../eval-run.js';
import { needsReview } from '../../core/eval/record.js';
import { renderPanel, type EvalSummary } from '../../core/eval/summary.js';
import { putEval } from '../../core/state/eval-store.js';
import { renderRetrieved } from '../../core/fidelity/retrieval.js';
import { lexicalNearness, readerNearness, nearWeight, referenceWeight, retrieveNear, type Nearness } from '../../core/fidelity/nearness.js';
import { gradeSubjects, SUBJECT_READER_VERSION } from '../../core/fidelity/subject-reader.js';
import type { ContextJudge } from '../../core/loop/context-judge.js';
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
import { localContext, type LocalContext } from '../../core/fidelity/context.js';
import { densityRatio, drawIndex, seedOf } from '../../core/fidelity/sampling.js';
import { scoreDetector } from '../../core/fidelity/stylometry.js';
import { chainOf, sampleSkeleton, skeletonBlock, followed, NEAR_WEIGHT, type MoveChain } from '../../core/structure/skeleton.js';
import { readStructure, STRUCTURE_READER_VERSION, type StructureMove } from '../../core/structure/moves.js';
import { structureModel } from './fidelity.js';
import { checkClass } from '../../core/observers/doc-class.js';
import { readTaste, tasteRules, describeTaste, applicabilityFor, vetoMisses, type TasteReading } from '../../core/taste/reader.js';
import { tastePermissions } from '../../core/taste/calibration.js';
import { refineTaste } from '../../core/taste/repair.js';
import { overlapIndex, sentencesKept, sentencesAdded } from '../../core/observers/overlap.js';
import { recordTaste, readerModel, readerClient as readerClientFor } from './taste.js';
import { processSpentUsd, processSpendByPurpose, spendBetween, type Budget, type InferenceClient } from '../../core/inference/client.js';
import { countWords } from '../../core/eval/size.js';
import { statedLength, statedLengths, againstStated, statedBounds, notHeldBecause, ownLengthBand, againstBand, type StatedLength } from '../../core/intake/length.js';
import { proseWords } from '../../core/observers/style.js';
import { isReplyWork } from '../../core/observers/formats.js';
import { citesLines, numbered, citedLines } from '../../core/loop/locators.js';
import { composeServed } from '../served.js';
import { findOwnershipBreaches, describeBreaches } from '../../core/state/output-ownership.js';
import { assertHistoryNotServed, foldRepairs } from '../../core/architecture/repair-memory.js';
import type { SkillVersion, InvocationSettings } from '../../core/state/canonical-state.js';
import * as store from '../../core/state/store.js';
import { listsBecause, unmeasuredKind } from '../../core/loop/claim-extract.js';
import { planFor } from '../../core/plan/execution-plan.js';
import { checkSatisfiable, describeSatisfiability, type SatisfiabilityVerdict } from '../../core/state/prerequisite.js';
import { resolveProvenance } from '../../core/fidelity/provenance.js';

import { runOnce, draftMaxTokens } from './improve.js';
import { version } from '../help.js';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { compareBindings, describeMismatch, describeNewSurface, detectResolvedModelDrift, bindingHash } from '../../core/runtime/binding.js';
import { resolve as resolvePath } from 'node:path';
import { sha, DATA, VALUED_OPTIONS, die, argv, flag, clientAndBinding, describeBinding, numericFlag, positional, boundResources, boundMaterial, assertSkillName, runFile, clientFor } from '../runtime.js';

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

export function resolveServedSkill(name: string, opts: { readonly index?: boolean } = {}): ServedSkill {
  const L: store.StoreLayout = { root: DATA, skillName: name };
  // A CANDIDATE is served by explicit id and is NOT active. That asymmetry is the product: a person
  // must be able to run the thing being proposed WITHOUT it having been adopted first.
  const wanted = flag('--candidate') ?? store.getActive(L) ?? die(`no active version for ${name}. Build it first.`);
  return resolveServedVersion(L, wanted, flag('--context') ?? '', opts);
}

/** A run of this many words repeated from a served piece of the author's is copying, not an echo of a phrase. */
const LIFTED_RUN = 12;

/**
 * What a SkillVersion serves a model, exactly as `invoke` serves it: SKILL.md and every example file
 * whose condition holds, fenced as reference material. `fix`'s candidate run and the regression floor's
 * runs serve through this too, so a comparison between two versions is never a comparison between two
 * ways of serving them.
 */
export function resolveServedVersion(L: store.StoreLayout, wanted: string, context: string, opts: { readonly index?: boolean } = {}): ServedSkill {
  const sv = store.getSkillVersion(L, wanted) ?? die(`SkillVersion ${wanted} is missing from the store.`);
  const pkg = store.getPackage(L, sv.materializedHash)
    ?? die(`package ${sv.materializedHash} is not in the store — this SkillVersion was built before packages were persisted, so what it served cannot be reconstructed. Rebuild it.`);
  if (pkg.files['SKILL.md'] === undefined) die('the stored package has no SKILL.md.');
  const { servedText, servedExamples, withheld } = composeServed(pkg.files, context, opts);
  const contractFile = pkg.files['contracts/output.schema.json'] ?? null;
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
/**
 * WHERE THE AUTHOR'S OWN LENGTH APPLIES. The request states no length and asks for no detail or brevity; it asks
 * for no shape of its own (code, a list, one line); the skill writes pieces, not answers, whose length belongs to
 * the request; the request is in the register the pieces are in; and the run is not a contract check or a long
 * piece planned section by section. Anywhere else the span of the pieces says nothing about this output.
 */
export const ownLengthApplies = (c: { stated: boolean; asked: boolean; shape: boolean; contract: boolean; answers: boolean; outOfRegister: boolean; sections: boolean; ruled?: boolean }): boolean =>
  !c.stated && !c.asked && !c.shape && !c.contract && !c.answers && !c.outOfRegister && !c.sections && !c.ruled;
/** Does the owner require a length of the whole work, in words? Then that is the length, and their pieces' span adds no second one. */
export const lengthIsRuled = (std: Standard | null): boolean => (std ? planFor(std).rulesLength : false);
/** How many words a count is outside a band; 0 inside it. */
export const wordsOutside = (n: number, band: readonly [number, number]): number => (n < band[0] ? band[0] - n : n > band[1] ? n - band[1] : 0);

/**
 * A LENGTH THE METHOD STATES IS ITS DEFAULT: a request that states its own, in the same unit, sets it for the run,
 * and these are the method's rules it then sets aside. "A detailed answer" names no number and moves no cap; a
 * request for 600 words says nothing about a limit in characters.
 */
export function lengthRulesTheRequestSets(std: Standard | null, stated: StatedLength | null): Requirement[] {
  if (!std || !stated) return [];
  // The length of the whole work only: a request for 600 words says nothing about how long one section runs.
  return std.requirements.filter((q) => q.measurement?.observer === 'LENGTH' && !q.measurement.params.in
    && ((q.measurement.params.unit as readonly string[] | undefined)?.[0] ?? 'words').toLowerCase() === stated.unit);
}

/** What a run says of the places its output cites, for a skill that cites lines (core/loop/locators.ts). */
export function lineCitationsLine(output: string, material: readonly { name: string; text: string }[]): string {
  const cited = citedLines(output, material); const off = cited.filter((c) => c.why);
  if (!cited.length) return 'Line citations: none found in the output in the form path:line, though this skill cites lines.';
  return `Line citations: ${cited.length - off.length} of ${cited.length} point at a line of the material with something on it${off.length ? `; not: ${off.slice(0, 6).map((c) => `${c.path}:${c.line} (${c.why})`).join(', ')}` : ''}.`;
}

/** What a run says of its length, where the request named none and the author's own pieces set it. */
export function ownLengthLine(output: string, band: readonly [number, number], span: readonly [number, number]): string {
  const written = proseWords(output); const how = againstBand(written, band);
  return `Length: ${written.toLocaleString('en-US')} words. The request names none; your pieces run ${span[0]} to ${span[1]}, shortest to longest${how === 'met' ? '' : `, and this is ${how} of what they span (${band[0]} to ${band[1]})`}.`;
}

/**
 * WHAT THE PERSON SAID WAS WRONG WITH THE LAST VERSION OF THIS PIECE (`atelier fix`), told to the writer beside the
 * task. It is no part of what was asked: a number in a complaint is not a length, and the complaint is not material.
 */
export const correctionFor = (said: string | undefined): string => (said?.trim()
  ? `\n\n(An earlier version of this piece was not right. The person who asked for it said, in their words: "${said.trim().replace(/"/g, "'")}". Write the piece so that this is put right, and change nothing else about what was asked.)` : '');

/** The length a request states in words, against what was written: the request's own constraint on this one output. */
export function requestLength(output: string, asked: StatedLength): { asked: string; met: boolean | null; detail: string } {
  const written = countWords(output); const how = againstStated(written, asked);
  const [lo, hi] = statedBounds(asked); const n = (x: number): string => Math.round(x).toLocaleString('en-US');
  const allows = lo !== null && hi !== null ? (lo === hi ? `exactly ${n(lo)}` : `${n(lo)} to ${n(hi)}`) : lo !== null ? `${n(lo)} or more` : hi !== null ? `${n(hi)} or fewer` : '';
  return { asked: asked.raw, met: how === 'met', detail: `${written.toLocaleString('en-US')} words written${how === 'met' ? '' : `: too ${how}, it allows ${allows}`}` };
}

/** Each rule as it fared on the delivered text, and the rules no check reads: the evaluation, rule by rule. */
export function rulesFared(report: VerifyReport | null): { checked: { id: string; statement: string; materiality: string | null; verdict: string; detail: string }[]; unchecked: { id: string; statement: string }[] } | null {
  if (!report) return null;
  return { checked: report.checked.map((c) => ({ id: c.requirementId, statement: c.statement ?? c.requirementId, materiality: c.materiality ?? null, verdict: c.result.verdict, detail: c.result.detail })),
    unchecked: report.unchecked.map((u) => ({ id: u.requirementId, statement: u.statement })) };
}

/** One draft's counts, as `invoke --drafts N` ranks them. */
export interface DraftScore {
  readonly req: number; readonly taste: number; readonly tells: number; readonly all: number; readonly signal: number | null; readonly style: number;
  /** steering features outside the author's range, and how far in total (core/fidelity/profile.ts); 0 without a profile */
  readonly outside?: number; readonly outsideBy?: number;
  /** the style detector's P(model-written), when the skill has one: a tie-breaker, never more */
  readonly detector?: number | null;
  /** words outside the span of the author's own pieces, when the request names no length (`ownLengthApplies`); absent where that does not apply */
  readonly lengthOff?: number;
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
  // THE LENGTH THEIR PIECES RUN, when the request names none: how many words a draft is outside it. After every
  // rule, before the finer features: a draft at the author's length that breaks a rule does not win on length.
  || (a.lengthOff ?? 0) - (b.lengthOff ?? 0)
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
  // A SKILL THAT CITES LINES IS SHOWN THE LINE NUMBERS (core/loop/locators.ts), read from the skill as served.
  const lineCiting = citesLines(servedText);
  const { material, materialText, task } = taskWithMaterial(L, asked, lineCiting);

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
  if (flag('--register') && !policy) die(`--register needs the corpus's own register first: atelier voice register --skill ${name} <register>`);
  const voiceFlag = flag('--voice');
  if (voiceFlag && !['incontext', 'off'].includes(voiceFlag)) die(`--voice is incontext or off, got "${voiceFlag}".`);
  const voiceMode: 'incontext' | 'off' = voiceFlag ? (voiceFlag === 'incontext' ? 'incontext' : 'off') : runSettings?.voice ?? 'off';
  const bank = voiceMode === 'incontext' && fid ? vstore.getBank(L) : null;
  if (voiceFlag === 'incontext' && !policy) die(`the voice pass needs the corpus's register declared first: atelier voice register --skill ${name} <register>`);
  if (voiceFlag === 'incontext' && (!bank || bank.pairs.length < MIN_PAIRS)) die(`the voice pass needs a pair bank of at least ${MIN_PAIRS} pairs: atelier voice pairs --skill ${name}`);
  // Whether the voice pass could run, before the request's register is read (below, once the run has a budget):
  // its calls are reserved in the budget either way.
  const voiceCould = voiceMode === 'incontext' && policy !== null && bank !== null && bank.pairs.length >= MIN_PAIRS
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
  const shapeAsked = shapeTarget !== null || authorTarget !== null;
  // STRICT DELIVERY (`--strict`, or `fidelity --set delivery=strict`): an output is delivered only when its verdict
  // is conformant. A reply that leaves out part of what the request asks is completed once; a draft that still
  // breaks a REQUIRED rule is written again (--redraws, default 2); what still does not conform is refused, with
  // its reasons and a failing exit. `--allow-nonconformant` delivers it anyway, marked, and still exits failing.
  const strict = (argv.includes('--strict') || runSettings?.delivery === 'strict') && std !== null && contractFile === null;
  if (argv.includes('--strict') && argv.includes('--no-repair')) die('--strict delivers only a checked output, and --no-repair turns the checks off: drop one of them.');
  const redraws = strict && !argv.includes('--no-repair') ? Math.max(0, Math.floor(numericFlag('--redraws', 2))) : 0;
  // STRICT NEEDS A CLAIM CHECK THAT DECIDES. On a kind of work the skill names and nobody measured the check on,
  // its findings are listed and nothing fails on them, so "delivered only when conformant" would promise a check
  // that did not decide. Said before anything is spent. A skill that names no kind, or a run with no material
  // bound, has no claim check to wait for: strict holds the rest of the standard, and the verdict says the
  // specifics were listed and why. --allow-unsourced turns the claim check off, and with it this stop.
  const materialBound = store.getMaterial(L).length > 0 || boundMaterial().length > 0;
  const unmeasuredWork = listsBecause({ cls: flag('--class') ?? store.getDocClass(L), bound: materialBound, slots: argv.includes('--placeholders') });
  const unmeasuredNamed = unmeasuredKind(flag('--class') ?? store.getDocClass(L));
  if (strict && unmeasuredNamed && !argv.includes('--allow-unsourced')) {
    die(`Strict delivery needs a claim check that decides, and here the claim check is not measured on ${unmeasuredNamed}. Nothing was written. Run without --strict to get a draft with unsourced sentences listed.`);
  }
  const shapeRounds = Math.max(shapeAsked ? Math.floor(numericFlag('--shape-rounds', 3)) : 0, redraws);
  if (shapeAsked && shapeRounds < 1) die('--shape-rounds must be at least 1: each round is one more draft.');
  if (shapeAsked && argv.includes('--no-repair')) die('--until-typical and --until-author check each round before keeping it, and --no-repair turns the checks off: drop one of them.');
  // PLAN-FIRST (`--structure plan`, core/structure/skeleton.ts): each draft is written against its own skeleton of
  // paragraph moves, sampled from the author's chain with their pieces nearest the request counted more.
  const structureFlag = flag('--structure');
  if (structureFlag && structureFlag !== 'plan') die(`--structure takes plan, got "${structureFlag}".`);
  if (structureFlag && !fid) die('--structure plan needs the skill\'s fidelity profile (built from a corpus, and not with --no-fidelity).');
  const authorStructure = structureFlag && fid ? fstore.getStructure(L, fid.profile.hash) : null;
  if (structureFlag && !authorStructure) die(`--structure plan needs your pieces read for structure first: atelier fidelity --skill ${name} --read-structure-from <folder of your pieces>`);
  if (structureFlag && argv.includes('--sections')) die('--structure plan and --sections both decide the shape of the piece: use one.');
  if (structureFlag && argv.includes('--no-repair')) die('--structure plan asks for stories and evidence paragraphs, and --no-repair turns off the check that cuts invented ones: drop one of them.');
  if (authorStructure && authorStructure.reader !== STRUCTURE_READER_VERSION) die(`your pieces were read by structure reader ${authorStructure.reader}, and this is ${STRUCTURE_READER_VERSION}: read them again (atelier fidelity --skill ${name} --read-structure-from <folder>).`);
  const selectFlag = flag('--select');
  if (selectFlag && !['sample', 'best'].includes(selectFlag)) die(`--select is sample or best, got "${selectFlag}".`);
  const sampling = (selectFlag ?? runSettings?.selection ?? 'best') === 'sample' && Boolean(fid?.profile.detector);
  if (selectFlag === 'sample' && !fid?.profile.detector) report.say('(--select sample needs the skill\'s style detector, trained at discovery; drafts are chosen the usual way.)');
  // THE AUTHOR'S RANGE ON THIS KIND OF SUBJECT (`--context local`, core/fidelity/context.ts): the SIGNAL bands moved
  // toward the author's pieces nearest the request, by how many of them are near. RULE bands never move.
  const contextFlag = flag('--context');
  if (contextFlag && !['local', 'off'].includes(contextFlag)) die(`--context is local or off, got "${contextFlag}".`);
  const contextWanted = (contextFlag ?? runSettings?.context ?? 'off') === 'local' && fid !== null;
  // The per-piece values come from the calibration, and a calibration made before it kept its pieces' ids cannot say
  // which piece is near the request.
  const contextReady = Boolean(fid?.typicality?.ids && fid.index);
  const recalibrate = `rebuild it from its corpus, or run atelier fidelity --skill ${name} --calibrate-from <folder of your pieces>`;
  if (contextFlag === 'local' && !contextReady) die(`--context local needs the skill's retrieval index and a typicality calibration that knows its pieces: ${recalibrate}.`);
  // HOW THE REQUEST'S NEAREST PIECES ARE FOUND (`--nearness reader`, core/fidelity/nearness.ts): by shared words, or
  // by a small model's reading of the subject against the skill's subject cards, with the words as its floor.
  const nearnessFlag = flag('--nearness');
  if (nearnessFlag && !['reader', 'lexical'].includes(nearnessFlag)) die(`--nearness is reader or lexical, got "${nearnessFlag}".`);
  const nearnessWanted = (nearnessFlag ?? runSettings?.nearness ?? 'lexical') === 'reader' && fid !== null;
  const subjectCards = nearnessWanted && fid?.index ? fstore.getSubjects(L, fid.index.hash) : null;
  if (nearnessFlag === 'reader' && !subjectCards) die(`--nearness reader needs your pieces read for their subjects first: atelier fidelity --skill ${name} --read-subjects`);
  // HOW THE METHOD IS CARRIED, as the self-improvement loop left it (`atelier evolve`): a default for the drafts and a
  // note on what earlier drafts missed. A flag on this run wins. Where the skill has a release, the number of drafts
  // is the release's (and `--fidelity`'s): the search does not change it there, and nothing here overrides it.
  // One adopted under another standard is not used: its note quotes requirements as they then were.
  const adoptedCarry = store.getCarry(L); const methodCarry = adoptedCarry?.standardVersion === sv.standardVersionHash ? adoptedCarry : null;
  const carryNoteFile = flag('--carry-note');
  const carryNote = (carryNoteFile !== undefined ? (existsSync(carryNoteFile) ? readFileSync(carryNoteFile, 'utf8') : die(`--carry-note ${carryNoteFile}: there is no such file.`)) : methodCarry?.note ?? '').trim();
  const nDrafts = Math.max(1, Math.floor(numericFlag('--drafts', runSettings ? runSettings.drafts : methodCarry?.drafts ?? (store.getVoice(L)?.pieces?.length ? 2 : 1))));
  const editBudget = runSettings && !argv.includes('--no-repair') ? Math.max(0, Math.floor(numericFlag('--edits', runSettings.editBudget))) : 0;
  // THE TASTE READER IS A MODEL'S OPINION OF THE OWNER'S RULES, and has not earned a say (docs/TASTE.md): it runs
  // only when asked for (--taste). A run is held to what code can read and what the owner judges.
  const taste = std && argv.includes('--taste') && !argv.includes('--no-taste') ? TasteSession.open(L, std, asked, waiting) : null;
  // The bounds grow with the drafts and the taste reader's calls, and a request the cap cannot cover is
  // refused before anything is spent rather than failing halfway with nothing delivered.
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', Math.max(1.0, 0.3 * nDrafts + 0.15 * editBudget + 0.4
      + (argv.includes('--sections') ? 0.1 * MAX_SECTIONS * nDrafts : 0)) + (voiceCould ? 0.03 * MAX_PARAGRAPHS : 0) + shapeRounds * (0.3 + 0.15 * editBudget + (voiceCould ? 0.03 * MAX_PARAGRAPHS : 0)) + (strict ? (shapeRounds + 1) * 0.4 : 0)),
    // Edits come last; their calls are reserved on top of the repair's (up to five), so a release's edit
    // budget is not silently starved by the rewrites before it.
    // Long form by section: a plan, and up to MAX_SECTIONS calls per draft instead of one.
    // A skill built from a method may write once more with what is missing named, and check that draft like the first.
    maxCalls: numericFlag('--max-calls', nDrafts + editBudget + 4 + (editBudget ? 5 : 0) + (taste?.callsFor(nDrafts) ?? 0) + (std?.requirements.some((r) => r.obligation === 'DELIVERABLE' && r.measurement) ? 6 : 0)
      + (argv.includes('--sections') ? 1 + MAX_SECTIONS * nDrafts : 0) + (nearnessWanted ? 1 : 0) + (voiceCould ? MAX_PARAGRAPHS * 2 + 4 : 0) + shapeRounds * (1 + 5 + editBudget + (voiceCould ? MAX_PARAGRAPHS + 4 : 0) + (taste?.callsFor(1) ?? 0)) + (structureFlag ? 2 : 0)
      + (strict ? (shapeRounds + 1) * (9 + editBudget + (taste?.callsFor(1) ?? 0)) + 1 : 0)) };
  // FROM HERE ON, EVERYTHING SPENT IS THIS RUN'S. Taken where the budget is made, before the first call that can
  // draw on it: the reading of the request and the grading of its subject are paid for before any draft, and a
  // snapshot taken at the first draft left them out of the lines by purpose, and out of the total whenever the claim
  // reader, on a meter of its own, cost more than they did.
  const spentBefore = processSpentUsd();
  const ledgerBefore = processSpendByPurpose();
  if (nDrafts * 0.2 > budget.capUsd) die(`--drafts ${nDrafts} needs roughly $${(nDrafts * 0.2).toFixed(2)} and the cap is $${budget.capUsd.toFixed(2)}. Nothing was spent. Raise --cap or ask for fewer drafts.`);
  taste?.bind(budget);
  // Made before any draft is paid for: building the reader's client can refuse a configuration, and a
  // refusal after the drafts were written would cost the person their output.
  if (taste?.acts) taste.client();
  const { client, binding } = checkedBinding(L, sv);
  // WHAT THE REQUEST ITSELF SAYS: its length, its format and the kind of document it names. Read by the context
  // judge when there is one (core/loop/context-judge.ts); the word patterns are the floor. On the run's own budget,
  // so its calls count against the cap the person set.
  const judge = !argv.includes('--allow-unsourced') ? contextJudgeFor(budget) : undefined;
  const intent = judge ? await judge.requestIntent(asked) : null;
  // THE REGISTER OF THE REQUEST (core/voice/register.ts): the person's flag, else the request's own words for its
  // document type as the judge quoted them, else the word table.
  const register = policy ? decideRegister(policy.corpusRegisters, asked, flag('--register'), null, intent?.document) : null;
  // Never out of register: pairs carry the whole voice of the register they were written in.
  const voiceRuns = voiceCould && register?.status !== 'out';
  // WHICH OF THE AUTHOR'S PIECES THIS REQUEST IS NEAR, read once and used by every step that weighs them: the
  // passages shown, the typical-of-you reading, the range for the subject and the skeleton. Recorded with the run.
  const subjectReader = nearnessWanted && subjectCards ? smallReaderFor() : undefined;
  let nearness: Nearness | null = null;
  // An index with no passage (every paragraph of the corpus under 40 words) has nothing to be near.
  if (fid?.index?.passages.length) {
    if (nearnessWanted) {
      const stale = subjectCards && !subjectCards.reader.startsWith(`${SUBJECT_READER_VERSION}:`);
      const grades = subjectCards && subjectReader && !stale ? await gradeSubjects(subjectReader.client, budget, asked, subjectCards) : null;
      nearness = grades && subjectCards && subjectReader ? readerNearness(fid.index, grades, `${SUBJECT_READER_VERSION}:${subjectReader.model}`, subjectCards.hash)
        : lexicalNearness(fid.index, asked, !subjectCards ? `your pieces are not read for their subjects yet (atelier fidelity --skill ${name} --read-subjects)`
          : stale ? `your subject cards were read by ${subjectCards.reader}, and this is ${SUBJECT_READER_VERSION}: read them again (atelier fidelity --skill ${name} --read-subjects)`
            : !subjectReader ? 'no small model to read the subject (offline, or no key)' : 'the subject reader could not answer');
      if (nearness.fellBack) report.say(`(nearness=reader: ${nearness.fellBack}; your nearest pieces were found by shared words.)`);
    } else nearness = lexicalNearness(fid.index, asked);
  }
  const readNear = nearness?.source === 'reader' ? nearness : null;
  const local = contextWanted && contextReady && fid?.typicality && fid.index
    ? localContext(asked, fid.typicality, fid.index, readNear ? (id) => nearWeight(readNear, id) : undefined) : null;
  if (contextWanted && !local) report.say(contextReady ? '(context=local: this request is near too few of your pieces to set a range of its own; your range for its length is used.)'
    : `(context=local is set, but the skill's calibration does not know its pieces; your range for its length is used: ${recalibrate}.)`);

  // ASKED FOR, NOT INVENTED. A story, a named source or a figure the person did not supply is cut from
  // the output (core/loop/claims.ts). Said before anything is spent, with how to supply the real ones.
  const needsLine = materialLine(satisfiable, material.length > 0, !argv.includes('--allow-unsourced'), name);
  if (needsLine) report.say(needsLine);
  if (nDrafts > 1 && (!std || contractFile !== null)) {
    console.log(`(--drafts ${nDrafts} does not apply here: ${!std ? 'the standard is missing' : 'this skill has an output contract, so there is one shape to produce'}; writing one draft.)`);
  }
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
  // Read by the context judge above when there is one; the word patterns are the floor.
  // The judge's reading and the word pattern together: either one finding a stated length or format counts.
  // A NUMBER IN THE REQUEST IS A LENGTH TOO (core/intake/length.ts). "About 2,000 words" was not seen: only words
  // like "detailed" were, so the usual length stayed in the prompt and the chapter came back short.
  const stated = statedLength(asked);
  const lengthAsked = intent?.length ?? requestedLength(asked);
  for (const q of lengthRulesTheRequestSets(std, stated)) {
    waived.set(q.requirementId, `the request states its own length (${stated?.raw})`);
    withheld.push(q.statement);
    report.say(`The request states its own length (${stated?.raw}): "${q.statement}" is withheld for this run.`);
  }
  const lengthLine = lengthAsked || stated ? servedText.split('\n').find((l) => /^My (?:pieces of this kind|answers usually) run about /.test(l.trim())) : undefined;
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
  const checks = { ...checksFor(L, { material: materialText, task: asked, context: { request: asked, material }, guardClaims: !argv.includes('--allow-unsourced'), placeholders: argv.includes('--placeholders'), ...(judge ? { judge } : {}) }),
    ...(waived.size ? { waived } : {}) };
  // DRAFTS THAT DIFFER (core/fidelity/types.ts, `diversity`): each draft its own temperature and its own slice of
  // the author's closest passages, so the shared block carries only the notes.
  const diverse = Boolean(runSettings?.diversity) && nDrafts > 1 && fid !== null;
  const impl = fid && runSettings ? implementationBlock({ ...fid.release, settings: diverse ? { ...runSettings, retrievalK: 0 } : runSettings }, fid.index, asked, readNear) : { text: '', retrieved: [] };
  const pool = diverse && fid?.index && runSettings && runSettings.retrievalK > 0 ? retrieveNear(fid.index, asked, runSettings.retrievalK * nDrafts, readNear) : [];
  // A run whose flags changed what the release would have done is recorded with the settings that ran and
  // no release: credited to the release, it would make the settings search compare arms that never ran.
  // Compared, not inferred from flags: `--fidelity` on a release that already runs the loop overrides nothing,
  // and `--sections` changes what ran though it changes no setting.
  const ran = runSettings ? { ...runSettings, drafts: nDrafts, editBudget } : null;
  const rel = fid?.release.settings;
  const overridden = !ran || !rel || argv.includes('--sections') || argv.includes('--no-repair')
    || ran.drafts !== rel.drafts || ran.editBudget !== rel.editBudget || ran.retrievalK !== rel.retrievalK || ran.notesCap !== rel.notesCap
    || Boolean(ran.diversity) !== Boolean(rel.diversity) || voiceMode !== (rel.voice ?? 'off') || shapeTarget !== null || authorTarget !== null || sampling !== (rel.selection === 'sample' && Boolean(fid?.profile.detector)) || Boolean(structureFlag)
    || contextWanted !== (rel.context === 'local') || nearnessWanted !== (rel.nearness === 'reader') || strict !== (rel.delivery === 'strict');
  const trace: FidelityTrace = { drafts: [], edits: [], variants: [] };
  // Out of register the author's range steers only on the features the policy carries; the rest are read, not steered by.
  const carried = fid && policy && register?.status === 'out' ? carriedProfile(fid.profile, policy) : fid?.profile ?? null;
  const steerProfile = carried && local ? { ...carried, context: local } : carried;
  const editProfile = fid && local ? { ...fid.profile, context: local } : fid?.profile ?? null;
  // What each draft call was given, by the index it was asked for; the record keeps only the calls that came back
  // (selectDraft), with the temperature the provider was actually sent.
  const retrievedFor: number[][] = [];
  let perDraftWords = 0;
  const variantOf = (i: number): DraftVariant => {
    const mine = pool.filter((_, j) => j % nDrafts === i).slice(0, runSettings?.retrievalK ?? 0);
    retrievedFor[i] = mine;
    const stableExtra = mine.length && fid?.index ? `\n\n${renderRetrieved(fid.index, mine)}` : '';
    // With drafts made to differ each draft is given its own passages; the largest such block is what a draft was sent.
    perDraftWords = Math.max(perDraftWords, countWords(stableExtra));
    return { temperature: DIVERSITY_TEMPERATURES[i % DIVERSITY_TEMPERATURES.length], stableExtra };
  };
  // The facts the person supplied, in the request and the bound material: what a draft may be specific with.
  const ledger = factLedger(materialText);
  // Said to the writer in so many words, after the pieces it is shown: they run at the author's length, and without
  // this line they set the length whatever the request says.
  const lengthNote = stated && contractFile === null ? `\n\nThe request states its length: ${statedLengths(asked).map((x) => x.raw).join(', ')}. Write to that length. The length my own pieces run does not apply to this request.` : '';
  // Served under its own heading, as what it is: what earlier runs showed, not a rule of the standard.
  const carryBlock = carryNote && contractFile === null ? `\n\n## From earlier runs of this skill (not a rule of the standard)\n\n${carryNote}` : '';
  const servedForRun = `${withheld.length ? withoutRules(servedText, withheld) : servedText}${impl.text}${carryBlock}${lengthNote}`;
  const deliveryForRun = withheld.length ? { ...delivery, withheldRules: withheld } : delivery;
  // What the person said was wrong with an earlier version (`atelier fix`) goes to the writer whatever shape was asked for.
  const corrected = `${task}${correctionFor(flag('--correcting'))}`;
  const taskForRun = shape === 'SHAPE' ? `${corrected}\n\n(The request's own format instruction overrides any presentation rule in the skill: follow the request exactly.)`
    : shape === 'BARE' ? `${corrected}\n\n(Deliver only the piece itself: no preamble, no note about it, no commentary after it.)` : corrected;
  // LONG FORM BY SECTION (core/fidelity/sections.ts), behind --sections: planned once, each section written with
  // the whole standard served, joined, then checked and steered as one piece. Not for a structured output.
  // A REQUEST THAT STATES ITS OWN LENGTH OR SHAPE GETS NO SKELETON: the request sets the shape then.
  // A LONG request still gets a plan, at the length its word count sets; a SHORT one or a stated shape does not.
  const planState = authorStructure && contractFile === null && lengthAsked !== 'SHORT' && shape !== 'SHAPE'
    ? newPlanState(authorStructure, nearness, asked, nDrafts, started,
      fid ? paragraphsFor(asked, fid.profile) : null) : null;
  if (authorStructure && !planState) trace.structure = { plans: [], read: null, followed: null, note: 'no skeleton: the request asks for something short, or states its own format' };
  const sectionWriter = argv.includes('--sections') && contractFile === null
    ? writeBySections({ client, budget, servedText: servedForRun, task: taskForRun, trace })
    : planState ? writeByPlan({ client, budget, servedText: servedForRun, task: taskForRun, state: planState }) : null;
  // ONE CLAIM VERDICT PER RUN. The report the repair counted on the text it delivered (two reads agreed, and each
  // sentence's verdict held for the run by claimMemory) is the one the panel shows: a fresh read of the same text
  // is another sample of a noisy reader, and two samples of one run disagreed (7, 2 and 5 flags in a live test).
  const completions: string[] = [];
  // THE AUTHOR'S OWN LENGTH, WHERE IT APPLIES (`ownLengthApplies`): one more thing the drafts are chosen by.
  const ownBand = ownLengthApplies({ stated: Boolean(stated), asked: Boolean(lengthAsked), shape: shape === 'SHAPE', contract: contractFile !== null,
    answers: checks.format?.claims === 'list' || (std ? isReplyWork(std.workType) : false), outOfRegister: register?.status === 'out', sections: argv.includes('--sections'), ruled: lengthIsRuled(std) })
    ? ownLengthBand(store.getVoice(L)?.lengthSpan) : null;
  // What one more draft would be told, when a draft leaves it unmet (`withRedraft`).
  const ownSpan = store.getVoice(L)?.lengthSpan;
  // A draft is written again for its length only on evidence that a piece of the author's runs inside the span: with
  // n pieces the next one falls between the shortest and the longest (n - 1) times in (n + 1), which is four in
  // five from nine pieces. On fewer the drafts are still chosen by length, which costs nothing. --no-redraft turns
  // the step off whole.
  const enough = (store.getVoice(L)?.lengthPieces ?? 0) >= LENGTH_REDRAFT_PIECES;
  // A length the request states in words is held as the request's own: a draft that misses it is written again.
  // Only where it can be read one way (core/intake/length.ts, `notHeldBecause`); otherwise it is shown as not counted.
  const notHeld = stated && contractFile === null ? notHeldBecause(asked, stated) : null;
  const askedWords = stated && contractFile === null && !notHeld ? stated : null;
  const unmet = std && !argv.includes('--no-redraft') ? unmetReader(std, ownBand && ownSpan && enough ? { band: ownBand, span: ownSpan } : null, askedWords) : null;
  let delivered: Delivered | null = null;
  const keepDelivered = (refine: (draft: string) => Promise<Delivered>) => async (draft: string): Promise<Delivered> => (delivered = await refine(draft));
  const rec = await runOnce(L, sv, servedForRun, servedHash, deliveryForRun, taskForRun, client, budget, binding,
    resolveProvenance(flag('--provenance'), process.env), contractFile,
    flag('--task') ? 'FLAG' : 'POSITIONAL',
    std && !argv.includes('--no-repair') ? keepDelivered(withStructureRead(withShape(withCoverage(withVoice(withEdits(withRedraft(refineDraft({ client, budget, name, std, checks, taste }), unmet ? { unmet, notes: completions, redraft: async (note) => (await spendOneWithResult(client, budget, servedForRun, taskForRun, null, note, {})).piece } : null), fid && (editBudget > 0 || argv.includes('--fidelity')) ? { client, budget, name, std, checks, profile: editProfile ?? fid.profile, editBudget, trace, taste } : null),
      voiceRuns && bank && fid ? { client, budget, name, std, checks, bank, copied: fid.index ? overlapIndex(fid.index.passages.map((p) => p.text)) : null, trace, taste, reader: smallReaderFor()?.client ?? null, gate: runSettings?.voiceGate === 'reader' ? 'reader' as const : 'lists' as const } : null),
      strict && judge?.covers ? { client, budget, judge, asked, servedText: servedForRun, task: taskForRun, notes: completions } : null),
      shapeRounds > 0 ? { client, budget, calibration: fid?.typicality ?? null, detector: fid?.profile.detector ?? null, target: shapeTarget, authorTarget, rounds: shapeRounds, servedText: servedForRun, task: taskForRun, trace, taste,
        fresh: planState ? (round: number) => freshPlannedDraft(client, budget, servedForRun, taskForRun, planState, round) : null } : null),
      planState ? { budget, trace, state: planState } : null)) : null,
    std && nDrafts > 1 ? withSections(selectDraft({ n: nDrafts, name, std, checks, taste, ownBand, signals: store.getSignals(L), profile: steerProfile, trace, ledger, sampling, ...(diverse ? { variant: variantOf, retrievedFor } : {}) }), sectionWriter)
      : sectionWriter ? { n: 1, write: sectionWriter, choose: () => ({ index: 0, why: '' }) } : null,
    std && checks.guardClaims !== false ? async (text: string) => {
      const r = await checkDraftAsync(name, std, text, checks);
      return (r.checked.find((c) => c.requirementId === 'UNSOURCED' && acts(c))?.result.spans ?? []).map((sp) => sp.text);
    } : null, settingsFor(checks, taste, nDrafts, carryBlock ? carryNote : ''),
    // A structured output is JSON, not prose: no reading of it means anything against a prose range.
    fid && std && contractFile === null ? (output: string) => fidelityRecord(fid, output, trace, impl.retrieved, applicability(name, std, output, waived, withheld, checks.context), ledger,
      { ...(runSettings ?? fid.release.settings), drafts: nDrafts, editBudget, ...(voiceMode === 'incontext' ? { voice: 'incontext' as const } : { voice: undefined }),
        ...(sampling ? { selection: 'sample' as const } : { selection: undefined }), ...(contextWanted ? { context: 'local' as const } : { context: undefined }), ...(nearnessWanted ? { nearness: 'reader' as const } : { nearness: undefined }),
        ...(strict ? { delivery: 'strict' as const } : { delivery: undefined }) }, overridden,
      policy && register ? { L, policy, register, traits, mode: voiceMode,
        note: voiceMode === 'incontext' && !voiceRuns ? (register.status === 'out' ? 'not run out of register: pairs carry the whole voice of the register they were written in'
          : !bank || bank.pairs.length < MIN_PAIRS ? `not run: the pair bank holds fewer than ${MIN_PAIRS} pairs (atelier voice pairs)` : 'not run on this kind of output') : null } : null, local,
      nearness ? { ...nearness, usedFor: [...(impl.retrieved.length || pool.length ? ['passages' as const] : []), ...(fid.typicality?.ids && nearness.pieces.length ? ['typicality' as const] : []),
        ...(local ? ['range' as const] : []), ...(planState ? ['skeleton' as const] : [])] } : null) : null);

  reportDrift(report, L, sv, rec);
  // Under strict delivery nothing is printed until the verdict is known.
  // WHAT A HOST READS IS THE TEXT, NOT THE REPORT. Where material is bound and the claim check lists and never
  // cuts, the sentences it could not find in the material close the delivered text, after everything the checks
  // read; the record keeps the text without them. With nothing bound the list is every specific the writer chose,
  // which tells a reader nothing: it stays in the report. --no-unsourced-note leaves it there in every case.
  const listed = unmeasuredWork && materialBound && !argv.includes('--no-unsourced-note') ? rec.repair?.claimsToCheck ?? [] : [];
  const shipped = listed.length ? `${rec.output.trimEnd()}\n\n---\nNot found in what you supplied (check before you use this):\n${listed.map((c) => `- "${c}"`).join('\n')}` : rec.output;
  if (!machine && !strict) console.log(`\n${shipped}\n`);
  if (adoptedCarry && !methodCarry) report.say(store.CARRY_RETIRED);
  for (const c of completions) report.say(c);
  reportChecks(report, rec, std, checks);
  if (lineCiting && material.length) report.say(lineCitationsLine(rec.output, material));
  const tasteMonitor = taste ? await taste.report(report, rec, name) : null;
  reportIntegrity(report, rec, cls.ok ? cls.note : null, std, L);
  reportFidelity(report, rec);
  if (ownBand) report.say(ownLengthLine(rec.output, ownBand, store.getVoice(L)?.lengthSpan ?? ownBand));
  if (stated?.unit === 'words' && contractFile === null) {
    const written = countWords(rec.output); const how = againstStated(written, stated);
    report.say(`Length asked: ${stated.raw}. Written: ${written.toLocaleString('en-US')} words${how === 'met' ? '' : ` (${how} of what was asked)`}.`);
  }
  reportRestyle(report, rec.output, material);
  const spent = finish(report, { rec, sv, name, task, asked, budget, spentBefore });
  // Taken where the total is, so the lines by purpose sum to it: what the evaluation below reads is not this run's writing.
  const spentBy = spendBetween(ledgerBefore, processSpendByPurpose());
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
      answers: checks.format?.claims === 'list', unmeasured: checks.listsBecause ?? null, profile: fid?.profile ?? null,
      format: { words: formatAsked ?? null, shape, withheld: presentationWithheld }, taste: tasteMonitor, costUsd: spent,
      // Where the cost went (core/inference/client.ts, `SpendPurpose`) and what the writer was sent, in words.
      spend: spentBy,
      sent: { skill: countWords(servedForRun) - countWords(impl.text) - countWords(carryBlock), added: countWords(impl.text) + countWords(carryBlock) + perDraftWords, request: countWords(taskForRun) },
      durationMs: Date.now() - started, drafts: nDrafts, report: finalReport, contract: contractFile !== null,
      request: askedWords ? requestLength(rec.output, askedWords) : stated && notHeld ? { asked: stated.raw, met: null, detail: notHeld } : null,
      applicability: rec.fidelity?.applicability ?? (std ? applicability(name, std, rec.output, waived, withheld, checks.context) : []),
      // WHAT THE REQUEST ASKED FOR, AGAINST THE DELIVERED TEXT: read under strict delivery, from the run's cache when
      // the loop already read this text. A monitor on the panel: it never decides the verdict.
      coverage: strict && judge?.covers ? await judge.covers(asked, rec.output).catch(() => null) : null,
      strict: strict ? { redraws, allowed: argv.includes('--allow-nonconformant') } : null });
  } catch (e) {
    report.say(`(the evaluation of this run could not be built: ${(e as Error).message.split('\n')[0]})`);
  }
  if (evaluation) putEval(L, evaluation);
  const showPanel = evaluation && !argv.includes('--quiet') && (argv.includes('--panel') || (!machine && process.stdout.isTTY));
  // STRICT DELIVERY: THE VERDICT DECIDES. An output that does not conform (or whose evaluation could not be built) is
  // not delivered: the reasons are, with a failing exit. The record keeps the text, for `atelier report`.
  const nonconformant = strict && !evaluation?.result.conformant;
  const refused = nonconformant && !argv.includes('--allow-nonconformant');
  if (nonconformant) process.exitCode = STRICT_EXIT;
  if (strict && !machine && !refused) console.log(`\n${nonconformant ? 'NOT CONFORMANT, delivered because --allow-nonconformant was given:\n\n' : ''}${rec.output}\n`);
  if (refused) {
    const why = evaluation ? evaluation.result.reasons.join('; ') : 'the run could not be evaluated';
    console.error(`atelier: not delivered (strict delivery): ${why}. The text is kept with the record: atelier report ${rec.invocationId}. To deliver it anyway, marked: --allow-nonconformant.`);
  }
  // DELIVERED UNDER STRICT IS NOT VERIFIED. Strict refuses what was seen to fail and what could not be evaluated;
  // what no check read in full is delivered, and said: a script that asked for strict must not read it as a pass of everything.
  const left = strict && !refused && evaluation?.record?.state === 'NEEDS_REVIEW' ? evaluation.record.entries.filter(needsReview).length : 0;
  if (left) console.error(`atelier: delivered (strict delivery): nothing required was seen to fail, and ${left} required thing${left === 1 ? ' was' : 's were'} not read in full by a check. Not verified: atelier report ${rec.invocationId}`);
  if (showPanel && evaluation) console.log(`\n${renderPanel(evaluation, { width: process.stdout.columns || 110, color: !process.env.NO_COLOR && process.stdout.isTTY && !machine })}\n`);
  if (machine === 'answer' && !refused) process.stdout.write(`${shipped}\n`);
  if (machine === 'json') {
    process.stdout.write(`${JSON.stringify({
      output: refused ? null : rec.output, ...(strict ? { delivered: !refused } : {}), invocationId: rec.invocationId, skillVersion: sv.skillVersionHash, costUsd: Number(spent.toFixed(4)),
      rulesBroken: rec.repair?.violatedAfter ?? [], cut: rec.repair?.storiesCut ?? [], toCheck: rec.repair?.claimsToCheck ?? [],
      // Every rule of the standard as it fared on the text delivered, in the owner's words: what `atelier run` shows.
      rules: rulesFared((delivered as Delivered | null)?.report ?? null),
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
function taskWithMaterial(L: store.StoreLayout, asked: string, lineCiting = false): { material: readonly { name: string; text: string }[]; materialText: string; task: string } {
  const material = [...store.getMaterial(L), ...boundMaterial()];
  const materialText = [asked, ...material.map((m) => m.text)].join('\n\n');
  // What the checks read is the material as given; what the writer sees, for a skill that cites lines, carries
  // each line's number, so a citation is read off the page and never counted.
  const task = !material.length ? asked
    : lineCiting ? `${asked}\n\n${material.map((m) => `<material name="${m.name}" lines="numbered">\n${numbered(m.name, m.text)}\n</material>`).join('\n\n')}\n\n`
      + '(Each line of the material is shown with its line number in front of it. When you cite a line, use that number; do not count.)'
      : `${asked}\n\n${material.map((m) => `<material name="${m.name}">\n${m.text}\n</material>`).join('\n\n')}`;
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
    if (final.kept.length || (final.cut.length && brokenByCut(t.output, final.text))) {
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
  r.checked.filter((x) => acts(x) && x.result.verdict === 'VIOLATED').map((x) => x.requirementId);

/**
 * SEVERAL DRAFTS, THE BEST BY COUNT (`draftOrder`): the fewest REQUIRED rules broken, then the fewest
 * VETO rules read as missed (when the reader has earned any), machine-writing moves, rules of any weight,
 * distance from the author's signals, and style. A count picks it, never a judge's taste: the reader
 * breaks ties between drafts that break the same REQUIRED rules, and never outranks one.
 */
function selectDraft(c: DraftContext & { readonly n: number; readonly ownBand?: readonly [number, number] | null; readonly signals: ReturnType<typeof store.getSignals>; readonly profile: FidelityProfile | null; readonly trace: FidelityTrace; readonly ledger: readonly Fact[]; readonly variant?: (i: number) => DraftVariant; readonly retrievedFor?: readonly number[][]; readonly sampling?: boolean }) {
  return { n: c.n, ...(c.variant ? { variant: c.variant } : {}), choose: async (drafts: readonly string[], written?: readonly { readonly index: number; readonly temperatureSent: number | null }[]) => {
    if (c.variant && written) c.trace.variants = written.map((w) => ({ index: w.index, temperature: w.temperatureSent, retrieved: c.retrievedFor?.[w.index] ?? [] }));
    const tasteMissed = c.taste?.acts ? await c.taste.misses(drafts) : drafts.map(() => 0);
    const reports = await Promise.all(drafts.map((d) => checkDraftAsync(c.name, c.std, d, c.checks)));
    const profile = c.profile;
    const readings = profile ? drafts.map((d) => readFidelity(d, profile)) : [];
    c.trace.drafts.push(...readings);
    const scored = drafts.map((d, i) => ({ i, ...draftScore(reports[i], c.std, d, c.signals, readings[i] ?? null),
      ...(c.ledger.length ? { facts: factCoverage(d, c.ledger).used.length } : {}), ...(c.ownBand ? { lengthOff: wordsOutside(proseWords(d), c.ownBand) } : {}), taste: tasteMissed[i] }));
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
  v: { client: InferenceClient; budget: Budget; name: string; std: Standard; checks: Checks; bank: PairBank; copied: ReturnType<typeof overlapIndex> | null; trace: FidelityTrace; taste: TasteSession | null; reader?: InferenceClient | null; gate?: 'lists' | 'reader' } | null) {
  if (!v) return refine;
  return async (draft: string) => {
    const r = await refine(draft);
    const notRun = (note: string): Delivered => { v.trace.voice = { bank: v.bank.hash, paragraphs: [], note }; return r; };
    if (v.taste?.acts) return notRun('not run: the taste reader holds VETO on this skill, and a rewrite would change the text it read');
    if (v.checks.claimSensor?.degraded) return notRun('not run: the claim reader could not run, so a rewrite could not be checked for invented claims');
    let passed: Awaited<ReturnType<typeof voicePass>>;
    try { passed = await voicePass(v.client, v.budget, r.output, v.bank, v.copied, v.reader ?? null, v.gate ?? 'lists'); } catch (err) {
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
interface ShapeRound { d: Delivered; draft: string; p: number; author: number | null; broken: number; edits: FidelityTrace['edits']; voice: FidelityTrace['voice']; taken: readonly TasteReading[] | null; notes: string[] }

/** The exit code of a strict run whose output did not conform, delivered or not. */
export const STRICT_EXIT = 3;

/**
 * GIVE WHAT WAS ASKED, ONCE MORE (strict delivery). The checked output is read against the request
 * (core/loop/context-judge.ts, `covers`): each thing the request explicitly asks for, and whether the reply gives
 * it. When a part is missing, one more draft is written with those parts named, put through the same checks, and
 * kept only if it breaks no more REQUIRED rules and leaves fewer parts out. The instruction never asks for
 * content the writer does not have: a part it cannot give, it must say so. A reader that cannot answer changes nothing.
 */
/**
 * WHAT A DRAFT DID NOT HOLD THAT NO SENTENCE REWRITE FIXES: a section or a table the method requires, a stated
 * length, a citation that is no line of the material, the length the author's own pieces run. Each is said in the
 * owner's words with what the check found, so that one more draft can be told all of them at once.
 */
export interface Unmet { readonly id: string; readonly statement: string; readonly detail: string; /** how far off, where that is a number: the less the better */ readonly off?: number;
  /** a miss of length, in words: what the writer is told to aim for, since told only the limit it lands just past it again */ readonly aim?: string;
  /** whose length was missed, where it is the request's and not the span of the author's pieces */ readonly of?: 'request';
  /** the miss is of the length of the whole piece (not of one section of it): what a trim can put right */ readonly whole?: true }
export const LENGTH_ID = 'length';
/** The fewest pieces from which a draft is written again for its length: (n - 1) / (n + 1) is 0.8 at nine. */
export const LENGTH_REDRAFT_PIECES = 9;
/** How many times a draft is written again: once, and once more for a length alone. */
const REDRAFTS = 2;
/** A draft that only runs long is cut up to this many times: each pass removes words from the last. */
const TRIMS = 3;

/**
 * WHAT TO AIM FOR, AFTER A MISS OF LENGTH. Told "at most 420 words" a writer came back at 469, and told "38 too
 * many" it cut 30. So the aim is set inside the limit by as much as the draft was outside it, and by a tenth of the
 * limit at most: a target the writer overshoots into the range, where the limit itself is one it overshoots out of.
 */
export function lengthAim(n: number, lo: number | null, hi: number | null): string | undefined {
  if (hi !== null && n > hi) return `aim for ${Math.max(hi - (n - hi), Math.round(hi * 0.9))} words or fewer`;
  if (lo !== null && n < lo) return `aim for ${Math.min(lo + (lo - n), Math.round(lo * 1.1))} words or more`;
  return undefined;
}

/** The reader of what a draft left unmet for this skill and this run, or null when there is nothing of the kind to read. */
export function unmetReader(std: Standard, own: { band: readonly [number, number]; span: readonly [number, number] } | null, asked: StatedLength | null = null): ((d: { output: string; report: VerifyReport }) => Unmet[]) | null {
  // A missing section or table is not a sentence to rewrite (core/loop/repair.ts leaves such a rule alone); nor is a
  // citation that is no line of the material, since the right number is on the page the writer was given.
  // Which rules those are is the plan's to say (core/plan/execution-plan.ts): the ones a miss of is written again for.
  const must = new Map(planFor(std).rules.filter((p) => p.onMiss === 'REDRAFT').map((p) => [p.id, p.statement]));
  if (!must.size && !own && !asked) return null;
  // A length the method states in words is a miss of length too: how far, and what to aim for.
  const limits = new Map(std.requirements.flatMap((r) => (r.measurement?.observer === 'LENGTH' && ((r.measurement.params.unit as readonly string[] | undefined)?.[0] ?? 'words').toLowerCase() === 'words'
    ? [[r.requirementId, { lo: typeof r.measurement.params.min === 'number' ? r.measurement.params.min : null, hi: typeof r.measurement.params.max === 'number' ? r.measurement.params.max : null, whole: !r.measurement.params.in }] as const] : [])));
  const ruleMiss = (x: VerifyReport['checked'][number]): Unmet => {
    const base = { id: x.requirementId, statement: must.get(x.requirementId) ?? x.requirementId, detail: x.result.detail };
    const lim = limits.get(x.requirementId); const n = x.result.value;
    if (!lim || typeof n !== 'number') return base;
    const aim = lengthAim(n, lim.lo, lim.hi);
    return { ...base, off: lim.hi !== null && n > lim.hi ? n - lim.hi : lim.lo !== null && n < lim.lo ? lim.lo - n : 0, ...(aim ? { aim } : {}), ...(lim.whole ? { whole: true as const } : {}) };
  };
  return (d) => {
    const rules = d.report.checked.filter((x) => must.has(x.requirementId) && x.result.verdict === 'VIOLATED').map(ruleMiss);
    if (asked) {
      const written = countWords(d.output); const [lo, hi] = statedBounds(asked);
      if (againstStated(written, asked) === 'met') return rules;
      const aim = lengthAim(written, lo, hi); const off = Math.round(hi !== null && written > hi ? written - hi : (lo ?? 0) - written);
      return [...rules, { id: LENGTH_ID, whole: true as const, of: 'request' as const, statement: `Write it at the length the request asks for: ${asked.raw}`, detail: `${written} words, ${off} ${hi !== null && written > hi ? 'too many' : 'too few'}`, off, ...(aim ? { aim } : {}) }];
    }
    const n = own ? proseWords(d.output) : 0;
    if (!own || againstBand(n, own.band) === 'met') return rules;
    const aim = lengthAim(n, own.band[0], own.band[1]);
    return [...rules, { id: LENGTH_ID, whole: true as const, statement: `Write it at the length my pieces run: ${own.span[0]} to ${own.span[1]} words`,
      detail: `${n} words, ${wordsOutside(n, own.band)} ${n > own.band[1] ? 'too many' : 'too few'}`, off: wordsOutside(n, own.band), ...(aim ? { aim } : {}) }];
  };
}

/** What the writer is told before the one more draft: everything unmet, and the draft it is to keep what it can of. */
export function redraftNote(unmet: readonly Unmet[], draft: string): string {
  return `An earlier draft did not hold what this work requires:\n${unmet.map((u) => `- ${u.statement} (${u.detail}${u.aim ? `; ${u.aim}` : ''})`).join('\n')}\n`
    + 'Write the whole piece again so that each of them holds. Keep what the earlier draft says wherever it can stay. Where a length is given to aim for, cut or add until you are there, and count before you finish. '
    + 'Fill them only from the request and the material you were given. Where you were not given what one needs, say so in its place. Never invent a figure, a source or a result to fill a table or a section.\n\n'
    + `The earlier draft:\n<earlier-draft>\n${draft.trim()}\n</earlier-draft>`;
}

/** Is everything a draft still misses that it runs too long? Then it is trimmed, not written again. */
const onlyTooLong = (unmet: readonly Unmet[]): boolean => unmet.length > 0 && unmet.every((u) => u.whole && u.aim?.endsWith('or fewer'));

/**
 * A DRAFT THAT HOLDS EVERYTHING AND RUNS LONG IS CUT, NOT REWRITTEN. Asked to write the piece again at the right
 * length, a writer changes what was right and lands a few words past the limit once more (469, then 439, then 422
 * against 420). Asked to remove words from the piece it is shown, with the number to remove and what to leave
 * alone, it has one thing to do. The number is the miss plus the margin `lengthAim` sets inside the limit.
 */
export function trimNote(unmet: readonly Unmet[], draft: string): string {
  // Where two limits are both passed, the one missed by most decides: inside it, the piece is inside the other.
  const worst = [...unmet].sort((a, b) => (b.off ?? 0) - (a.off ?? 0))[0]; const over = worst.off ?? 0; const to = /aim for (\d[\d,]*) words or fewer/.exec(worst.aim ?? '')?.[1];
  return `The draft below holds what this work requires and runs too long: ${unmet.map((u) => u.detail).join('; ')}.\n`
    + `Return the same piece with words removed${to ? ` until it runs ${to} words or fewer (at least ${over} fewer than now)` : ` (at least ${over})`}. `
    + 'Cut what adds least: a restated point, a qualifier, a clause that repeats its sentence. Keep every heading, section, table, list item, name, figure and citation exactly as it is, in the same order. '
    + 'Add nothing and reword nothing you do not have to. Count the words before you finish.\n\n'
    + `The draft:\n<earlier-draft>\n${draft.trim()}\n</earlier-draft>`;
}

/**
 * Is `after` nearer to holding everything than `before`? Rules first: fewer of them unmet, never more. A length is
 * the tie-break between drafts that leave the same number of rules unmet: a draft at the right length that drops a
 * section the method requires is not nearer, and one that adds the section and runs a few words long is.
 */
export const nearer = (after: readonly Unmet[], before: readonly Unmet[]): boolean => {
  const rules = (xs: readonly Unmet[]): number => xs.filter((u) => u.id !== LENGTH_ID).length;
  const far = (xs: readonly Unmet[]): number => xs.reduce((n, u) => n + (u.off ?? 0), 0);
  return rules(after) < rules(before) || (rules(after) === rules(before) && far(after) < far(before));
};

/** What the run says the one more draft did, in the owner's terms; a draft written again for its length alone says the two lengths. */
function redraftOutcome(before: readonly Unmet[], after: readonly Unmet[], kept: boolean, named: (us: readonly Unmet[]) => string, whose: (us: readonly Unmet[]) => string): string {
  if (before.every((u) => u.id === LENGTH_ID)) {
    const now = after.find((u) => u.id === LENGTH_ID); const what = before[0].of === 'request' ? 'what the request asks for' : 'what your pieces span';
    return kept ? `Written again for length: the first draft ran ${before[0].detail}, outside ${what}; ${now ? `it now runs ${now.detail}, nearer and still outside` : 'it is now inside it'}.`
      : `The draft runs ${before[0].detail}, outside ${what}; one more draft did not do better, so the first is kept.`;
  }
  return kept ? `Written again: the first draft left out ${before.length} thing(s) ${whose(before)} (${named(before)}); it now leaves out ${after.length}${after.length ? ` (${named(after)})` : ''}.`
    : `The draft leaves out ${before.length} thing(s) ${whose(before)} (${named(before)}); one more draft did not do better, so the first is kept.`;
}

/**
 * ONE MORE DRAFT, TOLD EVERYTHING THE FIRST DID NOT HOLD (`unmetReader`). Written once (and once more where only a
 * length is still unmet), put through the same checks, and kept only if it is nearer to holding them and breaks no more of any other REQUIRED rule: counted apart, since
 * a draft that adds a section and breaks another rule would otherwise read as no worse. It is told never to fill a
 * table or a section with what it was not given: a figure the material does not hold is the claim check's either way.
 */
export function withRedraft(refine: (draft: string) => Promise<Delivered>,
  c: { unmet: (d: Delivered) => Unmet[]; redraft: (note: string) => Promise<string>; notes: string[] } | null) {
  if (!c) return refine;
  // Said in the owner's own words, with the id beside it: "x3" alone tells them nothing.
  const named = (us: readonly Unmet[]): string => us.map((u) => (u.id === LENGTH_ID ? `the length ${u.of === 'request' ? 'the request asks for' : 'your pieces run'} (the draft: ${u.detail})` : `${u.id}: "${u.statement.length > 70 ? `${u.statement.slice(0, 67)}...` : u.statement}"`)).join('; ');
  const whose = (us: readonly Unmet[]): string => (us.some((u) => u.id === LENGTH_ID) ? 'the work requires' : 'the method requires');
  const others = (x: Delivered, us: readonly Unmet[]): number => brokenIn(x.report).filter((id) => !us.some((u) => u.id === id)).length;
  return async (draft: string) => {
    let d = await refine(draft);
    let missing = c.unmet(d);
    if (!missing.length) return d;
    // What is recorded as broken before is rules, by their ids: the length is no rule of the standard, and counted
    // as one it was reported as a rule held "once the draft was corrected" and read as a recurrence.
    const ids = missing.filter((u) => u.id !== LENGTH_ID).map((u) => u.id);
    const say = (x: Delivered, note: string): Delivered => { c.notes.push(note); return noted(x, note, ids); };
    // Written again once, and once more where everything still unmet is a length, which a writer nears by halves.
    // And where all that is left is that the whole piece runs long, it is cut, up to three times, counted apart.
    let redrafts = 0; let trims = 0;
    const another = (): boolean => (onlyTooLong(missing) ? trims < TRIMS : redrafts < REDRAFTS && (redrafts === 0 || missing.every((u) => u.aim)));
    while (missing.length && another()) {
      if (onlyTooLong(missing)) trims += 1; else redrafts += 1;
      try {
        const piece = await c.redraft(onlyTooLong(missing) ? trimNote(missing, d.output) : redraftNote(missing, d.output));
        const d2 = await refine(piece);
        const missing2 = c.unmet(d2);
        const better = nearer(missing2, missing) && others(d2, missing2) <= others(d, missing);
        const outcome = redraftOutcome(missing, missing2, better, named, whose);
        if (!better) return say(d, outcome);
        d = say(d2.repair ? d2 : { ...d2, repair: { passes: 0, violatedBefore: ids, violatedAfter: brokenIn(d2.report), originalOutputHash: sha(piece), draft: piece, why: 'written again with what the work requires named' } }, outcome);
        missing = missing2;
      } catch (err) {
        return say(d, `The draft leaves out ${missing.length} thing(s) ${whose(missing)} (${named(missing)}); the draft to add them could not be written (${(err as Error).message.split('\n')[0]}).`);
      }
    }
    return d;
  };
}

/** The delivered text with one more note in its repair record, so the record says what the printed line said. */
function noted(d: Delivered, note: string, violatedBefore: readonly string[]): Delivered {
  const base = d.repair ?? { passes: 0, violatedBefore, violatedAfter: brokenIn(d.report), originalOutputHash: sha(d.output), why: note };
  return { ...d, repair: { ...base, notes: [...(base.notes ?? []), note] } };
}

function withCoverage(refine: (draft: string) => Promise<Delivered>,
  c: { client: InferenceClient; budget: Budget; judge: ContextJudge; asked: string; servedText: string; task: string; notes: string[] } | null) {
  if (!c?.judge.covers) return refine;
  const covers = c.judge.covers.bind(c.judge);
  return async (draft: string) => {
    const d = await refine(draft);
    try {
      const missing = ((await covers(c.asked, d.output))?.parts ?? []).filter((p) => p.covered === false).map((p) => p.words);
      if (!missing.length) return d;
      const note = `An earlier reply left out parts of what the request asks for: ${missing.map((m) => `"${m}"`).join('; ')}. Write the reply so that it gives each of them in full, at the length that takes. `
        + 'If you cannot give one because you were not shown what it needs, say so plainly and ask for it. Never invent a file, a project, a figure or a result.';
      const piece = (await spendOneWithResult(c.client, c.budget, c.servedText, c.task, null, note, {})).piece;
      const d2 = await refine(piece);
      const missing2 = ((await covers(c.asked, d2.output))?.parts ?? []).filter((p) => p.covered === false).length;
      const better = brokenIn(d2.report).length <= brokenIn(d.report).length && missing2 < missing.length;
      c.notes.push(better ? `Completed: the first reply left out ${missing.length} part(s) of the request (${missing.map((m) => `"${m}"`).join('; ')}); it was written again and now leaves out ${missing2}.`
        : `The reply leaves out ${missing.length} part(s) of the request (${missing.map((m) => `"${m}"`).join('; ')}); one more draft did not do better, so the first is kept.`);
      if (better && !d2.repair) return { ...d2, repair: { passes: 0, violatedBefore: [], violatedAfter: brokenIn(d2.report), originalOutputHash: sha(piece), draft: piece, why: 'written again to give every part the request asks for' } };
      return better ? d2 : d;
    } catch { return d; }
  };
}

function withShape(refine: (draft: string) => Promise<Delivered>,
  s: { client: InferenceClient; budget: Budget; calibration: TypicalityCalibration | null; detector: FidelityProfile['detector']; target: number | null; authorTarget: number | null;
    rounds: number; servedText: string; task: string; trace: FidelityTrace; taste: TasteSession | null;
    /** how a later round's draft is written, when drafts are written against a plan; null for a plain draft */
    fresh?: ((round: number) => Promise<string>) | null } | null) {
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
    const editsBefore = s.trace.edits.length; const notesBefore = s.taste?.notes.length ?? 0;
    const run = async (text: string): Promise<ShapeRound> => {
      s.trace.edits.splice(editsBefore); s.trace.voice = undefined;
      if (s.taste) { s.taste.taken = null; s.taste.notes.splice(notesBefore); }
      const d = await refine(text);
      return { d, draft: text, ...score(d), edits: s.trace.edits.slice(editsBefore), voice: s.trace.voice, taken: s.taste?.taken ?? null, notes: s.taste?.notes.slice(notesBefore) ?? [] };
    };
    const tried: ShapeRound[] = [await run(draft)];
    let note: string | undefined;
    for (let round = 1; round <= s.rounds && !tried.some(met); round++) {
      try {
        const piece = s.fresh ? await s.fresh(round) : (await spendOneWithResult(s.client, s.budget, s.servedText, s.task, null, '', {})).piece;
        tried.push(await run(piece));
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
    if (s.taste) { s.taste.taken = best.taken; s.taste.notes.splice(notesBefore, s.taste.notes.length - notesBefore, ...best.notes); }
    // A LATER ROUND WAS WRITTEN ALONE: no draft selection, no draw. What the record says about round 0's drafts stays
    // true of round 0; the draw is cleared so it is not read as the kept text's.
    if (best !== tried[0]) { s.trace.sampled = undefined; note = note ?? `round ${tried.indexOf(best)} kept: written as one draft, without draft selection`; }
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

/** The plans of one run: the author's chain (nearest pieces weighted), each plan written so far, its seed, and which draft had which. */
interface PlanState { readonly chain: MoveChain; readonly asked: string; readonly nonce: number; readonly plans: StructureMove[][]; readonly seeds: number[]; readonly planOf: Record<string, number>;
  /** the skeleton length the request's word count sets, or null to draw it from the author's own */
  readonly paragraphs: number | null }

/**
 * ONE SKELETON PER DRAFT (core/structure/skeleton.ts), from the author's chain with the pieces nearest the request
 * counted NEAR_WEIGHT times, each at a length drawn from the author's own. Seeded by the request, the draft and the
 * run's start, recorded, so a run replays from its record and two runs of one request differ as the author's pieces do.
 */
function newPlanState(s: NonNullable<ReturnType<typeof fstore.getStructure>>, near: Nearness | null, asked: string, n: number, nonce: number, paragraphs: number | null = null): PlanState {
  const chain = chainOf(s.pieces.map((p) => p.moves), s.pieces.map((p) => (near ? referenceWeight(near, p.id, NEAR_WEIGHT) : 1)));
  const st: PlanState = { chain, asked, nonce, plans: [], seeds: [], planOf: {}, paragraphs };
  for (let i = 0; i < Math.max(1, n); i++) addPlan(st, `draft ${i}`);
  return st;
}
function addPlan(st: PlanState, tag: string): number {
  const seed = seedOf([st.asked, tag, String(st.nonce)]);
  st.plans.push(sampleSkeleton(st.chain, st.paragraphs, seed)); st.seeds.push(seed);
  return st.plans.length - 1;
}

/**
 * A WORD COUNT IN THE REQUEST SETS THE SKELETON'S LENGTH: "about 900 words" at the author's median paragraph of 60
 * words is 15 paragraphs, not a length drawn from their 3,000-word pieces. Null when the request states no count or
 * the profile measured no paragraph length.
 */
export function paragraphsFor(asked: string, profile: FidelityProfile): number | null {
  // The LAST count in the request: a title's own number ("Why 100 words of docs…") comes before the length asked.
  // Thousands with commas, and a range read at its midpoint.
  const num = '(\\d{1,3}(?:,\\d{3})+|\\d{2,6})';
  const all = [...asked.matchAll(new RegExp(`\\b${num}(?:\\s*(?:-|–|to)\\s*${num})?\\s*words?\\b`, 'gi'))];
  const m = all[all.length - 1];
  const per = profile.bands.find((b) => b.id === 'paragraphP50' && b.cls === 'all')?.median;
  if (!m || !per || per <= 0) return null;
  const n = (x: string): number => Number(x.replace(/,/g, ''));
  const words = m[2] ? (n(m[1]) + n(m[2])) / 2 : n(m[1]);
  return Math.min(40, Math.max(3, Math.round(words / per)));
}

/** Each draft written against its own plan, and which plan it had remembered by the draft's hash. */
function writeByPlan(c: { client: InferenceClient; budget: Budget; servedText: string; task: string; state: PlanState }) {
  return async (i: number, v: DraftVariant): Promise<Written> => {
    const k = i % c.state.plans.length;
    const w = await spendOneWithResult(c.client, c.budget, c.servedText, c.task, null, skeletonBlock(c.state.plans[k]), v);
    c.state.planOf[sha(w.piece)] = k;
    return w;
  };
}

/** A later shape round's draft, against a plan of its own. */
async function freshPlannedDraft(client: InferenceClient, budget: Budget, servedText: string, task: string, st: PlanState, round: number): Promise<string> {
  const k = addPlan(st, `round ${round}`);
  const w = await spendOneWithResult(client, budget, servedText, task, null, skeletonBlock(st.plans[k]), {});
  st.planOf[sha(w.piece)] = k;
  return w.piece;
}

/**
 * READ THE DELIVERED TEXT'S STRUCTURE, LAST. Two small-model reads (core/structure/moves.ts): what each paragraph of
 * the output does, and how much of ITS OWN plan it followed, the plan its draft was written against (found by the
 * draft's hash). Reported; never changes the text. A reader that cannot run costs the reading, never the output.
 */
function withStructureRead(refine: (draft: string) => Promise<Delivered>, s: { budget: Budget; trace: FidelityTrace; state: PlanState } | null) {
  if (!s) return refine;
  return async (draft: string) => {
    const d = await refine(draft);
    const st = s.state;
    const k = st.planOf[sha(d.repair?.draft ?? draft)];
    const base = { plans: st.plans, seeds: st.seeds, planOf: st.planOf };
    try {
      const r = await readStructure(clientFor(structureModel()), s.budget, d.output);
      s.trace.structure = { ...base, read: r?.moves ?? null, followed: r && k !== undefined ? followed(st.plans[k], r.moves) : null,
        ...(!r ? { note: 'the delivered text had too few paragraphs to read' } : k === undefined ? { note: 'the delivered draft was not written against a plan' } : {}) };
    } catch (err) {
      s.trace.structure = { ...base, read: null, followed: null, note: `the structure reader could not run (${(err as Error).message.split('\n')[0]})` };
    }
    return d;
  };
}

/**
 * HOW TYPICAL OF YOU, ON THIS KIND OF SUBJECT (core/fidelity/typicality.ts, `typicalityInContext`): the author's
 * pieces nearest the request (core/fidelity/nearness.ts) count up to NEAR_WEIGHT times in the reference.
 */
function contextTypicality(output: string, fid: NonNullable<ReturnType<typeof releaseFor>>, near: Nearness | null): ReturnType<typeof typicalityOf> {
  const cal = fid.typicality;
  if (!cal) return null;
  return near?.pieces.length ? typicalityInContext(valuesOf(output), cal, (id) => referenceWeight(near, id, NEAR_WEIGHT)) : typicalityOf(output, cal);
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
  local: LocalContext | null = null, nearness: NonNullable<FidelityRecord['nearness']> | null = null): FidelityRecord {
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
    reading: { ...readFidelity(output, local ? { ...fid.profile, context: local } : fid.profile), ...(fid.typicality ? { typicality: contextTypicality(output, fid, nearness) } : {}) },
    ...(local ? { context: local } : {}),
    ...(nearness ? { nearness } : {}),
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
export function applicability(name: string, std: Standard, output: string, waived: ReadonlyMap<string, string>, withheld: readonly string[], context?: CheckContext): NonNullable<FidelityRecord['applicability']> {
  const v = verifyText(name, std, output, context);
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
  if (f.reading.measured > 0) report.say(`In your range on ${f.reading.inBand} of ${f.reading.measured} measured features${out.length ? `; furthest outside: ${out.join('; ')}` : ''}${kept ? ` (${kept} structural edit(s) kept)` : ''}.`);
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
    req: r.checked.filter((c) => acts(c) && c.result.verdict === 'VIOLATED').length,
    all: r.checked.filter((c) => c.result.verdict === 'VIOLATED' && c.requirementId !== PUBLIC_FACTS).length,
    tells: r.checked.filter((c) => c.pattern === 'MACHINE_TELL').reduce((n, c) => n + c.result.spans.length, 0),
    signal: signalDistance(draft, signals),
    style,
  };
}

/** What this run was configured with, beyond the binding and the package: enough to re-run a study arm from its record. */
function settingsFor(checks: Checks, taste: TasteSession | null, nDrafts: number, carryNote = ''): InvocationSettings {
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
    flags: { drafts: nDrafts, noTaste: !argv.includes('--taste') || argv.includes('--no-taste'), allowUnsourced: argv.includes('--allow-unsourced'), placeholders: argv.includes('--placeholders'), ...(argv.includes('--test-run') ? { testRun: true } : {}), ...(carryNote ? { carryNoteHash: sha(carryNote) } : {}) },
  };
}

/**
 * THE WHOLE COST, and the record. The writer's budget and the claim reader's are separate meters; what
 * this run spent on either is the process total since generation began.
 */
/**
 * THE SETTINGS A RUN WAS WRITTEN UNDER, as typed: which model, how many drafts, a cap, what was turned off. Kept
 * with the run so a piece written again (`atelier fix`) is written as the first was. Not what names the run or the
 * skill, not the files given (kept apart, by path), not a complaint it was answering, not a machine's format.
 */
export function settingsOfRun(tokens: readonly string[] = argv.slice(1)): string[] {
  const NOT = ['skill', 'task', 'with', 'correcting', 'provenance', 'json', 'answer-only', 'quiet', 'panel', 'report', 'test-run'];
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (!t.startsWith('--')) continue;
    const eq = t.indexOf('='); const name = t.slice(2, eq === -1 ? undefined : eq);
    const next = eq === -1 && (VALUED_OPTIONS.includes(name) || name === 'with') && tokens[i + 1] !== undefined;
    if (!NOT.includes(name)) out.push(t, ...(next ? [tokens[i + 1]] : []));
    if (next) i += 1;
  }
  return out;
}

function finish(report: RunReport, r: { rec: Invocation; sv: SkillVersion; name: string; task: string; asked?: string; budget: Budget; spentBefore: number }): number {
  const spent = Math.max(r.budget.spentUsd, processSpentUsd() - r.spentBefore);
  const reader = spent - r.budget.spentUsd;
  report.detail(`invocation ${r.rec.invocationId}  ·  SkillVersion ${r.sv.skillVersionHash}${flag('--candidate') ? ' (CANDIDATE, not active)' : ''}  ·  $${spent.toFixed(4)}${reader > 0 ? ` (claim reader $${reader.toFixed(4)})` : ''}`);
  // What was asked, as typed, and the files given with it: what `atelier fix` needs to write this one piece again.
  writeAtomic(runFile('last-invocation.json'), JSON.stringify({ invocationId: r.rec.invocationId, skillName: r.name, input: r.task, at: r.rec.at,
    ...(r.asked !== undefined ? { asked: r.asked, with: boundMaterial().filter((m) => m.path).map((m) => ({ name: m.name, path: resolvePath(m.path) })),
      settings: settingsOfRun(), skillVersion: r.sv.skillVersionHash } : {}) }, null, 1));
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
  const cut = !guardClaims ? null : argv.includes('--placeholders') ? 'a story, source or figure the draft invents is replaced by a slot for yours'
    : materialBound ? 'any story, source or figure not found in what you bound is cut, or listed where the check is not measured'
    : 'a story, source or figure in the draft cannot be checked against anything of yours, and is listed for you, not cut';
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
  // A SKILL BUILT FROM A METHOD says on every run what of the method was held, by kind (core/eval/obligations.ts).
  const held = std ? methodReading(std.requirements, verifyText(rec.skillName, std, rec.output, checks.context)) : null;
  if (held) report.say(methodLine(held));
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
    if (!r.violatedAfter.length && !heavy) report.say(`Checked: every REQUIRED measured rule holds${r.violatedBefore.length ? ` (${r.violatedBefore.join(', ')} ${r.passes ? 'fixed by rewriting only the spans that broke them' : r.violatedBefore.includes('UNSOURCED') ? 'held once what could not be traced to your material was cut' : 'held once the draft was corrected'})` : ''}.`);
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
    report.say(`${checks.placeholders ? 'Left a slot for' : 'Cut'} ${r.storiesCut.length} invented stor(ies), quotation(s) or figure(s); your own would fit where they were (listed in the details).`);
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
    const { readings: read, permissions: earned, held } = await recordTaste(t.L, t.std, t.rec.output, t.asked, t.rec.invocationId, t.budget, taken, !argv.includes('--test-run'));
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
    const overlap = overlapIndex(served, voice?.standardWording ?? [])(rec.output); const lifted = overlap.longestShared;
    if (overlap.standard) report.detail(`(${overlap.standard} six-word run(s) shared with three or more of your pieces: your standard wording, not counted as copying)`);
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
