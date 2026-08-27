import { parseArgs } from 'node:util';
// cli/runtime.ts — the shared ground every command stands on.
//
// Extracted because a 1,700-line entry point is a file nobody reads twice, and a reader who opens
// this repository opens the CLI first. What lives here is the state a command cannot avoid touching:
// where data goes, how a run advances, and how a model is reached.

import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { writeAtomic } from '../core/state/fs-atomic.js';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { newRun, transition, type Run } from '../core/state/run-state.js';
import type { ExpertEvidence, Requirement } from '../core/state/canonical-state.js';
import type { Reservation } from '../core/golden/reservation.js';
import type { RatificationLedger } from '../core/ratification/decision-record.js';
import type { InferenceClient } from '../core/inference/client.js';
import { AnthropicInferenceClient } from '../providers/anthropic.js';
import { ClaudeCodeAdapter } from '../adapters/claude-code/adapter.js';
import { CodexAdapter } from '../adapters/codex/adapter.js';
import type { HostAdapter } from '../adapters/host-adapter.js';

export const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);
export const DATA = process.env.ATELIER_DATA ?? join(process.env.HOME ?? '.', '.atelier');
export const die = (m: string): never => { console.error(`atelier: ${m}`); process.exit(1); };

// ── THE COMMAND GRAMMAR, DECLARED ─────────────────────────────────────────────────────────────
//
// Option arity is STATED here, never inferred from what a token looks like. The bug that forced this
// was inference: `argv.find(a => !a.startsWith('--'))` reads as "find the positional" and finds the
// first token that is not itself a flag — and a flag's VALUE is such a token. So
//
//   atelier invoke --skill s --target-provider openai-compatible "Should we hire?"
//
// used "openai-compatible" as the writing task. Nothing failed; the record faithfully hashed and
// stored the wrong task; the model produced a fluent piece about the wrong question.
//
// `node:util.parseArgs` is given this table, so the parser knows an option takes a value because we
// said so. A census test proves every option the codebase reads is declared, which is what stops the
// table going stale one flag at a time.
export const VALUED_OPTIONS: readonly string[] = [
  'with',
  'api-key-env', 'applies-when', 'arm-set', 'backend', 'base-url', 'brief',
  'candidate', 'cap', 'complaint', 'context', 'decision',
  'declare-viewed', 'decisions', 'description', 'discovery-backend', 'discovery-base-url', 'discovery-model',
  'discovery-price-in', 'discovery-price-out', 'discovery-provider', 'discovery-strict-schema', 'discovery-structured-output',
  'exclude', 'host', 'id', 'invocation', 'kind',
  'labels', 'max-calls', 'model', 'name', 'note',
  'one-pager', 'pick', 'price-in', 'price-out', 'provenance', 'provider',
  'questions', 'reason', 'required-n', 'reserve', 'role',
  'rule', 'skill', 'source-author', 'statement', 'strict-schema',
  'structured-output', 'supersedes', 'target-backend', 'target-base-url', 'target-model',
  'target-price-in', 'target-price-out', 'target-provider', 'target-strict-schema', 'target-structured-output',
  'task', 'temperature', 'to', 'token-limit-param', 'verdict',
  'why', 'work-type',
];

export const BOOLEAN_OPTIONS: readonly string[] = [
  'accept-new-binding', 'cluster-per-file', 'drop', 'dry-run', 'indifferent',
  'json', 'never-this-transition', 'no-negative-probe', 'none', 'public-source',
  'review', 'score', 'skip-methods', 'yes',
];

export const argv = process.argv.slice(2);

interface Parsed { values: Record<string, string | boolean | undefined>; positionals: string[] }

/** Parse once, against the declared grammar. Unknown options are tolerated so a typo reaches the
 *  command's own error rather than a parser error nobody can act on. */
