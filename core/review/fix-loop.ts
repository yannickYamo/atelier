// atelier/core/review/fix-loop.ts — THE TOP THREE FIXES, ONE CHECK, STOP.
//
// Open-ended self-review burns calls and wears a piece down. This loop runs once: the writer rewrites the spans of
// the reviewer's first three fixes (each span alone, spliced back by code, so nothing else in the draft moves),
// then one verdict pass scores only those fixes and names at most three regressions. Nothing loops again. When the
// check finds regressions and no fix landed, the draft before the fixes is kept; otherwise the revised one is.

import { readContext, type DecidedBy, type Reading } from '../inference/reading.js';
import { quoteIsReal } from '../taste/reader.js';
import { FIX_CHECK_SYSTEM } from './prompts.js';
import type { Fix, Review, ReviewModel } from './reviewer.js';

/** How many of the reviewer's fixes are applied. */
export const FIXES_APPLIED = 3;
/** The most regressions the check may name. */
export const MAX_REGRESSIONS = 3;
/** A fix scored at or above this by the check counts as done. */
export const FIX_DONE_AT = 7;

/** Rewrite one span of the draft as the instruction says; return the new span, or null to leave it. */
export type SpanWriter = (req: { readonly draft: string; readonly span: string; readonly instruction: string }) => Promise<string | null>;

export interface AppliedFix { readonly fix: Fix; readonly before: string; readonly after: string }
export interface SkippedFix { readonly fix: Fix; readonly why: string }
export interface FixScore { readonly fix: Fix; readonly score: number; readonly done: boolean }
export interface Regression { readonly quote: string; readonly why: string }

export interface FixCheck {
  readonly scores: readonly FixScore[];
  readonly regressions: readonly Regression[];
  readonly by: DecidedBy;
  readonly why?: string;
}

export type FixStep =
  | { readonly step: 'review'; readonly review: Review }
  | { readonly step: 'apply'; readonly applied: readonly AppliedFix[]; readonly skipped: readonly SkippedFix[] }
  | { readonly step: 'check'; readonly check: FixCheck }
  | { readonly step: 'stop'; readonly why: string };

export interface FixLoopResult {
  /** the draft the loop hands back */
  readonly draft: string;
  /** true when the revised draft was kept, false when the input draft stands */
  readonly revised: boolean;
  readonly history: readonly FixStep[];
}

/** Splice a span's replacement in at its first occurrence. Code locates; meaning is the writer's. */
function splice(text: string, span: string, replacement: string): string | null {
  const at = text.indexOf(span);
  return at < 0 ? null : text.slice(0, at) + replacement + text.slice(at + span.length);
}

interface CheckIn { readonly before: string; readonly after: string; readonly applied: readonly AppliedFix[] }
interface CheckOut { readonly scores: readonly FixScore[]; readonly regressions: readonly Regression[] }

export const fixCheckReading: Reading<CheckIn, CheckOut> = {
  id: 'review-fix-check', version: '1', system: FIX_CHECK_SYSTEM,
  toolName: 'check_fixes', toolDescription: 'Score each listed fix and name at most three regressions.',
  maxTokens: 1500, estimateUsd: 0.04,
  schema: {
    type: 'object', additionalProperties: false, required: ['fixes', 'regressions'],
    properties: {
      fixes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'score'],
        properties: { n: { type: 'integer' }, score: { type: 'number' } } } },
      regressions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['quote', 'why'],
        properties: { quote: { type: 'string' }, why: { type: 'string' } } } },
    },
  },
  prompt: (x) => [
    `<fixes>\n${x.applied.map((a, i) => `${i + 1}. asked: ${a.fix.instruction}\n   before: "${a.before}"\n   after: "${a.after}"`).join('\n')}\n</fixes>`,
    `<draft_before>\n${x.before}\n</draft_before>`,
    `<draft_after>\n${x.after}\n</draft_after>`,
  ].join('\n\n'),
  decide: () => null,
  ground(raw, x) {
    const r = raw as { fixes?: unknown; regressions?: unknown } | null;
    if (!r || !Array.isArray(r.fixes)) return null;
    const scores: FixScore[] = [];
    for (const [i, a] of x.applied.entries()) {
      const s = (r.fixes as { n?: unknown; score?: unknown }[]).find((f) => f?.n === i + 1);
      if (!s || typeof s.score !== 'number' || !Number.isFinite(s.score) || s.score < 0 || s.score > 10) return null;
      scores.push({ fix: a.fix, score: s.score, done: s.score >= FIX_DONE_AT });
    }
    const regressions = (Array.isArray(r.regressions) ? r.regressions as Partial<Regression>[] : [])
      .filter((g): g is Regression => typeof g?.quote === 'string' && typeof g.why === 'string' && quoteIsReal(g.quote, x.after))
      .slice(0, MAX_REGRESSIONS);
    return { scores, regressions };
  },
  floor: () => ({ scores: [], regressions: [] }),
};

/**
 * Apply the review's first three fixes through `write`, check them once, stop. Runs only on a 'fix' verdict: a
 * 'ship' needs nothing, a 'redraft' or 'regather' needs more than span edits, and an 'unverified' review has none.
 */
export async function runFixLoop(draft: string, review: Review, write: SpanWriter, m: ReviewModel): Promise<FixLoopResult> {
  const history: FixStep[] = [{ step: 'review', review }];
  if (review.verdict !== 'fix' || review.fixes.length === 0) {
    history.push({ step: 'stop', why: review.verdict === 'fix' ? 'the review listed no fixes' : `the verdict is ${review.verdict}` });
    return { draft, revised: false, history };
  }
  let current = draft;
  const applied: AppliedFix[] = []; const skipped: SkippedFix[] = [];
  for (const fix of review.fixes.slice(0, FIXES_APPLIED)) {
    if (!current.includes(fix.quote)) { skipped.push({ fix, why: 'an earlier fix changed this span' }); continue; }
    let after: string | null;
    try { after = await write({ draft: current, span: fix.quote, instruction: fix.instruction }); }
    catch (e) { skipped.push({ fix, why: `the writer could not be asked: ${(e as Error).message.split('\n')[0]}` }); continue; }
    if (after === null || after === fix.quote) { skipped.push({ fix, why: 'the writer left the span as it was' }); continue; }
    const next = splice(current, fix.quote, after);
    if (next === null) { skipped.push({ fix, why: 'the span was not found' }); continue; }
    current = next; applied.push({ fix, before: fix.quote, after });
  }
  history.push({ step: 'apply', applied, skipped });
  if (applied.length === 0) {
    history.push({ step: 'stop', why: 'no fix was applied' });
    return { draft, revised: false, history };
  }
  const d = await readContext(fixCheckReading, { before: draft, after: current, applied }, m.client, m.model, m.budget, 'repair');
  const check: FixCheck = { scores: d.value.scores, regressions: d.value.regressions, by: d.by, ...(d.why ? { why: d.why } : {}) };
  history.push({ step: 'check', check });
  const landed = check.scores.some((s) => s.done);
  const keepRevised = !(check.by === 'model' && check.regressions.length > 0 && !landed);
  history.push({ step: 'stop', why: keepRevised ? 'one check made; the loop does not repeat' : 'the fixes landed nothing and made it worse: the draft before them stands' });
  return { draft: keepRevised ? current : draft, revised: keepRevised, history };
}
