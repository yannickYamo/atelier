// cli/commands/record.ts — THE HOST'S ACCOUNT OF A REAL USE, MADE CANONICAL.
//
// `/my-skill …` in Claude Code produced no record at all: `InvocationSurface` had one value and the
// type's own comment admitted it — "those invocations produce NO record". The product's primary
// surface could not feed the evidence loop; only `atelier invoke` could, and nobody uses a CLI to
// write when their editor serves the same skill.
//
// This command is the receiving end of two plugin hooks, and it is NOT part of anyone's workflow:
// nothing here is typed by a person, and the payloads are Claude Code's own hook JSON on stdin.
//
//   UserPromptSubmit  →  atelier record --from-hook prompt   (the person typed "/name task…")
//   Stop              →  atelier record --from-hook stop     (the turn finished; here is the output)
//
// The prompt half only NOTES a pending invocation — which skill, the exact input, whether the
// installed bytes matched the store at the moment of use. The stop half pairs by prompt_id, reads
// the model identity from the transcript when it is there, and persists through the same
// `persistInvocation` the CLI path uses. What cannot be known is recorded as unknown: a transcript
// with no model line yields an UNREPORTED observation, never a guess.

import { checksFor } from '../checks.js';
import { checkDraftAsync } from '../../core/loop/run-repair.js';
import { planRepair, regressions } from '../../core/loop/repair.js';
import { spanIntegrity } from '../../core/loop/integrity.js';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readJson } from '../../core/state/read-json.js';

import { writeAtomic } from '../../core/state/fs-atomic.js';
import * as store from '../../core/state/store.js';
import { observeRuntime, type RuntimeBinding } from '../../core/runtime/binding.js';
import { persistInvocation } from '../../core/runtime/record.js';
import { assertRequestBound } from '../../core/state/canonical-state.js';
import type { InvocationRecord, RepairRecord } from '../../core/state/canonical-state.js';
import { sha, DATA, die, flag, runFile, pickHost, nearestProject, keyFor } from '../runtime.js';

interface PromptPayload { prompt?: string; cwd?: string; prompt_id?: string; transcript_path?: string }
interface StopPayload { prompt_id?: string; cwd?: string; transcript_path?: string; last_assistant_message?: string; stop_hook_active?: boolean }

interface PendingInvocation {
  promptId: string; skillName: string; input: string; at: string;
  skillVersionHash: string; standardVersionHash: string; architectureHash: string;
  expectedPackageHash: string; servedPackageHash: string; matched: boolean; servedFiles: string[];
  /** set when the Stop hook sent the answer back once for its broken REQUIRED rules */
  repairOf?: { outputHash: string; violated: string[]; draft: string; spans: { start: number; end: number }[] };
}

const readStdin = async (): Promise<string> => {
  let data = '';
  for await (const chunk of process.stdin) data += (chunk as Buffer).toString();
  return data;
};

/** The last assistant line of a Claude Code transcript names the model. Absent is absent. */
const modelFromTranscript = (path: string | undefined): string | null => {
  if (!path || !existsSync(path)) return null;
  try {
    const lines = readFileSync(path, 'utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"type":"assistant"')) continue;
      const parsed = JSON.parse(lines[i]) as { message?: { model?: string } };
      if (parsed.message?.model) return parsed.message.model;
    }
  } catch { /* a malformed transcript yields an unreported model, never a crash */ }
  return null;
};

