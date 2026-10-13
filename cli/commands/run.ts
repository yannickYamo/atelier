// cli/commands/run.ts — `atelier run "<task>"`: the work, and under it the evaluation of it.
//
// `atelier invoke` is the engine and keeps its long report: every reading, what a draft cost, what was tried. `run`
// asks the engine for the same run and prints the work and its evaluation card (core/eval/run-card.ts), drawn from
// the run's one record (core/eval/record.ts): the owner's rules, what the request set, what was traced, each with
// what was observed of it. The engine's whole report is one flag away (--report) and is always kept with the run.
//
// It runs the engine as it is, in a process of its own, and reads the record it writes: there is one way a run
// happens, and this is a way of showing it.

import { execFile, spawnSync } from 'node:child_process';
import { DATA, VALUED_OPTIONS, argv, die, flag, loadSession, boundMaterial } from '../runtime.js';
import * as store from '../../core/state/store.js';
import { renderRunCard, type RunCard } from '../../core/eval/run-card.js';
import { planFor } from '../../core/plan/execution-plan.js';
import type { EvalSummary } from '../../core/eval/summary.js';
import { listEvals } from '../../core/state/eval-store.js';
import type { StandardVersion } from '../../core/state/canonical-state.js';

export interface EngineRun { readonly output: string | null; readonly invocationId: string; readonly costUsd: number; readonly cut?: readonly string[]; readonly toCheck: readonly string[];
  readonly report: readonly string[]; readonly eval: EvalSummary | null;
  /** every rule as it fared on the delivered text (cli/commands/invoke.ts, `rulesFared`); absent from a run that was not checked */
  readonly rules?: { readonly checked: readonly { readonly id: string; readonly statement: string; readonly materiality: string | null; readonly verdict: string; readonly detail: string }[];
    readonly unchecked: readonly { readonly id: string; readonly statement: string }[] } | null }

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
 * WHAT WAS DONE TO THE DRAFT, in plain words, from what the run recorded: written again and why and whether that
 * worked, what was removed.
 */
export function doneOf(run: Pick<EngineRun, 'report' | 'cut'>): string[] {
  // The engine's sentences name rules by their ids and quote each: here, only what happened, as it ended.
  const all = run.report.filter((l) => /^(?:Written again|The draft (?:runs|leaves out))/.test(l)); const last = all.at(-1) ?? '';
  const still = Number(/it now leaves out (\d+)/.exec(last)?.[1] ?? 0); const kept = all.filter((l) => l.startsWith('Written again')).length;
  const times = kept > 1 ? `${kept} times` : 'once';
  const again = !all.length ? '' : !kept ? 'one more draft was tried and was no better, so the first was kept'
    : last.includes('nearer and still outside') || still || !last.startsWith('Written again') ? `written again ${times} for what was missing${still ? `; ${still} thing${still === 1 ? ' is' : 's are'} still missing` : '; the length is nearer and still off'}`
      : `written again ${times}, and it now holds what was missing`;
  const cut = run.cut?.length ?? 0;
  return [again, cut ? `${cut} sentence${cut === 1 ? '' : 's'} removed (not found in your material)` : ''].filter(Boolean);
}

/** The card of a run: its record (core/eval/record.ts), what it cost, and what was done to the draft. */
export function cardFor(run: EngineRun): RunCard | null {
  const record = run.eval?.record;
  if (!record) return null;
  return { record, costUsd: run.costUsd, seconds: (run.eval?.durationMs ?? 0) / 1000, drafts: run.eval?.drafts ?? 1, done: doneOf(run), invocationId: run.invocationId };
}

/**
 * CAN THE WORK BE USED AS IT STANDS, AS AN EXIT CODE: the same rule however the run was asked for. Blocked is 1.
 * A run with no record is judged by the engine's own bar where it has one (a structured output held by its
 * contract), and is 1 where nothing evaluated it at all.
 */
export const exitFor = (e: EvalSummary | null | undefined): number => (e?.record ? (e.record.state === 'BLOCKED' ? 1 : 0) : e ? (e.result.conformant ? 0 : 1) : 1);

/** The evaluation of the run a machine asked for: from its JSON, or (for the bare answer) the one it stored since it began. */
function evalOfMachineRun(stdout: string, L: store.StoreLayout, began: string): EvalSummary | null {
  try { const j = JSON.parse(stdout) as Partial<EngineRun>; if (j && typeof j === 'object' && 'invocationId' in j) return j.eval ?? null; } catch { /* the bare answer */ }
  const last = listEvals(L)[0];
  return last && last.at >= began ? last : null;
}

/** The skill a run is for: the one named, or the one this folder built. Never a guess between two. */
function skillFor(named: string | null): string {
  return named ?? loadSession().skillName ?? die('which skill? This folder has built none. Name it: atelier run --skill <name> "<task>"');
}

/** Does the skill check the work against material, with none given? Said before the draft, and never a refusal. */
const needsMaterial = (std: Pick<StandardVersion, 'requirements'>, L: store.StoreLayout): boolean => planFor(std).readsMaterial && !store.getMaterial(L).length && !boundMaterial().length;

export async function run(): Promise<void> {
  const typed = sortArgs(argv.slice(1));
  const name = skillFor(typed.skill ?? flag('--skill') ?? null);
  const task = typed.task ?? die('give it something to do: atelier run "<your task>"');
  const engineArgs = ['invoke', '--skill', name, `--task=${task}`, ...typed.rest];
  // Asked for a machine's format, it is the engine's own output, untouched. The exit code is the run's all the same:
  // a script that reads only the code must not take a blocked output for a usable one.
  if (typed.machine) {
    const began = new Date().toISOString();
    const r = spawnSync(process.execPath, [...process.execArgv, process.argv[1], ...engineArgs], { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 1 << 26 });
    process.stdout.write(r.stdout);
    const code = r.status ?? 1;
    process.exitCode = code !== 0 ? code : exitFor(evalOfMachineRun(r.stdout, { root: DATA, skillName: name }, began));
    return;
  }
  const L = { root: DATA, skillName: name };
  const active = store.getActive(L); const sv = active ? store.getSkillVersion(L, active) : null;
  const std = sv ? store.getStandard(L, sv.standardVersionHash) : null;
  // NEVER REFUSED FOR WHAT IS MISSING: the work is written, the rules that needed the material are shown as not
  // checked, and the person is told how to have them checked.
  if (std && needsMaterial(std, L)) process.stderr.write('This skill checks the work against material you give it, and none was given: those rules will show as not checked. To have them checked, add --with <file>.\n');
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
  // THE EVALUATION IS PART OF WHAT A RUN RETURNS, not a report behind a flag: every rule, as it fared.
  const card = cardFor(result);
  const without = result.eval ? `  A structured output, held by its contract: ${result.eval.result.conformant ? 'it conforms' : `it does not conform (${result.eval.result.reasons.join('; ')})`}.` : '  This run was not evaluated: nothing is known about whether it holds your rules. See why: add --report';
  for (const l of card ? renderRunCard(card, process.stdout.columns || 100) : ['── Evaluation ──', without]) console.log(l);
  if (typed.report) console.log(`\n${result.report.join('\n')}`);
  process.exitCode = engine.code !== 0 ? engine.code : exitFor(result.eval);
}
