// cli/checks.ts — WHAT EVERY OUTPUT IS HELD TO, BUILT IN ONE PLACE.
//
// `invoke`, `verify`, the Claude Code stop hook (`record`), the MCP tool and the blind-reference loop all
// check text against a skill's standard. They used to build the check options by hand, and drifted: the
// MCP tool and the stop hook never checked the machine-writing phrases a skill had learned, although the
// README said "the same check runs" there. One constructor, so a new check reaches every surface at once.

import type { CheckContext } from '../core/observers/registry.js';
import * as store from '../core/state/store.js';
import type { CheckOptions } from '../core/loop/run-repair.js';
import { modelSensor, patternSensor, claimAction, withRules, type ClaimSensor } from '../core/loop/claim-extract.js';
import { modelJudge, type ContextJudge } from '../core/loop/context-judge.js';
import type { Budget, InferenceClient } from '../core/inference/client.js';
import { argv, flag, providerFor, clientAndBinding, boundMaterial, DATA, CONTEXT_READER_DEFAULT } from './runtime.js';
import { join } from 'node:path';
import { formatOf, type FormatProfile } from '../core/observers/formats.js';
import { shortFormOptions, shortFormTransfer, type ShortTransfer } from '../core/observers/short-form.js';
import type { Requirement, LatitudeLevel, StandardVersion } from '../core/state/canonical-state.js';
import { latitudeOf } from '../core/state/canonical-state.js';

/**
 * WHAT A SHORT-FORM REQUEST CHANGES (core/observers/short-form.ts): the format the output is held to (the class's, with
 * `--limit` as its character limit where one is given), and, on a standard read from longer pieces, the bands that do
 * not apply to a short output. A string when `--limit` is not a number of characters.
 */
export function shortFormRequest(requirements: readonly Requirement[] | null, declared: string | null | undefined, given: string | undefined):
  { readonly format: FormatProfile | null; readonly transfer: ShortTransfer | null } | string {
  const o = shortFormOptions(declared, given);
  if (typeof o === 'string') return o;
  const f = formatOf(declared);
  const format = given === undefined ? f : { ...(f ?? { id: 'limit', label: `a piece of at most ${given} characters`, strictSpecifics: false }), maxChars: Number(given) };
  return { format, transfer: requirements ? shortFormTransfer(requirements, o.limit ?? null, f?.short ? f.label : null) : null };
}

/** The claim reader's default on Anthropic: small, fast, and it only has to type and quote. */
export const CLAIMS_MODEL_DEFAULT = 'claude-haiku-4-5';

/**
 * WHO READS A DRAFT FOR INVENTED CLAIMS, resolved once per command.
 *
 *   --claims pattern (ATELIER_CLAIMS=pattern)   the pattern check: offline, free, and narrow
 *   --claims-model <id> (ATELIER_CLAIMS_MODEL)  that model reads, on the provider and backend the
 *                                               discovery settings name: your own API included
 *   otherwise, on Anthropic with a key          ${CLAIMS_MODEL_DEFAULT}
 *   otherwise                                   the pattern check, and the report says why
 *
 * A backend that is not Anthropic never gets a model it did not name: an Anthropic id sent to someone's
 * own server is a 404 at best. The reader has its own small budget (ATELIER_CLAIMS_CAP, default $0.50),
 * so checking never spends the writer's calls.
 *
 * A reader gates only when its (model, version) pair is qualified (QUALIFIED_READERS); otherwise it
 * reports beside the pattern check, which gates. `ATELIER_CLAIMS_GATE=reader` lets an unqualified reader
 * gate anyway: an escape hatch for someone who has measured it on their own writing, and the sensor's
 * notes say so every time it is used.
 */
