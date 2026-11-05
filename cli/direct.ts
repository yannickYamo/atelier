// cli/direct.ts — THE DIRECT WRITER: THE AUTHOR'S PIECES, THE MATERIAL, THE TASK, A DRAFT, ONE SELF-REVIEW.
//
// The default way a skill built from someone's pieces writes (cli/commands/invoke.ts sends a run here; `--pipeline
// legacy` keeps the compiled path). In every blind test since September the compiled path (rules, a plan, method steps,
// moves, repair) lost to the plainest arm: the author's posts of the kind asked for pasted whole, the material, the task,
// then one self-review against the same posts. So the run starts from that, and adds only what Atelier knows that a
// paste does not:
//
//   1. which pieces: a reading of the request against the skill's catalogue (core/direct/route.ts), so a comparison is
//      written from comparisons and an essay from essays; the person's kept pieces are in the catalogue (`atelier keep`);
//   2. the draft, written as prose at the effort asked (default high), with no tool forced and no rule served;
//   3. one self-review with the same pieces, the material and the task, and the person's own earlier corrections;
//   4. the checks: a rule the person stated and required is shown to the writer in their words, and a sentence of the
//      reviewed piece that still breaks one is rewritten, that sentence only (`atelier verify --repair`'s repair); the
//      rest (a specific not in what was given, a habit read off the pieces) is listed beside the piece and changes
//      nothing. The record's delivery decides the exit, as on every run; nothing is blanked or refused.
//
// The record is the one every run writes (core/loop/run-once.ts, `runOnce`), with `direct` saying what was shown and
// who chose it, so `atelier report`, `rate`, `fix` and `keep` read it as any other run.

import * as store from '../core/state/store.js';
import { sha } from '../core/state/receipt.js';
import { readContext } from '../core/inference/reading.js';
import { spend, processSpentUsd, type Budget, type InferenceClient } from '../core/inference/client.js';
import { resolveProvenance } from '../core/fidelity/provenance.js';
import { inferredLines } from '../core/loop/inferred.js';
import type { RuntimeBinding } from '../core/runtime/binding.js';
import type { SkillVersion, StandardVersion, DirectRecord, RepairRecord, InvocationSettings, LatitudeLevel, InferredItem } from '../core/state/canonical-state.js';
import { runOnce, draftMaxTokens, type Written } from '../core/loop/run-once.js';
import { workField, workRecord } from '../core/loop/work-field.js';
import { catalogueOf, titleOf, withinBudget, PIECE_BUDGET_CHARS, type Piece } from '../core/direct/pieces.js';
import { PIECE_ROUTE, type Route } from '../core/direct/route.js';
import { piecesBlock, taskBlock, DRAFT_ASK, reviewAsk, EDITS_SHOWN } from '../core/direct/prompt.js';
import { correctionsOf } from '../core/direct/kept.js';
import { checkDraftAsync, refineToStandard, REPAIR_PASSES, CLAIMS_TO_CHECK, INCONCLUSIVE, PUBLIC_FACTS } from '../core/loop/run-repair.js';
import { supportIsIn, numbersIn } from '../core/loop/claim-extract.js';
import type { Span } from '../core/observers/registry.js';
import { planFor } from '../core/plan/execution-plan.js';
import { buildRunEval } from './eval-run.js';
import { putEval } from '../core/state/eval-store.js';
import type { EvalSummary } from '../core/eval/summary.js';
import { acts, type VerifyReport } from '../core/observers/verify.js';
import { recordHead } from '../core/eval/certificate.js';
import { checksFor } from './checks.js';
import { contextReaderClient, contextReaderModel, flag, numericFlag, argv } from './runtime.js';
import { asText } from '../core/discovery/text.js';
import type { Voice } from '../core/compiler/voice.js';

export const DIRECT_VERSION = '1';
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
type Effort = (typeof EFFORTS)[number];
/** The token ceiling of a prose call: thinking at high effort counts against it, as it did for the baseline (32,000). */
export const DIRECT_MAX_TOKENS = 32_000;
/** The ceiling a prose call is sent with: `--max-tokens` where the person set one (a backend with a lower limit), else at least DIRECT_MAX_TOKENS. */
export const directMaxTokens = (): number => (flag('--max-tokens') !== undefined ? draftMaxTokens() : Math.max(draftMaxTokens(), DIRECT_MAX_TOKENS));
/** What one prose call is held to before it is sent: a long piece at high effort, not the cap of a run. */
const PROSE_ESTIMATE_USD = 0.25;

