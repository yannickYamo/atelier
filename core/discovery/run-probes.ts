// atelier/core/discovery/run-probes.ts — THE QUESTION DISCOVERY CANNOT ANSWER FOR ITSELF.
//
// Discovery can show that a property RECURS. It cannot show that the author would OBJECT if it were
// missing, and those are different facts: recurrence is a pattern, preference is a standard. Until a
// person answers, every factor the chain produces is UNDERIDENTIFIED — `confidenceFrom` says so, and
// it needs a boundary observation before anything reaches SUPPORTED.
//
// ─── WHY THIS IS BOUNDED, AND HOW THE BOUND IS CHOSEN ──────────────────────────────────────────
//
// A boundary probe is not a yes/no. It writes the SAME passage three ways — too little of the
// property, about right, too much — blinds them, and asks which one the author would ship. That is
// three generations per probe, so probing ten factors would cost thirty generations and a screen
// nobody reads. `probesNeeded` is true for all ten; the budget is not.
//
// So K factors are probed, chosen by HIGHEST RECURRENCE. That is the direction that costs most to get
// wrong: a rule seen in most of the held-out work will shape almost every future output, so if it is
// a habit rather than a standard, the damage is everywhere. A rule that barely recurs will barely
// fire. The selection uses discovery evidence only and never the probe result, so it cannot be
// steered by what the answers turn out to be.
//
// ─── AND WHY THE VARIANTS ARE BLINDED ──────────────────────────────────────────────────────────
//
// Level labels appear nowhere on the sheet. An author who can see which variant is meant to be "the
// right one" is being asked a leading question, and the answer measures compliance rather than taste.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import { designProbe, blindProbe, foldProbeAnswer, interpretProbe, type BlindProbe } from './chain/boundary-probe.js';
import type { BoundaryLabel } from './chain/taste-discovery.js';
import { asText } from './text.js';

export interface ProbeCandidate {
  readonly requirementId: string;
  readonly statement: string;
  readonly appliesWhen: string;
  /** how much of the held-out work this was seen in — the selection signal, never the probe result */
  readonly recurrence: number;
}

export interface PreparedProbe {
  readonly requirementId: string;
  readonly statement: string;
  readonly blind: BlindProbe;
  readonly costUsd: number;
}

/** Declared before any probe runs: highest recurrence first, ties by id so it is reproducible. */
export function selectForProbing(candidates: readonly ProbeCandidate[], k: number): readonly ProbeCandidate[] {
  return [...candidates]
    .sort((a, b) => b.recurrence - a.recurrence || a.requirementId.localeCompare(b.requirementId))
    .slice(0, k);
}

const VARIANT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { piece: { type: 'string' } },
  required: ['piece'], additionalProperties: false,
};

/**
 * Write the three variants and blind them.
 *
 * All three are written from the SAME brief and differ only in how much of the property they carry.
 * If they differed in anything else, the author would be choosing between a good piece and a bad one
 * for some unrelated reason, and the probe would measure that instead.
 */
export async function prepareProbe(
  client: InferenceClient, budget: Budget, c: ProbeCandidate, brief: string, seed: number,
): Promise<PreparedProbe> {
  const design = designProbe(
    c.requirementId, `probe:${c.requirementId}`, c.statement,
    `Write it while deliberately doing LESS of this than the author would: ${c.statement}`,
    `Write it applying this in the measure the author's own work suggests: ${c.statement}`,
    `Write it while deliberately doing MORE of this than the author would — overdone: ${c.statement}`,
    `written fresh for this probe from a brief the author did not supply, so no variant is a golden`,
  );

  const before = budget.spentUsd;
  const written = [];
  for (const v of design.variants) {
    const text = await spend(budget, 0.05, async () => {
      const r = await client.complete({
        // the BRIEF is stable across all three; only the instruction varies. Same task, three doses.
        stableBlock: `Write a short piece for this brief. Keep it under 200 words.\n\nBRIEF: ${brief}`,
        variableBlock: v.instruction, userMessage: 'Write it now. Output only the piece.',
        toolName: 'emit_piece', toolDescription: 'Emit the piece.', schema: VARIANT_SCHEMA, maxTokens: 700,
      });
      return { value: asText((r.json as { piece?: unknown } | null)?.piece), cost: r.cost };
    });
    written.push({ level: v.level, text });
  }

  return { requirementId: c.requirementId, statement: c.statement,
    blind: blindProbe(design, written, seed), costUsd: budget.spentUsd - before };
}

export interface ProbeOutcome {
  readonly requirementId: string;
  readonly label: BoundaryLabel;
  readonly meaning: string;
  /** what the author's answer does to the rule — the only thing that should change a standard */
  readonly consequence: 'CONFIRMS' | 'NARROWS' | 'REWORD_WEAKER' | 'REWORD_STRONGER';
}

/**
 * Fold one answer. The mapping from verdict to consequence is fixed here and not left to a caller,
 * because "what does INDIFFERENT mean for the rule" is exactly the judgement that drifts.
 */
export function foldAnswer(p: PreparedProbe, pick: { shipped?: string; none?: boolean; noPreference?: readonly string[] }): ProbeOutcome {
  const label = foldProbeAnswer(p.blind, pick);
  const consequence = label.preferredLevel === 'ACCEPTABLE' ? 'CONFIRMS' as const
    : label.preferredLevel === 'INDIFFERENT' ? 'NARROWS' as const
    : label.preferredLevel === 'TOO_LITTLE' ? 'REWORD_WEAKER' as const
    : 'REWORD_STRONGER' as const;
  return { requirementId: p.requirementId, label, meaning: interpretProbe(label), consequence };
}
