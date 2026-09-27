// cli/commands/taste.ts — THE TASTE READER: READINGS, WHAT THEY HAVE EARNED, AND THE OWNER'S LABELS.
//
//   atelier taste --skill <name>                    what each reading-based rule's reader has earned, and coverage
//   atelier taste --skill <name> --read <file>      read any text against the reading-based rules
//   atelier taste --skill <name> --calibrate        label readings, blind to the reader's verdict (a terminal)
//   atelier taste --skill <name> --list             the readings waiting for a label, numbered
//   atelier taste --skill <name> --label <n>=followed|missed|unsure ...   label from the list (scripts)
//
// Design and pre-registered bars: docs/TASTE.md. The reader (core/taste/reader.ts) reports; what its
// readings may do is computed from the owner's labels (core/taste/calibration.ts).

import { readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import * as store from '../../core/state/store.js';
import type { StandardVersion } from '../../core/state/canonical-state.js';
import { readTaste, tasteRules, describeTaste, type TasteReading } from '../../core/taste/reader.js';
import { tastePermissions, calibrationQueue, statementHash, passageAround, type TastePermissions, type OwnerLabel } from '../../core/taste/calibration.js';
import { coverageOf, describeCoverage } from '../../core/taste/dimensions.js';
import type { Budget } from '../../core/inference/client.js';
import { sha, DATA, die, argv, flag, flagAll, numericFlag, skillArg, clientFor, diagnoserModel } from '../runtime.js';

/** The model the reader runs on: its own setting, else the discovery model. Permissions are scoped to it. */
export const readerModel = (): string => flag('--reader-model') ?? process.env.ATELIER_READER_MODEL ?? diagnoserModel();

/**
 * Read a text, record the reading, and return it with what the reader has earned. Every reading is an
 * event (for calibration) and a behavioural observation per rule (for the convergence loop), with the
 * authority the reader holds for that rule at the time.
 */
export async function recordTaste(L: store.StoreLayout, v: StandardVersion, text: string, task: string | null,
  invocationId: string | null, budget: Budget,
  /** readings already taken of exactly this text (by a taste repair), recorded instead of reading again */
  taken: readonly TasteReading[] | null = null): Promise<{ readings: readonly TasteReading[]; permissions: TastePermissions }> {
  const model = readerModel();
  const rules = tasteRules(v);
  const permissions = tastePermissions(rules, store.readEvents(L), model);
  if (!rules.length) return { readings: [], permissions };
  const readings = taken ?? await readTaste(clientFor(model), budget, v, text, task);
  const at = new Date().toISOString();
  const readingId = sha(`${v.standardVersionHash}|${sha(text)}|${at}`);
  const hashOf = new Map(rules.map(({ rule, key }) => [key, statementHash(rule)]));
  store.appendEvent(L, { kind: 'TASTE_READING', readingId, invocationId, standardVersionHash: v.standardVersionHash, readerModel: model, at,
    readings: readings.map((r) => ({ ...r, statementHash: hashOf.get(r.key) ?? '', ...(r.quote ? { passage: passageAround(text, r.quote) } : {}) })) });
  for (const r of readings) {
    if (r.verdict !== 'FOLLOWED' && r.verdict !== 'MISSED') continue;
    store.putObservation(L, { requirementId: r.requirementId, domain: 'BEHAVIOR', contextId: sha(task ?? text), invocationId: invocationId ?? readingId,
      generationIndex: 0, verdict: r.verdict, producer: 'taste-reader', producerVersion: model,
      authority: permissions.veto.has(r.key) && r.kind !== 'OMISSION' ? 'VETO_QUALIFIED' : 'OBSERVE_ONLY',
      evidence: { quote: r.quote ?? null, kind: r.kind ?? null, why: r.why }, at });
  }
  return { readings, permissions };
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
    const { readings, permissions } = await recordTaste(L, v, readFileSync(file, 'utf8'), flag('--task') ?? null, null, budget);
    console.log(describeTaste(readings, byId, permissions.veto));
    console.log(`(${budget.calls ?? 0} model call(s), $${budget.spentUsd.toFixed(3)}, reader ${model})`);
    return;
  }

  const labels = flagAll('--label');
  if (labels.length || argv.includes('--list') || argv.includes('--calibrate')) {
    const queue = calibrationQueue(rules, store.readEvents(L), model);
    const record = (i: number, label: OwnerLabel): void => {
      const q = queue[i] ?? die(`no reading ${i + 1} in the list (1–${queue.length}).`);
      store.appendEvent(L, { kind: 'TASTE_LABEL', readingId: q.readingId, key: q.key, statementHash: q.statementHash, label, at: new Date().toISOString() });
    };
    if (labels.length) {
      for (const kv of labels) {
        const [n, l] = kv.split('=');
        const label = ({ followed: 'FOLLOWED', missed: 'MISSED', broken: 'MISSED', unsure: 'UNSURE' } as Record<string, OwnerLabel | undefined>)[(l ?? '').toLowerCase()];
        if (!label || !Number.isInteger(Number(n))) die(`--label takes <n>=followed|missed|unsure; got "${kv}".`);
        record(Number(n) - 1, label!);
      }
      console.log(`${labels.length} label(s) recorded.`);
    } else if (argv.includes('--list')) {
      if (!queue.length) console.log('Nothing waiting for a label. Readings are taken on every invoke, or with --read.');
      queue.forEach((q, i) => { console.log(`${i + 1}. ${q.rule.requirementId}: ${q.rule.statement.slice(0, 100)}\n   ${q.passage.replace(/\s+/g, ' ').slice(0, 300)}\n`); });
      return;
    } else {
      if (!process.stdin.isTTY) die('--calibrate asks in a terminal. From a script: --list, then --label <n>=followed|missed|unsure.');
      if (!queue.length) { console.log('Nothing waiting for a label. Readings are taken on every invoke, or with --read.'); return; }
      console.log('For each: does this passage follow the rule? You will not be shown what the reader thought.\n  f = followed · m = missed (broken here) · u = can\'t tell · q = stop\n');
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        for (const [i, q] of queue.entries()) {
          console.log(`\n${i + 1}/${queue.length}  RULE ${q.rule.requirementId}: ${q.rule.statement}\n\n${q.passage}\n`);
          const a = (await rl.question('f / m / u / q: ')).trim().toLowerCase();
          if (a === 'q') break;
          const label = a === 'f' ? 'FOLLOWED' : a === 'm' ? 'MISSED' : a === 'u' ? 'UNSURE' : null;
          if (label) record(i, label);
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
