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

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readJson } from '../../core/state/read-json.js';

import { writeAtomic } from '../../core/state/fs-atomic.js';
import * as store from '../../core/state/store.js';
import { observeRuntime, type RuntimeBinding } from '../../core/runtime/binding.js';
import { persistInvocation } from '../../core/runtime/record.js';
import { assertRequestBound } from '../../core/state/canonical-state.js';
import type { InvocationRecord } from '../../core/state/canonical-state.js';
import { sha, DATA, die, flag, runFile, pickHost } from '../runtime.js';

interface PromptPayload { prompt?: string; cwd?: string; prompt_id?: string; transcript_path?: string }
interface StopPayload { prompt_id?: string; cwd?: string; transcript_path?: string; last_assistant_message?: string }

interface PendingInvocation {
  promptId: string; skillName: string; input: string; at: string;
  skillVersionHash: string; standardVersionHash: string; architectureHash: string;
  expectedPackageHash: string; servedPackageHash: string; matched: boolean; servedFiles: string[];
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
  // The hook fires in the project the person is working in; the run's files are keyed by it.
  if (payload.cwd) process.env.ATELIER_PROJECT_DIR = payload.cwd;
  const pendingPath = runFile('pending-invocation.json');

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
    const ver = pickHost().verifyInstallation(pkg, payload.cwd ?? process.cwd());
    if (!ver.present) return;                          // installed elsewhere; not this project's use
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
  if (!existsSync(pendingPath)) return;
  const pending = readJson<PendingInvocation>(pendingPath, { what: 'the pending invocation', requireKeys: ['promptId', 'skillName'] });
  if (!pending.promptId || pending.promptId !== (payload.prompt_id ?? '')) return;   // a different turn ended
  rmSync(pendingPath, { force: true });
  const output = payload.last_assistant_message ?? '';
  if (!output) return;                                 // a turn with no assistant text witnessed nothing

  const L: store.StoreLayout = { root: DATA, skillName: pending.skillName };
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
  };
  assertRequestBound(rec.request, pending.input);
  persistInvocation(L, rec, binding, store.getStandard(L, pending.standardVersionHash));
  writeAtomic(runFile('last-invocation.json'), JSON.stringify({
    invocationId: rec.invocationId, skillName: pending.skillName, input: pending.input, at }, null, 1));
}
