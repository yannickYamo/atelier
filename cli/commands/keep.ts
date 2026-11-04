// cli/commands/keep.ts — WHAT YOU KEPT FROM A RUN BECOMES WHAT THE NEXT ONE IS WRITTEN FROM.
//
//   atelier keep --skill <name>                     keep the last run's piece as it was delivered
//   atelier keep --skill <name> <run> [<file>]      keep that run's piece; with a file, as you edited and published it
//   atelier keep --skill <name> <file> --request "<what it answered>"     keep a piece of yours with no run behind it
//   atelier keep --skill <name> --list | --remove <id>
//
// A kept piece joins the pieces the direct writer chooses from (core/direct/pieces.ts), first among them, and every
// sentence you changed or cut on the way from the run's piece to yours is shown to the next runs' self-review as your
// correction (core/direct/kept.ts). Only what you keep counts: a run you never kept teaches the skill nothing.

import { existsSync, readFileSync } from 'node:fs';
import * as store from '../../core/state/store.js';
import { sha } from '../../core/state/receipt.js';
import { editPairs, type KeptPiece } from '../../core/direct/kept.js';
import { titleOf } from '../../core/direct/pieces.js';
import { DATA, die, argv, flag, skillArg, positionals } from '../runtime.js';

export function keep(): void {
  const name = skillArg('--skill <name> required: atelier keep --skill <name> [<run>] [<file>]');
  const L: store.StoreLayout = { root: DATA, skillName: name };
  if (!store.getActive(L)) die(`no built skill called "${name}".`);
  const kept = store.getKept(L);
  if (argv.includes('--list')) {
    if (!kept.length) { console.log(`${name} has no kept pieces. After a run you like: atelier keep --skill ${name} [<your edited file>]`); return; }
    for (const k of kept) console.log(`  ${k.id}  ${k.at.slice(0, 10)}  ${titleOf(k.text)}  (${k.edits.length} correction(s)${k.from ? `, from run ${k.from}` : ''})`);
    return;
  }
  const removing = argv.includes('--remove');
  const args = positionals();
  if (removing) {
    const id = args[0] ?? die('--remove needs the id of a kept piece: atelier keep --skill <name> --list');
    if (!kept.some((k) => k.id === id)) die(`${name} has no kept piece ${id}: atelier keep --skill ${name} --list`);
    store.setKept(L, kept.filter((k) => k.id !== id));
    console.log(`removed ${id}; ${kept.length - 1} kept piece(s) left.`);
    return;
  }
  const runs = store.listInvocations(L);
  const runArg = args.find((a) => runs.some((r) => r.invocationId === a));
  const fileArg = args.find((a) => a !== runArg);
  if (fileArg && !existsSync(fileArg)) die(`there is no file at ${fileArg}, and no run of ${name} with that id. Nothing was kept.`);
  const run = runArg ? runs.find((r) => r.invocationId === runArg) ?? null
    // with no run named: the newest run of the person's own, never a test (a benchmark answer, a held-back case)
    : fileArg && flag('--request') ? null : [...runs].filter((r) => r.settings?.flags.testRun !== true).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  if (!run && !fileArg) die(`${name} has no run to keep yet: atelier run "<the task>", then atelier keep --skill ${name}`);
  const text = (fileArg ? readFileSync(fileArg, 'utf8') : run?.output ?? '').trim();
  if (!text) die('there is no text to keep.');
  // what it answered: as typed with --request, else as the run was asked, else the run's task up to its material
  const typed = flag('--request')?.trim();
  const fromRun = run?.direct?.asked?.trim() ? run.direct.asked : run ? run.input.split('\n\n')[0].trim() : '';
  const request = [typed, fromRun].find((x) => Boolean(x)) ?? null;
  const edits = run && fileArg ? editPairs(run.output, text) : [];
  const piece: KeptPiece = { id: `k${sha(text).slice(0, 8)}`, at: new Date().toISOString(), request, text, from: run?.invocationId ?? null, edits };
  store.setKept(L, [...kept.filter((k) => k.id !== piece.id), piece]);
  console.log(`kept ${piece.id}: "${titleOf(text)}"${run ? ` from run ${run.invocationId}` : ''}${fileArg && run ? `, with ${edits.length} correction(s) read from your edits` : ''}.`);
  console.log(`The next runs of ${name} can be written from it, and their self-review is shown your corrections. atelier keep --skill ${name} --list shows what is kept.`);
}
