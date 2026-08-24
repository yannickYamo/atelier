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
import { cmd, argv, die, loadSession, saveSession } from './runtime.js';
import { intake } from './commands/intake.js';
import { discover, pending, ratifyBatch, ratifyOne, addOne, ratifyClose } from './commands/discover.js';
import { build, revert } from './commands/build.js';
import { confirmBoundary } from './commands/confirm.js';
import { inspect, historyCmd, rollback, feedback } from './commands/inspect.js';
import { create, improve } from './commands/improve.js';
import { invoke } from './commands/invoke.js';
import { amend, sharpen, answerProbe } from './commands/amend.js';
import { reject, compare, promote } from './commands/promote.js';
import { check, profiles, carriers } from './commands/check.js';
import { reference } from './commands/reference.js';
import { enrol, terminate, type Run } from '../core/state/run-state.js';

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
    case 'improve': return improve();
    case 'feedback': { feedback(); return; }
    case 'check': return check();
    case 'profiles': { profiles(); return; }
    case 'carriers': { carriers(); return; }
    case 'reference': return reference();
    case 'status': {
      const s = loadSession();
      console.log(`state ${s.run.state}  skill ${s.skillName ?? '(none)'}  proposals ${s.proposals.length}`
        + `  decided ${s.decided.length}  studies [${s.run.enrolments.map((e) => e.study).join(', ')}]`);
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
    default:
      console.log('atelier create <path>   then: pending · ratify --decisions <json> · ratify-close · build --name <name>');
      console.log('         also: inspect · history · rollback · revert · compare · reject · feedback · status · improve · enrol · abort');
      console.log('      models: check [--role discovery|target] · profiles · carriers [--skill <name>] [--host codex]');
      console.log('   held-out: reference --skill <name>   then: reference --score --labels <json>');
  }
};

main().catch((e: unknown) => die(e instanceof Error ? e.message : String(e)));
