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
//   atelier verify --skill house-style --hook        (a Claude Code PostToolUse or Stop hook)
//
// `--hook` reads the host's hook JSON on stdin (a Write's content, an Edit's file by its path, or on a Stop event the
// last assistant turn of the transcript), checks it, and exits 2 with the broken rules and their spans on stderr where
// something REQUIRED was seen to fail, which is what blocks the host and hands the reasons back to the model; 0 otherwise.
// An event that carries nothing to check (a Stop with no assistant text yet, an Edit whose file is gone, a tool event on
// a source-code file, a Stop the hook already answered once) says so and exits 0. A guard that cannot check AT ALL (no such skill, an event that is not JSON) exits 2 and says why: a
// misconfigured guard must be seen on its first event, never passed silently.
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
import { basename } from 'node:path';
import * as store from '../../core/state/store.js';
import * as fstore from '../../core/state/fidelity-store.js';
import { describeVerify, spanLines } from '../../core/observers/verify.js';
import { planFor } from '../../core/plan/execution-plan.js';
import { MATERIAL_UNREAD } from '../../core/observers/written.js';
import { checkDraftAsync, refineToStandard, REPAIR_PASSES } from '../../core/loop/run-repair.js';
import { checkClass } from '../../core/observers/doc-class.js';
import { grammarListed, toCheckList } from '../../core/observers/grammar.js';
import { DATA, argv, flag, positional, assertSkillName, boundMaterial, numericFlag, clientAndBinding, assertReachable } from '../runtime.js';
import type { InferenceClient } from '../../core/inference/client.js';
import { describeTaste, vetoMisses, actsAsMiss } from '../../core/taste/reader.js';
import { recordTaste, readerModel } from './taste.js';
import { certificateFor, tasteStandingFor, claimStandingOf, recordHead } from '../../core/eval/certificate.js';
import { recordForText } from '../eval-run.js';
import { stateLine } from '../../core/eval/run-card.js';
import { partlyChecked, blocks, type EvaluationRecord } from '../../core/eval/record.js';
import { deliveryLine } from '../../core/eval/consequence.js';

export { verifyText, describeVerify, describeMeasurement } from '../../core/observers/verify.js';

