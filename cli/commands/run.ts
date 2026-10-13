// atelier/cli/commands/run.ts — `atelier run "<task>"`: the work, and one line that says whether it can be used.
//
// `atelier invoke` is the engine and keeps its long report: every rule, every reading, what a draft cost. A person
// who asked for a piece of work reads none of that first. `run` asks the engine for the same run and prints the work,
// the state of it (core/eval/run-state.ts) and at most two more lines. The full report is one flag away (--report)
// and is always kept with the run.
//
// It runs the engine as it is, in a process of its own, and reads the record it writes: there is one way a run
// happens, and this is a way of showing it.

import { execFile, spawnSync } from 'node:child_process';
import { DATA, VALUED_OPTIONS, argv, die, flag, loadSession, boundMaterial } from '../runtime.js';
import * as store from '../../core/state/store.js';
import { runState, type RunFacts } from '../../core/eval/run-state.js';
import { targetOf } from '../../core/observers/obligations.js';
import type { EvalSummary } from '../../core/eval/summary.js';
import type { Requirement } from '../../core/state/canonical-state.js';

export interface EngineRun { readonly output: string | null; readonly invocationId: string; readonly costUsd: number; readonly cut?: readonly string[]; readonly toCheck: readonly string[];
  readonly report: readonly string[]; readonly eval: EvalSummary | null }

/**
 * WHAT THE PERSON TYPED, SORTED BY WHERE IT STANDS, never by what it says: the task is the first word that is no
 * option's value, the skill is what follows `--skill`, and everything else goes to the engine as it was typed. Read
 * by value, a task that happened to equal a model's name was taken for the model.
 */
export function sortArgs(tokens: readonly string[]): { skill: string | null; task: string | null; report: boolean; machine: boolean; rest: string[] } {
  let skill: string | null = null; let task: string | null = null; let report = false; let machine = false; const rest: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]; const eq = t.startsWith('--') ? t.indexOf('=') : -1; const name = t.startsWith('--') ? t.slice(2, eq === -1 ? undefined : eq) : null;
    const value = (): string | null => (eq !== -1 ? t.slice(eq + 1) : tokens[i + 1] ?? null);
    const takesNext = name !== null && eq === -1 && (VALUED_OPTIONS.includes(name) || name === 'with');
    if (name === 'skill') skill = value();
    else if (name === 'task') task = value();
    else if (name === 'report') report = true;
    else if (name === 'json' || name === 'answer-only') { machine = true; rest.push(t); }
    else if (name !== null) { rest.push(t); if (takesNext && tokens[i + 1] !== undefined) rest.push(tokens[i + 1]); }
    else if (task === null) task = t;
    else rest.push(t);
    if (name !== null && takesNext) i += 1;
  }
  return { skill, task, report, machine, rest };
}

/**
 * The owner's rules no machine checks: a step of their method read as judgement, or a rule they made required that
 * carries no check. Required by them all the same, and counted so that a run never reads as more certain than it is.
 */
export const judgementRules = (requirements: readonly Requirement[]): number =>
  requirements.filter((r) => !r.measurement && r.authority !== 'EXPERT_REJECTED' && (r.materiality === 'REQUIRED' || r.obligation === 'JUDGEMENT')).length;

/** What the state line is made from: the run's own evaluation, and the owner's rules no machine checked on it. */
export function factsOf(run: Pick<EngineRun, 'eval' | 'toCheck'>, judgement: number): RunFacts {
  const required = run.eval?.gates.required;
  // With nothing bound to check a specific against, every specific is "to check": that is the report's to list, and
  // says nothing about this run. Counted here only where there was material and something was not found in it.
  const nothingBound = (run.eval?.gates.claims.unmeasured ?? '').startsWith('no material');
  // A rule set aside for this run (it waits for material, the request set its own length) was not checked on it.
  const waived = run.eval?.gates.applicability.waived.length ?? 0;
  const broken = (required?.broken ?? []).map((b) => ({ id: b.id, detail: b.detail, ...('label' in b && typeof b.label === 'string' ? { label: b.label } : {}) }));
  // THE ENGINE'S VERDICT STANDS. A run it calls not conformant for a reason that is no rule of the owner's (a passage
  // copied from their pieces, an invented claim delivered) is blocked for that reason, in its words.
  const verdict = run.eval && !run.eval.result.conformant && !broken.length ? [{ id: 'verdict', detail: run.eval.result.reasons[0] ?? 'the run did not conform' }] : [];
  return { applicable: required?.applicable ?? 0, held: required?.held ?? 0, judgement: judgement + waived, toCheck: nothingBound ? 0 : run.toCheck.length, broken: [...broken, ...verdict] };
}