export function claimSensorFor(evidence: string, task: string, placeholders: boolean, strict = false, bound = true, rules = ''): ClaimSensor {
  // the figure-only pattern check may repeat a rule's figure as written; the reader's evidence is the request and its material alone
  const material = withRules(evidence, rules);
  const mode = flag('--claims') ?? process.env.ATELIER_CLAIMS ?? 'model';
  if (mode === 'pattern') return patternSensor(material, placeholders, 'pattern check (--claims pattern)');
  // WITH NOTHING BOUND, A READING CAN ONLY LIST. Nothing is cut without material (claim-extract.ts, `listsBecause`), so
  // two model reads per text bought a list the pattern check also makes: four of a short answer's seven calls. The
  // reader is asked where its reading can act: material bound, or strict delivery, or the person naming a reader.
  // (Not when the person chose a reader, or asked for slots: a slot is the reader acting with nothing bound.)
  if (!bound && !strict && !argv.includes('--strict') && !placeholders && flag('--claims') === undefined && process.env.ATELIER_CLAIMS === undefined) return patternSensor(material, placeholders, 'pattern check (no material bound: a model reading of specifics could only list them)');
  const named = flag('--claims-model') ?? process.env.ATELIER_CLAIMS_MODEL;
  const provider = providerFor('discovery');
  if (!named && provider !== 'anthropic') {
    return patternSensor(material, placeholders, 'pattern check (no claim reader configured: set ATELIER_CLAIMS_MODEL to a model on your backend)');
  }
  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return patternSensor(material, placeholders, 'pattern check (no API key for the claim reader)');
  }
  const model = named ?? CLAIMS_MODEL_DEFAULT;
  const cap = Number(process.env.ATELIER_CLAIMS_CAP ?? 0.5);
  // Two reads per new text (the gate below), so twice the calls of a single-read reader.
  const budget = { spentUsd: 0, capUsd: Number.isFinite(cap) && cap > 0 ? cap : 0.5, maxCalls: 48 };
  return modelSensor(clientAndBinding('discovery', model).client, budget, model,
    { material: evidence, rules, task, placeholders, strict, gateAnyway: process.env.ATELIER_CLAIMS_GATE === 'reader', cacheDir: join(DATA, 'cache', 'claims'), reads: 2 });
}

/**
 * The context judge (core/loop/context-judge.ts): the same small model as the claim reader, on the same
 * backend, for the questions that need reading. None offline (`--claims pattern`, no key, no model on a
 * non-Anthropic backend): then the word patterns decide, as they did before.
 */
