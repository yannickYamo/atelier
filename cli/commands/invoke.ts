// cli/commands/invoke.ts — Serving the package and recording what came back.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import { checksFor, claimInstrumentOf } from '../checks.js';
import { refineToStandard, checkDraftAsync, enforceClaims, PUBLIC_FACTS } from '../../core/loop/run-repair.js';
import { signalDistance } from '../../core/observers/selection.js';
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
import { sha, DATA, die, argv, flag, clientAndBinding, describeBinding, numericFlag, positional, boundResources, boundMaterial, assertSkillName, runFile } from '../runtime.js';

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
export interface DraftScore { readonly req: number; readonly taste: number; readonly tells: number; readonly all: number; readonly signal: number | null; readonly style: number }

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
  || (a.signal ?? Infinity) - (b.signal ?? Infinity) || b.style - a.style;

export async function invoke(): Promise<void> {
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
  const nDrafts = Math.max(1, Math.floor(numericFlag('--drafts', store.getVoice(L)?.pieces?.length ? 2 : 1)));
  const taste = std && !argv.includes('--no-taste') ? TasteSession.open(L, std, asked, waiting) : null;
  // The bounds grow with the drafts and the taste reader's calls, and a request the cap cannot cover is
  // refused before anything is spent rather than failing halfway with nothing delivered.
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', Math.max(1.0, 0.3 * nDrafts + 0.4)),
    maxCalls: numericFlag('--max-calls', nDrafts + 4 + (taste?.callsFor(nDrafts) ?? 0)) };
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
  const checks = checksFor(L, { material: materialText, task: asked, guardClaims: !argv.includes('--allow-unsourced'), placeholders: argv.includes('--placeholders') });
  if (nDrafts > 1 && (!std || contractFile !== null)) {
    console.log(`(--drafts ${nDrafts} does not apply here: ${!std ? 'the standard is missing' : 'this skill has an output contract, so there is one shape to produce'}; writing one draft.)`);
  }
  const spentBefore = processSpentUsd();
  const rec = await runOnce(L, sv, servedText, servedHash, delivery, task, client, budget, binding,
    resolveProvenance(flag('--provenance'), process.env), contractFile,
    flag('--task') ? 'FLAG' : 'POSITIONAL',
    std && !argv.includes('--no-repair') ? refineDraft({ client, budget, name, std, checks, taste }) : null,
    std && nDrafts > 1 ? selectDraft({ n: nDrafts, name, std, checks, taste, signals: store.getSignals(L) }) : null,
    std && checks.guardClaims !== false ? async (text: string) => {
      const r = await checkDraftAsync(name, std, text, checks);
      return (r.checked.find((c) => c.requirementId === 'UNSOURCED')?.result.spans ?? []).map((sp) => sp.text);
    } : null, settingsFor(checks, taste, nDrafts));

  reportDrift(report, L, sv, rec);
  console.log(`\n${rec.output}\n`);
  reportChecks(report, rec, std, checks);
  if (taste) await taste.report(report, rec, name);
  reportIntegrity(report, rec, cls.ok ? cls.note : null, std, L);
  reportRestyle(report, rec.output, material);
  finish(report, { rec, sv, name, task, budget, spentBefore });
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
    console.log(`Observations from here are recorded against this binding and are not evidence about the other one.\n`);
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
  async report(report: RunReport, rec: Invocation, name: string): Promise<void> {
    await reportTaste(report, { L: this.L, std: this.std, rec, asked: this.asked, budget: this.meter, tasteOn: true,
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
    if (!taste?.acts) return { output: r.output, repair: r.repair };
    let t: Awaited<ReturnType<typeof refineTaste>>;
    try {
      t = await refineTaste(c.client, taste.client(), c.budget, c.name, c.std, r.output, await taste.read(r.output), taste.veto, taste.asked, c.checks, await taste.applies());
    } catch (e) {
      taste.notes.push(`the taste reader could not run before delivery (${(e as Error).message.split('\n')[0]}); delivered as the counted checks left it`);
      return { output: r.output, repair: r.repair };
    }
    taste.taken = t.readings;
    if (!t.targeted.length || t.output === r.output) return { output: r.output, repair: r.repair };
    // THE REPORT IS THE DELIVERED TEXT'S. The taste rewrite changed the text after the counted checks
    // read it, so the text is held to the claim floor again and every figure below is counted on it.
    const final = await enforceClaims(c.name, c.std, t.output, c.checks);
    const fixed = { targeted: t.targeted, fixed: t.fixed, why: t.why };
    const cut = [...(r.repair?.storiesCut ?? []), ...final.cut];
    const base = r.repair ?? { passes: 0, violatedBefore: [], violatedAfter: [], originalOutputHash: sha(draft), draft, why: t.why };
    return { output: final.text, repair: { ...base, violatedAfter: brokenIn(final.report), taste: fixed, ...(cut.length ? { storiesCut: cut } : {}) } };
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
function selectDraft(c: DraftContext & { readonly n: number; readonly signals: ReturnType<typeof store.getSignals> }) {
  return { n: c.n, choose: async (drafts: readonly string[]) => {
    const tasteMissed = c.taste?.acts ? await c.taste.misses(drafts) : drafts.map(() => 0);
    const reports = await Promise.all(drafts.map((d) => checkDraftAsync(c.name, c.std, d, c.checks)));
    const scored = drafts.map((d, i) => ({ i, ...draftScore(reports[i], c.std, d, c.signals), taste: tasteMissed[i] }));
    scored.sort(draftOrder);
    const best = scored[0];
    return { index: best.i, why: `${c.taste?.acts ? `${best.taste} taste rule(s) read as missed, ` : ''}${best.req} REQUIRED rule(s) broken, ${best.tells} machine-writing move(s), ${best.all} rule(s) of any weight${c.signals.length ? `, ${best.signal ?? 'unknown distance'} from your signals` : ''}${best.style ? `, style margin ${best.style}` : ''} — the best of ${drafts.length}` };
  } };
}

/** One draft's counts. An unread signal distance is null: unknown is not "on target", so it ranks last. */
function draftScore(r: Awaited<ReturnType<typeof checkDraftAsync>>, std: Standard, draft: string, signals: ReturnType<typeof store.getSignals>): Omit<DraftScore, 'taste'> {
  const style = r.checked.find((c) => std.requirements.find((q) => q.requirementId === c.requirementId)?.measurement?.observer === 'STYLE_DISTANCE')?.result.value ?? 0;
  return {
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
    maxTokens: draftMaxTokens(),
    ...(temperature === undefined ? {} : { temperature }),
    flags: { drafts: nDrafts, noTaste: argv.includes('--no-taste'), allowUnsourced: argv.includes('--allow-unsourced'), placeholders: argv.includes('--placeholders') },
  };
}

/**
 * THE WHOLE COST, and the record. The writer's budget and the claim reader's are separate meters; what
 * this run spent on either is the process total since generation began.
 */
function finish(report: RunReport, r: { rec: Invocation; sv: SkillVersion; name: string; task: string; budget: Budget; spentBefore: number }): void {
  const spent = Math.max(r.budget.spentUsd, processSpentUsd() - r.spentBefore);
  const reader = spent - r.budget.spentUsd;
  report.detail(`invocation ${r.rec.invocationId}  ·  SkillVersion ${r.sv.skillVersionHash}${flag('--candidate') ? ' (CANDIDATE, not active)' : ''}  ·  $${spent.toFixed(4)}${reader > 0 ? ` (claim reader $${reader.toFixed(4)})` : ''}`);
  writeAtomic(runFile('last-invocation.json'), JSON.stringify({ invocationId: r.rec.invocationId, skillName: r.name, input: r.task, at: r.rec.at }, null, 1));
  const details = runFile('last-invocation.txt');
  report.write(details);
  console.log(`$${spent.toFixed(2)} · everything this run checked: ${details} · not right? atelier fix "<what was wrong>"`);
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
  private readonly lines: string[] = [];
  say(line: string): void { console.log(line); this.lines.push(line); }
  detail(line: string): void { this.lines.push(line); }
  write(path: string): void { writeAtomic(path, `${this.lines.join('\n')}\n`); }
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
    if (r.violatedAfter.length) report.say(`Still broken after repair: ${r.violatedAfter.join(', ')}. ${r.why}`);
    else report.say(`Checked: every REQUIRED measured rule holds${r.violatedBefore.length ? ` (${r.violatedBefore.join(', ')} fixed by rewriting only the spans that broke them)` : ''}.`);
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
async function reportTaste(report: RunReport, t: TasteContext): Promise<void> {
  for (const n of t.tasteNotes) report.say(`(${n}.)`);
  if (!t.tasteOn || !t.std) return;
  const rules = new Map(t.std.requirements.map((q) => [q.requirementId, q]));
  try {
    const taken = t.tasteTaken ?? t.readings.get(t.rec.output) ?? null;
    const { readings: read, permissions: earned, held } = await recordTaste(t.L, t.std, t.rec.output, t.asked, t.rec.invocationId, t.budget, taken);
    // A held-back reading shows nothing that names a rule, the taste repair included.
    if (t.rec.repair?.taste) report.say(held ? 'taste repair: details held back with the reading.' : `taste repair: ${t.rec.repair.taste.why}.`);
    report.detail(describeTaste(read, rules, t.permissions?.veto ?? earned.veto, held, t.waiting));
    if (held) return;
    const missed = read.filter((x) => x.verdict === 'MISSED' && !t.waiting.has(x.requirementId)).length;
    const waiting = read.filter((x) => t.waiting.has(x.requirementId)).length;
    const status = t.permissions?.veto.size ? 'it acts on the rules your labels gave it' : `reporting only until you label it: atelier taste --skill ${t.name} --calibrate`;
    report.say(`Taste reader: ${missed} of ${read.length} reading-based rule(s) read as missed${waiting ? `, ${waiting} waiting for your material` : ''} (${status}).`);
  } catch (e) {
    if (t.rec.repair?.taste) report.say(`taste repair: ${t.rec.repair.taste.why}.`);
    report.say(`(the taste reader could not run: ${(e as Error).message.split('\n')[0]})`);
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
