// cli/checks.ts — WHAT EVERY OUTPUT IS HELD TO, BUILT IN ONE PLACE.
//
// `invoke`, `verify`, the Claude Code stop hook (`record`), the MCP tool and the blind-reference loop all
// check text against a skill's standard. They used to build the check options by hand, and drifted: the
// MCP tool and the stop hook never checked the machine-writing phrases a skill had learned, although the
// README said "the same check runs" there. One constructor, so a new check reaches every surface at once.

import * as store from '../core/state/store.js';
import type { CheckOptions } from '../core/loop/run-repair.js';
import { modelSensor, patternSensor, type ClaimSensor } from '../core/loop/claim-extract.js';
import { flag, providerFor, clientAndBinding } from './runtime.js';
import { formatOf } from '../core/observers/formats.js';

/** The claim reader's default on Anthropic: small, fast, and it only has to type and quote. */
export const CLAIMS_MODEL_DEFAULT = 'claude-haiku-4-5';

/**
 * WHO READS A DRAFT FOR INVENTED CLAIMS, resolved once per command.
 *
 *   --claims pattern (ATELIER_CLAIMS=pattern)   the pattern check: offline, free, and narrow
 *   --claims-model <id> (ATELIER_CLAIMS_MODEL)  that model reads, on the provider and backend the
 *                                               discovery settings name: your own API included
 *   otherwise, on Anthropic with a key          ${CLAIMS_MODEL_DEFAULT}
 *   otherwise                                   the pattern check, and the report says why
 *
 * A backend that is not Anthropic never gets a model it did not name: an Anthropic id sent to someone's
 * own server is a 404 at best. The reader has its own small budget (ATELIER_CLAIMS_CAP, default $0.50),
 * so checking never spends the writer's calls.
 *
 * A reader gates only when its (model, version) pair is qualified (QUALIFIED_READERS); otherwise it
 * reports beside the pattern check, which gates. `ATELIER_CLAIMS_GATE=reader` lets an unqualified reader
 * gate anyway: an escape hatch for someone who has measured it on their own writing, and the sensor's
 * notes say so every time it is used.
 */
export function claimSensorFor(material: string, task: string, placeholders: boolean, strict = false): ClaimSensor {
  const mode = flag('--claims') ?? process.env.ATELIER_CLAIMS ?? 'model';
  if (mode === 'pattern') return patternSensor(material, placeholders, 'pattern check (--claims pattern)');
  const named = flag('--claims-model') ?? process.env.ATELIER_CLAIMS_MODEL;
  const provider = providerFor('discovery');
  if (!named && provider !== 'anthropic') {
    return patternSensor(material, placeholders, 'pattern check (no claim reader configured: set ATELIER_CLAIMS_MODEL to a model on your backend)');
  }
  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return patternSensor(material, placeholders, 'pattern check (no API key for the claim reader)');
  }
  const model = named ?? CLAIMS_MODEL_DEFAULT;
  const cap = Number(process.env.ATELIER_CLAIMS_CAP ?? 0.5);
  const budget = { spentUsd: 0, capUsd: Number.isFinite(cap) && cap > 0 ? cap : 0.5, maxCalls: 24 };
  return modelSensor(clientAndBinding('discovery', model).client, budget, model,
    { material, task, placeholders, strict, gateAnyway: process.env.ATELIER_CLAIMS_GATE === 'reader' });
}

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
  /** the task the person typed, when there is one: the claim reader's context, beside the material */
  readonly task?: string;
}): CheckOptions {
  const guardClaims = opts.guardClaims ?? true;
  const placeholders = opts.placeholders ?? false;
  // The format the text is: the one declared for it, or the class the standard was built from.
  const format = formatOf(flag('--class') ?? store.getDocClass(L));
  return { material: opts.material, guardClaims, placeholders, format,
    learnedTells: store.activeTells(store.getTells(L)),
    ...(guardClaims ? { claimSensor: claimSensorFor(opts.material, opts.task ?? '', placeholders, format?.strictSpecifics ?? false) } : {}) };
}