export function contextJudgeFor(budget?: Budget): ContextJudge | undefined {
  const mode = flag('--claims') ?? process.env.ATELIER_CLAIMS ?? 'model';
  if (mode === 'pattern') return undefined;
  const model = contextJudgeModel();
  if (!model) return undefined;
  if (providerFor('discovery') === 'anthropic' && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return undefined;
  // The run's budget when there is one (invoke); a check with no run of its own gets a small cap of its own.
  return modelJudge(clientAndBinding('discovery', model).client, budget ?? { spentUsd: 0, capUsd: 0.2, maxCalls: 40 });
}

/**
 * WHO JUDGES CONTEXT: the context reader (`--context-reader`, `ATELIER_CONTEXT_READER`; claude-haiku-5-5 on Anthropic),
 * apart from the claim reader, which stays on the model it was qualified on (core/loop/claim-extract.ts). A claims model
 * named by hand still serves as the judge where no reader is named: on another backend it is the one model that is there.
 * Null when nothing can judge (no model named on a non-Anthropic backend), and the word patterns decide.
 */
export function contextJudgeModel(): string | null {
  const named = flag('--context-reader') ?? process.env.ATELIER_CONTEXT_READER ?? flag('--claims-model') ?? process.env.ATELIER_CLAIMS_MODEL;
  if (named) return named;
  return providerFor('discovery') === 'anthropic' ? CONTEXT_READER_DEFAULT : null;
}

/**
 * The small model for the readings that need context and decide nothing alone: a request's subject
 * (core/fidelity/subject-reader.ts) and whether a voice rewrite kept its claims (core/voice/reader.ts). The claim
 * reader's model on the same backend, under the same conditions as the context judge. None offline: nearness is
 * then read by shared words, and the voice gate by its word lists.
 */
export function smallReaderFor(): { client: InferenceClient; model: string } | undefined {
  const mode = flag('--claims') ?? process.env.ATELIER_CLAIMS ?? 'model';
  if (mode === 'pattern') return undefined;
  const named = flag('--claims-model') ?? process.env.ATELIER_CLAIMS_MODEL;
  const provider = providerFor('discovery');
  if (!named && provider !== 'anthropic') return undefined;
  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return undefined;
  const model = named ?? CLAIMS_MODEL_DEFAULT;
  return { client: clientAndBinding('discovery', model).client, model };
}

/**
 * The checks for one skill: the person's material (theirs to cite), the invented-claim guard, whether
 * invented material becomes a slot or is cut, and the machine-writing phrases this skill has learned.
 * The claim sensor carries its instrument, qualification and spend; `claimInstrumentOf` reads them.
 */
export function checksFor(L: store.StoreLayout, opts: {
  /** everything the person supplied for this output: the task, bound files, stored material */
  readonly material: string;
  /** false with `--allow-unsourced` */
  readonly guardClaims?: boolean;
  /** true with `--placeholders` */
  readonly placeholders?: boolean;
  /** the task the person typed, when there is one: the claim reader's context, beside the material */
  readonly task?: string;
  /** the request and the material by name, for the rules that are about what the work was made from */
  readonly context?: CheckContext;
  /** the context judge, when the caller already made one (invoke asks it about the request first) */
  readonly judge?: ContextJudge;
  /**
   * No model, whatever the environment says: the pattern claim check (`--claims pattern` semantics) and no
   * context judge. `atelier score` needs this, so the same text scores the same on every machine.
   */
  readonly offline?: boolean;
  /**
   * Is material bound for this output (stored with `atelier material`, or given with the call)? The request is an
   * instruction, not material. Left out, it is read from the store and the `--with` files.
   */
  readonly bound?: boolean;
  /** the kind of work named for this one check (the MCP tool's `class`), over the flag and the skill's own */
  readonly cls?: string | null;
  /** the level this output is held at, where a run tightened it (cli/latitude.ts); the skill's own otherwise */
  readonly level?: LatitudeLevel;
}): CheckOptions {
  const guardClaims = opts.guardClaims ?? true;
  const placeholders = opts.placeholders ?? false;
  // THE SKILL'S OWN WORDS ARE KNOWN. A rule the person approved ("end with one thing the reader can do in
  // under two minutes") puts its wording in every draft, and the claim check, reading only the material,
  // cut that sentence as an invented figure. What the approved standard says is theirs to repeat.
  // Fenced, so a figure in the rules counts only as written: "23" and "10" in a rule's wording worked out "2.3M rows"
  // as derived from what was supplied (core/loop/derived.ts reads no arithmetic out of a fenced block).
  // THE SOURCE ROLES. The evidence for what this answer may assert about the current work is the request and its material
  // (`evidence`); the rules are instructions and license a specific only as written (claim-extract.ts, `decideSpecifics`).
  const own = standardStatements(L).join('\n\n');
  const evidence = opts.material ?? '';
  const material = withRules(evidence, own);
  // What the skill is served as examples: their facts are their case's, never this request's (core/loop/carry-over.ts).
  // THE METHOD IS NOT AN EXAMPLE. A term the owner's method names is approved terminology, the writer's to use on any
  // request; read among the examples, it was called borrowed ("the OCR pass" in a method about scanned imports).
  const examples = servedExamples(L);
  const approved = [store.getMethod(L)?.text ?? '', own].filter((t) => t.trim()).join('\n\n');
  // The format the text is: the one declared for it, or the class the standard was built from.
  const format = formatOf(flag('--class') ?? store.getDocClass(L));
  const judge = opts.offline ? undefined : opts.judge ?? (guardClaims ? contextJudgeFor() : undefined);
  // Where a deletion is not earned (no material bound, or a kind of work nobody measured), findings are listed.
  const bound = opts.bound ?? (store.getMaterial(L).length > 0 || boundMaterial().length > 0);
  const sensor = (): ClaimSensor => (opts.offline ? patternSensor(material, placeholders, 'pattern check (offline)')
    : claimSensorFor(evidence, opts.task ?? '', placeholders, format?.strictSpecifics ?? false, bound, own));
  // WHAT AN UNTRACED SPECIFIC MEETS, by the latitude (core/loop/claim-extract.ts, `claimAction`): cut only where the owner
  // chose it and a qualified reader found it; otherwise blocked, sent to review or listed.
  const action = claimAction({ level: opts.level ?? latitudeOf(activeStandard(L)), bound, ownerCut: store.getClaimsCut(L), cls: opts.cls ?? flag('--class') ?? store.getDocClass(L), slots: placeholders });
  return { material, evidence, ...(examples ? { examples } : {}), ...(approved ? { approved } : {}), guardClaims, placeholders, format, ...(action.why ? { listsBecause: action.why } : {}), claimAct: action.act, ...(opts.level ? { level: opts.level } : {}), ...(action.otherwise ? { cutOtherwise: action.otherwise } : {}), ...(opts.context ? { context: opts.context } : {}), ...(judge ? { judge } : {}),
    learnedTells: store.activeTells(store.getTells(L)),
    ...(guardClaims ? { claimSensor: sensor() } : {}) };
}

/** The examples the skill is served: the author's pieces with the requests they answered, and the exemplar. The method is the owner's, not an example. Empty before a build. */
export function servedExamples(L: store.StoreLayout): string {
  const voice = store.getVoice(L); const ex = store.getExemplar(L);
  return [...(voice?.pieces ?? []), ...(voice?.pieceRequests ?? []).filter((r): r is string => typeof r === 'string'),
    ...(ex ? [ex.text, ex.request ?? ''] : [])].filter((t) => t.trim()).join('\n\n');
}

/** The active skill's standard, or null when the skill is not built yet. */
function activeStandard(L: store.StoreLayout): StandardVersion | null {
  const active = store.getActive(L);
  const sv = active ? store.getSkillVersion(L, active) : null;
  return sv ? store.getStandard(L, sv.standardVersionHash) : null;
}

/** The statements of the active skill's approved rules, or none when the skill is not built yet. */
function standardStatements(L: store.StoreLayout): string[] {
  return (activeStandard(L)?.requirements ?? []).filter((r) => r.authority !== 'EXPERT_REJECTED').map((r) => r.statement);
}

/** What `invoke` records about the invented-claim check that ran: which instrument, and on whose word. */
export interface ClaimInstrument {
  /** the instrument as it stood at the end of the run (a reader that degraded says so) */
  readonly instrument: string;
  /** READER_VERSION when a model read; null for the pattern check */
  readonly version: string | null;
  /** a model reader whose (model, version) pair a qualification result stands behind */
  readonly qualified: boolean;
  /** whose findings failed the check: the reader's, or the pattern check's */
  readonly gate: 'reader' | 'pattern';
  /** a read failed and every reading since was the pattern check's */
  readonly degraded: boolean;
  /** what the reader spent from its own budget, never the writer's */
  readonly spentUsd: number;
}

/**
 * THE CLAIM INSTRUMENT, AS A RECORD CAN KEEP IT. A verdict of "no invented claims" means one thing from a
 * qualified reader, another from an unqualified one that only reported, and another from a pattern check
 * that took over when the reader failed. Read it after the run: `degraded` and `spentUsd` change as it
 * goes. Null when the check was turned off (`--allow-unsourced`).
 */
export function claimInstrumentOf(checks: CheckOptions): ClaimInstrument | null {
  const s = checks.guardClaims === false ? undefined : checks.claimSensor;
  if (!s) return checks.guardClaims === false ? null : { instrument: 'pattern check', version: null, qualified: false, gate: 'pattern', degraded: false, spentUsd: 0 };
  return { instrument: s.instrument, version: s.version, qualified: s.qualified, gate: s.gate, degraded: s.degraded, spentUsd: s.spentUsd };
}
