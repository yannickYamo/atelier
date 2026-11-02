// cli/commands/library.ts — WHAT THE WRITING LIBRARY HOLDS HERE: THE CORE, THE PACK OVER IT, AND WHAT WAS LEFT OUT.
//
// Read-only. A person who keeps a pack (ATELIER_LIBRARY, or --pack <dir>) sees that it loaded, what it holds per kind
// of piece, and every file or entry that was left out and why. Nothing in it is served from here.

import { loadLibrary, cardsFor, anglesFor, rubricFor, beatsFor, tellsActive } from '../../core/library/loader.js';
import { flag } from '../runtime.js';

export function library(): void {
  const pack = flag('--pack');
  const lib = loadLibrary(pack ? { packDir: pack } : {});
  console.log(`Library: ${lib.sources.length ? lib.sources.join(' + ') : 'nothing found'}`);
  const kinds = [...new Set([...lib.cards, ...lib.angles, ...lib.rubrics, ...lib.beats].map((x) => x.kind))].sort();
  for (const k of kinds) {
    const r = rubricFor(lib, k);
    console.log(`  ${k}: ${cardsFor(lib, k).length} card(s), ${anglesFor(lib, k).length} angle(s), ${r ? `a rubric of ${r.criteria.length} criteria and ${r.caps.length} cap(s)` : 'no rubric'}, beats ${beatsFor(lib, k).map((b) => b.beat).join(' > ') || '(none)'}`);
  }
  const tells = tellsActive(lib);
  console.log(`  tells: ${tells.length} (${tells.filter((t) => t.status === 'banned').length} banned, ${tells.filter((t) => t.status === 'warned').length} warned)`);
  console.log(`  question wordings: ${lib.questions.length}`);
  if (lib.problems.length) {
    console.log(`\nLeft out (${lib.problems.length}):`);
    for (const p of lib.problems) console.log(`  ${p}`);
  }
}
