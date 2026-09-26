// cli/commands/verify.ts — HOLD ANY TEXT TO THE STANDARD, AND SAY EXACTLY WHERE IT BREAKS.
//
//   atelier verify --skill house-style draft.md
//   cat reply.txt | atelier verify --skill support-voice --json
//
// Runs every rule that carries a measurement against the text and prints each violation with the span
// that caused it. Exits 1 when a REQUIRED rule is broken, so it can sit in a pipeline, a pre-commit
// hook or a host hook as a gate. Rules without a measurement are listed as not checked: a rule about
// when or why is a person's to judge, and this command does not pretend otherwise.

import { readFileSync, existsSync } from 'node:fs';
import * as store from '../../core/state/store.js';
import { verifyText, describeVerify } from '../../core/observers/verify.js';
import { DATA, argv, flag, positional, assertSkillName } from '../runtime.js';

export { verifyText, describeVerify, describeMeasurement } from '../../core/observers/verify.js';

export async function verify(): Promise<void> {
  const name = flag('--skill') ?? fail('--skill <name> required: atelier verify --skill <name> <file>   (or pipe the text in)');
  const L: store.StoreLayout = { root: DATA, skillName: assertSkillName(name) };
  const active = store.getActive(L) ?? fail(`no built skill called "${name}".`);
  const sv = store.getSkillVersion(L, active) ?? fail(`skill version ${active} is missing.`);
  const v = store.getStandard(L, sv.standardVersionHash) ?? fail(`standard ${sv.standardVersionHash} is missing.`);
  const file = positional([name]);
  let text: string;
  if (file && file !== '-') {
    if (!existsSync(file)) fail(`there is no file at ${file}.`);
    text = readFileSync(file, 'utf8');
  } else {
    if (process.stdin.isTTY) fail('give it a file, or pipe the text in: atelier verify --skill <name> draft.md');
    let data = '';
    for await (const chunk of process.stdin) data += (chunk as Buffer).toString();
    text = data;
  }
  if (!text.trim()) fail('there is no text to check. An empty input passing would read as a clean result.');
  const report = verifyText(name, v, text);
  console.log(argv.includes('--json') ? JSON.stringify(report, null, 1) : describeVerify(report));
  if (report.failed) process.exitCode = 1;
}

/**
 * EXIT 2 FOR "COULD NOT CHECK", 1 FOR "CHECKED AND FAILED". A gate that reads exit 1 as a broken rule
 * must not be handed a missing file under the same code.
 */
const fail = (m: string): never => { console.error(`atelier: ${m}`); process.exit(2); };