/** What blocked the text, from the record its state is read from: the rule lines and the record's own checks alike (copying, the request). */
const violatedOf = (record: EvaluationRecord): { id: string; statement: string; required: boolean; evidence: string | null }[] =>
  record.entries.filter(blocks).map((e) => ({ id: e.id, statement: e.statement, required: e.required, evidence: e.observation.evidence ?? null }));

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
  hookMode = argv.includes('--hook');
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
  if (hookMode) {
    // THE HOST'S EVENT, NOT A FILE: what was written (a Write's content, an Edit's result by its path) or what was answered.
    let data = '';
    if (!process.stdin.isTTY) for await (const chunk of process.stdin) data += (chunk as Buffer).toString();
    let event: { tool_input?: { content?: unknown; file_path?: unknown }; last_assistant_message?: unknown; transcript_path?: unknown; stop_hook_active?: unknown } = {};
    let parsed: unknown = null;
    try { parsed = JSON.parse(data || '{}'); } catch { fail('the hook event on stdin is not JSON: the hook is not wired as Claude Code sends it; nothing was checked'); }
    // AN EVENT IS AN OBJECT. A JSON string or list ("this is not an event") parsed, carried nothing, and passed as "nothing to
    // check": a guard wired wrong was never seen. It cannot check at all, so it says so and exits 2.
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) fail('the hook event on stdin is not a JSON object: the hook is not wired as Claude Code sends it; nothing was checked');
    event = parsed as typeof event;
    // A STOP THE HOOK ALREADY ANSWERED. The host sets `stop_hook_active` when the model is continuing because a stop hook
    // blocked it once; blocking again on the same answer would hold the host in a loop with nobody to read the reasons.
    if (event.stop_hook_active === true) { console.error('atelier: the stop hook already ran once on this answer (stop_hook_active); nothing more is blocked'); return; }
    const path = typeof event.tool_input?.file_path === 'string' ? event.tool_input.file_path : null;
    // A SOURCE FILE IS NOT THIS SKILL'S WORK. A prose skill's rules read a comment in a code file as prose (a dash, a short
    // sentence) and blocked the edit. Whether the file is code is decided by its extension, a fact of the path, never a
    // reading of what is in it; everything else (markdown, plain text, a file with no extension) keeps the contract.
    if (path && isCodePath(path)) { console.error(`atelier: nothing to check: ${path} is code`); return; }
    text = typeof event.tool_input?.content === 'string' ? event.tool_input.content
      : path && existsSync(path) ? readFileSync(path, 'utf8')
        : typeof event.last_assistant_message === 'string' ? event.last_assistant_message
          : typeof event.transcript_path === 'string' ? textFromTranscript(event.transcript_path) : '';
    if (!text.trim()) { console.error('atelier: nothing to check in this hook event (no written content, no file at its path, no assistant text in the transcript)'); return; }
  } else if (file && file !== '-') {
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
    const r = await refineToStandard(client, budget, name, v, text, REPAIR_PASSES, checks);
    for (const n of checks.claimSensor?.notes ?? []) console.error(`(${n})`);
    // WHAT WAS LISTED, NOT CHANGED: a grammar rule whose findings are only listed is unverified, never held. Its items
    // are said here, in both outputs, so "nothing changed" never reads as "every rule holds".
    const listed = r.report.checked.filter(grammarListed).map((c) => ({ rule: c.requirementId, statement: c.statement,
      items: c.result.spans.map((s) => ({ text: s.text, start: s.start, end: s.end, why: s.why })) }));
    const slips = listed.flatMap((l) => l.items);
    // THE SAME RECORD OF THE REPAIRED TEXT a run carries, and its delivery: the exit code is that delivery's.
    const after = recordForText({ L, std: v, text: r.output, report: r.report, sensor: checks.claimSensor, claimsOff: argv.includes('--allow-unsourced'), answers: checks.format?.claims === 'list', unmeasured: checks.listsBecause ?? null, act: checks.claimAct, material: checks.evidence ?? '' });
    if (argv.includes('--json')) {
      // Under the one record head (core/eval/certificate.ts).
      console.log(JSON.stringify({ ...recordHead({ state: after.state, standardVersionHash: v.standardVersionHash, skillVersion: active, certificate: certificateFor(v, tasteStandingFor(L, v, readerModel()), claimStandingOf(checks.claimSensor)), record: after }),
        output: r.output, failed: after.state === 'BLOCKED', violated: violatedOf(after), repair: r.repair, spentUsd: budget.spentUsd,
        ...(listed.length ? { unverified: listed.map((l) => l.rule), listed } : {}) }, null, 1));
    } else {
      console.log(r.output);
      console.error(r.repair ? `(repaired: ${r.repair.violatedBefore.length} REQUIRED rule(s) broken before, ${r.repair.violatedAfter.length} after; ${r.repair.why}; $${budget.spentUsd.toFixed(4)})`
        : slips.length ? `(nothing changed: ${slips.length} possible slip${slips.length === 1 ? ' is' : 's are'} listed for you to check)`
          : '(nothing to repair: every REQUIRED measured rule holds)');
      for (const l of listed) console.error(`  ${l.rule} unverified, listed for you to check: ${toCheckList(l.items, l.items.length)}`);
      if (after.delivery) console.error(`(${deliveryLine(after.delivery)})`);
    }
    if (after.delivery?.decision === 'BLOCK') process.exitCode = 1;
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
  const record = recordForText({ L, std: v, text, report, readings: tasteRead, sensor: checks.claimSensor, claimsOff: argv.includes('--allow-unsourced'), answers: checks.format?.claims === 'list', unmeasured: checks.listsBecause ?? null, act: checks.claimAct, material: checks.evidence ?? '' });
  // THE HOOK'S ANSWER IS THE DELIVERY'S (core/eval/consequence.ts): exit 2 and the rules that decided it on stderr where the
  // table blocks; 0 otherwise, with a note where the work goes to a person.
  if (hookMode) {
    const decided = record.delivery;
    const blocking = new Set(decided?.decision === 'BLOCK' ? decided.why.filter((w) => w.action === 'block').flatMap((w) => w.entries) : []);
    const broken = record.entries.filter((e) => blocking.has(e.id));
    if (decided?.decision === 'PERSON') console.error(`atelier: this goes to a person under the "${name}" standard (${deliveryLine(decided)}); nothing was blocked.`);
    if (broken.length) {
      console.error(`atelier: this breaks ${broken.length} required rule(s) of the "${name}" standard. Rewrite only what each names, keep everything else as it is:`);
      // THE SPANS, AS PLAIN VERIFY PRINTS THEM: "rewrite only what each names" names them here, or the model rewrites blind.
      const spansOf = new Map(report.checked.map((c) => [c.requirementId, c.result.spans]));
      for (const e of broken) {
        console.error(`  - ${e.statement.replace(/[.]$/, '')}${e.observation.evidence ? `: ${e.observation.evidence}` : ''}`);
        for (const l of spanLines(spansOf.get(e.id) ?? [], '      ')) console.error(l);
      }
      process.exitCode = 2;
      return;
    }
    // WHAT WAS NOT READ IS SAID, AND BLOCKS NOTHING: a required rule whose check could not read this text (one that reads
    // the material, on an event that binds none) is named, so a pass is never mistaken for every rule holding.
    // Required is the plan's word: an owner's step whose check has not qualified is required too, and named when unread.
    const required = new Set(planFor(v).rules.filter((p) => p.role !== 'HABIT').map((p) => p.id));
    const unread = report.checked.filter((c) => required.has(c.requirementId) && c.result.verdict === 'NOT_APPLICABLE' && c.result.detail.startsWith(MATERIAL_UNREAD));
    if (unread.length) {
      console.error(`atelier: ${unread.length} required rule(s) of the "${name}" standard were not read on this text, so nothing was blocked on ${unread.length === 1 ? 'its' : 'their'} account:`);
      for (const c of unread) console.error(`  - ${c.statement.replace(/[.]$/, '')}: ${c.result.detail}`);
      if (!named.length) console.error(`  To have the material read, bind it to the skill: atelier material --skill ${name} <file>`);
    }
    return;
  }
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ...recordHead({ state: record.state, standardVersionHash: v.standardVersionHash, skillVersion: active, certificate: certificateFor(v, tasteStandingFor(L, v, readerModel()), claimStandingOf(checks.claimSensor)), record }),
      ...report, ...(profile ? { profile } : {}), failed: record.state === 'BLOCKED' || (taste?.failed ?? false), violated: violatedOf(record), ...(classNote ? { note: classNote } : {}),
      ...(taste ? { taste: { failed: taste.failed, verdicts: taste.verdicts } } : {}) }, null, 1));
  } else {
    console.log(describeVerify(report, partlyChecked(record)));
    console.log(`\n${record.state.replace('_', ' ')} · ${stateLine(record)}`);
    if (record.delivery) console.log(deliveryLine(record.delivery));
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
  // THE EXIT CODE IS THE DELIVERY'S (core/eval/consequence.ts): 1 where the standard's consequence table blocks the text,
  // and only there. A taste reader's qualified miss is in the record, and the table decides what it does.
  if (record.delivery?.decision === 'BLOCK') process.exitCode = 1;
}

