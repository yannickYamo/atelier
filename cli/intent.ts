// cli/intent.ts — WHAT A SKILL IS FOR (GENERATE, GUARD, RESPOND), WHEREVER A COMMAND ASKS.
//
// Kept with the run where `atelier new` read it; otherwise read now by the intent reading (core/observers/intent-mode.ts),
// whose floor is the word lists. One way in, so no command reads the person's words by a pattern of its own.

import { readContext } from '../core/inference/reading.js';
import { INTENT_MODE } from '../core/observers/intent-mode.js';
import type { SkillMode } from '../core/ratification/suggest.js';
import type { InferenceClient } from '../core/inference/client.js';

/** The mode kept with the run, or the reading's of what the person said the skill is for. */
export async function intentModeOf(intent: { readonly text: string; readonly mode?: SkillMode } | null | undefined, client: InferenceClient | null, model: string | null): Promise<SkillMode> {
  if (intent?.mode) return intent.mode;
  return (await readContext(INTENT_MODE, { intent: intent?.text ?? '' }, client, model, { spentUsd: 0, capUsd: 0.05, maxCalls: 1 })).value.mode;
}