const parsed = ((): Parsed => {
  const options: Record<string, { type: 'string' | 'boolean' }> = {};
  for (const o of VALUED_OPTIONS) options[o] = { type: 'string' };
  for (const o of BOOLEAN_OPTIONS) options[o] = { type: 'boolean' };
  try {
    const r = parseArgs({ args: argv.slice(1), options, allowPositionals: true, strict: false });
    return { values: r.values, positionals: r.positionals };
  } catch {
    return { values: {}, positionals: [] };
  }
})();
export const cmd = argv[0] ?? '';
export const flag = (f: string): string | undefined => {
  const name = f.replace(/^--/, '');
  const v = parsed.values[name];
  if (typeof v === 'string') return v;
  if (v === true) return undefined;                      // declared boolean, asked for as a value
  const i = argv.indexOf(f);                             // undeclared option: raw scan, as before
  return i === -1 ? undefined : argv[i + 1];
};

/**
 * THE POSITIONAL, from the declared grammar rather than from token shape.
 *
 * `skip` removes tokens the command has already claimed — the skill name, typically — so the task is
 * what is genuinely left over.
 */
export const positional = (skip: readonly string[] = []): string | undefined =>
  parsed.positionals.find((a) => !skip.includes(a));

// ── the model seam ───────────────────────────────────────────────────────────────────────────
//
// `core/` depends on the InferenceClient INTERFACE and never on a vendor — enforced by test, not by
// comment. This is the one place a concrete provider is chosen.
//
// ─── DISCOVERY AND TARGET ARE TWO DECISIONS, AND THEY WERE ONE ─────────────────────────────────
//
// Reading an expert's work well is a hard inference problem. Executing a compiled skill is not the
// same problem, and there is no reason the same model has to do both. Collapsing them made the
// expert's standard hostage to whichever model happened to discover it, which is the exact dependency
// this product exists to remove:
//
//   frontier model reads the corpus  →  YOU ratify the standard  →  a local model runs it, forever
//
// or the reverse, for a team that cannot send its corpus anywhere: local discovery, more human review,
// local runtime. Or cheap discovery and an expensive runtime. Nothing in the ownership model changes
// across those three, because the StandardVersion belongs to the person either way and carries no
// model identity at all.
//
// So: two providers, two models, two independent flags. `--provider` and `--model` still set both,
// because most of the time they are the same and typing four flags to say one thing is a tax.

import { OpenAICompatibleInferenceClient, BACKEND_PRESETS, type StructuredOutputMode, type TokenLimitParam } from '../providers/openai-compatible.js';
import { isLocalBackend, priceFor, ANTHROPIC_PRICING, type Pricing } from '../providers/pricing.js';
import { bindingHash, type RuntimeBinding } from '../core/runtime/binding.js';

// ─── THE DEFAULTS FOLLOW THE ONE MODEL-DEPENDENT CLAIM THIS PRODUCT MAKES ──────────────────────
//
// Atelier is provider-agnostic by construction: `core/` names no vendor, the request maps onto both
// wire protocols without loss, and a standard carries no model identity. Exactly one thing about it
// does depend on the model, and it is not a limitation to be engineered away — RECOVERING TACIT
// JUDGMENT FROM A CORPUS IS A HARD INFERENCE PROBLEM, and how much of it a run recovers tracks how
// capable the reading model is.
//
// So the discovery default is the most capable model available rather than the cheapest adequate
// one. It used to be a mid-tier model from an older generation, while the README called that model
// "a frontier model" — the product's default contradicting the product's own advice, on the single
// axis that most affects what a user gets.
//
// EXECUTION IS A DIFFERENT JOB. Running a compiled standard is not the same problem as inferring
// one, which is the whole reason the two are configured separately. The target default is strong
// rather than maximal, and a local 8B model is a legitimate target for a standard a frontier model
// discovered.
//
// Both are overridable, and neither is Anthropic-specific by design: `modelFor` refuses to hand an
// Anthropic default to a provider it was not chosen for, rather than quietly sending a name that
// backend has never heard of.
export const MODEL = process.env.ATELIER_MODEL ?? 'claude-opus-5';
export const PROPOSER = process.env.ATELIER_PROPOSER_MODEL ?? 'claude-fable-5';

export type ProviderId = 'anthropic' | 'openai-compatible';
export const PROVIDERS: readonly ProviderId[] = ['anthropic', 'openai-compatible'];

