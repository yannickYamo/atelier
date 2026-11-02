// atelier/core/library/state.ts — WHERE A SKILL'S LIBRARY STATE LIVES: BESIDE THE ANSWERS IT WAS TOLD.
//
// The dealt directions a person has used (./dealer.ts) and the plain model's habits in form (./rendition.ts) are kept
// per skill, in the same directory as `told.json` (../state/store.ts): `<root>/skills/<name>/`.

import { join } from 'node:path';
import type { StoreLayout } from '../state/store.js';

/** The skill's own directory; a name that would resolve outside `skills/` is refused, as the store refuses it. */
export function skillDir(l: StoreLayout): string {
  if (!l.skillName || l.skillName === '.' || l.skillName === '..' || /[\\/\0]/.test(l.skillName)) {
    throw new Error(`STORE: "${l.skillName}" is not a skill name; it would resolve outside skills/.`);
  }
  return join(l.root, 'skills', l.skillName);
}
