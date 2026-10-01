// cli/commands/verify.ts — HOLD ANY TEXT TO THE STANDARD, AND SAY EXACTLY WHERE IT BREAKS.
//
//   atelier verify --skill house-style draft.md
//   cat reply.txt | atelier verify --skill support-voice --json
//
// Runs every rule that carries a measurement against the text and prints each violation with the span
// that caused it. Exits 1 when a REQUIRED rule is broken, so it can sit in a pipeline, a pre-commit
// hook or a host hook as a gate. Rules without a measurement are not counted; `--taste` has the taste
// reader read them (docs/TASTE.md).
//
//   atelier verify --skill house-style draft.md --repair
//
// `--repair` is the guard for text written anywhere else: the same check-and-repair loop `invoke` runs
// on its own drafts (only the spans that break a REQUIRED rule are rewritten, a rewrite that changes a
// claim or moves a banned move onto a sibling is refused), and prints the repaired text. Nothing else
// in the text is touched: it keeps its own voice.

import { profileOf } from '../../core/observers/selection.js';
import { checksFor } from '../checks.js';
import { readFileSync, existsSync } from 'node:fs';
import * as store from '../../core/state/store.js';
import { describeVerify } from '../../core/observers/verify.js';
import { checkDraftAsync, refineToStandard } from '../../core/loop/run-repair.js';
import { checkClass } from '../../core/observers/doc-class.js';
import { DATA, argv, flag, positional, assertSkillName, boundMaterial, numericFlag, clientAndBinding } from '../runtime.js';
import { describeTaste, vetoMisses, actsAsMiss } from '../../core/taste/reader.js';
import { recordTaste } from './taste.js';

export { verifyText, describeVerify, describeMeasurement } from '../../core/observers/verify.js';