/** Which half of the pipeline a client is being built for. The two are configured separately. */
export type Role = 'discovery' | 'target';

const roleFlag = (role: Role, name: string): string | undefined =>
  flag(`--${role}-${name}`) ?? process.env[`ATELIER_${role.toUpperCase()}_${name.toUpperCase().replace(/-/g, '_')}`];

/** A role's setting, then the shared setting, then the default. Most people only ever set the middle one. */
const setting = (role: Role, name: string, envName: string, fallback: string): string =>
  roleFlag(role, name) ?? flag(`--${name}`) ?? process.env[envName] ?? fallback;

/**
 * A RATE FROM THE PERSON WHO KNOWS IT.
 *
 * `providers/pricing.ts` has said since it was written that "a user who wants a number passes one
 * in", and until now there was no way to pass one in: the field existed on the client config and no
 * command could reach it. So one vendor had a working dollar cap and every other backend was
 * permanently UNKNOWN_PRICING — a two-tier experience decided by which SDK ships, in a product whose
 * claim is that the standard does not belong to a vendor.
 *
 * USD per MILLION tokens, the unit every published rate card uses, so a person can copy the number
 * off the page they are reading. Both halves are required together: a half-priced call is a wrong
 * number, and a wrong number is worse than an honest UNKNOWN.
 */
export const priceOverrideFor = (role: Role): Pricing | null => {
  const inM = roleFlag(role, 'price-in') ?? flag('--price-in') ?? process.env.ATELIER_PRICE_IN;
  const outM = roleFlag(role, 'price-out') ?? flag('--price-out') ?? process.env.ATELIER_PRICE_OUT;
  if (inM === undefined && outM === undefined) return null;
  if (inM === undefined || outM === undefined) {
    die('--price-in and --price-out go together. A rate with only one half priced would be a wrong\n'
      + '  number, and a wrong number costs more than an honest UNKNOWN.\n'
      + '  Both are USD per MILLION tokens:  --price-in 3 --price-out 15');
  }
  const i = Number(inM), o = Number(outM);
  if (!Number.isFinite(i) || !Number.isFinite(o) || i < 0 || o < 0) {
    die(`--price-in / --price-out must be non-negative numbers in USD per million tokens; got "${inM}" and "${outM}".`);
  }
  return { inputPerM: i, outputPerM: o };
};

export const providerFor = (role: Role): ProviderId => {
  const p = setting(role, 'provider', 'ATELIER_PROVIDER', 'anthropic') as ProviderId;
  if (!PROVIDERS.includes(p)) die(`unknown provider "${p}". Available: ${PROVIDERS.join(', ')}.`);
  return p;
};

/**
 * The model for one role.
 *
 * REFUSES to hand a default to a provider it was not chosen for. The defaults are Anthropic model ids;
 * sending `claude-opus-4-7` to a local server because the user set a provider and forgot a model is a
 * confusing HTTP 404 at best and, on a permissive backend, a silent substitution — an inference run
 * whose provenance names a model that never touched it.
 */
export const modelFor = (role: Role, fallback = MODEL): string => {
  const explicit = roleFlag(role, 'model') ?? flag('--model') ?? process.env.ATELIER_MODEL;
  if (explicit) return explicit;
  const provider = providerFor(role);
  if (provider !== 'anthropic') {
    die(`no model set for the ${role} runtime.\n`
      + `  The built-in defaults are Anthropic model ids and mean nothing to ${provider}.\n`
      + `  Name one:  --${role}-model <id>    (or --model <id> for both roles)`);
  }
  return fallback;
};

/**
 * Schema enforcement is part of the RUNTIME IDENTITY, not a formatting preference.
 *
 * The same model asked to satisfy a schema and asked to be VALIDATED against one is not reliably the
 * same system, which is the same reason `structuredOutput` is in the binding. A run that quietly used
 * the weaker guarantee must not be comparable to one that did not.
 */
