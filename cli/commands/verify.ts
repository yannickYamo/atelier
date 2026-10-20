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

import { profileOf, bandWords } from '../../core/observers/selection.js';
import { sayPooled } from '../../core/observers/pooled.js';
import { checksFor, shortFormRequest } from '../checks.js';
import { readFileSync, existsSync } from 'node:fs';
import * as store from '../../core/state/store.js';
import * as fstore from '../../core/state/fidelity-store.js';
import { describeVerify } from '../../core/observers/verify.js';
import { checkDraftAsync, refineToStandard } from '../../core/loop/run-repair.js';
import { checkClass } from '../../core/observers/doc-class.js';
import { grammarListed, toCheckList } from '../../core/observers/grammar.js';
import { DATA, argv, flag, positional, assertSkillName, boundMaterial, numericFlag, clientAndBinding, assertReachable } from '../runtime.js';
import type { InferenceClient } from '../../core/inference/client.js';
import { describeTaste, vetoMisses, actsAsMiss } from '../../core/taste/reader.js';
import { recordTaste } from './taste.js';
import { recordForText } from '../eval-run.js';
import { stateLine } from '../../core/eval/run-card.js';
import { partlyChecked, blocks } from '../../core/eval/record.js';

export { verifyText, describeVerify, describeMeasurement } from '../../core/observers/verify.js';

/**
 * The author's range as the skill card counts it (core/eval/skill-card.ts): the features of the fidelity profile the
 * active release serves, every piece's band. Read only; a skill with no release has none.
 */
function profileBands(L: store.StoreLayout): { id: string; band: readonly [number, number] }[] {
  const active = fstore.getActiveRelease(L)?.release ?? null;
  const profile = active?.profileHash ? fstore.getProfile(L, active.profileHash) : active ? fstore.getProfile(L) : null;
  return (profile?.bands ?? []).filter((b) => b.cls === 'all').map((b) => ({ id: b.id, band: b.band }));
}

