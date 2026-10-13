// atelier/cli/commands/run.ts — `atelier run "<task>"`: the work, and one line that says whether it can be used.
//
// `atelier invoke` is the engine and keeps its long report: every rule, every reading, what a draft cost. A person
// who asked for a piece of work reads none of that first. `run` asks the engine for the same run and prints the work,
// the state of it (core/eval/run-state.ts) and at most two more lines. The full report is one flag away (--report)
// and is always kept with the run.
//
// It runs the engine as it is, in a process of its own, and reads the record it writes: there is one way a run
// happens, and this is a way of showing it.

import { execFile } from 'node:child_process';
import { DATA, argv, die, flag, loadSession, positionals } from '../runtime.js';
import * as store from '../../core/state/store.js';
import { runState, type RunFacts } from '../../core/eval/run-state.js';
import type { EvalSummary } from '../../core/eval/summary.js';
import type { Requirement } from '../../core/state/canonical-state.js';

interface EngineRun { readonly output: string | null; readonly invocationId: string; readonly costUsd: number; readonly toCheck: readonly string[]; readonly report: readonly string[]; readonly eval: EvalSummary | null }

/** The skill a run is for: the one named, or the one this folder built. Never a guess between two. */
function skillFor(): string {
  const named = flag('--skill');
  if (named) return named;
  const here = loadSession().skillName;
  return here ?? die('which skill? This folder has built none. Name it: atelier run --skill <name> "<task>"');
}

/**
 * The owner's rules no machine checks: a step of their method read as judgement, or a rule they made required that
 * carries no check. Required by them all the same, and counted so that a run never reads as more certain than it is.
 */
export const judgementRules = (requirements: readonly Requirement[]): number =>
  requirements.filter((r) => !r.measurement && r.authority !== 'EXPERT_REJECTED' && (r.materiality === 'REQUIRED' || r.obligation === 'JUDGEMENT')).length;

/** What the state line is made from: the run's own evaluation, and the owner's rules no machine checks. */
export function factsOf(run: Pick<EngineRun, 'eval' | 'toCheck'>, judgement: number): RunFacts {
  const required = run.eval?.gates.required;
  // With nothing bound to check a specific against, every specific is "to check": that is the report's to list, and
  // says nothing about this run. Counted here only where there was material and something was not found in it.
  const nothingBound = (run.eval?.gates.claims.unmeasured ?? '').startsWith('no material');
  return { applicable: required?.applicable ?? 0, held: required?.held ?? 0, judgement, toCheck: nothingBound ? 0 : run.toCheck.length,
    broken: (required?.broken ?? []).map((b) => ({ id: b.id, detail: b.detail, ...('label' in b && typeof b.label === 'string' ? { label: b.label } : {}) })) };
}

/** The lines under the work: its state, what was done to get there when anything was, and where to go next. */
export function linesFor(run: EngineRun, judgement: number): string[] {
  const { state, line } = runState(factsOf(run, judgement));
  const again = run.report.some((l) => l.startsWith('Written again')) ? 'It was written again once to meet your rules.' : null;
  const next = state === 'BLOCKED' ? 'Not deliverable as it stands. What was checked: atelier run --report · wrong about your work? atelier fix "<what was wrong>"'
    : 'Not right? atelier fix "<what was wrong>" · everything this run checked: add --report';
  return [line, ...(again ? [again] : []), next];
}

export async function run(): Promise<void> {
  const name = skillFor();
  const task = flag('--task') ?? positionals().find((a) => a !== name) ?? die('give it something to do: atelier run "<your task>"');
  // Everything else the person typed goes to the engine as typed: material, a backend, a cap.
  const own = new Set(['--skill', name, '--task', task, '--report']);
  const passed = argv.slice(1).filter((a) => !own.has(a));
  const L = { root: DATA, skillName: name };
  const active = store.getActive(L); const sv = active ? store.getSkillVersion(L, active) : null;
  const std = sv ? store.getStandard(L, sv.standardVersionHash) : null;
  const judgement = judgementRules(std?.requirements ?? []);
  const full = argv.includes('--report');
  if (process.stderr.isTTY) process.stderr.write('writing…\n');
  const engine = await new Promise<{ code: number; out: string; err: string }>((done) => {
    execFile(process.execPath, [...process.execArgv, process.argv[1], 'invoke', '--skill', name, `--task=${task}`, '--json', ...passed],
      { maxBuffer: 1 << 26, env: process.env }, (e, out, err) => { done({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, out, err }); });
  });
  let result: EngineRun;
  try { result = JSON.parse(engine.out) as EngineRun; } catch { process.stderr.write(engine.err); process.exitCode = engine.code || 1; return; }
  if (result.output === null) { process.stderr.write(engine.err); process.exitCode = engine.code || 1; return; }
  console.log(`${result.output.trimEnd()}\n`);
  const lines = linesFor(result, judgement);
  for (const l of lines) console.log(l);
  if (full) console.log(`\n${result.report.join('\n')}`);
  if (lines[0].startsWith('BLOCKED')) process.exitCode = 1;
}
