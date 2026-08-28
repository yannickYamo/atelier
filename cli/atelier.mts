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
import { cmd, argv, die, loadSession, saveSession, listSessions, projectDir } from './runtime.js';
import { intake } from './commands/intake.js';
import { discover } from './commands/discover.js';
import { plan } from './commands/plan.js';
import { skill } from './commands/skill.js';
import { contract } from './commands/contract.js';
import { pending, ratifyBatch, ratifyOne, addOne, ratifyClose } from './commands/ratify.js';
import { build, revert } from './commands/build.js';
import { confirmBoundary } from './commands/confirm.js';
import { inspect, historyCmd, rollback, feedback } from './commands/inspect.js';
import { create, improve } from './commands/improve.js';
import { invoke } from './commands/invoke.js';
import { amend, sharpen, answerProbe } from './commands/amend.js';
import { reject, compare, promote, judgements } from './commands/promote.js';
import { check, profiles, carriers } from './commands/check.js';
import { reference } from './commands/reference.js';
import { enrol, terminate, type Run } from '../core/state/run-state.js';

/** Every command the dispatcher answers. Exported so a test can pin it against the docs. */
export const COMMANDS: readonly string[] = [
  'abort',
  'skill',
  'plan',
  'contract',
  'add',
  'amend',
  'answer',
  'build',
  'carriers',
  'check',
  'compare',
  'confirm',
  'create',
  'discover',
  'enrol',
  'feedback',
  'history',
  'improve',
  'inspect',
  'intake',
  'invoke',
  'judgements',
  'pending',
  'profiles',
  'promote',
  'ratify',
  'ratify-close',
  'ratify-one',
  'reference',
  'reject',
  'revert',
  'rollback',
  'sharpen',
  'status',
];

const main = async (): Promise<void> => {
  switch (cmd) {
    case 'create': return create(argv[1] ?? die('usage: atelier create <path-to-your-work>'));
    case 'intake': { intake(argv[1] ?? die('usage: atelier intake <path> [--work-type <type>]'), process.argv.includes('--work-type') ? process.argv[process.argv.indexOf('--work-type') + 1] : 'writing'); return; }
    case 'discover': return discover();
    case 'pending': { pending(); return; }
    case 'ratify': { ratifyBatch(); return; }
    case 'ratify-one': { ratifyOne(); return; }
    case 'add': { addOne(); return; }
    case 'ratify-close': { ratifyClose(); return; }
    case 'build': { build(); return; }
    case 'confirm': { confirmBoundary(); return; }
    case 'inspect': { inspect(); return; }
    case 'history': { historyCmd(); return; }
    case 'rollback': { rollback(); return; }
    case 'revert': { revert(); return; }
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
    case 'profiles': { profiles(); return; }
    case 'carriers': { carriers(); return; }
    case 'skill': return skill();
    case 'plan': { plan(); return; }
    case 'contract': return contract();
    case 'reference': return reference();
    case 'status': {
      const s = loadSession();
      console.log(`state ${s.run.state}  skill ${s.skillName ?? '(none)'}  proposals ${s.proposals.length}`
        + `  decided ${s.decided.length}  studies [${s.run.enrolments.map((e) => e.study).join(', ')}]`);
      console.log(`project ${projectDir()}`);
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
      const s = loadSession();
      const t = terminate(s.run, 'USER_ABORTED');
      if (t.ok) saveSession({ ...s, run: (t as { run: Run }).run });
      console.log('run aborted.');
      return;
    }
    case 'enrol': {
      const s = loadSession();
      const kind = (process.argv.includes('--kind') ? process.argv[process.argv.indexOf('--kind') + 1] : '') as 'DISCOVERY_STUDY' | 'BEHAVIOUR_STUDY';
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
      const known = COMMANDS.join(' · ');
      if (cmd !== undefined && cmd !== '' && cmd !== 'help' && cmd !== '--help' && cmd !== '-h') {
        die(`unknown command "${cmd}".\n  commands: ${known}`);
      }
      console.log('atelier create <path>   then: pending · ratify --decisions <json> · ratify-close · build --name <name>');
      console.log(`  every command: ${known}`);
      console.log('      models: check [--role discovery|target] · profiles · carriers [--skill <name>] [--host codex]');
      console.log('   held-out: reference --skill <name>   then: reference --score --labels <json>');
      return;
    }
  }
};

main().catch((e: unknown) => die(e instanceof Error ? e.message : String(e)));
