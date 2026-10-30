// core/loop/run-once.ts — ONE DRAFT, ONE RUN: THE PLACE A REAL EXECUTION BECOMES A RECORD.
//
// `spendOneWithResult` writes one draft; `runOnce` writes a run and persists its record. Every surface that writes
// goes through them: `invoke` (and so `run`, `fix` in place and the MCP tools), `fix`, `reference`, `floor`, `tells`,
// `reproduce`, and the tests that drive a draft without a provider. They lived in cli/commands/improve.ts, which also
// value-imports the convergence controller, the distinctiveness floor and the diagnosis, so every run loaded the whole
// outer loop to write one draft. Here they link only what a draft needs; what fails, throws, and the CLI's one catch
// (cli/atelier.mts, `main().catch`) prints it and exits 1, as `die` did from here.

import type { FidelityRecord } from '../fidelity/types.js';
import { mapLimitSettled } from '../inference/concurrency.js';
import type { Budget, InferenceClient, SpendPurpose } from '../inference/client.js';
import { spend } from '../inference/client.js';
import { observeRuntime, type RuntimeBinding } from '../runtime/binding.js';
import { persistInvocation } from '../runtime/record.js';
import * as store from '../state/store.js';
import { sha } from '../state/receipt.js';
import type { Provenance } from '../fidelity/provenance.js';
import type { RepairRecord, InvocationRecord, InvocationSettings, TaskSource } from '../state/canonical-state.js';
import { assertRequestBound } from '../state/canonical-state.js';
import { asText } from '../discovery/text.js';
import { workField, workRecord, WORK_FIELD_ASK } from './work-field.js';
import { splitServed } from '../fidelity/request-notes.js';
import { applyStep, type Proposed } from './repair.js';
import { stepLedger, controllerRecord, DEFAULT_COST } from './controller.js';
import type { VerifyReport } from '../observers/verify.js';

/** What the claim guard found in a structured output, as the one line the one acceptance rule reads: the invented-claim line. */
const claimsReport = (found: readonly string[]): VerifyReport => ({ skill: '', standardVersionHash: '', unchecked: [], conditional: [], failed: found.length > 0,
  checked: [{ requirementId: 'UNSOURCED', statement: 'Every specific is in your material or your request.', materiality: 'REQUIRED', phase: 'ACCURACY',
    result: { verdict: found.length ? 'VIOLATED' : 'MET', spans: found.map((t) => ({ start: 0, end: t.length, text: t, why: 'not in your material or your request' })), value: found.length, detail: `${found.length} specific(s) not in the material supplied` } }] });

/** The default shape, used when the package carries no output contract. */
const FREE_TEXT_SCHEMA: Record<string, unknown> = {
  type: 'object', properties: { piece: { type: 'string' } }, required: ['piece'], additionalProperties: false
};

/** The token ceiling every draft is written under when nothing sets one: ~1.8x the measured median piece. */
export const DEFAULT_DRAFT_MAX_TOKENS = 12_000;
let ceiling: () => number = () => DEFAULT_DRAFT_MAX_TOKENS;
/**
 * THE FLAG STAYS IN THE CLI. `--max-tokens` is read by cli/runtime.ts, which installs its reader here once; a draft
 * reads the ceiling when it is written, never earlier, so a value that cannot be a ceiling is refused at the same
 * moment it was before. A caller with no CLI (a test, a harness) gets the default.
 */
export const setDraftMaxTokens = (read: () => number): void => { ceiling = read; };
/** The token ceiling every draft is written under: --max-tokens, or the default. */
export const draftMaxTokens = (): number => ceiling();

/** The most characters of unchosen drafts one record keeps, across all of them. */
export const UNCHOSEN_CAP_CHARS = 60_000;

