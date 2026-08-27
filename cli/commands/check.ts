// cli/commands/check.ts — POINT IT AT A BACKEND AND FIND OUT, RATHER THAN ASSUMING.
//
// One command, one binding, one honest answer. It exists because the alternative — a table in a README
// listing every backend that speaks a compatible protocol — is a claim nobody checked, and a reader who
// finds one entry wrong stops believing the other five.
//
// It writes a capability profile to disk. The profile carries what was measured and, more importantly,
// what was not: no run of this command can establish that a model's TASTE DISCOVERY is any good, and
// the profile says so in the same breath as the passes.

import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { join } from 'node:path';
import { readJson } from '../../core/state/read-json.js';
import { runProviderConformance, describeProviderConformance } from '../../core/inference/provider-conformance.js';
import { supportStage, describeProfile, UNMEASURED, type ModelCapabilityProfile } from '../../core/inference/capability.js';
import { bindingHash } from '../../core/runtime/binding.js';
import { ATELIER_CLI_DELIVERY, describeMatrix, type Carrier } from '../../core/delivery/carrier-delivery.js';
import * as store from '../../core/state/store.js';
import { DATA, die, flag, argv, clientAndBinding, describeBinding, pickHost, type Role } from '../runtime.js';

const PROFILES = (): string => join(DATA, 'profiles');

/**
 * Run the suite against whatever is configured, and record what it found.
 *
 * `--role target` checks the runtime the compiled skill will be served through; the default checks the
 * one discovery will use. They are separate because they are separate decisions — a frontier model may
 * read the corpus while a local one runs the result, and each has to be reachable on its own.
 */
export async function check(): Promise<void> {
  // NOT a cast. `as Role` asserted that whatever the user typed is one of the two, which made the
  // guard on the next line unreachable to the compiler while remaining necessary at runtime — the
  // check was doing real work and reading as dead code. Validate, then narrow.
  const raw = flag('--role') ?? 'discovery';
  // `return die(...)` rather than a bare call: TypeScript only narrows past a never-returning
  // arrow when its result is used, so the bare form left `raw` unnarrowed and forced the cast back.
  if (raw !== 'discovery' && raw !== 'target') return die(`unknown --role "${raw}". Available: discovery, target.`);
  const role: Role = raw;

  const { client, binding } = clientAndBinding(role);
  console.log(`Checking the ${role} runtime — ${describeBinding(binding)}\n`);

  // The negative probe needs a client that will be given an impossible budget. Same configuration,
  // because a probe against a DIFFERENT binding would prove nothing about this one.
  const report = await runProviderConformance(client, describeBinding(binding), argv.includes('--no-negative-probe') ? undefined : client);
  console.log(describeProviderConformance(report));

  const passed = (id: string): boolean => report.probes.find((p) => p.id === id)?.outcome === 'PASS';
  const profile: ModelCapabilityProfile = {
    providerAdapter: binding.providerAdapter, backend: binding.backend, modelId: binding.requestedModel,
    static: {
      structuredOutput: [binding.structuredOutput],
      // Explicit per-block cache control exists on one protocol and not the other. Recorded as a fact
      // about the adapter, which is where it is known, rather than guessed from the model name.
      promptCaching: binding.providerAdapter === 'anthropic' ? 'EXPLICIT' : 'AUTOMATIC_PREFIX',
      reportsResolvedModel: report.reportedModel !== null,
      contextWindow: null,
    },
    empirical: {
      ...UNMEASURED,
      transport: passed('REQUEST_SUCCEEDS') ? 'TRANSPORT_VERIFIED' : 'FAILED',
      structure: passed('STRUCTURED_OBJECT_RETURNED') ? 'STRUCTURE_VERIFIED' : 'FAILED',
      // NOT MEASURED HERE, AND NOT INFERRED FROM THE ABOVE. Evidence anchoring and authority safety are
      // properties of a DISCOVERY run over a real corpus, which this command does not perform. Leaving
      // them UNKNOWN is the whole discipline: a clean protocol check says nothing about either.
      measuredAt: new Date().toISOString(),
      measuredOn: describeBinding(binding),
    },
  };

  mkdirSync(PROFILES(), { recursive: true });
  writeAtomic(join(PROFILES(), `${bindingHash(binding)}.json`), JSON.stringify(profile, null, 1));

  console.log(describeProfile(profile));
  console.log(`\nSupport stage: ${supportStage(profile)}`);
  console.log(`Recorded at ${join(PROFILES(), `${bindingHash(binding)}.json`)}\n`);
  if (!report.passed) die('this backend did not pass. Nothing was recorded as verified.');
}

/** Everything measured so far, so the README can be written from records rather than from memory. */
export function profiles(): void {
  const d = PROFILES();
  if (!existsSync(d)) { console.log('nothing checked yet. Try: atelier check --provider openai-compatible --model <id>'); return; }
  const all = readdirSync(d).filter((f) => f.endsWith('.json'))
    .map((f) => readJson<ModelCapabilityProfile>(join(d, f), { what: 'a model capability profile' }));
  if (!all.length) { console.log('nothing checked yet.'); return; }
  for (const p of all) {
    console.log(`${p.providerAdapter.padEnd(20)} ${p.backend.padEnd(34)} ${p.modelId.padEnd(30)} ${supportStage(p)}`);
  }
  console.log(`\nA stage is about ONE model on ONE backend, measured once, on the date in its record. It does not`);
  console.log(`generalise to another model on the same backend, or to another backend on the same protocol.`);
}


// ── CARRIERS ─────────────────────────────────────────────────────────────────────────────────
/**
 * Which carrier semantics reach a model, on each surface that can run this skill.
 *
 * Two surfaces, always shown together, because the difference between them IS the answer. Atelier
 * composes the request when you run `atelier invoke`, so it can hand a contract to the provider and
 * route examples into the payload. A host composing its own request cannot be handed anything, and the
 * honest report for what it cannot enforce is UNSUPPORTED — never a paragraph of prose standing in for
 * a schema.
 */
export function carriers(): void {
  const host = pickHost();
  const name = flag('--skill') ?? (argv[1]?.startsWith('--') ? undefined : argv[1]);
  const L = name ? { root: DATA, skillName: name } : null;

  let present: Carrier[] | undefined;
  if (L) {
    const active = store.getActive(L);
    const sv = active ? store.getSkillVersion(L, active) : null;
    const arch = sv ? store.getArchitecture(L, sv.architectureHash, sv.standardVersionHash) : null;
    if (arch) present = [...new Set(arch.components.map((c) => c.carrier))] as Carrier[];
    else console.log(`(no built skill named "${name}" — showing every carrier)\n`);
  }

  console.log(describeMatrix('atelier invoke — Atelier composes the request', ATELIER_CLI_DELIVERY, present));
  console.log();
  console.log(describeMatrix(`${host.detect().hostId} native — ${host.detect().hostId} composes the request`, host.carrierDelivery(), present));
  console.log(`\nNothing here is earned by a file existing. A DELIVERED row names the mechanism that puts the`);
  console.log(`carrier in front of the model, and a claim that names an artefact instead is refused at the type.`);
}
