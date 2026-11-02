// atelier/core/library/dealer.ts — THREE DIRECTIONS DEALT BY CODE, ONE CHOSEN BY A READING.
//
// Asked to pick a direction for a piece, a model picks the most common one for its kind, every time. So the choice is
// split: CODE deals k candidates from the library (filtered by kind, weighted by how well each fits the request,
// directions this person used lately kept out, drawn with a seeded generator so a run can be replayed), and a READING
// picks one of the k with a one-line reason and adopts it whole, never a blend. The conventional way of writing the
// kind is always offered beside them as a standing exit, and never recommended.
//
// FORM ONLY, NEVER THE CALL. A direction governs how the piece is built and how it opens. The position the piece
// takes, what it argues and concludes, comes from the material and the author; the writer is told so in those words
// (`directionNote`).
//
// The per-user history is an append-only file beside the skill's other state (./state.ts), read back as the last N.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Angle, PieceKind } from './schema.js';
import type { Reading, Decision, DecidedBy } from '../inference/reading.js';
import { readContext } from '../inference/reading.js';
import type { Budget, InferenceClient } from '../inference/client.js';
import type { StoreLayout } from '../state/store.js';
import { skillDir } from './state.js';

/** The standing exit's id: write it the conventional way. */
export const CANON = 'canon';
export const CANON_LINE = 'Write it the conventional way for this kind, at the craft of the author\'s best pieces.';
/** What the writer is told about every direction, the conventional one included. */
export const FORM_ONLY = 'This direction sets how the piece is built and opens; the position it takes comes from the material and the author.';

export interface DealContext {
  readonly kind: PieceKind;
  readonly requestSummary: string;
  /** how many facts the inventory holds: a direction that runs on evidence fits a full inventory better */
  readonly inventoryCount: number;
  /** angle ids this person used lately, most recent last */
  readonly recent: readonly string[];
  readonly seed: string;
}

/** How a direction fits the request, a closed field the fit reading fills. */
export type Fit = 'STRONG' | 'SOME' | 'NONE';
/** The weight each fit draws with. NONE keeps a small chance: the deal exists to leave the obvious choice. */
export const FIT_WEIGHT: Readonly<Record<Fit, number>> = { STRONG: 3, SOME: 2, NONE: 0.5 };
/** The floor's weight: every direction alike. */
export const UNIFORM_WEIGHT = 1;
/** A recently used direction draws at this share of its weight, where too few others are left to exclude it. */
export const RECENT_PENALTY = 0.2;

// ── THE SEEDED DRAW ──────────────────────────────────────────────────────────────────────────

/** A 32-bit hash of the seed text (FNV-1a). */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** A small seeded generator (mulberry32): the same seed gives the same sequence in [0, 1). */
export function seededRandom(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * k ids drawn without replacement, each with chance proportional to its weight among those left. Deterministic for
 * a given seed and input order. A non-positive weight is never drawn.
 */
export function weightedSample(items: readonly { readonly id: string; readonly weight: number }[], k: number, seed: string): string[] {
  const rand = seededRandom(seed);
  const pool = items.filter((x) => x.weight > 0).map((x) => ({ ...x }));
  const out: string[] = [];
  while (out.length < k && pool.length) {
    const total = pool.reduce((s, x) => s + x.weight, 0);
    let r = rand() * total; let i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i].weight; if (r < 0) break; }
    out.push(pool[i].id); pool.splice(i, 1);
  }
  return out;
}

// ── THE FIT READING ──────────────────────────────────────────────────────────────────────────

export interface FitInput { readonly requestSummary: string; readonly inventoryCount: number; readonly angles: readonly Pick<Angle, 'id' | 'fitsWhen'>[] }
export type FitReading = ReadonlyMap<string, Fit>;

export const FIT_SYSTEM = `You match a writing request against directions a piece could take. Each direction says when it fits. For each direction, say how well the request fits it: STRONG (the request has what the direction runs on), SOME (it could work), or NONE (the request lacks what it needs). For STRONG or SOME, copy a short quote from the request that shows the fit. Judge only fit; never which direction is best.`;
export const FIT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { fits: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' }, fit: { type: 'string', enum: ['STRONG', 'SOME', 'NONE'] }, quote: { type: ['string', 'null'] },
  }, required: ['id', 'fit', 'quote'], additionalProperties: false } } },
  required: ['fits'], additionalProperties: false,
};
const norm = (s: string): string => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

