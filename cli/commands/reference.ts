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

import { readFileSync, existsSync } from 'node:fs';
import * as store from '../../core/state/store.js';
import { isGeneralScope } from '../../core/state/canonical-state.js';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { scoreReference, LABELLING_INSTRUCTIONS, UNCERTAIN_HANDLING, scorePairedArms,
  type ReferencePair, type ReferenceLabel, type ReferenceJudgement, type Recognition } from '../../core/reference/reference-test.js';
import { PAIR_KINDS, armsRequiredBy, servedTextFor, armSetHash, MissingArmInput,
  type ArmId, type ArmInputs } from '../../core/reference/arms.js';
import { auditHoldout, type HoldoutCandidate } from '../../core/reference/holdout-integrity.js';
import { declareBuilderViewed } from '../../core/golden/reservation.js';
import type { Budget } from '../../core/inference/client.js';
import type { GoldenUnit } from '../../core/golden/golden-unit.js';
import { runOnce, spendOneWithResult } from './improve.js';
import { resolveServedSkill } from './invoke.js';
import type { Provenance } from '../../core/fidelity/provenance.js';
import { DATA, die, flag, argv, clientAndBinding, describeBinding, loadSession, saveSession, numericFlag } from '../runtime.js';

const PAIRS = (): string => join(DATA, 'reference-pairs.json');

/**
 * Which side carries the expert's work.
 *
 * Derived from a hash of the unit id rather than drawn at random, so the assignment is reproducible
 * from the record and a reviewer can verify it was not chosen after the labels came in. It is not
 * meant to be unguessable — it is meant to be FIXED BEFORE the generation and auditable afterwards.
 */
// Keyed by PAIR KIND as well as unit, so each comparison of the same context gets an independent
// assignment. Without the pair kind, every pair on one unit would land the same way round and a rater
// who noticed the pattern once would carry it through the whole sheet.
const sideFor = (pairKind: string, unitId: string, salt: string): 'A' | 'B' =>
  (parseInt(createHash('sha256').update(`${salt}:${pairKind}:${unitId}`).digest('hex').slice(0, 8), 16) % 2 === 0 ? 'A' : 'B');


/**
 * The corpus discovery read, for the arm that pastes it into the prompt.
 *
 * Deliberately the SAME files, excluding the reserve, because the whole question this arm answers is
 * whether compiling that material beats simply showing it. Reading a different set would compare two
 * things at once.
 */
function corpusTextForBaseline(): string {
  const manifest = join(DATA, 'corpus-paths.json');
  if (!existsSync(manifest)) {
    die('no corpus manifest — this run has no record of which files discovery read, so the '
      + 'paste-the-work baseline cannot be built from the same material.');
  }
  const files = JSON.parse(readFileSync(manifest, 'utf8')) as { id: string; path: string }[];
  return files.map((f) => `--- ${f.id} ---\n${readFileSync(f.path, 'utf8')}`).join('\n\n');
}

/**
 * The ratified requirements as flat prose. No carriers, no anchored examples, no output contract.
 *
 * This is the arm that isolates the compiler from the standard it compiled: same rules, none of the
 * machinery that decides how each one reaches the model.
 */
function standardAsProse(L: store.StoreLayout, standardVersionHash: string): string {
  const sd = store.getStandard(L, standardVersionHash) ?? die(`standard ${standardVersionHash} is missing from the store.`);
  const lines = sd.requirements.map((r) => (!isGeneralScope(r.appliesWhen)
    ? `- ${r.statement} (when: ${r.appliesWhen})`
    : `- ${r.statement}`));
  return `Follow these rules.\n\n${lines.join('\n')}`;
}

export async function reference(): Promise<void> {
  if (flag('--declare-viewed')) { declareViewed(); return Promise.resolve(); }
  if (argv.includes('--score')) { scorePhase(); return Promise.resolve(); }
  return preparePhase();
}

/**
 * Record that the builder has read one or more held-out units, and refuse them from then on.
 *
 * There is no undo. A unit whose reference the builder has seen cannot become clean again by anyone
 * changing their mind about how much they remember, and an undo here would be a button for exactly
 * that.
 */
