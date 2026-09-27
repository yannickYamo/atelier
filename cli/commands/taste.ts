// cli/commands/taste.ts — THE TASTE READER: READINGS, WHAT THEY HAVE EARNED, AND THE OWNER'S LABELS.
//
//   atelier taste --skill <name>                    what each reading-based rule's reader has earned, and coverage
//   atelier taste --skill <name> --read <file>      read any text against the reading-based rules
//   atelier taste --skill <name> --calibrate        label readings, blind to the reader's verdict (a terminal)
//   atelier taste --skill <name> --list             the readings waiting for a label, each with a token
//   atelier taste --skill <name> --label <token>=followed|missed|unsure ...   label from the list (scripts)
//
// Design and pre-registered bars: docs/TASTE.md. The reader (core/taste/reader.ts) reports; what its
// readings may do is computed from the owner's labels (core/taste/calibration.ts).

import { readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import * as store from '../../core/state/store.js';
import type { StandardVersion } from '../../core/state/canonical-state.js';
import { readTaste, tasteRules, describeTaste, actsAsMiss, type TasteReading } from '../../core/taste/reader.js';
import { tastePermissions, calibrationQueue, statementHash, passageAround, heldBack, HOLDBACK, type TastePermissions, type OwnerLabel } from '../../core/taste/calibration.js';
import { coverageOf, describeCoverage } from '../../core/taste/dimensions.js';
import type { Budget } from '../../core/inference/client.js';
import { sha, DATA, die, argv, flag, flagAll, numericFlag, skillArg, clientFor, diagnoserModel, hasModelFor, modelFor } from '../runtime.js';

/**
 * The model the reader runs on: its own setting, else the discovery model, else (when the discovery
 * runtime has no model, e.g. a local provider named only for the target) the target model.
 * Permissions are scoped to it, so changing it starts calibration again.
 */
export const readerModel = (): string => flag('--reader-model') ?? process.env.ATELIER_READER_MODEL
  ?? (hasModelFor('discovery') ? diagnoserModel() : modelFor('target'));

/** The share of readings held back for calibration: ATELIER_TASTE_HOLDBACK, else a third. */
const holdbackShare = (): number => {
  const x = Number(process.env.ATELIER_TASTE_HOLDBACK);
  return process.env.ATELIER_TASTE_HOLDBACK !== undefined && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : HOLDBACK;
};

export interface RecordedTaste {
  readonly readings: readonly TasteReading[];
  readonly permissions: TastePermissions;
  /** held back for calibration: act on it, but show no verdicts (core/taste/calibration.ts `heldBack`) */
  readonly held: boolean;
}

/**
 * Read a text, record the reading, and return it with what the reader has earned.
 *
 * Every reading is a TASTE_READING event, for calibration. Only a reading of the skill's own output (an
 * invocation) that the reader has the authority to act on also becomes a behavioural observation for the
 * convergence loop: an OBSERVE-only verdict is a report, and a reading of someone else's text (verify,
 * `--read`, MCP) is not evidence about what this skill does.
 */
export async function recordTaste(L: store.StoreLayout, v: StandardVersion, text: string, task: string | null,
  invocationId: string | null, budget: Budget,
  /** readings already taken of exactly this text (by a taste repair), recorded instead of reading again */
  taken: readonly TasteReading[] | null = null): Promise<RecordedTaste> {
  const model = readerModel();
  const rules = tasteRules(v);
  const permissions = tastePermissions(rules, store.readEvents(L), model);
  if (!rules.length) return { readings: [], permissions, held: false };
  const readings = taken ?? await readTaste(clientFor(model), budget, v, text, task);
  const at = new Date().toISOString();
  const readingId = sha(`${v.standardVersionHash}|${sha(text)}|${at}`);
  const held = heldBack(readingId, holdbackShare());
  const hashOf = new Map(rules.map(({ rule, key }) => [key, statementHash(rule)]));
  store.appendEvent(L, { kind: 'TASTE_READING', readingId, invocationId, standardVersionHash: v.standardVersionHash, readerModel: model, at, blind: held,
    readings: readings.map((r) => ({ ...r, statementHash: hashOf.get(r.key) ?? '', ...(r.quote ? { passage: passageAround(text, r.quote) } : {}) })) });
  if (invocationId) {
    for (const r of readings) {
      const acts = permissions.veto.has(r.key) && (r.verdict === 'FOLLOWED' || actsAsMiss(r));
      if (!acts) continue;
      store.putObservation(L, { requirementId: r.requirementId, domain: 'BEHAVIOR', contextId: sha(task ?? text), invocationId,
        generationIndex: 0, verdict: r.verdict, producer: 'taste-reader', producerVersion: model, authority: 'VETO_QUALIFIED',
        evidence: { quote: r.quote ?? null, kind: r.kind ?? null, why: r.why }, at });
    }
  }
  return { readings, permissions, held };
}

export async function taste(): Promise<void> {
  const name = skillArg();
  const L: store.StoreLayout = { root: DATA, skillName: name };
  const active = store.getActive(L) ?? die(`no built skill called "${name}".`);
  const sv = store.getSkillVersion(L, active) ?? die(`skill version ${active} is missing.`);
  const v = store.getStandard(L, sv.standardVersionHash) ?? die(`standard ${sv.standardVersionHash} is missing.`);
  const model = readerModel();
  const rules = tasteRules(v);
  const byId = new Map(v.requirements.map((r) => [r.requirementId, r]));

  const file = flag('--read');
  if (file) {
    if (!existsSync(file)) die(`--read: there is no file at ${file}.`);
    const budget: Budget = { spentUsd: 0, capUsd: numericFlag('--cap', 1), maxCalls: 3 };
    const { readings, permissions, held } = await recordTaste(L, v, readFileSync(file, 'utf8'), flag('--task') ?? null, null, budget);
    console.log(describeTaste(readings, byId, permissions.veto, held));
    console.log(`(${budget.calls ?? 0} model call(s), $${budget.spentUsd.toFixed(3)}, reader ${model})`);
    return;
  }

  const labels = flagAll('--label');
  if (labels.length || argv.includes('--list') || argv.includes('--calibrate')) {
    const queue = calibrationQueue(rules, store.readEvents(L), model);
    const record = (q: (typeof queue)[number], label: OwnerLabel): void => {
      store.appendEvent(L, { kind: 'TASTE_LABEL', readingId: q.readingId, key: q.key, statementHash: q.statementHash, label, at: new Date().toISOString() });
    };
    if (labels.length) {
      // By token, never by position: a position shifts as soon as anything above it is labelled.
      const byToken = new Map(queue.map((q) => [q.token, q]));
      const seen = new Set<string>();
      const parsed = labels.map((kv) => {
        const at = kv.lastIndexOf('=');
        const token = at > 0 ? kv.slice(0, at) : '';
        const label = ({ followed: 'FOLLOWED', missed: 'MISSED', broken: 'MISSED', unsure: 'UNSURE' } as Record<string, OwnerLabel | undefined>)[kv.slice(at + 1).toLowerCase()];
        if (!label || !token) die(`--label takes <token>=followed|missed|unsure (the token from --list); got "${kv}".`);
        if (seen.has(token)) die(`--label: ${token} is labelled twice in one command. Nothing was recorded.`);
        seen.add(token);
        return { q: byToken.get(token) ?? die(`--label: nothing waiting under ${token} (already labelled, or not in: atelier taste --skill ${name} --list). Nothing was recorded.`), label: label! };
      });
      for (const { q, label } of parsed) record(q, label);
      console.log(`${parsed.length} label(s) recorded.`);
    } else if (argv.includes('--list')) {
      if (!queue.length) console.log('Nothing waiting for a label. A share of readings is held back for this on every invoke, verify --taste or --read.');
      for (const q of queue) console.log(`${q.token}  ${q.rule.requirementId}: ${q.rule.statement.slice(0, 100)}\n   ${q.passage.replace(/\s+/g, ' ').slice(0, 300)}\n`);
      return;
    } else {
      if (!process.stdin.isTTY) die('--calibrate asks in a terminal. From a script: --list, then --label <token>=followed|missed|unsure.');
      if (!queue.length) { console.log('Nothing waiting for a label. A share of readings is held back for this on every invoke, verify --taste or --read.'); return; }
      console.log('For each: does this passage follow the rule? You will not be shown what the reader thought.\n  f = followed · m = missed (broken here) · u = can\'t tell · q = stop\n');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        for (const [i, q] of queue.entries()) {
          console.log(`\n${i + 1}/${queue.length}  RULE ${q.rule.requirementId}: ${q.rule.statement}\n\n${q.passage}\n`);
          const a = (await rl.question('f / m / u / q: ')).trim().toLowerCase();
          if (a === 'q') break;
          const label = a === 'f' ? 'FOLLOWED' : a === 'm' ? 'MISSED' : a === 'u' ? 'UNSURE' : null;
          if (label) record(q, label);
        }
      } finally { rl.close(); }
    }
  }

  // ── Where it stands ──────────────────────────────────────────────────────────────────────────
  const p = tastePermissions(rules, store.readEvents(L), model);
  console.log(`Taste reader for ${name}  ·  model ${model}  ·  ${rules.length} reading-based rule(s)`);
  console.log(`  pooled: ${p.pooled.falseBlocks} wrong of ${p.pooled.trials} labelled misses (upper bound ${Math.round(p.pooled.upper95 * 100)}%, bar 15%) → ${p.pooled.earned ? 'VETO earned' : 'OBSERVE'}`);
  for (const { rule, key } of rules) {
    const r = p.rules.get(key)!;
    console.log(`  ${rule.requirementId.padEnd(4)} ${r.permission.padEnd(7)} ${r.why.padEnd(46).slice(0, 46)}  ${rule.statement.slice(0, 60)}`);
  }
  console.log(`\nWhat the standard covers:\n${describeCoverage(coverageOf(v.requirements))}`);
  const waiting = calibrationQueue(rules, store.readEvents(L), model).length;
  console.log(waiting ? `\n${waiting} reading(s) waiting for your label: atelier taste --skill ${name} --calibrate` : '\nNo readings waiting for a label.');
}
