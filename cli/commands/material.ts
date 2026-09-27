// cli/commands/material.ts — WHAT YOU VOUCH FOR, FOR A SKILL TO DRAW ON.
//
//   atelier material --skill <name> notes.md incidents.md figures.md
//   atelier material --skill <name> --list
//   atelier material --skill <name> --clear
//
// A voice is made partly of specifics: stories from the author's own work, the numbers they cite and
// where those numbers come from. The skill may use these only when they are here. Everything in this
// folder is served with every task, and a first-person story or a cited figure in the output that is not
// supported by it is replaced with a placeholder for you to fill (see core/loop/claims.ts).

import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import * as store from '../../core/state/store.js';
import { DATA, die, argv, skillArg } from '../runtime.js';

export function material(): void {
  const name = skillArg('--skill <name> required: atelier material --skill <name> <file>...');
  const L: store.StoreLayout = { root: DATA, skillName: name };
  if (!store.getActive(L)) die(`no built skill called "${name}".`);
  if (argv.includes('--clear')) { store.clearMaterial(L); console.log(`material for ${name} cleared.`); return; }
  const files = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--skill');
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