const strictSchemaFor = (role: Role): boolean => {
  const raw = (setting(role, 'strict-schema', 'ATELIER_STRICT_SCHEMA', 'on')).toLowerCase();
  if (['on', 'true', '1', 'yes'].includes(raw)) return true;
  if (['off', 'false', '0', 'no'].includes(raw)) return false;
  return die(`unknown --strict-schema "${raw}". Use on or off.`);
};

const structuredOutputFor = (role: Role): StructuredOutputMode => {
  const raw = (setting(role, 'structured-output', 'ATELIER_STRUCTURED_OUTPUT', 'tool-call')).toLowerCase();
  if (raw === 'tool-call') return 'FORCED_TOOL_CALL';
  if (raw === 'json-schema') return 'JSON_SCHEMA_RESPONSE_FORMAT';
  return die(`unknown --structured-output "${raw}". Available: tool-call, json-schema.`);
};

/**
 * A named backend, when one was given.
 *
 * It supplies a base URL and the protocol quirks someone has checked — today that is which spelling of
 * the output-token limit the backend accepts. A preset is NOT a support claim: it records a documented
 * difference, and `atelier check` is what turns it into a verified backend.
 */
export const backendFor = (role: Role): { name: string; preset: (typeof BACKEND_PRESETS)[string] } | null => {
  const name = roleFlag(role, 'backend') ?? flag('--backend') ?? process.env.ATELIER_BACKEND;
  if (!name) return null;
  // Typed as possibly absent, which is the truth: `Record<string, T>` claims every key resolves, so
  // the refusal below read as unreachable while being the only thing standing between a typo and a
  // request to nowhere.
  const preset: (typeof BACKEND_PRESETS)[string] | undefined = BACKEND_PRESETS[name];
  if (!preset) {
    die(`unknown --backend "${name}". Known: ${Object.keys(BACKEND_PRESETS).join(', ')}.\n`
      + `  Any other backend works too — give it --base-url directly instead of a name.`);
  }
  return { name, preset };
};

export const baseUrlFor = (role: Role): string =>
  roleFlag(role, 'base-url') ?? flag('--base-url') ?? process.env.ATELIER_BASE_URL
  ?? backendFor(role)?.preset.baseUrl
  ?? die('no backend given. Use --base-url <url>, or --backend <name> for a known one.');

/**
 * Build the client AND the binding that describes it, together.
 *
 * Together because they must not be able to disagree. A binding assembled somewhere else from the same
 * flags would drift the first time a flag changed, and the record would then describe a configuration
 * that never ran — the precise failure the binding exists to catch.
 */
export function clientAndBinding(role: Role, modelOverride?: string): { client: InferenceClient; binding: RuntimeBinding } {
  const provider = providerFor(role);
  const model = modelOverride ?? modelFor(role);
  const temperature = flag('--temperature') === undefined ? undefined : Number(flag('--temperature'));
  const parameters: Record<string, string | number | boolean> = {};
  if (temperature !== undefined) parameters.temperature = temperature;

  // The override wins over any shipped table, for every provider. A person who names their rate is
  // the authority on it; a dated seed is a convenience for the case where nobody has.
  const priceOverride = priceOverrideFor(role);

  if (provider === 'anthropic') {
    return {
      client: new AnthropicInferenceClient(model, undefined, priceOverride ?? priceFor(ANTHROPIC_PRICING, model)),
      binding: { providerAdapter: 'anthropic', backend: 'api.anthropic.com', requestedModel: model,
        structuredOutput: 'NATIVE_TOOL_USE', parameters, runtimeProfile: null },
    };
  }

  const backend = backendFor(role);
  const baseUrl = baseUrlFor(role);
  const structuredOutput = structuredOutputFor(role);
  const strictSchema = strictSchemaFor(role);
  const apiKeyEnv = flag('--api-key-env');
  const tokenLimitParam = (flag('--token-limit-param') ?? backend?.preset.tokenLimitParam ?? 'max_tokens') as TokenLimitParam;
  // PART OF THE BINDING. Two runs of one model that differ in which token-limit field was sent are two
  // configurations, and on a backend that rejects one of them they are a working run and a failing one.
  parameters.tokenLimitParam = tokenLimitParam;
  // PART OF THE BINDING for the same reason: two runs of one model that differ in whether the schema
  // was enforced or merely requested are two configurations, and their evidence is not interchangeable.
  parameters.strictSchema = strictSchema;
  return {
    client: new OpenAICompatibleInferenceClient({
      modelId: model, baseUrl, structuredOutput, temperature, tokenLimitParam, strictSchema,
      ...(priceOverride ? { pricing: priceOverride } : {}),
      apiKey: apiKeyEnv ? process.env[apiKeyEnv] : undefined,
      backendName: backend?.name,
    }),
    binding: { providerAdapter: 'openai-compatible', backend: backend?.name ?? baseUrl, requestedModel: model,
      structuredOutput, parameters, runtimeProfile: null },
  };
}