export async function record(): Promise<void> {
  const mode = flag('--from-hook') ?? die('atelier record is written by the host hooks, not typed. (--from-hook prompt|stop)');
  let payload: PromptPayload & StopPayload;
  try { payload = JSON.parse(await readStdin()) as PromptPayload & StopPayload; }
  catch { return; }                                   // a malformed hook payload records nothing, loudly nowhere
  // The hook fires wherever Claude Code started, which may be a subdirectory of the project the skill
  // is installed in; outside a git repository CLAUDE_PROJECT_DIR is that same subdirectory. The use
  // used to be dropped without a trace. The project is found by walking up: at prompt time to the
  // directory where THIS skill is installed, at stop time to the one holding the pending use.
  const start = payload.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const pendingIn = (d: string): string => join(DATA, 'runs', keyFor(d), 'pending-invocation.json');

  if (mode === 'prompt') {
    const m = /^\/([a-z0-9][a-z0-9-]{0,39})(?:\s+([\s\S]*))?$/.exec((payload.prompt ?? '').trim());
    if (!m) return;
    const [, name, rest] = m;
    const L: store.StoreLayout = { root: DATA, skillName: name };
    const active = store.getActive(L);
    if (!active) return;                              // a slash-command that is not an Atelier skill
    const sv = store.getSkillVersion(L, active);
    const pkg = sv ? store.getPackage(L, sv.materializedHash) : null;
    if (!sv || !pkg) return;
    // The delivery question is answered AT THE MOMENT OF USE: were the installed bytes the stored
    // package's? By stop-time the person may have rebuilt, and the answer would describe that.
    const host = pickHost();
    const root = nearestProject(start, (d) => host.verifyInstallation(pkg, d).present);
    if (!root) return;                                 // installed nowhere above here; not this project's use
    const ver = host.verifyInstallation(pkg, root);
    process.env.ATELIER_PROJECT_DIR = root;
    const pendingPath = runFile('pending-invocation.json');
    const pending: PendingInvocation = {
      promptId: payload.prompt_id ?? '', skillName: name, input: (rest ?? '').trim(), at: new Date().toISOString(),
      skillVersionHash: sv.skillVersionHash, standardVersionHash: sv.standardVersionHash,
      architectureHash: sv.architectureHash, expectedPackageHash: sv.materializedHash,
      servedPackageHash: ver.matchesPackage ? pkg.packageHash : `edited-${sha(JSON.stringify(ver))}`,
      matched: ver.matchesPackage, servedFiles: Object.keys(pkg.files),
    };
    writeAtomic(pendingPath, JSON.stringify(pending, null, 1));
    return;
  }

  if (mode !== 'stop') die(`unknown --from-hook "${mode}" (prompt|stop)`);
  const root = nearestProject(start, (d) => existsSync(pendingIn(d)));
  if (!root) return;
  process.env.ATELIER_PROJECT_DIR = root;
  const pendingPath = runFile('pending-invocation.json');
  const pending = readJson<PendingInvocation>(pendingPath, { what: 'the pending invocation', requireKeys: ['promptId', 'skillName'] });
  // A different turn ended. The ONLY exception is the continuation this hook asked for, which Claude
  // Code marks with stop_hook_active. A pending repair whose continuation never came (the person
  // pressed Esc) is stale: the next unrelated turn must never be recorded as this skill's output.
  const continuation = Boolean(pending.repairOf) && payload.stop_hook_active === true;
  if (!pending.promptId || (pending.promptId !== (payload.prompt_id ?? '') && !continuation)) {
    if (pending.repairOf) rmSync(pendingPath, { force: true });
    return;
  }
  // The answer: what the host reports, and failing that the draft the repair was asked of — a
  // continuation that came back empty still leaves a use to record.
  // An empty string is no answer, so `||` is deliberate here, not `??`.
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const output = payload.last_assistant_message || (continuation ? pending.repairOf?.draft ?? '' : '');
  if (!output) { rmSync(pendingPath, { force: true }); return; }   // a turn with no assistant text witnessed nothing

  const L: store.StoreLayout = { root: DATA, skillName: pending.skillName };

  // ── THE SAME LOOP AS `invoke`, IN THE HOST ───────────────────────────────────────────────────
  //
  // The answer is counted against every measured rule. When a REQUIRED one is broken AND the rules
  // point at spans to rewrite, the turn is not allowed to end: the host is handed those spans and asked
  // to rewrite only them, once. `stop_hook_active` and `repairOf` both guard the once. Unlike the CLI,
  // the host holds the pen for the whole answer, so "only these spans" is an instruction there, not a
  // splice — and the record says whether anything outside them changed, and whether anything got worse.
  const std = store.getStandard(L, pending.standardVersionHash);
  const checks = checksFor(L, { material: [pending.input, ...store.getMaterial(L).map((m) => m.text)].join('\n\n'), task: pending.input });
  const report = std ? await checkDraftAsync(pending.skillName, std, output, checks) : null;
  const brokenNow = (report?.checked ?? []).filter((c) => c.materiality === 'REQUIRED' && c.result.verdict === 'VIOLATED');
  const targets = report?.failed ? planRepair(output, report) : [];
  if (report?.failed && targets.length && !payload.stop_hook_active && !pending.repairOf) {
    writeAtomic(pendingPath, JSON.stringify({ ...pending, repairOf: { outputHash: sha(output), violated: brokenNow.map((c) => c.requirementId),
      draft: output, spans: targets.map((t) => ({ start: t.start, end: t.end })) } }, null, 1));
    const reason = `Your answer breaks ${brokenNow.length} REQUIRED rule(s) of the /${pending.skillName} standard. `
      + 'Rewrite ONLY these spans, keep everything else exactly as it is, keep every figure, name, negation, [placeholder] and '
      + 'qualifier ("may", "most", "roughly") the span carries unless the reason names that word, and give the full revised answer:\n\n'
      + targets.map((t) => `${t.id}. "${t.text}"\n   ${t.reasons.join('\n   ')}`).join('\n\n');
    process.stdout.write(`${JSON.stringify({ decision: 'block', reason })}\n`);
    return;
  }
  rmSync(pendingPath, { force: true });
  let repair: RepairRecord | undefined;
  if (continuation && pending.repairOf && std) {
    const draft = pending.repairOf.draft;
    const before = await checkDraftAsync(pending.skillName, std, draft, checks);
    const worse = report ? regressions(before, report) : [];
    // Outside the spans: the draft's text between and around them, compared with the answer's.
    const keep = (t: string, spans: { start: number; end: number }[]): string[] => {
      const out: string[] = []; let at = 0;
      for (const sp of [...spans].sort((a, b) => a.start - b.start)) { out.push(t.slice(at, sp.start)); at = sp.end; }
      out.push(t.slice(at));
      return out.map((x) => x.trim()).filter(Boolean);
    };
    const outsideSpansChanged = !keep(draft, pending.repairOf.spans).every((piece) => output.includes(piece));
    // The same meaning check the CLI splice enforces, over the whole answer: the host held the pen, so a
    // lost figure or qualifier cannot be put back here, only named where the person will see it.
    // An invented claim is meant to lose its specifics, so its span is left out of the comparison; the
    // rest of the answer is held to the check in full.
    const asked = planRepair(draft, before);
    let held = draft;
    for (const t of [...asked].filter((x) => x.specifics).sort((a, b) => b.start - a.start)) held = held.slice(0, t.start) + held.slice(t.end);
    const meaning = spanIntegrity(held, output, new Set(asked.flatMap((t) => t.drops)), false, new Set(asked.flatMap((t) => t.swaps ?? [])));
    repair = { passes: 1, violatedBefore: pending.repairOf.violated, violatedAfter: brokenNow.map((c) => c.requirementId),
      originalOutputHash: pending.repairOf.outputHash, draft, outsideSpansChanged,
      ...(meaning.ok ? {} : { meaningLost: meaning.lost }),
      why: [brokenNow.length ? 'the host rewrote once and a REQUIRED rule still does not hold' : 'every REQUIRED measured rule now holds',
        worse.length ? `the rewrite made ${worse.join(', ')} worse` : '',
        outsideSpansChanged ? 'text outside the named spans changed' : '',
        meaning.ok ? '' : `the rewrite lost ${meaning.lost.join(', ')}`].filter(Boolean).join('; ') };
  }

  const at = new Date().toISOString();
  const model = modelFromTranscript(payload.transcript_path);
  // The binding records what is KNOWN about this runtime: the host composed the request, and the
  // transcript may name the model. Where it does not, the observation says UNREPORTED — recording a
  // guessed identity would let host evidence masquerade as evidence about a configured runtime.
  const binding: RuntimeBinding = {
    providerAdapter: 'claude-code', backend: 'claude-code',
    requestedModel: model ?? 'claude-code-session',
    structuredOutput: 'NATIVE_TOOL_USE', parameters: {}, runtimeProfile: null,
  };
  const rec: InvocationRecord = {
    invocationId: `i${sha(`${pending.skillVersionHash}|${pending.input}|${at}|host`).slice(0, 10)}`,
    skillName: pending.skillName, standardVersionHash: pending.standardVersionHash,
    skillVersionHash: pending.skillVersionHash, architectureHash: pending.architectureHash,
    servedPackageHash: pending.servedPackageHash,
    runtimeBinding: binding, observedRuntime: observeRuntime(binding, model, at),
    invocationSurface: 'HOST_PLUGIN', provenance: 'ORGANIC_USE',
    inputHash: sha(pending.input),
    request: { resolvedTaskHash: sha(pending.input), servedTaskHash: sha(pending.input), source: 'HOST_PROMPT' },
    outputHash: sha(output), at,
    delivery: { expectedPackageHash: pending.expectedPackageHash, servedPackageHash: pending.servedPackageHash,
      matched: pending.matched, servedFiles: pending.servedFiles, outputContract: null },
    input: pending.input, output,
    ...(repair ? { repair } : {}),
  };
  assertRequestBound(rec.request, pending.input);
  persistInvocation(L, rec, binding, store.getStandard(L, pending.standardVersionHash));
  writeAtomic(runFile('last-invocation.json'), JSON.stringify({
    invocationId: rec.invocationId, skillName: pending.skillName, input: pending.input, at }, null, 1));
}