/** Every draft but the chosen one, in order, cut to fit `cap` characters in total. */
export function unchosenDrafts(pieces: readonly string[], chosen: number, cap = UNCHOSEN_CAP_CHARS): { texts: string[]; truncated: boolean } {
  const texts: string[] = []; let left = cap; let truncated = false;
  pieces.forEach((p, i) => {
    if (i === chosen) return;
    if (p.length > left) truncated = true;
    texts.push(p.slice(0, Math.max(0, left)));
    left = Math.max(0, left - p.length);
  });
  return { texts, truncated };
}

/** What writing one draft returns: the piece, who answered, the schema sent, and the task as served. */
export type Written = Awaited<ReturnType<typeof spendOneWithResult>>;

/** One draft's variation: the temperature it is written at, and reference material only it is given. */
export interface DraftVariant { readonly temperature?: number; readonly stableExtra?: string }

/**
 * ONE generation, and the place the OUTPUT_CONTRACT carrier stopped being dark.
 *
 * This used to call the provider with a hardcoded `{piece: string}` no matter what the package
 * contained. A ratified OUTPUT_CONTRACT compiled to `contracts/output.schema.json`, was installed,
 * hashed, listed in delivery metadata and marked served — and never once constrained a generation. The
 * carrier existed everywhere except where it mattered.
 *
 * The schema now comes from the stored contract when there is one, and the schema OBJECT THAT WAS SENT
 * is returned so the caller can hash it against the contract. That comparison is the delivery evidence:
 * anything weaker is a claim that a file exists, which was the whole problem.
 *
 * A contract also changes what an output IS. Under free text the result is a string; under a contract
 * it is a typed object, and it is serialized for the record rather than reduced to one field — reading
 * `.piece` off a contract-shaped object would return undefined and record an empty output as a success.
 */
export async function spendOneWithResult(
  client: InferenceClient, budget: Budget, stable: string, brief: string,
  contract: { readonly schema: Record<string, unknown>; readonly artifact: string } | null = null,
  /** a correction appended to the instruction, never to the task: the task the record binds stays the task asked */
  note = '',
  /** this draft's own variation (a temperature, more reference material), when drafts are made to differ */
  variant: DraftVariant = {},
  /** what the ledger charges this call to: a draft is writing, unless a path that only a flag caused names its own purpose */
  purpose: SpendPurpose = 'writing',
): Promise<{ piece: string; reportedModel: string | null; schemaSent: Record<string, unknown>; servedTask: string; temperatureSent: number | null;
  /** the reply's work field (core/loop/work-field.ts): whether the piece came inside it, and what stood outside; null for a contract-shaped output */
  work: ReturnType<typeof workRecord> | null }> {
  const schema = contract?.schema ?? FREE_TEXT_SCHEMA;
  // CAPTURED FROM THE REQUEST OBJECT, not copied from the argument. A proof built from the same
  // variable the caller passed in would agree with itself no matter what was actually transmitted.
  let servedTask = '';
  // THE SKILL CACHED, THIS REQUEST'S NOTES NOT (../fidelity/request-notes.ts, `FOR_THIS_REQUEST`): the skill is the same bytes on every
  // request; the rules set aside for this one and its other notes are said after the request, in the turn that asks for it.
  const { skill, forRequest } = splitServed(stable);
  const r = await spend(budget, 0.2, async () => {
    const req = {
      stableBlock: skill, variableBlock: brief,
      ...(variant.temperature !== undefined ? { temperature: variant.temperature } : {}),
      // THE REQUEST IS THE LAST BLOCK OF THE SYSTEM PROMPT, AND THIS SAYS SO. "Write it now. Output only the piece
      // itself." told the writer to write a piece whatever was asked: a thank-you came back as a sixty-word fix. The work
      // is whatever the request asks for, at the length it asks for.
      // a draft's own passages (drafts made to differ) are this draft's, so they go with the request's notes, uncached
      userMessage: `${forRequest || variant.stableExtra?.trim() ? `For this request only:\n\n${[forRequest, variant.stableExtra?.trim() ?? ''].filter(Boolean).join('\n\n')}\n\n` : ''}${contract ? 'Produce it now, in the required shape.' : 'Do what the request above asks, now, at the length it calls for: the answer, the review, the piece, or one line if one line is all it needs. Output only that, nothing about these instructions. ' + WORK_FIELD_ASK}${note ? `\n\n${note}` : ''}`,
      toolName: contract ? 'emit_output' : 'emit_piece',
      toolDescription: contract ? 'Emit the output in the shape the standard requires.' : 'Emit the finished piece.',
      // NOT A CONSTANT — reviewer finding F1, the instrument's own lesson applied to the product.
      // The contract runner shipped at 1200 against a measured 6606-token median and had to retract
      // a study over the truncation tail; this path carried 4000, ~60% of that median, serving
      // invoke, every reference arm, and fix's rerun. Default is ~1.8x the measured median;
      // --max-tokens overrides, and a cut-off still surfaces as GenerationIncomplete, never as data.
      schema, maxTokens: draftMaxTokens() };
    servedTask = req.variableBlock;
    const res = await client.complete(req);
    return { value: res, cost: res.cost, usage: res };
  }, purpose);
  // ONLY THE WORK FIELD IS THE WORK (core/loop/work-field.ts): what the writer said around it about the task is set aside
  // and kept on the record; a reply with no field is the work whole, as before, and the record says so.
  const field = contract ? null : workField(asText((r.json as { piece?: unknown } | null)?.piece));
  const piece = contract ? JSON.stringify(r.json ?? null, null, 2) : field?.text ?? '';
  // NO TEXT IS NOT A DRAFT. A reply with no piece in it was once taken as an empty draft: no rule can be broken by
  // nothing, so it was checked clean and delivered, under strict delivery too. It is a failed call, like any other:
  // with several drafts the others stand, and with none there is nothing to deliver.
  if (contract === null && !piece.trim()) throw new Error('the model returned no text for the draft');
  return { piece, reportedModel: r.modelId || null, schemaSent: schema, servedTask, temperatureSent: r.temperatureSent ?? null, work: field ? workRecord(field) : null };
}



