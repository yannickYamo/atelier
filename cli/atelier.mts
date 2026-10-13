#!/usr/bin/env node
/**
 * atelier — the binary the plugin's skills invoke.
 *
 * THIS IS WHERE THE PROTOCOL IS ENFORCED. The SKILL.md files tell a model what to do; this refuses
 * when the model does it in the wrong order. Guarantees that live only in prose fail silently under
 * paraphrase, and a silently unenforced protocol is worse than an absent one, because its output
 * looks identical to a correct run.
 *
 * Host-independent: it knows nothing about Claude Code. Claude Code is one caller.
 *
 * This file is dispatch and nothing else. Each command lives in `commands/`, and what they share
 * lives in `runtime.ts`.
 */
import { cmd, argv, die, flag, loadSession, saveSession, listSessions, projectDir, archiveSession, sessionPath } from './runtime.js';
import { intake } from './commands/intake.js';
import { discover } from './commands/discover.js';
import { plan } from './commands/plan.js';
import { skill } from './commands/skill.js';
import { contract } from './commands/contract.js';
import { study } from './commands/study.js';
import { pending, ratifyBatch, ratifyOne, addOne, ratifyClose } from './commands/ratify.js';
import { build, revert } from './commands/build.js';
import { confirmBoundary } from './commands/confirm.js';
import { inspect, historyCmd, rollback, feedback } from './commands/inspect.js';
import { floor } from './commands/floor.js';
import { optimize } from './commands/optimize.js';
import { mine } from './commands/mine.js';
import { taste } from './commands/taste.js';
import { tells } from './commands/tells.js';
import { tend, skillDashboard } from './commands/tend.js';
import { fidelity } from './commands/fidelity.js';
import { report as reportRun, rate } from './commands/report.js';
import { evaluate } from './commands/eval.js';
import { qualify } from './commands/qualify.js';
import { reproduce } from './commands/reproduce.js';
import { method } from './commands/method.js';
import { evolve } from './commands/evolve.js';
import { voice } from './commands/voice.js';
import { setup } from './commands/setup.js';
import { create, improve } from './commands/improve.js';
import { invoke } from './commands/invoke.js';
import { run } from './commands/run.js';
import { spawnSync } from 'node:child_process';
import { amend, sharpen, answerProbe } from './commands/amend.js';
import { reject, compare, promote, judgements } from './commands/promote.js';
import { check, profiles, carriers } from './commands/check.js';
import { exportSkill } from './commands/export.js';
import { reference } from './commands/reference.js';
import { record } from './commands/record.js';
import { fix } from './commands/fix.js';
import { newSkill } from './commands/new.js';
import { review } from './commands/review.js';
import { verify } from './commands/verify.js';
import { score } from './commands/score.js';
import { mcp } from './commands/mcp.js';
import { material } from './commands/material.js';
import { existsSync } from 'node:fs';
import { USAGE, wantsHelp, version } from './help.js';
import { enrol, terminate, type Run } from '../core/state/run-state.js';
import { policyFor } from '../core/state/policy.js';

/**
 * EVALUATION SURFACE, NOT PRODUCT SURFACE.
 *
 * `study` runs the measurement apparatus: sealing suites, scoring observers against a human key,
 * auditing whether a standard permits a valid carrier test. Every one of those is something WE do
 * to Atelier, never something a user does to their own work — being asked to hand-label thirty
 * sentences out of context is a bad experience and it is not what anyone installed this for.
 *
 * It still dispatches, because the alternative is a second binary that drifts from this one and an
 * apparatus measuring code the product does not run. It is simply not offered.
 */
const EVAL_ONLY: readonly string[] = ['study'];

/** Every command the dispatcher answers. Exported so a test can pin it against the docs. */
export const COMMANDS: readonly string[] = [
  'new',
  'review',
  'verify',
  'score',
  'mcp',
  'material',
  'abort',
  'skill',
  'plan',
  'contract',
  'study',
  'add',
  'amend',
  'answer',
  'build',
  'carriers',
  'check',
  'export',
  'compare',
  'confirm',
  'create',
  'discover',
  'enrol',
  'feedback',
  'fix',
  'floor',
  'history',
  'improve',
  'inspect',
  'intake',
  'invoke',
  'run',
  'lab',
  'mine',
  'taste',
  'tend',
  'fidelity',
  'report',
  'rate',
  'eval',
  'qualify',
  'reproduce',
  'method',
  'evolve',
  'voice',
  'setup',
  'tells',
  'optimize',
  'judgements',
  'pending',
  'profiles',
  'promote',
  'ratify',
  'ratify-close',
  'ratify-one',
  'record',
  'reference',
  'reject',
  'revert',
  'rollback',
  'sharpen',
  'status',
];

/**
 * WHAT A PERSON SEES FIRST: build, run, react. Three commands carry the product; everything else is still here,
 * under `atelier lab`, for whoever wants it. A newcomer read forty commands to find these three.
 */