export async function verify(): Promise<void> {
  const name = flag('--skill') ?? fail('--skill <name> required: atelier verify --skill <name> <file>   (or pipe the text in)');
  const L: store.StoreLayout = { root: DATA, skillName: assertSkillName(name) };
  const active = store.getActive(L) ?? fail(`no built skill called "${name}".`);
  const sv = store.getSkillVersion(L, active) ?? fail(`skill version ${active} is missing.`);
  const v = store.getStandard(L, sv.standardVersionHash) ?? fail(`standard ${sv.standardVersionHash} is missing.`);
  // The class check runs before anything is read: a text of the wrong kind has nothing to check against.
  const cls = checkClass(store.getDocClass(L), flag('--class'));
  // A short piece checked against a standard read from longer ones (core/observers/short-form.ts): its method and bans
  // hold, its counted bands do not apply, and the output is held to the format's limit or to --limit.
  const shortAsked = shortFormRequest(v.requirements, flag('--class'), flag('--limit'));
  const short = typeof shortAsked === 'string' ? fail(shortAsked) : shortAsked;
  if (!cls.ok && !short.transfer) fail(cls.why);
  const classNote = short.transfer ? short.transfer.said : cls.ok ? cls.note : null;
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
  const named = [...store.getMaterial(L), ...boundMaterial()].map((m) => ({ name: m.name, text: m.text }));
  const checks = { ...checksFor(L, { material, task: flag('--task') ?? '', context: { ...(flag('--task') ? { request: flag('--task') } : {}), material: named }, guardClaims: !argv.includes('--allow-unsourced'), placeholders: argv.includes('--placeholders') }),
    ...(short.format ? { format: short.format } : {}), ...(short.transfer ? { doesNotApply: short.transfer.doesNotApply } : {}) };
  if (argv.includes('--repair')) {
    const budget = { spentUsd: 0, capUsd: numericFlag('--cap', 1), maxCalls: numericFlag('--max-calls', 4) };
    // The model is asked for only when a rewrite needs it: a repair that is all mechanical (a known misspelling, a/an,
    // an agreement, punctuation) runs with no key, and a key is asked for at the first call that needs one.
    let model: InferenceClient | null = null;
    const client: InferenceClient = { complete: (req) => { if (!model) { assertReachable('target'); model = clientAndBinding('target').client; } return model.complete(req); } };
    const r = await refineToStandard(client, budget, name, v, text, 2, checks);
    for (const n of checks.claimSensor?.notes ?? []) console.error(`(${n})`);
    // WHAT WAS LISTED, NOT CHANGED: a grammar rule whose findings are only listed is unverified, never held. Its items
    // are said here, in both outputs, so "nothing changed" never reads as "every rule holds".
    const listed = r.report.checked.filter(grammarListed).map((c) => ({ rule: c.requirementId, statement: c.statement,
      items: c.result.spans.map((s) => ({ text: s.text, start: s.start, end: s.end, why: s.why })) }));
    const slips = listed.flatMap((l) => l.items);
    if (argv.includes('--json')) {
      console.log(JSON.stringify({ output: r.output, failed: r.report.failed, repair: r.repair, spentUsd: budget.spentUsd,
        ...(listed.length ? { unverified: listed.map((l) => l.rule), listed } : {}) }, null, 1));
    } else {
      console.log(r.output);
      console.error(r.repair ? `(repaired: ${r.repair.violatedBefore.length} REQUIRED rule(s) broken before, ${r.repair.violatedAfter.length} after; ${r.repair.why}; $${budget.spentUsd.toFixed(4)})`
        : slips.length ? `(nothing changed: ${slips.length} possible slip${slips.length === 1 ? ' is' : 's are'} listed for you to check)`
          : '(nothing to repair: every REQUIRED measured rule holds)');
      for (const l of listed) console.error(`  ${l.rule} unverified, listed for you to check: ${toCheckList(l.items, l.items.length)}`);
    }
    if (r.report.failed) process.exitCode = 1;
    return;
  }
  const report = await checkDraftAsync(name, v, text, checks);
  for (const n of checks.claimSensor?.notes ?? []) console.error(`(${n})`);
  // The reading-based rules, on request (`--taste`): this calls a model, and every count here is free.
  // Read first, so `--json` prints one object holding both.
  let taste: { text: string; failed: boolean; verdicts: unknown[] } | null = null;
  let tasteRead: { requirementId: string; verdict: string; quote?: string; why: string; acts: boolean }[] | undefined;
  if (argv.includes('--taste')) {
    const budget = { spentUsd: 0, capUsd: numericFlag('--cap', 1), maxCalls: 3 };
    try {
      const { readings, permissions, held } = await recordTaste(L, v, text, flag('--task') ?? null, null, budget);
      tasteRead = readings.map((r) => ({ requirementId: r.requirementId, verdict: r.verdict, ...(r.quote ? { quote: r.quote } : {}), why: r.why, acts: permissions.veto.has(r.key) }));
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
  }), ...store.getSignals(L).map((s) => ({ id: s.id, band: s.band })), ...profileBands(L)];
  const profile = argv.includes('--profile') ? profileOf(text, bands.filter((b, i) => bands.findIndex((x) => x.id === b.id) === i)) : null;
  // THE SAME RECORD A RUN CARRIES (cli/eval-run.ts): this text, under this standard, judged the same way.
  const record = recordForText({ L, std: v, text, report, readings: tasteRead, sensor: checks.claimSensor, claimsOff: argv.includes('--allow-unsourced'), answers: checks.format?.claims === 'list', unmeasured: checks.listsBecause ?? null });
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ...report, record, ...(profile ? { profile } : {}), failed: record.state === 'BLOCKED' || (taste?.failed ?? false), ...(classNote ? { note: classNote } : {}),
      ...(taste ? { taste: { failed: taste.failed, verdicts: taste.verdicts } } : {}) }, null, 1));
  } else {
    console.log(describeVerify(report, partlyChecked(record)));
    console.log(`\n${record.state.replace('_', ' ')} · ${stateLine(record)}`);
    // WHAT FAILED, BY NAME: a check the record holds beyond the rule lines above (copying from an example, the request's
    // own checks) is named here, so the text output says what blocked the work, not only --json.
    for (const e of record.entries.filter(blocks)) console.log(`  ✗ ${e.statement.replace(/[.]$/, '')}${e.observation.evidence ? `: ${e.observation.evidence}` : ''}`);
    if (report.checked.some((c) => c.requirementId === 'UNSOURCED' && c.result.verdict === 'VIOLATED')) {
      console.log(`\nUNSOURCED: if a flagged story or figure is yours, add it to the skill's material (atelier material --skill ${name} <file>) or pass --allow-unsourced.`);
    }
    if (classNote) console.log(`\n(${classNote})`);
    if (profile) {
      if (!profile.entries.length) console.log('\nprofile: this skill holds no counted features of your style yet (they come from discovery).');
      else {
        console.log('\nprofile (0 = inside your range; 1 = a full range-width outside):');
        for (const l of profile.layers) console.log(`  ${l.layer.padEnd(28)} ${l.distance.toFixed(2)}  (${l.features} feature${l.features === 1 ? '' : 's'})`);
        // A POOLED RATE (a short-form build's count rules) has no band a short text can be read against: it is shown as
        // the rule's own line reads it, the count against what the length expects at the author's rate, never "n/a".
        const pooledOf = new Map(v.requirements.flatMap((r) => {
          const m = r.measurement; const id = ((m?.params.feature as readonly string[] | undefined) ?? [])[0];
          return r.authority !== 'EXPERT_REJECTED' && m?.observer === 'FEATURE' && id && typeof m.params.pooledPerWord === 'number'
            ? [[id, { rate: m.params.pooledPerWord, detail: report.checked.find((c) => c.requirementId === r.requirementId)?.result.detail ?? null }] as const] : [];
        }));
        for (const e of profile.entries) {
          const pooled = pooledOf.get(e.id);
          if (pooled && (e.value === null || bandWords(e.band) === 'any value')) {
            console.log(`    ${e.id.padEnd(20)} ${pooled.detail ?? 'not counted'}  your rate about ${sayPooled(pooled.rate)}`);
            continue;
          }
          console.log(`    ${e.id.padEnd(20)} ${e.value ?? 'n/a'}  your range ${bandWords(e.band)}${e.distance ? `  → ${e.distance} off` : ''}`);
        }
      }
    }
    if (taste) console.log(`\n${taste.text}`);
  }
  if (taste?.failed) process.exitCode = 1;
  // THE EXIT CODE IS THE RECORD'S: 1 where something required was seen to fail, and only there.
  if (record.state === 'BLOCKED') process.exitCode = 1;
}

/**
 * EXIT 2 FOR "COULD NOT CHECK", 1 FOR "CHECKED AND FAILED". A gate that reads exit 1 as a broken rule
 * must not be handed a missing file under the same code.
 */
const fail = (m: string): never => { console.error(`atelier: ${m}`); process.exit(2); };