function declareViewed(): void {
  const ids = (flag('--declare-viewed') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!ids.length) die('--declare-viewed <unitId,unitId> — name the held-out units you have read.');
  const s = loadSession();
  const r = s.reservation ?? die('nothing is reserved in this run, so there is no held-out set to declare against.');

  const known = new Set(r.reserved.map((u) => u.unitId));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) {
    die(`not in the held-out set: ${unknown.join(', ')}\n`
      + `  reserved here: ${r.reserved.map((u) => u.unitId).join(', ') || '(none)'}`);
  }

  const reserved = declareBuilderViewed(r.reserved, ids);
  saveSession({ ...s, reservation: { ...r, reserved } });
  console.log(`Recorded BUILDER_VIEWED on ${ids.length} unit(s): ${ids.join(', ')}`);
  console.log('  They are contaminated from now on and `reference` will refuse to spend on them.');
  console.log('  This cannot be undone, which is the only handling that means anything.');
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

  // ── THE HOLDOUT IS AUDITED BEFORE A CENT IS SPENT ──────────────────────────────────────────────
  //
  // The audit runs from the RECORD of what consumed each unit, not from anyone's judgement about how
  // much they remember. That ordering is the whole point: an audit run after seeing which units would
  // be convenient is not an audit, and the temptation to reconstruct one arrives exactly when n is
  // too small.
  const candidates: HoldoutCandidate[] = reserved.map((u) => ({
    itemId: u.unitId,
    path: u.provenance.sourceRef,
    consumedBy: u.provenance.consumedBy,
    taskReusableUnderFrozenSplit: true,
  }));
  const audit = auditHoldout(candidates, s.reservation?.bar ?? 0.15);
  if (audit.contaminated.length) {
    die(`${audit.contaminated.length} held-out unit(s) are contaminated and cannot carry a comparison:\n`
      + audit.contaminated.map((c) => `  ${c.item.itemId}: ${c.why}`).join('\n')
      + '\n  Nothing was generated. A comparison against material that shaped the skill measures the '
      + 'skill against its own source.');
  }
  if (!audit.sufficient) {
    console.log(`\n  ${audit.terminal}: ${audit.why}\n`);
  }

  const { L, sv, servedText, servedHash, contractFile, delivery } = resolveServedSkill(name);

  // ── THE ARM SET IS FIXED HERE, AND THE BUDGET IS CHECKED AGAINST IT BEFORE ANYTHING IS SPENT ────
  //
  // A partial arm set is worse than no run. The missing arm leaves no trace in the output, so a
  // truncated run reads exactly like a complete one that happened to favour us. That is why this
  // refuses on budget rather than generating what it can afford.
  const arms: readonly ArmId[] = armsRequiredBy(PAIR_KINDS);
  const onePagerPath = flag('--one-pager');
  const inputs: ArmInputs = {
    compiledSkillText: servedText,
    corpusText: corpusTextForBaseline(),
    standardAsProse: standardAsProse(L, sv.standardVersionHash),
    // Written by a model reading the corpus. One call, and it is inside the budget rather than free.
    modelStyleGuide: null,
    expertOnePager: onePagerPath ? readFileSync(onePagerPath, 'utf8') : null,
  };

  const perUnit = arms.length;
  const projected = reserved.length * perUnit + 2;
  const cap = numericFlag('--cap', 2.0);
  console.log(`${arms.length} arm(s) x ${reserved.length} held-out unit(s) = ${reserved.length * perUnit} generation(s), plus 1 to write the baseline guide.`);
  console.log(`  arms: ${arms.join(', ')}`);

  const budget: Budget = { spentUsd: 0, capUsd: cap, maxCalls: projected };
  const { client, binding } = clientAndBinding('target');

  // The guide arm has to exist before the loop, because it is one input reused across every unit.
  if (arms.includes('B2_MODEL_STYLE_GUIDE')) {
    const guide = await spendOneWithResult(client, budget,
      'Read the following body of work by one author and write a short guide a writer could follow to '
      + 'produce more work like it. Rules only, no preamble.',
      inputs.corpusText, null);
    (inputs as { modelStyleGuide: string | null }).modelStyleGuide = guide.piece;
    console.log('  baseline guide written');
  }

  // Refuse now, while nothing has been generated, if an arm cannot be served at all.
  for (const a of arms) {
    try { servedTextFor(a, inputs); } catch (e) {
      if (e instanceof MissingArmInput) die(`${a}: ${e.message}`);
      throw e;
    }
  }

  console.log(`\nGenerating with ${describeBinding(binding)}.`);
  console.log('The expert\'s own work is the reference. It is NOT sent to the model.\n');

  const provenance: Provenance = 'ORGANIC_USE';
  const salt = sv.skillVersionHash;

  // arm -> unitId -> output
  const outputs = new Map<ArmId, Map<string, string>>();
  for (const a of arms) {
    const byUnit = new Map<string, string>();
    for (const u of reserved) {
      const rec = await runOnce(L, sv, servedTextFor(a, inputs), servedHash, delivery, u.task, client,
        budget, binding, provenance, a === 'T_ATELIER' ? contractFile : null);
      byUnit.set(u.unitId, rec.output);
    }
    outputs.set(a, byUnit);
    console.log(`  ${a} ready across ${reserved.length} unit(s)`);
  }

  const textFor = (side: ArmId | 'GOLDEN', u: GoldenUnit): string =>
    (side === 'GOLDEN' ? u.artifact : (outputs.get(side)?.get(u.unitId) ?? die(`no output for ${side}/${u.unitId}`)));

  const pairs: ReferencePair[] = [];
  for (const kind of PAIR_KINDS) {
    for (const u of reserved) {
      const leftOnA = sideFor(kind.id, u.unitId, salt) === 'A';
      pairs.push({
        contextId: `${kind.id}::${u.unitId}`,
        task: u.task,
        goldenSide: leftOnA ? 'A' : 'B',
        aText: leftOnA ? textFor(kind.left, u) : textFor(kind.right, u),
        bText: leftOnA ? textFor(kind.right, u) : textFor(kind.left, u),
      });
    }
  }

  const setHash = armSetHash(arms, sv.skillVersionHash);
  writeAtomic(PAIRS(), JSON.stringify({ skillVersionHash: sv.skillVersionHash, salt, armSetHash: setHash, arms, pairs }, null, 1));

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
  const stored = JSON.parse(readFileSync(PAIRS(), 'utf8')) as {
    skillVersionHash: string; armSetHash?: string; arms?: ArmId[]; pairs: ReferencePair[] };

  // ── LABELS BELONG TO THE ARM SET THEY WERE COLLECTED ON ────────────────────────────────────────
  //
  // Re-preparing with a different arm set and scoring with the old labels would silently mix two
  // comparisons. The hash is over the SET and the skill version, so either changing refuses here
  // rather than producing a number nobody can attribute.
  const expected = flag('--arm-set');
  if (expected && stored.armSetHash && expected !== stored.armSetHash) {
    die(`these labels were collected on arm set ${expected}, and the prepared pairs are ${stored.armSetHash}. `
      + 'Scoring across two arm sets would report a comparison that never ran. Re-prepare, or score the run these pairs belong to.');
  }
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
  // `Number(x) || fallback` in a file that imports `numericFlag` to avoid exactly this: `--required-n 0`
  // is falsy and would silently become the reservation's own n, which is the opposite of asking for no
  // requirement at all.
  const requiredN = numericFlag('--required-n', s.reservation?.reservedClaimUnits ?? stored.pairs.length);

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
  reportPairedArms(stored, labels);

  if (r.decision === 'HELD_OUT_REFERENCE_NONINFERIORITY_ESTABLISHED') {
    console.log('\n  This is product validation for THIS author and THIS corpus. It is not absolute fidelity,');
    console.log('  it does not qualify any autonomous sensor, and it does not make PROMOTE reachable without');
    console.log('  the expert.');
  }
}