/** The lines under the work: its state, what was done to it when anything was, and where to go next. */
export function linesFor(run: EngineRun, judgement: number): string[] {
  const { state, line } = runState(factsOf(run, judgement));
  const cut = run.cut?.length ?? 0;
  const done = [run.report.some((l) => l.startsWith('Written again')) ? 'It was written again once to meet your rules.' : '',
    cut ? `${cut} sentence${cut === 1 ? ' was' : 's were'} removed: not found in the material you gave. See them with --report.` : ''].filter(Boolean).join(' ');
  const next = state === 'BLOCKED' ? 'Not deliverable as it stands. What was checked: add --report · wrong about your work? atelier fix "<what was wrong>"'
    : 'Not right? atelier fix "<what was wrong>" · everything this run checked: add --report';
  return [line, ...(done ? [done] : []), next];
}

/** The skill a run is for: the one named, or the one this folder built. Never a guess between two. */
function skillFor(named: string | null): string {
  return named ?? loadSession().skillName ?? die('which skill? This folder has built none. Name it: atelier run --skill <name> "<task>"');
}

/** A skill that checks the work against material is not run without any: said before a draft is paid for. */
function needsMaterial(requirements: readonly Requirement[], L: store.StoreLayout): boolean {
  const against = requirements.some((r) => r.materiality === 'REQUIRED' && r.measurement && targetOf(r.measurement.observer) === 'BOUND_MATERIAL');
  return against && !store.getMaterial(L).length && !boundMaterial().length;
}

export async function run(): Promise<void> {
  const typed = sortArgs(argv.slice(1));
  const name = skillFor(typed.skill ?? flag('--skill') ?? null);
  const task = typed.task ?? die('give it something to do: atelier run "<your task>"');
  const engineArgs = ['invoke', '--skill', name, `--task=${task}`, ...typed.rest];
  // Asked for a machine's format, it is the engine's own output, untouched.
  if (typed.machine) { process.exitCode = spawnSync(process.execPath, [...process.execArgv, process.argv[1], ...engineArgs], { stdio: 'inherit' }).status ?? 1; return; }
  const L = { root: DATA, skillName: name };
  const active = store.getActive(L); const sv = active ? store.getSkillVersion(L, active) : null;
  const std = sv ? store.getStandard(L, sv.standardVersionHash) : null;
  if (std && needsMaterial(std.requirements, L)) die(`this skill checks the work against material you give it, and none was given. Add it: atelier run "${task.length > 40 ? `${task.slice(0, 37)}...` : task}" --with <file>`);
  if (process.stderr.isTTY) process.stderr.write('writing…\n');
  const engine = await new Promise<{ code: number; out: string; err: string }>((done) => {
    execFile(process.execPath, [...process.execArgv, process.argv[1], ...engineArgs, '--json'], { maxBuffer: 1 << 26, env: process.env },
      (e, out, err) => { done({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, out, err }); });
  });
  let result: EngineRun | null = null;
  try { result = JSON.parse(engine.out) as EngineRun; } catch { /* the engine said why on its own stream */ }
  const work = result?.output ?? null;
  if (!result || work === null) { process.stderr.write(engine.err); process.exitCode = engine.code || 1; return; }
  console.log(`${work.trimEnd()}\n`);
  const lines = linesFor(result, judgementRules(std?.requirements ?? []));
  for (const l of lines) console.log(l);
  if (typed.report) console.log(`\n${result.report.join('\n')}`);
  process.exitCode = lines[0].startsWith('BLOCKED') ? 1 : engine.code;
}