export async function verify(): Promise<void> {
  const name = flag('--skill') ?? fail('--skill <name> required: atelier verify --skill <name> <file>   (or pipe the text in)');
  const L: store.StoreLayout = { root: DATA, skillName: assertSkillName(name) };
  const active = store.getActive(L) ?? fail(`no built skill called "${name}".`);
  const sv = store.getSkillVersion(L, active) ?? fail(`skill version ${active} is missing.`);
  const v = store.getStandard(L, sv.standardVersionHash) ?? fail(`standard ${sv.standardVersionHash} is missing.`);
  // The class check runs before anything is read: a text of the wrong kind has nothing to check against.
  const cls = checkClass(store.getDocClass(L), flag('--class'));
  if (!cls.ok) fail(cls.why);
  const classNote = cls.ok ? cls.note : null;
  const file = positional([name]);
  let text: string;
  if (file && file !== '-') {
    if (!existsSync(file)) fail(`there is no file at ${file}.`);
    text = readFileSync(file, 'utf8');
  } else {
    if (process.stdin.isTTY) fail('give it a file, or pipe the text in: atelier verify --skill <name> draft.md');
    let data = '';
    for await (const chunk of process.stdin) data += (chunk as Buffer).toString();
    text = data;
  }
  if (!text.trim()) fail('there is no text to check. An empty input passing would read as a clean result.');
  // THE SAME CHECKS AS THE LOOP. A story or a figure the text presents as fact, found in neither the
  // skill's material nor anything bound with --with, fails as UNSOURCED. A person checking their own
  // draft whose stories are theirs adds them to the material, or passes --allow-unsourced.
  // The request is supplied, as it is to invoke: a detail the person typed is theirs to have repeated.
  const material = [flag('--task') ?? '', ...[...store.getMaterial(L), ...boundMaterial()].map((m) => m.text)].filter(Boolean).join('\n\n');
  const checks = checksFor(L, { material, task: flag('--task') ?? '', guardClaims: !argv.includes('--allow-unsourced'), placeholders: argv.includes('--placeholders') });
  if (argv.includes('--repair')) {
    const budget = { spentUsd: 0, capUsd: numericFlag('--cap', 1), maxCalls: numericFlag('--max-calls', 4) };
    const r = await refineToStandard(clientAndBinding('target').client, budget, name, v, text, 2, checks);
    for (const n of checks.claimSensor?.notes ?? []) console.error(`(${n})`);
    if (argv.includes('--json')) {
      console.log(JSON.stringify({ output: r.output, failed: r.report.failed, repair: r.repair, spentUsd: budget.spentUsd }, null, 1));
    } else {
      console.log(r.output);
      console.error(r.repair ? `(repaired: ${r.repair.violatedBefore.length} REQUIRED rule(s) broken before, ${r.repair.violatedAfter.length} after; ${r.repair.why}; $${budget.spentUsd.toFixed(4)})`
        : '(nothing to repair: every REQUIRED measured rule holds)');
    }
    if (r.report.failed) process.exitCode = 1;
    return;
  }
  const report = await checkDraftAsync(name, v, text, checks);
  for (const n of checks.claimSensor?.notes ?? []) console.error(`(${n})`);
  // The reading-based rules, on request (`--taste`): this calls a model, and every count here is free.
  // Read first, so `--json` prints one object holding both.
  let taste: { text: string; failed: boolean; verdicts: unknown[] } | null = null;
  if (argv.includes('--taste')) {
    const budget = { spentUsd: 0, capUsd: numericFlag('--cap', 1), maxCalls: 3 };
    try {
      const { readings, permissions, held } = await recordTaste(L, v, text, flag('--task') ?? null, null, budget);
      taste = { text: describeTaste(readings, new Map(v.requirements.map((r) => [r.requirementId, r])), permissions.veto, held),
        // A miss on a rule where the reader holds VETO fails the check, as a broken REQUIRED rule does.
        failed: vetoMisses(readings, permissions.veto).length > 0,
        verdicts: held ? [] : readings.map((r) => ({ rule: r.requirementId, verdict: r.verdict, kind: r.kind ?? null, quote: r.quote ?? null, why: r.why,
          authority: actsAsMiss(r) && permissions.veto.has(r.key) ? 'VETO' : 'OBSERVE' })) };
    } catch (e) { fail(`the taste reader could not run: ${(e as Error).message.split('\n')[0]}`); }
  }
  // THE PROFILE (--profile): where the text sits on each counted feature the skill holds, by layer.
  // A profile, not a score: the layers fail independently, and one number would hide which.
  const bands = [...v.requirements.flatMap((r) => {
    const m = r.measurement;
    if (r.authority === 'EXPERT_REJECTED' || m?.observer !== 'FEATURE') return [];
    const lo = typeof m.params.minValue === 'number' ? m.params.minValue : -Infinity;
    const hi = typeof m.params.maxValue === 'number' ? m.params.maxValue : Infinity;
    return [{ id: ((m.params.feature as readonly string[] | undefined) ?? [])[0] ?? '', band: [lo, hi] as const }];
  }), ...store.getSignals(L).map((s) => ({ id: s.id, band: s.band }))];
  const profile = argv.includes('--profile') ? profileOf(text, bands) : null;
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ...report, ...(profile ? { profile } : {}), failed: report.failed || (taste?.failed ?? false), ...(classNote ? { note: classNote } : {}),
      ...(taste ? { taste: { failed: taste.failed, verdicts: taste.verdicts } } : {}) }, null, 1));
  } else {
    console.log(describeVerify(report));
    if (report.checked.some((c) => c.requirementId === 'UNSOURCED' && c.result.verdict === 'VIOLATED')) {
      console.log(`\nUNSOURCED: if a flagged story or figure is yours, add it to the skill's material (atelier material --skill ${name} <file>) or pass --allow-unsourced.`);
    }
    if (classNote) console.log(`\n(${classNote})`);
    if (profile) {
      if (!profile.entries.length) console.log('\nprofile: this skill holds no counted features of your style yet (they come from discovery).');
      else {
        console.log('\nprofile (0 = inside your range; 1 = a full range-width outside):');
        for (const l of profile.layers) console.log(`  ${l.layer.padEnd(28)} ${l.distance.toFixed(2)}  (${l.features} feature${l.features === 1 ? '' : 's'})`);
        for (const e of profile.entries) console.log(`    ${e.id.padEnd(20)} ${e.value ?? 'n/a'}  your range ${e.band[0]} to ${e.band[1]}${e.distance ? `  → ${e.distance} off` : ''}`);
      }
    }
    if (taste) console.log(`\n${taste.text}`);
  }
  if (taste?.failed) process.exitCode = 1;
  if (report.failed) process.exitCode = 1;
}

/**
 * EXIT 2 FOR "COULD NOT CHECK", 1 FOR "CHECKED AND FAILED". A gate that reads exit 1 as a broken rule
 * must not be handed a missing file under the same code.
 */
const fail = (m: string): never => { console.error(`atelier: ${m}`); process.exit(2); };