export const FIT: Reading<FitInput, FitReading> = {
  id: 'angle-fit', version: '1', system: FIT_SYSTEM, schema: FIT_SCHEMA,
  toolName: 'emit_fit', toolDescription: 'How well the request fits each direction, with a quote from the request.',
  maxTokens: 1000, estimateUsd: 0.005,
  prompt(input) {
    return [`The request:\n${input.requestSummary.slice(0, 3000)}`, `The material holds ${input.inventoryCount} listed fact(s).`,
      `The directions:\n${input.angles.map((a) => `- ${a.id}: fits when ${a.fitsWhen}`).join('\n')}`].join('\n\n');
  },
  // One direction or none: nothing to weigh.
  decide(input) { return input.angles.length <= 1 ? new Map(input.angles.map((a) => [a.id, 'SOME'])) : null; },
  ground(raw, input) {
    const r = raw as { fits?: unknown } | null;
    if (!r || !Array.isArray(r.fits)) return null;
    const ids = new Set(input.angles.map((a) => a.id)); const request = norm(input.requestSummary);
    const out = new Map<string, Fit>();
    for (const f of r.fits as Record<string, unknown>[]) {
      const id = String(f?.id); if (!ids.has(id) || out.has(id)) continue;
      const fit = f.fit === 'STRONG' || f.fit === 'SOME' || f.fit === 'NONE' ? f.fit : null; if (!fit) continue;
      // A fit is held to its quote: one the request does not hold is no fit.
      const q = typeof f.quote === 'string' ? norm(f.quote) : '';
      out.set(id, fit === 'NONE' || (q.length >= 4 && request.includes(q)) ? fit : 'NONE');
    }
    return out.size ? out : null;
  },
  floor() { return new Map(); },
};

// ── THE DEAL ─────────────────────────────────────────────────────────────────────────────────

export interface Deal {
  readonly dealt: readonly string[];
  readonly seed: string;
  /** the weight each candidate of the kind drew with */
  readonly weights: Readonly<Record<string, number>>;
  /** who scored the fit: the model, code, or the floor (every direction alike) */
  readonly fitBy: DecidedBy;
  readonly why?: string;
}
export interface Reader { readonly client: InferenceClient | null; readonly model: string | null; readonly budget: Budget }

/**
 * The weights, by code: the fit's weight (uniform with no fit), and the person's recent directions kept out where at
 * least k others are left, drawn at RECENT_PENALTY of their weight otherwise.
 */
export function dealWeights(angles: readonly Angle[], ctx: DealContext, fit: FitReading, k: number): { readonly id: string; readonly weight: number }[] {
  const ofKind = angles.filter((a) => a.kind === ctx.kind);
  const recent = new Set(ctx.recent);
  const fresh = ofKind.filter((a) => !recent.has(a.id)).length;
  return ofKind.map((a) => {
    const f = fit.get(a.id); const w = f ? FIT_WEIGHT[f] : UNIFORM_WEIGHT;
    return { id: a.id, weight: !recent.has(a.id) ? w : fresh >= k ? 0 : w * RECENT_PENALTY };
  });
}

/** k directions of the request's kind, dealt by code. With no reader, or a fit nothing grounded, every direction weighs alike. */
export async function dealAngles(angles: readonly Angle[], ctx: DealContext, k = 3, reader?: Reader): Promise<Deal> {
  const ofKind = angles.filter((a) => a.kind === ctx.kind);
  const d: Decision<FitReading> = reader
    ? await readContext(FIT, { requestSummary: ctx.requestSummary, inventoryCount: ctx.inventoryCount, angles: ofKind }, reader.client, reader.model, reader.budget)
    : { value: FIT.decide({ requestSummary: '', inventoryCount: 0, angles: ofKind }) ?? new Map(), by: ofKind.length <= 1 ? 'code' : 'floor', reader: `${FIT.id}-${FIT.version}`, why: 'no model set up' };
  const weights = dealWeights(angles, ctx, d.value, k);
  return { dealt: weightedSample(weights, k, ctx.seed), seed: ctx.seed, weights: Object.fromEntries(weights.map((w) => [w.id, w.weight])), fitBy: d.by, ...(d.why ? { why: d.why } : {}) };
}

// ── THE CHOICE ───────────────────────────────────────────────────────────────────────────────

export interface ChooseInput { readonly candidates: readonly Angle[]; readonly requestSummary: string; readonly inventoryCount: number }
export interface Choice { readonly choice: string; readonly reason: string }

export const CHOOSE_SYSTEM = `You choose the direction one piece of writing will take. A direction sets only how the piece is built and how it opens; the position the piece takes comes from the material and the author, never from the direction.

You are shown the request and three directions, then a standing exit (the conventional way). Pick exactly one and adopt it whole: never combine two, never adapt one toward another. Give a one-line reason grounded in the request or the material. Pick the conventional way only where none of the three can be written from what the request gives.`;
export const CHOOSE_SCHEMA = (ids: readonly string[]): Record<string, unknown> => ({
  type: 'object',
  properties: { choice: { type: 'string', enum: [...ids, CANON] }, reason: { type: 'string' } },
  required: ['choice', 'reason'], additionalProperties: false,
});

