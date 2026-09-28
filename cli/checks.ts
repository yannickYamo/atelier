// cli/checks.ts — WHAT EVERY OUTPUT IS HELD TO, BUILT IN ONE PLACE.
//
// `invoke`, `verify`, the Claude Code stop hook (`record`), the MCP tool and the blind-reference loop all
// check text against a skill's standard. They used to build the check options by hand, and drifted: the
// MCP tool and the stop hook never checked the machine-writing phrases a skill had learned, although the
// README said "the same check runs" there. One constructor, so a new check reaches every surface at once.

import * as store from '../core/state/store.js';
import type { CheckOptions } from '../core/loop/run-repair.js';

/**
 * The checks for one skill: the person's material (theirs to cite), the invented-claim guard, whether
 * invented material becomes a slot or is cut, and the machine-writing phrases this skill has learned.
 */
export function checksFor(L: store.StoreLayout, opts: {
  /** everything the person supplied for this output: the task, bound files, stored material */
  readonly material: string;
  /** false with `--allow-unsourced` */
  readonly guardClaims?: boolean;
  /** true with `--placeholders` */
  readonly placeholders?: boolean;
}): CheckOptions {
  return { material: opts.material, guardClaims: opts.guardClaims ?? true, placeholders: opts.placeholders ?? false,
    learnedTells: store.activeTells(store.getTells(L)) };
}
