// cli/commands/export.ts — THE SKILL AS ONE FILE, FOR AN AGENT THAT CANNOT READ A FOLDER.
//
// A compiled skill is a folder: SKILL.md and the examples it points at. An agent with no file access (a
// system prompt, an API call, another tool's skill format) gets SKILL.md alone and loses the examples, and
// an outside benchmark had to inline them by hand. `invoke` already assembles the text it serves (the
// skill with its examples inlined, what the context allows); this writes that same text out, so the
// plug-in path and the runtime path serve the same thing.

import { writeAtomic } from '../../core/state/fs-atomic.js';
import { resolveServedSkill } from './invoke.js';
import { flag, skillArg } from '../runtime.js';

/** Past this many words an export says so. */
export const EXPORT_WORDS = 2500;

export function exportSkill(): void {
  const name = skillArg('--skill <name> required: atelier export --skill <name> [--out <file>]');
  const { servedText, sv } = resolveServedSkill(name);
  const out = flag('--out');
  if (!out) { process.stdout.write(`${servedText}\n`); return; }
  writeAtomic(out, `${servedText}\n`);
  const words = servedText.split(/\s+/).length;
  console.log(`wrote ${out}: ${name}, version ${sv.skillVersionHash}, ${words} words, examples inlined.`);
  // A long skill is not a better one: focused skills outperform comprehensive ones, and the hand-written skills this
  // is measured against run to about 1,200 words. Said, never trimmed here: what is shown is chosen at build.
  if (words > EXPORT_WORDS) console.log(`(${words} words is over ${EXPORT_WORDS}. Rebuild without --full, or with --voice none, for a shorter skill.)`);
}
