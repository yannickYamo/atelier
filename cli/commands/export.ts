// cli/commands/export.ts — THE SKILL AS ONE FILE, FOR AN AGENT THAT CANNOT READ A FOLDER.
//
// A compiled skill is a folder: SKILL.md and the examples it points at. An agent with no file access (a
// system prompt, an API call, another tool's skill format) gets SKILL.md alone and loses the examples, and
// an outside benchmark had to inline them by hand. `invoke` already assembles the text it serves (the
// skill with its examples inlined, what the context allows); this writes that same text out, so the
// plug-in path and the runtime path serve the same thing.

import { writeAtomic } from '../../core/state/fs-atomic.js';
import { resolveServedSkill } from './invoke.js';
import * as store from '../../core/state/store.js';
import { countWords, describeParts, skillSizeOf } from '../../core/eval/size.js';
import { withoutReferenceIndex } from '../served.js';
import { argv, flag, skillArg } from '../runtime.js';

/** Past this many words an export says so. */
export const EXPORT_WORDS = 2500;

/**
 * `--no-index` leaves out the list in SKILL.md that names each example file and when it applies (cli/served.ts,
 * `withoutReferenceIndex`): in an export those files are inlined below it, each with its own condition, so the list
 * points at files that are not there. Off by default: what an export holds changes only when asked.
 */
export function exportSkill(): void {
  const name = skillArg('--skill <name> required: atelier export --skill <name> [--out <file>] [--no-index]');
  const noIndex = argv.includes('--no-index');
  const { L, servedText, sv, delivery } = resolveServedSkill(name, { index: !noIndex });
  const out = flag('--out');
  if (!out) { process.stdout.write(`${servedText}\n`); return; }
  writeAtomic(out, `${servedText}\n`);
  const words = countWords(servedText);
  console.log(`wrote ${out}: ${name}, version ${sv.skillVersionHash}, ${words} words, examples inlined${noIndex ? ', reference index left out' : ''}.`);
  // Where the words are, so a long export has a cause the person can act on (core/eval/size.ts).
  const pkg = store.getPackage(L, sv.materializedHash);
  if (pkg) console.log(`  ${describeParts(skillSizeOf(noIndex ? { ...pkg.files, 'SKILL.md': withoutReferenceIndex(pkg.files['SKILL.md'] ?? '') } : pkg.files, servedText, delivery.servedExamples))}`);
  // A long skill is not a better one: focused skills outperform comprehensive ones, and the hand-written skills this
  // is measured against run to about 1,200 words. Said, never trimmed here: what is shown is chosen at build.
  if (words > EXPORT_WORDS) console.log(`(${words} words is over ${EXPORT_WORDS}. Rebuild with --piece-budget <words>, without --full, or with --voice none, for a shorter skill.)`);
}
