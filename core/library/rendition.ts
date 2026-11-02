// atelier/core/library/rendition.ts — THE PLAIN MODEL'S HABITS IN FORM, WRITTEN DOWN SO THEY CAN BE REFUSED.
//
// The build already has the model write plain drafts on the author's own topics, with no skill (the comparison in
// ../observers/contrast.ts). Those drafts show what the model does by default for this kind of piece: how it opens,
// how it is built, how it closes. A default that is written down can be refused; one left unsaid comes back in every
// draft. So one reading summarises the drafts' form in three to six short lines, each grounded by quotes code finds in
// at least two of the drafts (a habit seen once is not a habit), and the skill keeps the result as "the default to
// avoid in form". Only form: the drafts' content and positions are never summarised or served.
//
// The writer is told these as habits to avoid unless the author's own pieces use them (`renditionNote`).

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Reading } from '../inference/reading.js';
import type { StoreLayout } from '../state/store.js';
import { writeAtomic } from '../state/fs-atomic.js';
import { readJson } from '../state/read-json.js';
import { skillDir } from './state.js';

export const RENDITION_PARTS = ['OPENING', 'STRUCTURE', 'CLOSING'] as const;
export type RenditionPart = typeof RENDITION_PARTS[number];
export interface RenditionHabit { readonly part: RenditionPart; readonly habit: string; readonly quotes: readonly { readonly draft: number; readonly quote: string }[] }
export interface RenditionPrior { readonly kind: string; readonly habits: readonly RenditionHabit[]; readonly drafts: number }

export interface RenditionInput { readonly kind: string; readonly drafts: readonly string[] }

/** The most habits kept, and the fewest drafts a habit must be quoted from (fewer when fewer drafts were written). */
export const MAX_HABITS = 6;
export const MIN_DRAFTS_PER_HABIT = 2;
/** How much of each draft the reader is shown: its head and its tail, where openings and closings are. */
const HEAD = 1500; const TAIL = 700; const MAX_SHOWN = 8;

export const RENDITION_SYSTEM = `You are shown several plain drafts a model wrote, with no guidance, for one kind of piece. Describe what they do by default in FORM only: how they open, how they are structured, how they close. Never their topics, claims or positions.

Write three to six habits. Each: part (OPENING, STRUCTURE or CLOSING), habit (one short line, a pattern a writer could avoid, e.g. "opens on a question to the reader"), and quotes: for each draft that shows it, the draft's number and a short quote copied exactly from it. Only list a habit that at least two drafts share.`;
export const RENDITION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { habits: { type: 'array', items: { type: 'object', properties: {
    part: { type: 'string', enum: [...RENDITION_PARTS] }, habit: { type: 'string' },
    quotes: { type: 'array', items: { type: 'object', properties: { draft: { type: 'integer' }, quote: { type: 'string' } }, required: ['draft', 'quote'], additionalProperties: false } },
  }, required: ['part', 'habit', 'quotes'], additionalProperties: false } } },
  required: ['habits'], additionalProperties: false,
};
const norm = (s: string): string => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
const shown = (d: string): string => (d.length <= HEAD + TAIL ? d : `${d.slice(0, HEAD)}\n[…]\n${d.slice(-TAIL)}`);

export const RENDITION: Reading<RenditionInput, RenditionPrior> = {
  id: 'rendition-prior', version: '1', system: RENDITION_SYSTEM, schema: RENDITION_SCHEMA,
  toolName: 'emit_habits', toolDescription: 'The plain drafts\' default habits in form, each quoted from the drafts that show it.',
  maxTokens: 1200, estimateUsd: 0.01,
  prompt(input) {
    return [`The kind of piece: ${input.kind}`, ...input.drafts.slice(0, MAX_SHOWN).map((d, i) => `Draft ${i + 1}:\n${shown(d)}`)].join('\n\n');
  },
  // Fewer than two drafts show no default: nothing to read.
  decide(input) { return input.drafts.filter((d) => d.trim()).length < 2 ? { kind: input.kind, habits: [], drafts: input.drafts.length } : null; },
  ground(raw, input) {
    const r = raw as { habits?: unknown } | null;
    if (!r || !Array.isArray(r.habits)) return null;
    const drafts = input.drafts.slice(0, MAX_SHOWN).map(norm);
    const need = Math.min(MIN_DRAFTS_PER_HABIT, drafts.length);
    const habits: RenditionHabit[] = [];
    for (const h of r.habits as Record<string, unknown>[]) {
      const part = (RENDITION_PARTS as readonly string[]).includes(String(h?.part)) ? h.part as RenditionPart : null;
      const habit = typeof h?.habit === 'string' ? h.habit.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
      if (!part || !habit || !Array.isArray(h.quotes)) continue;
      // Each quote must be in the draft it names (numbered from 1); one quote per draft counts.
      const quotes = new Map<number, string>();
      for (const q of h.quotes as Record<string, unknown>[]) {
        const i = typeof q?.draft === 'number' ? q.draft - 1 : -1; const text = typeof q?.quote === 'string' ? q.quote.trim().slice(0, 200) : '';
        if (i >= 0 && i < drafts.length && !quotes.has(i) && norm(text).length >= 4 && drafts[i].includes(norm(text))) quotes.set(i, text);
      }
      if (quotes.size < need) continue;
      habits.push({ part, habit, quotes: [...quotes].map(([i, quote]) => ({ draft: i + 1, quote })) });
      if (habits.length >= MAX_HABITS) break;
    }
    return habits.length ? { kind: input.kind, habits, drafts: input.drafts.length } : null;
  },
  // No model, or nothing grounded: no prior, and the writer is told nothing.
  floor(input) { return { kind: input.kind, habits: [], drafts: input.drafts.length }; },
};

const PART_LABEL: Readonly<Record<RenditionPart, string>> = { OPENING: 'Opening', STRUCTURE: 'Structure', CLOSING: 'Closing' };

/** What the writer is told: the habits as form to avoid, unless the author's own pieces use them. Empty with no habits. */
export function renditionNote(prior: RenditionPrior | null): string {
  if (!prior?.habits.length) return '';
  const order = (p: RenditionPart): number => RENDITION_PARTS.indexOf(p);
  const lines = [...prior.habits].sort((a, b) => order(a.part) - order(b.part)).map((h) => `- ${PART_LABEL[h.part]}: ${h.habit}`);
  return `These are the plain model's habits for this kind: avoid them in form unless the author's own pieces use them.\n\n${lines.join('\n')}`;
}

const FILE = 'rendition-prior.json';
/** Kept with the skill, beside its other state: written at build, read on each run. */
export function writeRenditionPrior(l: StoreLayout, prior: RenditionPrior): void {
  const dir = skillDir(l); mkdirSync(dir, { recursive: true });
  writeAtomic(join(dir, FILE), JSON.stringify(prior, null, 1));
}
/** The kept prior; null where none was written or it cannot be read (a run then serves none). */
export function readRenditionPrior(l: StoreLayout): RenditionPrior | null {
  const p = join(skillDir(l), FILE);
  if (!existsSync(p)) return null;
  try {
    const x = readJson<Partial<RenditionPrior>>(p, { kind: 'object', what: 'the plain model\'s habits in form' });
    return typeof x.kind === 'string' && Array.isArray(x.habits) ? { kind: x.kind, habits: x.habits, drafts: typeof x.drafts === 'number' ? x.drafts : 0 } : null;
  } catch { return null; }
}