export const inferenceClient = (modelId: string, role: Role = 'discovery'): InferenceClient =>
  clientAndBinding(role, modelId).client;

/** Convenience for the discovery half, which is where most commands spend their calls. */
export const clientFor = (modelId: string): InferenceClient => clientAndBinding('discovery', modelId).client;

/** One line naming what will serve, printed before a run so nobody discovers it afterwards. */
export const describeBinding = (b: RuntimeBinding): string =>
  `${b.requestedModel} via ${b.providerAdapter}${b.backend ? ` (${b.backend})` : ''} [${bindingHash(b)}]`;

/**
 * CAN WE REACH A MODEL AT ALL — asked before anything is written down.
 *
 * `create` used to read the corpus, print the reserve, SEAL it and advance the run, and only then
 * construct a client and discover the key was missing. The user exports the key, runs the same
 * command again, and is refused: there is already a run in progress. The first thing a new reader
 * does with the quickstart left them with a sealed run and a refusal.
 *
 * Nothing here validates the credential — that costs a call and this must be free. It asks the one
 * question that can be answered locally, which is whether there is a credential to try, and it asks
 * it before any state exists to be stuck in.
 */
export const assertReachable = (role: Role): void => {
  const provider = providerFor(role);
  if (provider === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) {
      die('ANTHROPIC_API_KEY is not set.\n'
        + '  export ANTHROPIC_API_KEY=sk-...\n'
        + `Atelier needs an inference provider for the ${role} step. Your corpus, standard and outputs stay\n`
        + 'on this machine; nothing is sent anywhere except that one call.\n'
        + '  Nothing has been read or sealed, so this command is safe to run again once the key is set.');
    }
    return;
  }
  // An OpenAI-compatible backend on this machine needs no key; a hosted one does. `baseUrlFor` also
  // fails here rather than after intake when neither --base-url nor --backend was given.
  const url = baseUrlFor(role);
  if (!isLocalBackend(url) && !flag('--api-key-env') && !process.env.OPENAI_API_KEY) {
    die(`no API key for ${url}.\n`
      + '  export OPENAI_API_KEY=...           (or pass --api-key-env <VAR>)\n'
      + '  Nothing has been read or sealed, so this command is safe to run again once the key is set.');
  }
};


// ── BOUNDS THE USER TYPED ─────────────────────────────────────────────────────────────────────
//
// `Number(flag('--cap')) || 3.0` reads as a default and is not one. Zero is falsy, so `--cap 0` — the
// obvious way to ask for a dry run — silently became a live $3 budget. So did `--cap abc`, via NaN.
// A bound the user asked for and did not get is the one kind of parsing bug that costs money.
export const numericFlag = (name: string, fallback: number): number => {
  const raw = flag(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) die(`--${name.replace(/^--/, '')} must be a non-negative number; got "${raw}".`);
  return n;
};

/**
 * RESOURCES THIS INVOCATION HAS. Names only; what a resource IS stays the caller's business.
 *
 * `--with support-ticket-history=./tickets.csv`, repeatable. The name is what a requirement's
 * prerequisite is matched against, so the author's vocabulary and the runtime's agree by string
 * rather than by a taxonomy neither has needed yet.
 */
