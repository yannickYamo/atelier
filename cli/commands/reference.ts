// cli/commands/reference.ts — THE HELD-OUT EXPERT REFERENCE TEST, MADE ASKABLE.
//
// `core/reference/reference-test.ts` is the system-level endpoint: the expert's own held-out work
// against the compiled skill's attempt at the same task, judged blind by the expert. It shipped with
// the scoring, the conservative UNCERTAIN rule, the recognition diagnostic and the UNDERPOWERED
// verdict already written, and it was reachable from nothing but its own tests.
//
// So the corpus could be reserved — `atelier create --reserve` works and holds pieces back before
// discovery reads them — and there was no command that could ever spend that reserve. The README asks
// contributors to "run the resulting skill on work it has not seen"; this is that command.
//
// TWO PHASES, AND THE SPLIT IS THE INSTRUMENT. `prepare` generates and SEALS a side assignment it
// does not reveal; `score` unblinds. One command that did both would let the person scoring see which
// side was theirs, and a result obtained that way is a different result.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { scoreReference, LABELLING_INSTRUCTIONS, UNCERTAIN_HANDLING,
  type ReferencePair, type ReferenceLabel, type ReferenceJudgement, type Recognition } from '../../core/reference/reference-test.js';
import type { Budget } from '../../core/inference/client.js';
import type { GoldenUnit } from '../../core/golden/golden-unit.js';
import { runOnce } from './improve.js';
import { resolveServedSkill } from './invoke.js';
import { resolveProvenance } from '../../core/fidelity/provenance.js';
import { DATA, die, flag, argv, clientAndBinding, describeBinding, loadSession , numericFlag} from '../runtime.js';

const PAIRS = (): string => join(DATA, 'reference-pairs.json');

/**
 * Which side carries the expert's work.
 *
 * Derived from a hash of the unit id rather than drawn at random, so the assignment is reproducible
 * from the record and a reviewer can verify it was not chosen after the labels came in. It is not
 * meant to be unguessable — it is meant to be FIXED BEFORE the generation and auditable afterwards.
 */
const sideFor = (unitId: string, salt: string): 'A' | 'B' =>
  (parseInt(createHash('sha256').update(`${salt}:${unitId}`).digest('hex').slice(0, 8), 16) % 2 === 0 ? 'A' : 'B');

export async function reference(): Promise<void> {
  if (argv.includes('--score')) { scorePhase(); return; }
  return preparePhase();
}

async function preparePhase(): Promise<void> {
  const name = flag('--skill') ?? die('usage: atelier reference --skill <name>   (then: --score --labels <json>)');
  const s = loadSession();
  const reserved: readonly GoldenUnit[] = s.reservation?.reserved ?? [];
  if (!reserved.length) {
    die('nothing was reserved, so there is no held-out work to test against.\n'
      + '  A reserve has to be taken BEFORE discovery reads the corpus; one chosen now would be evidence\n'
      + '  the standard was already built from.\n'
      + '  Start a run with:  atelier create <path> --reserve <file> [--reserve <file> ...]');
  }

  const { L, sv, servedText, servedHash, contractFile, delivery } = resolveServedSkill(name);
  const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 2.0), maxCalls: reserved.length + 2 };
  const { client, binding } = clientAndBinding('target');
  console.log(`Generating ${reserved.length} held-out attempt(s) with ${describeBinding(binding)}.`);
  console.log('The expert\'s own work is the reference. It is NOT sent to the model.\n');

  const salt = sv.skillVersionHash;
  const pairs: ReferencePair[] = [];
  for (const u of reserved) {
    const rec = await runOnce(L, sv, servedText, servedHash, delivery, u.task, client, budget, binding,
      resolveProvenance('HELD_OUT_REFERENCE', process.env), contractFile);
    const goldenSide = sideFor(u.unitId, salt);
    pairs.push({ contextId: u.unitId, task: u.task,
      goldenSide,
      aText: goldenSide === 'A' ? u.artifact : rec.output,
      bText: goldenSide === 'A' ? rec.output : u.artifact });
    console.log(`  ${u.unitId} ready`);
  }

  writeFileSync(PAIRS(), JSON.stringify({ skillVersionHash: sv.skillVersionHash, salt, pairs }, null, 1));

  console.log(`\n${'─'.repeat(78)}\n${LABELLING_INSTRUCTIONS}\n${'─'.repeat(78)}`);
  for (const p of pairs) {
    console.log(`\n\n### ${p.contextId}\n\nTASK\n${p.task}\n\n--- A ---\n${p.aText}\n\n--- B ---\n${p.bText}`);
  }
  console.log(`\n${'─'.repeat(78)}`);
  console.log(`${pairs.length} pair(s) at ${PAIRS()}. Which side is yours is recorded there and NOT shown above.`);
  console.log('When you have answered every one:');
  console.log(`  atelier reference --score --labels '[{"contextId":"${pairs[0].contextId}","judgement":"A_BETTER","recognizedOriginal":"NO"}]'`);
  console.log(`  spent $${budget.spentUsd.toFixed(4)}`);
}

