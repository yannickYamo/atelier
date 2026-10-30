#!/usr/bin/env -S npx tsx
// scripts/carrier-acceptance.mts — THE FIXTURE THAT MAKES THE CARRIER MATRIX FALSIFIABLE.
//
// Everything Atelier says about carrier delivery is, so far, a claim it makes about itself. Three of
// the four carriers are pinned by tests that capture the actual inference request, which settles them
// for `atelier invoke`. The fourth surface — a host composing its own request — cannot be settled from
// inside this repository at all. Somebody has to run it and look.
//
// So this builds one standard containing one rule of each carrier, installs it for a host, and prints
// what to check in a real session. It makes NO inference calls and needs no key: compiling and
// installing is the whole job, and the observation is a person's.
//
// Run:  npm run acceptance:carriers -- --host codex [--dir <path>]

import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { componentFor, type SkillArchitecture } from '../core/architecture/compile.js';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';
import { describeMatrix, ATELIER_CLI_DELIVERY, type Carrier } from '../core/delivery/carrier-delivery.js';
import { ClaudeCodeAdapter } from '../adapters/claude-code/adapter.js';
import { CodexAdapter } from '../adapters/codex/adapter.js';
import type { StandardVersion, Requirement } from '../core/state/canonical-state.js';

const arg = (f: string): string | undefined => {
  const i = process.argv.indexOf(f);
  return i === -1 ? undefined : process.argv[i + 1];
};

const r = (o: Partial<Requirement> & { requirementId: string; statement: string }): Requirement => ({
  appliesWhen: 'GENERAL', kind: 'GENERATIVE', authority: 'EXPERT_RATIFIED', provenance: 'MACHINE_DISCOVERED',
  evidence: 'a verbatim line from the corpus', evidenceItemId: 'fixture-01.md',
  wouldBeAbsentIf: null, materiality: null, realizationTolerance: null, outputShape: null, ...o,
});

// One rule per carrier, and each one lands on its carrier because of what the AUTHOR declared about it
// — never because the fixture asked for a carrier directly. Materiality is the input; carrier is the
// compiler's conclusion, and a fixture that set carriers by hand would be testing nothing.
const REQUIREMENTS: Requirement[] = [
  r({ requirementId: 'c1', statement: 'Open on the decision, not on the background.',
    materiality: 'REQUIRED' }),                                       // → PROSE
  r({ requirementId: 'c2', statement: 'Do not hedge a recommendation you have evidence for.',
    kind: 'BOUNDARY', authority: 'DERIVED_UNRATIFIED', materiality: 'REQUIRED' }), // → SELF_CHECK
  r({ requirementId: 'c3', statement: 'Name the trade-off in the same paragraph as the recommendation.',
    appliesWhen: 'the reader must choose between two options', materiality: 'PREFERRED' }), // → EXAMPLE
  r({ requirementId: 'c4', statement: 'Every analysis ends with a verdict and a confidence.',
    materiality: 'REQUIRED',
    outputShape: { verdict: { type: 'string' }, confidence: { type: 'number' } } }), // → OUTPUT_CONTRACT
];

const v: StandardVersion = {
  standardVersionHash: 'fixture-sv1', evidenceId: 'fixture-ev1', workType: 'analysis',
  requirements: REQUIREMENTS, authorityState: 'RATIFIED', mintedAt: '2026-08-23T00:00:00Z',
  supersedes: null, reason: null,
};
const arch: SkillArchitecture = {
  architectureHash: 'fixture-ar1', standardVersionHash: v.standardVersionHash,
  components: REQUIREMENTS.map(componentFor),
};
const pkg = renderAgentSkill(v, arch, 'carrier-fixture', 'One rule per carrier, for acceptance testing.');

const wanted = (arg('--host') ?? 'codex').toLowerCase();
const host = wanted === 'claude-code' ? new ClaudeCodeAdapter() : wanted === 'codex' ? new CodexAdapter() : null;
if (!host) { console.error(`unknown --host "${wanted}". Available: codex, claude-code.`); process.exit(1); }

const dir = arg('--dir') ?? mkdtempSync(join(tmpdir(), 'atelier-acceptance-'));
const inst = host.install(pkg, dir);
if (!inst.ok) { console.error(`install failed: ${inst.reason}`); process.exit(1); }

console.log(`\nCarrier acceptance fixture — one rule per carrier\n`);
for (const c of arch.components) {
  console.log(`  ${c.carries.join(',').padEnd(4)} ${c.carrier.padEnd(16)} ${c.gateRole.padEnd(8)} ${REQUIREMENTS.find((x) => x.requirementId === c.carries[0])!.statement}`);
}
console.log(`\nInstalled for ${host.detect().hostId} at ${inst.installedAt}`);
console.log(`Runtime files: ${Object.keys(pkg.runtime).sort().join(', ')}`);

const present = [...new Set(arch.components.map((c) => c.carrier))] as Carrier[];
console.log(`\n${describeMatrix('atelier invoke', ATELIER_CLI_DELIVERY, present)}`);
console.log(describeMatrix(`${host.detect().hostId} native`, host.carrierDelivery(), present));

console.log(`
WHAT TO OBSERVE, in a real ${host.detect().hostId} session
──────────────────────────────────────────────────────────
Open a session with ${dir} as the project directory and run:

    ${host.invocationHint('carrier-fixture').replace(/<[^>]*>/, '').trim()} Compare two pricing models for a seed-stage API company.

Then check each carrier SEPARATELY. The point is not whether the output is good — it is which of the
four rules demonstrably shaped it.

  c1  PROSE            expect the piece to open on the decision. If it opens on background, the
                       instruction did not land and PROSE is not delivered here after all.

  c2  SELF_CHECK       expect a short note AFTER the draft saying whether it hedged. Absent means the
                       post-draft pass is not running.

  c3  EXAMPLE          this one is the open question. It applies only when the reader must choose
                       between two options, which the task above triggers. Watch whether the session
                       READS examples/c3.md. If it does, EXAMPLE moves from REFERENCED to DELIVERED
                       for this host and the matrix above should be updated with that evidence.

  c4  OUTPUT_CONTRACT  expect this to FAIL, and that is the correct result. The host composes its own
                       request and Atelier cannot supply a schema. Do not read a passing verdict here
                       as success — a model that happens to end with a verdict has not been constrained
                       to, and next time it will not.

Then run the same task through the surface that does own the request:

    atelier invoke --skill carrier-fixture "Compare two pricing models for a seed-stage API company."

There c4 is a hard schema, and the invocation record carries the hash of the schema the provider
actually received.
`);