export const FRONT_DOOR: readonly string[] = [
  'atelier: your method and your best work, turned into a skill that holds new work to them.',
  '',
  '  atelier new <your-work> --method <how-you-do-it.md>    build a skill from your method and your finished examples',
  '  atelier run "<task>"                                   do new work with it, checked (or /<skill> in Claude Code)',
  '  atelier fix "<what was wrong>"                         say what was wrong, in your own words',
  '',
  '  No written method yet? atelier new <your-work> "<what it is for>" reads the rules off your examples for you to approve.',
  '  atelier <command> --help explains a command. Everything else, for the curious: atelier lab',
];

/** The commands a newcomer does not need, by what they are for. Nothing is hidden: it is one command away. */
const LAB: readonly (readonly [string, readonly string[]])[] = [
  ['check and correct', ['verify', 'score', 'material', 'amend', 'add', 'status', 'report', 'rate', 'export', 'setup', 'mcp']],
  ['build, the long way', ['method', 'skill', 'review', 'pending', 'ratify', 'ratify-one', 'ratify-close', 'build', 'confirm', 'plan', 'contract', 'abort', 'check']],
  ['measure a skill', ['reproduce', 'evolve', 'eval', 'qualify', 'floor', 'reference', 'history', 'inspect']],
  ['experimental: studied, and not shown to help yet', ['fidelity', 'taste', 'tells', 'tend', 'voice', 'optimize', 'mine', 'sharpen', 'improve', 'compare', 'profiles', 'carriers']],
];

function lab(): void {
  const rest = argv.slice(1);
  // `atelier lab <command> ...` is that command: one name for the long way round, and no second way to run anything.
  if (rest.length && COMMANDS.includes(rest[0])) {
    const r = spawnSync(process.execPath, [...process.execArgv, process.argv[1], ...rest], { stdio: 'inherit' });
    process.exitCode = r.status ?? 1;
    return;
  }
  console.log('atelier lab: everything beyond build, run and fix. Each is its own command: atelier <command> --help\n');
  const listed = new Set<string>();
  for (const [what, names] of LAB) { const here = names.filter((n) => COMMANDS.includes(n)); here.forEach((n) => listed.add(n)); console.log(`  ${what}:\n    ${here.join(' · ')}`); }
  const others = COMMANDS.filter((c) => !EVAL_ONLY.includes(c)).filter((c) => !listed.has(c) && !['new', 'run', 'fix', 'invoke', 'lab'].includes(c));
  if (others.length) console.log(`  the rest:\n    ${others.join(' · ')}`);
  console.log('\n  `atelier invoke` is `atelier run` with its full report.');
}