/**
 * Every comparison the run prepared, scored as a paired test.
 *
 * The primary is printed first and labelled, because the whole reason the arm set is an enum is that
 * the comparison most likely to be skipped is the one that decides the product.
 */
function reportPairedArms(
  stored: { armSetHash?: string; arms?: ArmId[]; pairs: ReferencePair[] },
  labels: readonly ReferenceLabel[],
): void {
  if (!stored.armSetHash) return;   // a run prepared before arms existed
  const byId = new Map(labels.map((l) => [l.contextId, l]));

  console.log(`\n${'─'.repeat(78)}\n  ARM COMPARISONS   arm set ${stored.armSetHash}   (${(stored.arms ?? []).join(', ')})`);
  for (const kind of PAIR_KINDS) {
    const mine = stored.pairs.filter((p) => p.contextId.startsWith(`${kind.id}::`));
    if (!mine.length) continue;
    let leftWins = 0; let rightWins = 0; let concordant = 0;
    for (const p of mine) {
      const l = byId.get(p.contextId);
      if (!l || l.judgement === 'UNCERTAIN' || l.judgement === 'NO_MATERIAL_DIFFERENCE') { concordant += 1; continue; }
      // goldenSide records which side carries the pair's LEFT arm, not the golden, once a pair kind
      // has two generated arms. The field name is inherited; the meaning is "left is on this side".
      const leftWon = (l.judgement === 'A_BETTER') === (p.goldenSide === 'A');
      if (leftWon) leftWins += 1; else rightWins += 1;
    }
    const r = scorePairedArms(kind.id, leftWins, rightWins, concordant);
    const tag = kind.primary ? 'PRIMARY  ' : '         ';
    console.log(`\n  ${tag}${kind.left} vs ${kind.right}`);
    console.log(`           ${kind.answers}`);
    console.log(`           ${r.leftWins} : ${r.rightWins} on ${r.leftWins + r.rightWins} discordant of ${r.n} scored`);
    console.log(r.resolves
      ? `           exact McNemar p = ${r.p.toFixed(4)}`
      : "           too few discordant pairs to resolve; no p reported");
  }
  console.log('─'.repeat(78));
}