/** The pieces a skill holds to write from: every piece it was built from, else the pieces it serves. */
export function builtPieces(voice: Voice | null): { text: string; request: string | null }[] {
  if (voice?.wholePieces?.length) return [...voice.wholePieces];
  const served = voice?.pieces ?? [];
  const req = voice?.pieceRequests ?? [];
  const guard = (voice?.guardPieces ?? []).filter((g) => !served.includes(g));
  return [...served.map((t, i) => ({ text: t, request: req[i] ?? null })), ...guard.map((t) => ({ text: t, request: null }))];
}

/**
 * WHETHER A RUN GOES THE DIRECT WAY. A skill that writes documents from pieces, with no output contract, not held strict,
 * and not asked for another path. `null` when it does; otherwise why not, said on the record of the compiled run.
 */
export function directWhyNot(x: { voice: Voice | null; std: StandardVersion | null; contract: boolean; strict: boolean; held?: LatitudeLevel | null;
  /** a short piece from a long-form standard (`--limit`, a short `--class`): its limit and bands are the compiled path's */
  shortForm?: boolean }): string | null {
  const asked = flag('--pipeline');
  if (asked !== undefined && asked !== 'direct' && asked !== 'legacy') throw new Error(`--pipeline takes direct or legacy; got "${asked}".`);
  if (asked === 'legacy') return 'asked for the compiled path (--pipeline legacy)';
  if (argv.includes('--deep')) return 'a deep run takes the compiled path';
  if (x.contract) return 'the skill has an output contract';
  if (!x.std) return 'the skill has no standard';
  const forced = asked === 'direct';
  const compiledOnly = COMPILED_FLAGS.find((f) => argv.includes(f));
  if (compiledOnly) return `${compiledOnly} is read by the compiled path`;
  // Strict delivery refuses what does not conform; the direct path never refuses, so not even --pipeline direct takes it.
  if (x.strict) return 'strict delivery holds the compiled path';
  if (x.shortForm) return 'a short piece from a long-form standard takes the compiled path';
  if (!forced && x.std.latitude?.level === 'STRICT') return 'a strict skill holds the compiled path';
  if (!forced && x.held === 'STRICT') return 'the request holds this run strict, and a strict run takes the compiled path';
  if (!forced && x.voice?.form === 'REPLY') return 'a skill that answers takes the compiled path';
  if (builtPieces(x.voice).length < 1) return 'the skill holds none of the author\'s pieces';
  return null;
}

/** Flags only the compiled path reads: given one, a run takes that path, and says so. */
export const COMPILED_FLAGS = ['--voice', '--register', '--structure', '--until-typical', '--until-author', '--shape-rounds', '--fidelity', '--try-release',
  '--drafts', '--sections', '--select', '--context', '--nearness', '--moves', '--taste', '--answers', '--placeholders', '--strict', '--graded', '--set-aside',
  // a fix replayed as a whole new piece (`atelier fix`): the complaint and what earlier fixes took out are the compiled path's
  '--correcting', '--corrections-of', '--fix-of',
  // a candidate release is measured against the package it was compiled to, which the direct writer never serves
  '--candidate', '--limit'] as const;

export interface DirectContext {
  readonly L: store.StoreLayout;
  readonly sv: SkillVersion;
  readonly std: StandardVersion;
  readonly name: string;
  readonly asked: string;
  readonly material: readonly { readonly name: string; readonly text: string }[];
  readonly client: InferenceClient;
  readonly binding: RuntimeBinding;
  readonly say: (line: string) => void;
  readonly detail: (line: string) => void;
  /** when the run started, for the evaluation's duration */
  readonly started: number;
  /** what the run was configured with, as every run records it (cli/commands/invoke.ts, `settingsFor`): the certificate, the flags, a test run's mark */
  readonly settings: (checks: ReturnType<typeof checksFor>) => InvocationSettings;
  /** what the process had spent when the run began: the run's cost is everything after it */
  readonly spentBefore: number;
}

const asEffort = (x: string | undefined): Effort => {
  if (x === undefined) return 'high';
  if (!(EFFORTS as readonly string[]).includes(x)) throw new Error(`--effort takes ${EFFORTS.join(', ')}; got "${x}".`);
  return x as Effort;
};

