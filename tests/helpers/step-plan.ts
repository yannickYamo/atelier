// tests/helpers/step-plan.ts — THE STEP-CHECK READING, ANSWERED BY THE TEST DOUBLE, GROUNDED BY THE PRODUCT.
//
// A method's stated steps get their checks from a reading (core/method/step-check.ts): a model answers, code grounds.
// In tests the model is the stand-in (tests/fixtures/step-check-stand-in.mjs), which answers as the old step readers
// would have; the grounding, the spec parser, the sandbox and the method standard are the product's own. So a test
// that calls `mp` exercises everything but the model.
import { methodProposals, proposalsAcross, stepsOf, outlineOf, type MethodProposal } from '../../core/method/standard.js';
import { STEP_CHECK, planOf, stepCheckInput, type StepPlan, type StepToCheck } from '../../core/method/step-check.js';
import { standInChecks } from '../fixtures/step-check-stand-in.js';
import { countWords } from '../../core/eval/size.js';

interface Example { readonly task: string | null; readonly material: readonly { readonly name: string; readonly text: string }[]; readonly reference: string }

/** The plan the stand-in gives a note against the owner's examples, grounded by the reading's own code. */
export function standInPlan(note: string, cases: readonly (Example & { readonly id?: string })[]): StepPlan | null {
  const steps: StepToCheck[] = stepsOf(note).map((st, i) => ({ id: String(i + 1), text: st.text, under: st.under }));
  if (!steps.length || !cases.length) return null;
  const input = stepCheckInput(steps, cases.map((c, i) => ({ id: c.id ?? `e${i + 1}`, task: c.task, material: c.material, reference: c.reference })), outlineOf, countWords);
  const raw = standInChecks({ steps: steps.map((s) => ({ ...s })), example: { sections: [...input.example.sections], tables: input.example.tables.map((t) => [...t.header]), labels: input.example.labels } });
  const value = STEP_CHECK.ground(raw, input) ?? STEP_CHECK.floor(input);
  return planOf(steps, value);
}

/** `methodProposals` with the stand-in's plan. */
export const mp = (note: string, example: Example): MethodProposal[] => methodProposals(note, example, standInPlan(note, [example]));

/** `proposalsAcross` with the stand-in's plan, read against every example as the build does. */
export const pa = (note: string, cases: readonly (Example & { readonly id: string })[]): ReturnType<typeof proposalsAcross> => proposalsAcross(note, cases, standInPlan(note, cases));
