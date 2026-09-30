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

export function exportSkill(): void {
  const name = skillArg('--skill <name> required: atelier export --skill <name> [--out <file>]');
  const { servedText, sv } = resolveServedSkill(name);
  const out = flag('--out');
  if (!out) { process.stdout.write(`${servedText}\n`); return; }
  writeAtomic(out, `${servedText}\n`);
  console.log(`wrote ${out}: ${name}, version ${sv.skillVersionHash}, ${servedText.split(/\s+/).length} words, examples inlined.`);
}