/** One prose call: the pieces cached, the task beside them, `ask` as the turn. */
async function prose(client: InferenceClient, budget: Budget, stable: string, variable: string, ask: string, effort: Effort, tool: string): Promise<Written> {
  const temperature = flag('--temperature') === undefined ? undefined : Number(flag('--temperature'));
  const r = await spend(budget, PROSE_ESTIMATE_USD, async () => {
    const res = await client.complete({ stableBlock: stable, variableBlock: variable, userMessage: ask, toolName: tool, toolDescription: 'Write the piece.',
      schema: { type: 'object', properties: { piece: { type: 'string' } }, required: ['piece'] }, maxTokens: directMaxTokens(), plain: { effort },
      ...(temperature === undefined ? {} : { temperature }) });
    return { value: res, cost: res.cost, usage: res };
  }, 'writing');
  // A reply that wraps the piece in a work field is the field; prose with none is the piece whole.
  const field = workField(asText((r.json as { piece?: unknown } | null)?.piece));
  const piece = field.text.trim();
  if (!piece) throw new Error('the model returned no text for the piece');
  return { piece, reportedModel: r.modelId || null, schemaSent: {}, servedTask: variable, temperatureSent: r.temperatureSent ?? null, work: workRecord(field) };
}

/** The required rules a report finds broken, the claim lines aside (those list what to check; they are no rule of the owner's). */
const brokenOf = (report: VerifyReport): string[] =>
  report.checked.filter((x) => acts(x) && x.result.verdict === 'VIOLATED' && !x.requirementId.startsWith('UNSOURCED')).map((x) => x.requirementId);

/** Every specific the claim check left for the person to check, read off the report's claim lines. */
/** One sentence listed for the person, and the words in it a reader found untraced, where it named them. */
export interface ToCheck { readonly sentence: string; readonly specific: string | null }

/**
 * WHAT IS LISTED BESIDE THE PIECE, FROM WHAT THE CHECKS FOUND. A sentence that is itself in what the person gave (its
 * words in one passage of the material or the request, and every number of it there) is never listed as not given,
 * whichever check raised it: "The CRM holds the deals", copied from the notes, was listed once as a specific to check.
 * Where a reader named the part of the sentence it could not trace, that part is said, so the person reads which words.
 */
export const toCheckOf = (report: Awaited<ReturnType<typeof checkDraftAsync>>, known: string): ToCheck[] => {
  const knownNumbers = new Set(numbersIn(known));
  const given = (t: string): boolean => supportIsIn(t, known) && numbersIn(t).every((n) => knownNumbers.has(n));
  const out: ToCheck[] = [];
  for (const c of report.checked) {
    if (![...LISTED_IDS].includes(c.requirementId) || c.result.verdict !== 'VIOLATED') continue;
    for (const sp of c.result.spans as readonly (Span & { specific?: string })[]) {
      const sentence = sp.text.trim();
      if (!sentence || given(sentence) || out.some((x) => x.sentence === sentence)) continue;
      const specific = sp.specific?.trim();
      out.push({ sentence, specific: specific && specific !== sentence ? specific : null });
    }
  }
  return out;
};
const LISTED_IDS: ReadonlySet<string> = new Set(['UNSOURCED', CLAIMS_TO_CHECK, INCONCLUSIVE, PUBLIC_FACTS]);