const main = async (): Promise<void> => {
  // Answered BEFORE dispatch, so no command can run when asked about. `abort --help` used to abort.
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') { console.log(version()); return; }
  if (COMMANDS.includes(cmd) && wantsHelp(argv)) {
    console.log(`usage: ${USAGE[cmd] ?? `atelier ${cmd}`}`);
    return;
  }
  switch (cmd) {
    // ONE WAY TO BUILD. With a method note, the owner's steps are the rules and the folder is their finished work
    // (./commands/method.ts); without one, the rules are read off the folder and offered for approval.
    case 'new': return flag('--method') ? method() : newSkill();
    case 'run': return run();
    case 'lab': { lab(); return; }
    case 'review': { await review(); return; }
    case 'verify': return verify();
    case 'score': return score();
    case 'mcp': return mcp();
    case 'material': { material(); return; }
    case 'create': return create(argv[1] ?? die('usage: atelier create <path-to-your-work>'));
    case 'intake': { intake(argv[1] ?? die('usage: atelier intake <path> [--work-type <type>]'), process.argv.includes('--work-type') ? process.argv[process.argv.indexOf('--work-type') + 1] : 'writing'); return; }
    case 'discover': return discover();
    case 'pending': { pending(); return; }
    case 'ratify': { ratifyBatch(); return; }
    case 'ratify-one': { ratifyOne(); return; }
    case 'add': { addOne(); return; }
    case 'ratify-close': { ratifyClose(); return; }
    case 'build': { await build(); return; }
    case 'confirm': { confirmBoundary(); return; }
    case 'inspect': { inspect(); return; }
    case 'history': { historyCmd(); return; }
    case 'floor': { await floor(); return; }
    case 'optimize': { await optimize(); return; }
    case 'mine': { await mine(); return; }
    case 'taste': { await taste(); return; }
    case 'tells': { await tells(); return; }
    case 'tend': { await tend(); return; }
    case 'fidelity': { await fidelity(); return; }
    case 'report': { reportRun(); return; }
    case 'rate': { rate(); return; }
    case 'eval': { evaluate(); return; }
    case 'qualify': { qualify(); return; }
    case 'reproduce': { await reproduce(); return; }
    case 'method': { await method(); return; }
    case 'evolve': { await evolve(); return; }
    case 'voice': { await voice(); return; }
    case 'setup': { setup(); return; }
    case 'rollback': { rollback(); return; }
    case 'revert': { revert(); return; }
    case 'study': { study(); return; }
    case 'compare': return compare();
    case 'reject': { reject(); return; }
    case 'invoke': return invoke();
    case 'amend': { amend(); return; }
    case 'sharpen': return sharpen();
    case 'answer': { answerProbe(); return; }
    case 'promote': { promote(); return; }
    case 'judgements': { judgements(); return; }
    case 'improve': return improve();
    case 'feedback': { feedback(); return; }
    case 'check': return check();
    case 'export': { exportSkill(); return; }
    case 'profiles': { profiles(); return; }
    case 'carriers': { carriers(); return; }
    case 'skill': return skill();
    case 'plan': { plan(); return; }
    case 'contract': return contract();
    case 'record': return record();
    case 'fix': return fix();
    case 'reference': return reference();
    case 'status': {
      // With a skill: the one-page dashboard. Without: the run in flight in this project.
      const dash = flag('--skill');
      if (dash) { skillDashboard(dash); return; }
      const s = loadSession();
      console.log(`state ${s.run.state}  skill ${s.skillName ?? '(none)'}  proposals ${s.proposals.length}`
        + `  decided ${s.decided.length}  studies [${s.run.enrolments.map((e) => e.study).join(', ')}]`);
      console.log(`project ${projectDir()}`);
      // Read off core/state/policy.ts — the one owner of "what is permitted now" — rather than
      // restated here where it would drift.
      const pol = policyFor(s.run);
      if (pol.reasonIfBlocked) console.log(`blocked: ${pol.reasonIfBlocked}`);
      // Runs are keyed by the project PATH, so a moved or renamed directory shows an empty run here
      // while the old one still exists under its old name. Naming the others is the difference
      // between a recoverable situation and a baffling one.
      const others = listSessions().filter((x) => !x.here);
      if (others.length) {
        console.log(`\n${others.length} other run(s) in flight under this store:`);
        for (const o of others) console.log(`  ${o.projectDir ?? '(project not recorded)'}`);
        console.log('  Working in one of those? cd there, or set ATELIER_PROJECT_DIR to it.');
      }
      return;
    }
    case 'abort': {
      // Marked terminal AND moved aside. Terminal alone left the file in the way of every later
      // command, with advice to run the command that had just been run.
      if (!existsSync(sessionPath())) { console.log('nothing in flight here.'); return; }
      const s = loadSession();
      const t = terminate(s.run, 'USER_ABORTED');
      if (t.ok) saveSession({ ...s, run: (t as { run: Run }).run });
      const archived = archiveSession();
      if (!archived) { console.log('nothing in flight here.'); return; }
      console.log(`run aborted. What was decided is kept at ${archived}; the next command starts a new run.`);
      return;
    }
    case 'enrol': {
      const s = loadSession();
      const KINDS = ['DISCOVERY_STUDY', 'BEHAVIOUR_STUDY'] as const;
      const asked = process.argv.includes('--kind') ? process.argv[process.argv.indexOf('--kind') + 1] : undefined;
      const kind = KINDS.find((k) => k === asked) ?? die(`--kind ${KINDS.join('|')} required.`);
      const e = enrol(s.run, kind, new Date().toISOString());
      if (!e.ok) die(`${e.refusal} — ${e.detail}`);
      saveSession({ ...s, run: (e as { run: Run }).run });
      console.log(`enrolled in ${kind}.`);
      return;
    }
    default: {
      // A MISTYPED COMMAND IS AN ERROR, AND THIS USED TO EXIT 0.
      //
      // `atelier discovr` printed help and reported success, so a script could run a typo in a loop
      // and never learn the work had not happened. Help on no argument is a courtesy; help on a wrong
      // argument is a failure, and the exit code has to say which.
      //
      // The list is derived from the dispatch table rather than typed out beside it. The hand-written
      // version had drifted to omit nine registered commands, including `promote` and `confirm`,
      // which other commands tell the user to run.
      if (cmd !== undefined && cmd !== '' && cmd !== 'help' && cmd !== '--help' && cmd !== '-h') {
        die(`unknown command "${cmd}". The three you need: new, run, fix. Every other: atelier lab`);
      }
      // THE SIX VERBS A SKILL IS LIVED WITH, IN THE ORDER IT IS LIVED, THEN EVERY COMMAND ON ONE LINE:
      // AGENTS.md promises --help lists every command, and a newcomer should not have to read forty.
      for (const line of FRONT_DOOR) console.log(line);
      return;
    }
  }
};

main().catch((e: unknown) => die(e instanceof Error ? e.message : String(e)));