function scorePhase(): void {
  if (!existsSync(PAIRS())) die(`no prepared pairs at ${PAIRS()}. Run \`atelier reference --skill <name>\` first.`);
  const stored = JSON.parse(readFileSync(PAIRS(), 'utf8')) as { skillVersionHash: string; pairs: ReferencePair[] };
  const raw = flag('--labels') ?? die('--labels <json> required — array of {contextId, judgement, recognizedOriginal}');
  let labels: ReferenceLabel[];
  try { labels = JSON.parse(raw) as ReferenceLabel[]; } catch { return void die('--labels is not valid JSON.'); }

  const J: ReferenceJudgement[] = ['A_BETTER', 'B_BETTER', 'NO_MATERIAL_DIFFERENCE', 'UNCERTAIN'];
  const R: Recognition[] = ['YES', 'NO', 'UNSURE'];
  for (const l of labels) {
    if (!J.includes(l.judgement)) die(`${l.contextId}: judgement must be one of ${J.join(' / ')}`);
    if (!R.includes(l.recognizedOriginal)) die(`${l.contextId}: recognizedOriginal must be one of ${R.join(' / ')}`);
  }

  // The bar and the required n belong to the reservation, which fixed them before any generation.
  const s = loadSession();
  const bar = s.reservation?.bar ?? 0.15;
  const requiredN = Number(flag('--required-n')) || (s.reservation?.reservedClaimUnits ?? stored.pairs.length);

  const r = scoreReference(stored.pairs, labels, bar, requiredN);

  console.log(`\n${r.decision}`);
  console.log(`  ${r.why}\n`);
  for (const o of r.outcomes) console.log(`  ${o.contextId.padEnd(28)} ${o.outcome.padEnd(26)} recognised: ${o.recognized}`);
  console.log(`\n  ${r.failures} failure(s) of ${r.n}  ·  95% upper bound ${(r.upperBound95 * 100).toFixed(0)}%  ·  bar ${(r.bar * 100).toFixed(0)}%`);
  console.log(`  UNCERTAIN handling: ${UNCERTAIN_HANDLING.rule}`);
  if (r.nonRecognized) {
    console.log(`  among the ${r.nonRecognized.n} they did NOT recognise: ${r.nonRecognized.failures} failure(s), bound ${(r.nonRecognized.upperBound95 * 100).toFixed(0)}%`);
  } else {
    console.log('  too few unrecognised pairs to report that subgroup separately.');
  }
  if (r.decision === 'HELD_OUT_REFERENCE_NONINFERIORITY_ESTABLISHED') {
    console.log('\n  This is product validation for THIS author and THIS corpus. It is not absolute fidelity,');
    console.log('  it does not qualify any autonomous sensor, and it does not make PROMOTE reachable without');
    console.log('  the expert.');
  }
}