/** The direct run, recorded. Returns the record and the JSON a `--json` run prints. */
export async function runDirect(c: DirectContext) {
  const effort = asEffort(flag('--effort'));
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 3), maxCalls: numericFlag('--max-calls', 6) };
  const voice = store.getVoice(c.L);
  const kept = store.getKept(c.L);
  const catalogue = catalogueOf(builtPieces(voice), kept.map((k) => ({ text: k.text, request: k.request })));
  const materialText = c.material.map((m) => m.text).join('\n\n');

  // 1. WHICH PIECES: a reading of the request, grounded; the shared-words floor when no model can read.
  const routeBudget: Budget = { spentUsd: 0, capUsd: 0.1, maxCalls: 1 };
  const decided = await readContext(PIECE_ROUTE, { request: c.asked, material: materialText, pieces: catalogue }, contextReaderClient(), contextReaderModel(), routeBudget, 'other');
  const route: Route = decided.value;
  const shown: Piece[] = withinBudget(catalogue, route.order.length ? route.order : catalogue.map((p) => p.id), numericFlag('--piece-chars', PIECE_BUDGET_CHARS));
  const corrections = correctionsOf(kept, EDITS_SHOWN);
  const stable = piecesBlock(shown);
  // The author's own rules, in their words: what they stated and required (a ban they wrote), never a rule read off their pieces.
  const rules = planFor(c.std).rules.filter((r) => r.stated && r.role !== 'HABIT').map((r) => r.statement);
  const variable = taskBlock({ material: c.material, task: c.asked, rules });
  c.detail(`Written from ${shown.length} of ${catalogue.length} piece(s) of the author's${route.kind ? `, as ${route.kind}` : ''} (${decided.by === 'model' ? 'chosen by a reading of the request' : `chosen by shared words: ${decided.why ?? 'no reading'}`}): ${shown.map((p) => titleOf(p.text)).join('; ')}.`);

  // What the delivered text is checked by, set up once: the record's settings are read from it too.
  const checks = checksFor(c.L, { material: [c.asked, materialText].filter(Boolean).join('\n\n'), task: c.asked, context: { request: c.asked, material: c.material.map((m) => ({ name: m.name, text: m.text })) }, guardClaims: !argv.includes('--allow-unsourced'), placeholders: false, claimReads: 1 });

  // 2-3. THE DRAFT, THEN ONE SELF-REVIEW. A review that fails costs the review, never the piece: the draft is delivered, said.
  let review: DirectRecord['review'] = { ran: false };
  let draftText = '';
  let repaired: string[] = [];
  // set inside the refine step; a holder, so the type is not narrowed to its first value
  const seen: { report: VerifyReport | null; checks: ReturnType<typeof checksFor> | null } = { report: null, checks: null };
  // what the last check listed, with the words each reader named: the record keeps the sentences, the person reads both
  const listedHere: ToCheck[] = [];
  const refine = async (draft: string): Promise<{ output: string; repair: RepairRecord | null }> => {
    draftText = draft;
    let output = draft;
    if (argv.includes('--no-review')) review = { ran: false, why: 'turned off (--no-review)' };
    else {
      try {
        const again = await prose(c.client, budget, stable, variable, reviewAsk(draft, { material: c.material, edits: corrections, rules }), effort, 'emit_review');
        output = again.piece; review = { ran: true };
      } catch (e) { review = { ran: false, why: `the review could not run: ${(e as Error).message.split('\n')[0]}` }; c.say(`(the self-review could not run, so the first draft is delivered: ${review.why})`); }
    }
    // 4. THE CHECKS. A rule the owner required that the reviewed piece still breaks has the sentences that break it
    // rewritten, as `atelier verify --repair` does (core/loop/run-repair.ts, `refineToStandard`): only those spans, and
    // never at the cost of another rule. Everything else the checks find (a specific not in what was given, a habit
    // missed) is listed beside the piece and changes nothing. `--no-repair` changes nothing; the piece is still read, so
    // its evaluation rests on the checks, never on nothing.
    let violatedBefore: string[] = []; let violated: string[] = []; let toCheck: ToCheck[] = []; let passes = 0;
    let more: Partial<RepairRecord> = {};
    {
      try {
        let report = await checkDraftAsync(c.name, c.std, output, checks);
        violatedBefore = brokenOf(report);
        if (violatedBefore.length && !argv.includes('--no-repair')) {
          try {
            const r = await refineToStandard(c.client, budget, c.name, c.std, output, REPAIR_PASSES, checks);
            output = r.output; report = r.report; passes = r.repair?.passes ?? 0;
            if (r.repair) { const { passes: _p, violatedBefore: _b, violatedAfter: _a, originalOutputHash: _h, draft: _d, claimsToCheck: _c, why: _w, ...rest } = r.repair; more = rest; }
          } catch (e) { c.say(`(the sentences that break ${violatedBefore.join(', ')} could not be rewritten: ${(e as Error).message.split('\n')[0]}; the piece is delivered as reviewed)`); }
        }
        seen.report = report; seen.checks = checks;
        violated = brokenOf(report);
        toCheck = toCheckOf(report, checks.evidence ?? '');
        listedHere.splice(0, listedHere.length, ...toCheck);
      } catch (e) { c.say(`(the checks could not read the piece: ${(e as Error).message.split('\n')[0]}; it is delivered unchecked)`); }
    }
    repaired = violatedBefore.filter((id) => !violated.includes(id));
    return { output, repair: { ...more, passes, violatedBefore, violatedAfter: violated, originalOutputHash: sha(draft), draft, claimsToCheck: toCheck.map((t) => t.sentence),
      why: passes ? `written directly from the author's pieces and reviewed once; the sentences breaking ${violatedBefore.join(', ')} were rewritten` : 'written directly from the author\'s pieces, reviewed once; the checks are listed beside the piece, nothing was changed by them' } };
  };
  const direct = (): DirectRecord => ({ version: DIRECT_VERSION, asked: c.asked, from: catalogue.length,
    pieces: shown.map((p) => ({ id: p.id, title: titleOf(p.text), kept: p.kept })),
    route: { by: decided.by, reader: decided.reader, kind: route.kind, ...(decided.why ? { why: decided.why } : {}) }, effort, review, corrections: corrections.length });
  const servedHash = sha(stable);
  const rec = await runOnce(c.L, c.sv, stable, servedHash, { expectedPackageHash: servedHash, servedPackageHash: servedHash, matched: true, servedFiles: ['direct:pieces'] },
    variable, c.client, budget, c.binding, resolveProvenance(flag('--provenance'), process.env), null, flag('--task') ? 'FLAG' : 'POSITIONAL', refine,
    { n: 1, choose: () => ({ index: 0, why: '' }), write: () => prose(c.client, budget, stable, variable, DRAFT_ASK, effort, 'emit_piece') },
    null, c.settings(checks), null, () => ({ direct: direct() }));

  // WHAT THE PERSON READS BESIDE THE PIECE: what the checks found, never in it.
  const violated = rec.repair?.violatedAfter ?? [];
  const toCheck = rec.repair?.claimsToCheck ?? [];
  if (repaired.length) c.say(`Your rule${repaired.length === 1 ? '' : 's'} ${repaired.join(', ')}: the sentences that broke ${repaired.length === 1 ? 'it' : 'them'} were rewritten, and nothing else.`);
  if (violated.length) c.say(`Beside the piece: ${violated.length} required rule(s) of the standard still not held: ${violated.join(', ')}. atelier fix "<what was wrong>" changes the sentences you name.`);
  // Each specific the checks left in the piece, listed beside it as every run lists them (core/loop/inferred.ts): what
  // `atelier run` shows, and what --json carries as `inferred`.
  const named = new Map(listedHere.map((t) => [t.sentence, t.specific]));
  const inferred: InferredItem[] = toCheck.filter((t) => rec.output.includes(t.slice(0, 60)))
    .map((t) => { const sp = named.get(t); return { kind: 'specific', what: sp ? `"${sp.slice(0, 100)}", in: ${t.slice(0, 160)}` : t.slice(0, 160), settled: 'left in the piece for you to check', add: 'your source for it, as material (--with)' }; });
  for (const l of inferredLines(inferred)) c.say(l);
  if (!review.ran && review.why) c.detail(`Self-review: not run (${review.why}).`);
  if (draftText && draftText !== rec.output) c.detail('The self-review revised the first draft; the first draft is kept on the record.');
  const spent = Math.max(budget.spentUsd + routeBudget.spentUsd, processSpentUsd() - c.spentBefore);
  // THE EVALUATION OF THIS RUN, as every run has one (cli/eval-run.ts): stored beside the record, carried by --json, read
  // by report, rate, eval and reproduce. Fault-isolated: it never costs the person the piece.
  let evaluation: EvalSummary | null = null;
  try {
    const ch = seen.checks;
    evaluation = buildRunEval({ L: c.L, rec, std: c.std, sensor: ch?.claimSensor, claimsOff: argv.includes('--allow-unsourced'), answers: false, unmeasured: ch?.listsBecause ?? null,
      ...(ch?.claimAct ? { claimAct: ch.claimAct } : {}), material: ch?.evidence ?? materialText, profile: null, format: { words: null, shape: null, withheld: 0 }, taste: null, costUsd: spent,
      durationMs: Date.now() - c.started, drafts: 1, applicability: [], report: seen.report, contract: false });
    putEval(c.L, evaluation);
  } catch (e) { c.say(`(the evaluation of this run could not be built: ${(e as Error).message.split('\n')[0]})`); }
  const json = {
    ...recordHead({ state: evaluation?.record?.state ?? null, standardVersionHash: c.sv.standardVersionHash, skillVersion: c.sv.skillVersionHash, certificate: rec.settings?.certificate ?? null, record: evaluation?.record ?? null }),
    eval: evaluation,
    output: rec.output, answer: rec.output, invocationId: rec.invocationId, skillVersion: c.sv.skillVersionHash, costUsd: Number(spent.toFixed(4)),
    rulesBroken: violated, cut: rec.repair?.storiesCut ?? [], toCheck, questions: [], answers: [], plan: null, inferred, work: rec.work ?? null,
    direct: rec.direct ?? null, model: rec.observedRuntime?.resolvedModel ?? c.binding.requestedModel, maxTokens: directMaxTokens(),
  };
  return { rec, json, spent, budget, evaluation, claimAct: checks.claimAct };
}
