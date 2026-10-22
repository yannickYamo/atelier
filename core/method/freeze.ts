// atelier/core/method/freeze.ts — A STEP'S CHECK, ONCE RATIFIED, IS KEPT WHILE THE STEP AND THE EXAMPLES ARE.
//
// The check a step carries is read by a model, several times, and the draws are kept by agreement (./step-check.ts). Read
// again on every build, the same method and the same examples gave three standards from three builds: a step that was a
// written check in one build was judgement in the next, and no written check was qualified in all three. So a check is
// frozen when the skill is built: keyed by the step's own words and the examples it was read and qualified on, a
// rebuild reuses it, qualification and all, and reads only the steps whose wording or examples changed. Rewording one
// step changes that step's check and no other. A check no model read (the floor) is never frozen: a later build with a
// model reads it.

import { createHash } from 'node:crypto';
import type { StepCheck, StepToCheck, ExampleCase } from './step-check.js';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** The examples a check was read and qualified on, as one key: each one's text, request and material, in order. */
export const examplesKey = (cases: readonly ExampleCase[]): string =>
  sha(JSON.stringify(cases.map((c) => [c.reference, c.task ?? null, c.material.map((m) => [m.name, m.text])])));

/**
 * The key a step's check is frozen under: the step's own words, the examples, and the outputs the owner rejected naming the
 * step (a check must catch those to qualify, so a new rejection reads the step again). With none, the key is as it was.
 */
export const freezeKey = (stepText: string, examples: string, rejected: readonly string[] = []): string =>
  sha(`${stepText.trim()}\u0000${examples}${rejected.length ? `\u0000${sha(JSON.stringify(rejected))}` : ''}`);

/** Rejected outputs, by the words of the step each breaks (cli/commands/method.ts, `rejectedOutputs`). */
type Rejected = ReadonlyMap<string, readonly string[]>;

/** The frozen checks, by step id, of the steps whose words, examples and rejected outputs are unchanged. */
export function frozenFor(steps: readonly StepToCheck[], examples: string, frozen: Readonly<Record<string, StepCheck>>, rejected: Rejected = new Map()): Map<string, StepCheck> {
  return new Map(steps.flatMap((st) => { const f = frozen[freezeKey(st.text, examples, rejected.get(st.text) ?? [])]; return f ? [[st.id, { ...f, frozen: true as const }]] : []; }));
}

/**
 * What a build freezes: every check a model read, by its key, with what the step is (a prohibition or a thing to do) where
 * a model read that too: the kind is in the standard and its hash, so read again it moved the hash of an unchanged
 * method. A floor check is left to be read again.
 */
export function toFreeze(steps: readonly StepToCheck[], chosen: Readonly<Record<string, StepCheck>>, examples: string,
  kinds: ReadonlyMap<string, 'BOUNDARY' | 'GENERATIVE'> = new Map(), rejected: Rejected = new Map()): Record<string, StepCheck> {
  return Object.fromEntries(steps.flatMap((st) => {
    const c = chosen[st.id];
    if (c?.by !== 'model') return [];
    const { frozen: _f, ...kept } = c; void _f;
    const kind = kinds.get(st.text.trim());
    return [[freezeKey(st.text, examples, rejected.get(st.text) ?? []), { ...kept, ...(kind ? { kind } : {}) }]];
  }));
}

/** The kinds frozen with the checks of steps whose words and examples are unchanged, by the step's words. */
export function frozenKinds(steps: readonly { readonly text: string }[], examples: string, frozen: Readonly<Record<string, StepCheck>>, rejected: Rejected = new Map()): Map<string, 'BOUNDARY' | 'GENERATIVE'> {
  return new Map(steps.flatMap((st) => { const k = frozen[freezeKey(st.text, examples, rejected.get(st.text) ?? [])]?.kind; return k ? [[st.text.trim(), k] as const] : []; }));
}