/** Every string inside a structured output, one per paragraph: what a claim check reads of a contract-shaped answer. */
export function stringLeaves(json: string): string {
  const out: string[] = [];
  const walk = (x: unknown): void => {
    if (typeof x === 'string') { if (x.trim()) out.push(x.trim()); } else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') Object.values(x).forEach(walk);
  };
  try { walk(JSON.parse(json)); } catch { out.push(json); }
  return out.join('\n\n');
}

const unchosenFields = (pieces: readonly string[], chosen: number): { unchosen?: string[]; unchosenTruncated?: boolean } => {
  const u = unchosenDrafts(pieces, chosen);
  return u.texts.length ? { unchosen: u.texts, ...(u.truncated ? { unchosenTruncated: true } : {}) } : {};
};

/**
 * ONE instrumented generation. The single place a real execution becomes a record.
 *
 * `fidelity` runs this N times per context rather than re-deriving a serving path of its own. A
 * second execution path is how a measurement ends up describing an artefact the product never
 * installs — the trap the archived study runner fell into by re-rendering rules out of the standard.
 */
export async function runOnce(
  L: store.StoreLayout, sv: { skillVersionHash: string; standardVersionHash: string; architectureHash: string },
  servedText: string, servedHash: string, delivery: { expectedPackageHash: string; servedPackageHash: string; matched: boolean; servedFiles: string[] },
  task: string, client: InferenceClient, budget: Budget, binding: RuntimeBinding,
  provenance: Provenance = 'ORGANIC_USE',
  /** the package's output contract, verbatim, when it carries one */
  contractText: string | null = null,
  /** where the task came from, so a wrong task is traceable to the surface that produced it */
  taskSource: TaskSource = 'POSITIONAL',
  /**
   * Check the draft and rewrite what broke a rule, before anything is recorded — `invoke` passes it,
   * measurement arms never do: a study's arm must be what the model wrote, not what a loop fixed.
   */
  refine: ((draft: string) => Promise<{ output: string; repair: RepairRecord | null }>) | null = null,
  /** write several drafts side by side and deliver the one `choose` picks — `invoke --drafts N` */
  select: { readonly n: number; readonly choose: (drafts: readonly string[], written?: readonly { readonly index: number; readonly temperatureSent: number | null }[]) => { index: number; why: string } | Promise<{ index: number; why: string }>;
    /** draft i's own variation, when drafts are made to differ (core/fidelity/types.ts, `diversity`) */
    readonly variant?: (i: number) => DraftVariant;
    /** how draft i is written, when not in one call (long form by section, core/fidelity/sections.ts) */
    readonly write?: (i: number, variant: DraftVariant) => Promise<Written>;
    /**
     * DRAFTS ON DEMAND. When given, the first draft is written alone and the rest only when it says the draft wants a
     * rival: a draft that already holds every rule the drafts are chosen by at the top of their order (every REQUIRED
     * rule, and every rule the taste reader acts on) is delivered as it is, because what a second whole draft could still
     * improve, the repair chain fixes at a fraction of a draft's price. Absent when the person asked for the drafts
     * themselves (`--drafts N`) or the outputs are sampled among several to keep the author's spread.
     */
    readonly enough?: (draft: string) => Promise<boolean> } | null = null,
  /**
   * THE INVENTED-CLAIM CHECK FOR A STRUCTURED OUTPUT. A contract-shaped answer is never span-rewritten,
   * which used to mean it was never checked for invented claims at all: a report or a contract, the
   * outputs where an invented figure does the most harm, went out unread. Its string fields are read
   * together; on a finding the whole artifact is generated once more with the findings named, and if
   * it still invents, nothing is delivered. Returns the unsupported claims' sentences.
   */
  claimGuard: ((text: string) => Promise<readonly string[]>) | null = null,
  /** what `invoke` was configured with beyond the binding (see InvocationSettings); null elsewhere */
  settings: InvocationSettings | null = null,
  /** how the output was steered toward the author's range, read on the delivered text (cli/fidelity.ts); null elsewhere */
  fidelity: ((output: string) => FidelityRecord) | null = null,
  /** what was settled before the draft, and what the delivered work copied from its material (cli/commands/invoke.ts); null elsewhere */
  before: ((output: string) => Pick<InvocationRecord, 'prewrite' | 'copied' | 'corrections' | 'worksOn' | 'served'>) | null = null,
): Promise<InvocationRecord> {
  // PARSED HERE, AND A BROKEN CONTRACT STOPS THE RUN (thrown; the CLI's one catch prints it and exits 1). Falling back
  // to free text on a malformed schema would produce an output nobody constrained, recorded as a normal invocation.
  let contract: { schema: Record<string, unknown>; artifact: string } | null = null;
  if (contractText !== null) {
    try {
      contract = { schema: JSON.parse(contractText) as Record<string, unknown>, artifact: 'contracts/output.schema.json' };
    } catch (e) {
      throw new Error(`the stored package's output contract is not valid JSON (${(e as Error).message}). Nothing was invoked: `
        + 'generating without it would produce an output the ratified shape never constrained.', { cause: e });
    }
  }
  const n = select && contract === null ? Math.max(1, Math.floor(select.n)) : 1;
  // A FAILED DRAFT CALL COSTS THAT DRAFT, NOT THE RUN. With several drafts, the ones that came back are
  // kept and the choice is made among them; the failure is said and recorded. Only when none came back
  // is there nothing to deliver, and the first error is what the person sees.
  const writeOne = (i: number): Promise<Written> => {
    const v = n > 1 ? select?.variant?.(i) ?? {} : {};
    return select?.write && contract === null ? select.write(i, v) : spendOneWithResult(client, budget, servedText, task, contract, '', v);
  };
  // THE FIRST DRAFT ALONE, when the selection can say it needs no rival (`select.enough`); the planned drafts not written
  // are counted on the record (`spared`), so the cost of a run reads from what it did.
  let spared = 0;
  let settled: Awaited<ReturnType<typeof mapLimitSettled<number, Written>>>;
  if (n > 1 && select?.enough) {
    const [first] = await mapLimitSettled([0], 1, writeOne);
    if (first.ok && await select.enough(first.value.piece)) { settled = [first]; spared = n - 1; }
    else settled = [first, ...await mapLimitSettled(Array.from({ length: n - 1 }, (_, i) => i + 1), n - 1, writeOne)];
  } else settled = await mapLimitSettled(Array.from({ length: n }, (_, i) => i), n, writeOne);
  // Each draft that came back, with the index it was asked for: a variant recorded for draft i describes the
  // i-th call, and the drafts that failed must not shift it onto another.
  const written = settled.flatMap((x, i) => (x.ok ? [{ ...x.value, index: i }] : []));
  const failures = settled.flatMap((x) => (x.ok ? [] : [(x.error as Error).message?.split('\n')[0] ?? String(x.error)]));
  if (!written.length) {
    const first = settled.find((x) => !x.ok);
    throw first && !first.ok ? first.error : new Error('no draft was written');
  }
  if (failures.length) process.stderr.write(`atelier: ${failures.length} of ${n} draft call(s) failed (${failures[0]}); choosing among the ${written.length} that came back.\n`);
  const picked = written.length > 1 && select ? await select.choose(written.map((w) => w.piece), written.map((w) => ({ index: w.index, temperatureSent: w.temperatureSent })))
    : { index: 0, why: spared ? `the first draft held every rule the drafts are chosen by; ${spared} planned draft(s) not written` : n > 1 ? `the only draft of ${n} that came back` : '' };
  let { piece: draft, reportedModel, schemaSent, servedTask } = written[picked.index];
  const work = written[picked.index].work ?? null;
  let contractRepair: RepairRecord | null = null;
  if (contract !== null && claimGuard) {
    const guard = claimGuard;
    const found = await guard(stringLeaves(draft));
    if (found.length) {
      const note = 'Your previous answer asserted specifics that are not in anything you were given. Leave them out; '
        + 'say the point without them, or leave the field general:\n' + found.map((f) => `- "${f.slice(0, 200)}"`).join('\n');
      // THE ONE STEP (core/loop/repair.ts, `applyStep`). A structured output has no repair chain, so the one draft written
      // again around what the claim guard found is the one step on a ledger made for this run: gated by the budget,
      // entered before it runs, its call counted on it, and kept only on the one acceptance rule (fewer specifics no
      // source holds, no figure the earlier output, the request or the material does not hold).
      const ledger = stepLedger(null, () => ({ usdLeft: budget.capUsd - budget.spentUsd - (budget.inFlightUsd ?? 0), callsLeft: budget.maxCalls !== undefined ? budget.maxCalls - (budget.calls ?? 0) : null }), [], task);
      const s = await applyStep<Proposed & { readonly written: Awaited<ReturnType<typeof spendOneWithResult>>; readonly still: readonly string[] }>(ledger,
        { action: 'claim-redraft', targets: ['UNSOURCED'], why: `the output asserted ${found.length} specific(s) not in your material or your request: written again once without them`,
          expectedGain: found.length, expectedCostUsd: DEFAULT_COST['claim-redraft'], forEnforced: ['UNSOURCED'] },
        { text: stringLeaves(draft), report: claimsReport(found) }, async () => {
          const again = await spendOneWithResult(client, budget, servedText, task, contract, note);
          const leaves = stringLeaves(again.piece); const still = await guard(leaves);
          return { text: leaves, report: claimsReport(still), written: again, still };
        }, { enforced: new Set(['UNSOURCED']), purposes: ['writing'] });
      const kept = s.kind === 'judged' && s.kept ? s.after : null;
      if (kept) ({ piece: draft, reportedModel, schemaSent, servedTask } = kept.written);
      contractRepair = { passes: 0, violatedBefore: ['UNSOURCED'], violatedAfter: kept && !kept.still.length ? [] : ['UNSOURCED'], originalOutputHash: sha(written[picked.index].piece),
        controller: controllerRecord(ledger.entries, kept ? 'the output was written again once' : s.kind === 'refused' || s.kind === 'failed' ? s.why : `not kept: ${s.kind === 'judged' ? s.why ?? '' : s.why}`),
        why: kept && !kept.still.length ? 'the output was written again once without the specifics no source holds' : 'the output still asserts specifics no source holds' };
      const still = kept ? kept.still : found;
      if (still.length) {
        throw new Error(`the output still asserts ${still.length} specific(s) that are not in your material or your request, after one retry:\n`
          + still.map((f) => `  - "${f.slice(0, 200)}"`).join('\n')
          + `\nNothing was delivered or recorded. If they are yours, bind them (atelier material --skill ${L.skillName} <file>), or pass --allow-unsourced.`);
      }
    }
  }
  // A structured output is held by its contract, not by prose rules; it is never span-rewritten.
  const refined = refine && contractText === null ? await refine(draft) : { output: draft, repair: contractRepair };
  const output = refined.output;
  const at = new Date().toISOString();
  // THE PROOF. Not "the file is in the package" — the schema the provider received, hashed, against the
  // contract that was compiled. Equal means the carrier reached the model; anything else is a serving
  // failure and `checkDelivery` routes it as one.
  const contractEvidence = contractText === null ? null : {
    artifact: 'contracts/output.schema.json',
    contractHash: sha(JSON.stringify(JSON.parse(contractText) as unknown)),
    schemaHash: sha(JSON.stringify(schemaSent)),
    enforced: sha(JSON.stringify(JSON.parse(contractText) as unknown)) === sha(JSON.stringify(schemaSent))
  };
  const rec = {
    invocationId: `i${sha(`${sv.skillVersionHash}|${task}|${at}|${Math.round(budget.spentUsd * 1e6)}`).slice(0, 10)}`,
    skillName: L.skillName, standardVersionHash: sv.standardVersionHash, skillVersionHash: sv.skillVersionHash,
    architectureHash: sv.architectureHash, servedPackageHash: servedHash,
    // The binding is recorded from what was CONFIGURED and the observation from what ANSWERED. Two
    // fields because they can disagree, and the disagreement is the signal.
    runtimeBinding: binding, observedRuntime: observeRuntime(binding, reportedModel, at),
    invocationSurface: 'ATELIER_CLI' as const, provenance, inputHash: sha(task),
    // THE FOURTH BINDING. Built from the resolved task and from what the request actually carried,
    // then asserted equal before anything is written down.
    request: { resolvedTaskHash: sha(task), servedTaskHash: sha(servedTask), source: taskSource },
    outputHash: sha(output),
    at, delivery: { ...delivery, outputContract: contractEvidence }, input: task, output,
    ...(refined.repair ? { repair: refined.repair } : {}),
    // whether the draft came inside its work field, and what the writer said outside it (never delivered, never checked)
    ...(work ? { work } : {}),
    ...(n > 1 ? { selection: { drafts: n, chosen: picked.index, why: picked.why,
      ...(failures.length ? { written: written.length, failed: failures } : {}), ...(spared ? { written: written.length, spared } : {}),
      ...unchosenFields(written.map((w) => w.piece), picked.index) } } : {}),
    ...(settings ? { settings } : {}),
    ...(fidelity ? { fidelity: fidelity(output) } : {}),
    ...(before ? before(output) : {}) };
  assertRequestBound(rec.request, task);
  // Persisted through the ONE shared function — the host surface records through the same one, so
  // evidence cannot differ in shape by which surface witnessed it.
  persistInvocation(L, rec, binding, store.getStandard(L, sv.standardVersionHash));
  return rec;
}