/**
 * THE LAST ASSISTANT TURN OF A CLAUDE CODE TRANSCRIPT, as text: what a Stop event is about. The transcript is JSON lines,
 * and the host writes one line of type "assistant" per content block, so the turn is read back from the end to the
 * person's last message: every text block of every assistant line on the way, in order. A "user" line that carries only
 * tool results is the host answering a tool call, inside the turn; a line of any other type (progress, system, a
 * snapshot) is skipped. Reading only the last line checked nothing when that line was a thinking or tool-use block
 * alone, and stopping at the first line of another type lost the prose written before a tool call. Each line is parsed,
 * never matched for a spelling of its type. Absent, unreadable or malformed is no text, never a crash.
 */
export function textFromTranscript(path: string): string {
  try {
    if (!existsSync(path)) return '';
    const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim());
    const turn: string[] = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      const j = ((): { type?: unknown; message?: { content?: unknown } } | null => {
        try { const p = JSON.parse(lines[i]) as { type?: unknown; message?: { content?: unknown } } | null; return p && typeof p === 'object' && !Array.isArray(p) ? p : null; } catch { return null; }
      })();
      const c = j?.message?.content;
      if (j?.type === 'user') {
        // the person's own message ends the turn; a message made only of tool results is the host's, inside it
        const blocks = Array.isArray(c) ? c as { type?: unknown }[] : null;
        if (!blocks?.some((b) => b.type === 'tool_result')) break;
        continue;
      }
      if (j?.type !== 'assistant') continue;
      if (typeof c === 'string') turn.push(c);
      else if (Array.isArray(c)) turn.push(...(c as { type?: unknown; text?: unknown }[]).flatMap((b) => b.type === 'text' && typeof b.text === 'string' ? [b.text] : []));
      else turn.push('');
    }
    return turn.reverse().filter(Boolean).join('\n');
  } catch { /* a malformed transcript is no text */ }
  return '';
}

/**
 * File extensions a host writes code to. A decidable fact of the path: a prose skill has nothing to check in a source
 * file, and its rules read a comment there as prose. Markdown, plain text and a file with no extension are not here.
 */
const CODE_EXTENSIONS: ReadonlySet<string> = new Set([
  'ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'scala', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh',
  'cs', 'swift', 'm', 'mm', 'php', 'pl', 'pm', 'lua', 'r', 'dart', 'ex', 'exs', 'erl', 'hs', 'clj', 'cljs', 'elm', 'zig', 'sol',
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd', 'sql', 'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'xml', 'html', 'htm',
  'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'astro', 'graphql', 'gql', 'proto', 'tf', 'lock', 'mk', 'cmake', 'gradle', 'nix',
]);
export const isCodePath = (p: string): boolean => {
  const base = basename(p); const dot = base.lastIndexOf('.');
  return dot > 0 && CODE_EXTENSIONS.has(base.slice(dot + 1).toLowerCase());
};

/**
 * EXIT 2 FOR "COULD NOT CHECK", 1 FOR "CHECKED AND FAILED". A gate that reads exit 1 as a broken rule
 * must not be handed a missing file under the same code. Under --hook, 2 is also what blocks the host: a guard that
 * cannot check at all is seen, never passed silently.
 */
let hookMode = false;
const fail = (m: string): never => { console.error(`atelier: ${m}`); process.exit(2); };

