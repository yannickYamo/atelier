// cli/commands/material.ts — WHAT YOU VOUCH FOR, FOR A SKILL TO DRAW ON.
//
//   atelier material --skill <name> notes.md incidents.md figures.md
//   atelier material --skill <name> --list
//   atelier material --skill <name> --clear
//   atelier material --skill <name> --cut | --no-cut
//
// A voice is made partly of specifics: stories from the author's own work, the numbers they cite and
// where those numbers come from. The skill may use these only when they are here. Everything in this
// folder is served with every task. A specific in the output it does not support is blocked, sent to review or
// listed, by the skill's latitude; it is cut only where you chose that here (`--cut`) and a qualified reader found it
// (core/loop/claim-extract.ts, `claimAction`).

import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import * as store from '../../core/state/store.js';
import { DATA, die, argv, skillArg } from '../runtime.js';

export function material(): void {
  const name = skillArg('--skill <name> required: atelier material --skill <name> <file>...');
  const L: store.StoreLayout = { root: DATA, skillName: name };
  if (!store.getActive(L)) die(`no built skill called "${name}".`);
  if (argv.includes('--clear')) { store.clearMaterial(L); console.log(`material for ${name} cleared.`); return; }
  // THE OWNER'S CHOICE TO CUT: kept with the material, and said back.
  if (argv.includes('--cut') || argv.includes('--no-cut')) {
    store.setClaimsCut(L, argv.includes('--cut'));
    console.log(argv.includes('--cut') ? `Invented specifics in ${name}'s output are cut where a qualified claim reader finds them; elsewhere they are blocked, sent to review or listed, by its latitude. --no-cut undoes it.`
      : `Nothing is cut from ${name}'s output: invented specifics are blocked, sent to review or listed, by its latitude.`);
  }
  const files = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--skill');
  if ((argv.includes('--cut') || argv.includes('--no-cut')) && !files.length) return;
  if (argv.includes('--list') || !files.length) {
    const m = store.getMaterial(L);
    if (!m.length) console.log(`${name} has no material. Add notes, stories and figures you vouch for:\n  atelier material --skill ${name} <file>...`);
    for (const x of m) console.log(`  ${x.name}  (${x.text.split(/\s+/).filter(Boolean).length} words)`);
    return;
  }
  for (const f of files) {
    if (!existsSync(f)) die(`there is no file at ${f}.`);
    store.addMaterial(L, basename(f), readFileSync(f, 'utf8'));
    console.log(`added ${basename(f)}`);
  }
  console.log(`${store.getMaterial(L).length} material file(s) for ${name}; served with every task.`);
}
