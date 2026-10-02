// atelier/core/fidelity/sections.ts — LONG FORM, ONE SECTION AT A TIME.
//
// A standard holds over a 500-word piece and drifts over a 5,000-word one: the model's attention to the
// author's paragraphs, rhythm and rules fades as the piece grows, and plain prompting drifts most there. So a
// long piece is planned first (its sections, and what each must say), then each section is written on its own
// with the whole standard served and the plan as context, then the sections are joined, and the whole piece
// goes through the same checks, repair and steering as any other output.
//
// The plan says only what each section covers, in the request's own terms; it carries no figure or name the
// request did not, and the claim floor reads the joined piece like any other.

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';

export interface SectionPlan {
  readonly sections: readonly { readonly title: string; readonly covers: string }[];
  /** whether the author's pieces of this kind carry section headings */
  readonly headings: boolean;
}

/** At most this many sections: a plan longer than this is a book, not a piece. */
export const MAX_SECTIONS = 9;

export const PLAN_SYSTEM = `You plan a long piece before it is written.

You are given the author's standard and examples (as reference material) and a request. Divide the piece the
request asks for into sections, in order. For each section give a short working title and one or two sentences
on what it covers, in the request's own terms. Add no figure, name, date or claim the request did not give.
Say whether the author's pieces of this kind use section headings.

Give between 2 and ${MAX_SECTIONS} sections.`;

export const PLAN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    sections: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, covers: { type: 'string' } }, required: ['title', 'covers'], additionalProperties: false } },
    headings: { type: 'boolean' },
  },
  required: ['sections', 'headings'], additionalProperties: false,
};

/** A validated plan, or null when the model's answer is not one (too few or too many sections, empty fields). */
export function parsePlan(raw: unknown): SectionPlan | null {
  const o = raw as { sections?: unknown; headings?: unknown } | null;
  if (!Array.isArray(o?.sections)) return null;
  const sections = (o.sections as unknown[]).flatMap((x) => {
    const s = x as { title?: unknown; covers?: unknown } | null;
    return typeof s?.title === 'string' && s.title.trim() && typeof s.covers === 'string' && s.covers.trim()
      ? [{ title: s.title.trim(), covers: s.covers.trim() }] : [];
  });
  if (sections.length < 2 || sections.length > MAX_SECTIONS) return null;
  return { sections, headings: o.headings === true };
}

/** One planning call. Throws when no valid plan comes back: the caller falls back to writing the piece whole. */
export async function planSections(client: InferenceClient, budget: Budget, served: string, task: string): Promise<SectionPlan> {
  const res = await spend(budget, 0.1, async () => {
    const x = await client.complete({ stableBlock: `${served}\n\n${PLAN_SYSTEM}`, variableBlock: task, userMessage: 'Plan the piece now.',
      toolName: 'emit_plan', toolDescription: 'Return the plan of sections.', schema: PLAN_SCHEMA, maxTokens: 2000, temperature: 0 });
    return { value: x, cost: x.cost };
  });
  const plan = parsePlan(res.json);
  if (!plan) throw new Error('the plan did not come back as 2 to 9 sections');
  return plan;
}

/** What is added to the served skill for section k: the whole plan, and which section to write now. */
export function sectionBlock(plan: SectionPlan, k: number): string {
  const list = plan.sections.map((s, i) => `${i + 1}. ${s.title}: ${s.covers}`).join('\n');
  const s = plan.sections[k];
  return `\n\n=== THE PLAN OF THE PIECE (context: write only the section named below) ===\n${list}\n`
    + `\nWrite section ${k + 1} of ${plan.sections.length} only: "${s.title}", which covers: ${s.covers}\n`
    + `Do not write the other sections, do not summarise the piece, and do not ${plan.headings ? 'add a heading (it is added for you)' : 'add a heading'}.`;
}

/** The sections joined into one piece, with headings when the author's pieces carry them. */
export function joinSections(plan: SectionPlan, texts: readonly string[]): string {
  return texts.map((t, i) => (plan.headings ? `## ${plan.sections[i].title}\n\n${t.trim()}` : t.trim())).join('\n\n');
}