export const boundResources = (): ReadonlySet<string> => {
  const names = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--with') continue;
    const spec = argv[i + 1];
    if (!spec) die('--with needs <name>=<path>, for example --with support-ticket-history=./tickets.csv');
    const name = spec.includes('=') ? spec.slice(0, spec.indexOf('=')) : spec;
    if (!name) die(`--with "${spec}" has no name before the "=".`);
    names.add(name);
  }
  return names;
};

// ── hosts ────────────────────────────────────────────────────────────────────────────────────
export const projectDir = (): string =>
  process.env.ATELIER_PROJECT_DIR ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

export function pickHost(): HostAdapter {
  const want = (flag('--host') ?? process.env.ATELIER_HOST ?? 'claude-code').toLowerCase();
  if (want === 'codex') return new CodexAdapter();
  if (want === 'claude-code') return new ClaudeCodeAdapter();
  return die(`unknown host "${want}". Available: claude-code, codex.`);
}

// ── session (one active run per data dir; a run is a study, not a session) ────────────────────
export interface Session {
  run: Run; skillName: string | null; evidence: ExpertEvidence | null;
  proposals: Requirement[]; decided: Requirement[];
  /** frozen at intake. Discovery must never read these; `reservedIds` is what the filter consults. */
  reservation?: Reservation | null;
  /**
   * APPEND-ONLY, and separate from `decided` on purpose.
   *
   * `decided` is the OUTCOME — what is in the standard now — and it is rewritten in place every time
   * a decision is submitted. That answers "what did the author keep" and cannot answer "what were
   * they shown, and what did they do about it", which is the only question that tells an approval
   * apart from an edit or a rejection apart from a proposal nobody surfaced. The module that records
   * that shipped with the first version and was called by nothing; this field is where it lands.
   */
  ledger?: RatificationLedger | null;
}

const SPATH = join(DATA, 'session.json');

export const loadSession = (): Session => existsSync(SPATH)
  ? JSON.parse(readFileSync(SPATH, 'utf8')) as Session
  : { run: newRun(sha(`${Date.now()}`)), skillName: null, evidence: null, proposals: [], decided: [], reservation: null };

export const saveSession = (s: Session): void => {
  mkdirSync(DATA, { recursive: true });
  writeAtomic(SPATH, JSON.stringify(s, null, 1));
};

/**
 * Where the evidence came from, recorded once and never rewritten.
 *
 * A user learning from someone ELSE's public work gets `PUBLIC_BEHAVIOUR_INFERRED`, which is capped
 * at USER_ADOPTED for the life of the rule. They may decide to use a behaviour; they cannot ratify it
 * as that author's standard, and the ceiling makes the second impossible rather than discouraged.
 *
 * Declared with a flag rather than guessed. Nothing about a folder of markdown says whose it is, and
 * a system that inferred authorship would be wrong in the direction that matters.
 */
export const sourceProvenance = (): 'MACHINE_DISCOVERED' | 'PUBLIC_BEHAVIOUR_INFERRED' =>
  (argv.includes('--public-source') || Boolean(flag('--source-author'))) ? 'PUBLIC_BEHAVIOUR_INFERRED' : 'MACHINE_DISCOVERED';

export const step = (s: Session, to: Run['state'], ctx: Parameters<typeof transition>[2] = {}): Session => {
  // A REFUSAL IS STILL A REFUSAL. Re-sealing a corpus and closing ratification twice are distinct
  // acts, not repeats, and blanket idempotency here silently permitted both — the guards exist
  // because the second one means something different from the first.
  //
  // What was wrong was the MESSAGE, not the refusal: "ILLEGAL_TRANSITION — CORPUS_SEALED ->
  // CORPUS_SEALED" is the state machine's vocabulary leaking into the primary entry point, and a
  // person reading it has no way to know a session file they were never told about is in the way.
  const t = transition(s.run, to, ctx);
  if (!t.ok) {
    die(`${t.detail}\n\n  This run is at "${s.run.state}" and cannot move to "${to}".`
      + `\n  Start over:      atelier abort   then run your command again`
      + `\n  See where it is: atelier status`);
  }
  return { ...s, run: (t as { run: Run }).run };
};