/** The choice reading for a given set of candidates (the schema's enum names them). */
export function chooseReading(candidates: readonly Angle[]): Reading<ChooseInput, Choice> {
  return {
    id: 'angle-choice', version: '1', system: CHOOSE_SYSTEM, schema: CHOOSE_SCHEMA(candidates.map((c) => c.id)),
    toolName: 'emit_choice', toolDescription: 'The one direction adopted, with a one-line reason.',
    maxTokens: 300, estimateUsd: 0.003,
    prompt(input) {
      return [`The request:\n${input.requestSummary.slice(0, 3000)}`, `The material holds ${input.inventoryCount} listed fact(s).`,
        ...input.candidates.map((a, i) => `Direction ${i + 1} (${a.id}): ${a.idea}\n  structure: ${a.structure}\n  opening: ${a.openingMove}\n  runs on: ${a.evidenceType}\n  fits when: ${a.fitsWhen}`),
        `Standing exit (${CANON}, not recommended): ${CANON_LINE}`].join('\n\n');
    },
    // Nothing dealt: only the conventional way is left, decided by code.
    decide(input) { return input.candidates.length ? null : { choice: CANON, reason: 'no direction of this kind was dealt' }; },
    ground(raw, input) {
      const r = raw as { choice?: unknown; reason?: unknown } | null;
      const choice = typeof r?.choice === 'string' ? r.choice : '';
      const reason = typeof r?.reason === 'string' ? r.reason.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
      if (!reason || !(choice === CANON || input.candidates.some((c) => c.id === choice))) return null;
      return { choice, reason };
    },
    // The floor takes the first card dealt (the draw already weighed fit), never the conventional way.
    floor(input) { return input.candidates.length ? { choice: input.candidates[0].id, reason: 'the first direction dealt (no model chose)' } : { choice: CANON, reason: 'no direction of this kind was dealt' }; },
  };
}

export interface Chosen { readonly dealt: readonly string[]; readonly choice: string; readonly reason: string; readonly seed: string; readonly by: DecidedBy; readonly why?: string }

/** One of the dealt candidates, chosen by a reading with its reason; the conventional way is offered and never the floor's pick. */
export async function chooseAngle(candidates: readonly Angle[], ctx: Pick<DealContext, 'requestSummary' | 'inventoryCount' | 'seed'>, client: InferenceClient | null, model: string | null = null, budget: Budget = { spentUsd: 0, capUsd: 0.05 }): Promise<Chosen> {
  const d = await readContext(chooseReading(candidates), { candidates, requestSummary: ctx.requestSummary, inventoryCount: ctx.inventoryCount }, client, model, budget);
  return { dealt: candidates.map((c) => c.id), choice: d.value.choice, reason: d.value.reason, seed: ctx.seed, by: d.by, ...(d.why ? { why: d.why } : {}) };
}

/** What the writer is told of the direction: its structure and opening, and that the position is not the direction's. */
export function directionNote(angle: Angle | typeof CANON): string {
  if (angle === CANON) return `Direction for this piece: ${CANON_LINE}\n\n${FORM_ONLY}`;
  return [`Direction for this piece: ${angle.idea}`, `How it is built: ${angle.structure}`, `How it opens: ${angle.openingMove}`,
    `What it runs on: ${angle.evidenceType}`, ...(angle.pitfalls.length ? [`Watch for: ${angle.pitfalls.join('; ')}`] : []), '', FORM_ONLY].join('\n');
}

// ── THE HISTORY ──────────────────────────────────────────────────────────────────────────────

export interface AngleUse { readonly angle: string; readonly kind: PieceKind; readonly dealt: readonly string[]; readonly seed: string; readonly at: string }
const HISTORY = 'angle-history.jsonl';

/** One line appended per run: the direction used, what was dealt, and the seed. Never rewritten. */
export function recordAngleUse(l: StoreLayout, use: AngleUse): void {
  const dir = skillDir(l); mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, HISTORY), `${JSON.stringify(use)}\n`);
}

/** The last n uses, oldest first; a line that cannot be read is skipped, a missing file is no history. */
export function recentAngleUses(l: StoreLayout, n: number): AngleUse[] {
  const p = join(skillDir(l), HISTORY);
  if (!existsSync(p) || n <= 0) return [];
  const out: AngleUse[] = [];
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const u = JSON.parse(line) as Partial<AngleUse>; if (typeof u.angle === 'string' && typeof u.kind === 'string') out.push(u as AngleUse); } catch { /* a torn line is no use */ }
  }
  return out.slice(-n);
}

/** The ids of the last n directions used for a kind, for `DealContext.recent`. */
export function recentAngles(l: StoreLayout, n: number, kind?: PieceKind): string[] {
  return recentAngleUses(l, kind ? Number.MAX_SAFE_INTEGER : n).filter((u) => !kind || u.kind === kind).slice(-n).map((u) => u.angle);
}
