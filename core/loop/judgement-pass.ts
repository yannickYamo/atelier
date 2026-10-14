// atelier/core/loop/judgement-pass.ts — ONE READ OF THE DRAFT AGAINST THE STEPS NO CHECK CAN READ.
//
// A method's judgement steps ("name the risk that matters most", "mark every load-bearing claim Known, Assumed
// or To verify") are planned as JUDGEMENT (../plan/execution-plan.ts): shown to the writer, never checked, and
// nothing acted on them at run time. Behind `invoke --judgement-pass` (a study arm), one model call reads the
// draft and the bound material against ONLY those steps, in the owner's words, and returns FIND/REPLACE pairs.
// Code applies each pair, and only under every guard below; a pair that fails one is refused and the refusal
// recorded with its reason.
//
// THE RULE OF THIS MODULE: THE PASS IS A REPAIR, NEVER AN OBSERVATION. It writes no line of the check report
// and nothing it does moves the evaluation record (../eval/record-build.ts): a judgement step is UNVERIFIED
// before the pass and UNVERIFIED after it, whatever the pass changed. A model that edited toward a step has
// not shown the step is met; only the owner can say that.
//
// The guards, each in code:
//   once          `find` occurs exactly once in the draft, both read with markdown emphasis taken out
//                 (`*`, `_`, backticks): 52 of 138 pairs in the measuring run failed to match for emphasis alone
//   not a title   the span is in no heading line and no table row
//   no new figure `replace` carries no digit figure (a percentage, a sum of money included) that `find` lacks
//   whole markup  the span cuts through no emphasis (an odd count of markers inside it)
//   never worse   the text after the pairs breaks no rule that held (`regressions`, the half of `acceptRepair`
//                 the ordinary repair refuses on; the other half, progress on a measured rule, is not asked of
//                 a pass that serves rules no check reads)

import type { InferenceClient, Budget } from '../inference/client.js';
import { spend } from '../inference/client.js';
import type { ExecutionPlan } from '../plan/execution-plan.js';
import type { VerifyReport } from '../observers/verify.js';
import type { JudgementPassRecord } from '../state/canonical-state.js';
import { regressions } from './repair.js';

export interface JudgementPair { readonly step: string; readonly find: string; readonly replace: string; readonly why: string }

/** How many pairs one pass may return; the rest are not read. */
export const MAX_PAIRS = 24;

/**
 * The text with markdown emphasis taken out, and for each character kept, where it sat in the original. `*` and
 * backticks go wherever they stand; `_` goes only as emphasis, never inside a word (`snake_case` is a word).
 */
export function stripEmphasis(text: string): { readonly text: string; readonly map: readonly number[] } {
  let out = ''; const map: number[] = [];
  const word = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{N}]/u.test(c);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '*' || c === '`') continue;
    if (c === '_' && !(word(text[i - 1]) && word(text[i + 1]))) continue;
    out += c; map.push(i);
  }
  return { text: out, map };
}

export type Located = { readonly start: number; readonly end: number } | { readonly refused: string };

/** Where `find` sits in `draft`, emphasis set aside on both sides; refused unless it is there exactly once. */
export function locateOnce(draft: string, find: string): Located {
  const needle = stripEmphasis(find).text.trim();
  if (!needle) return { refused: 'the find is empty' };
  const hay = stripEmphasis(draft);
  const hits: number[] = [];
  for (let at = hay.text.indexOf(needle); at !== -1; at = hay.text.indexOf(needle, at + needle.length)) hits.push(at);
  if (!hits.length) return { refused: 'the find is not in the draft' };
  if (hits.length > 1) return { refused: `the find is in the draft ${hits.length} times` };
  return { start: hay.map[hits[0]], end: hay.map[hits[0] + needle.length - 1] + 1 };
}

/** Is any line the span touches a heading (atx, or over a setext rule) or a table row. */
export function inHeadingOrTable(draft: string, start: number, end: number): boolean {
  const lines = draft.split('\n');
  let at = 0;
  for (let i = 0; i < lines.length; i++) {
    const from = at; const to = at + lines[i].length;
    at = to + 1;
    if (to < start || from >= end) continue;
    if (/^ {0,3}#{1,6}(?:\s|$)/.test(lines[i])) return true;
    if (/^\s*\|/.test(lines[i])) return true;
    if (lines[i].trim() && /^ {0,3}(?:=+|-{3,})\s*$/.test(lines[i + 1] ?? '')) return true;
  }
  return false;
}

/** Every digit figure, with the sign that changes what it says: "12", "4.5%", "$1,200", "3x". */
const figures = (s: string): string[] => (s.match(/[\p{Sc}]?\d[\d,]*(?:\.\d+)?(?:%|x\b)?/gu) ?? []).map((f) => f.replace(/,/g, ''));

/** The first figure `replace` states that `find` does not, or null when it adds none. */
export function newFigure(find: string, replace: string): string | null {
  const had = new Map<string, number>();
  for (const f of figures(find)) had.set(f, (had.get(f) ?? 0) + 1);
  for (const f of figures(replace)) { const n = had.get(f) ?? 0; if (!n) return f; had.set(f, n - 1); }
  return null;
}

/**
 * Does the span cut through emphasis: an odd number of runs of `*`, of backticks, or of `_` as emphasis inside it.
 * Runs, not characters: "Risk:** none" out of "**Risk:** none" holds one closing run of two stars, and replacing it
 * would leave the opening run with nothing to close.
 */
const cutsMarkup = (span: string): boolean => {
  const odd = (re: RegExp): boolean => ((span.match(re) ?? []).length % 2) === 1;
  return odd(/\*+/g) || odd(/`+/g) || odd(/(?<![\p{L}\p{N}_])_+|_+(?![\p{L}\p{N}_])/gu);
};

export interface Applied { readonly step: string; readonly find: string; readonly replace: string }
export interface Refused { readonly step: string; readonly find: string; readonly reason: string }

/**
 * The pairs applied in order, each located in the text as the ones before it left it, under the code guards
 * (once, not a title, no new figure, whole markup). The never-worse guard needs the check and is `judgementPass`'s.
 */
export function applyPairs(draft: string, pairs: readonly JudgementPair[]): { readonly text: string; readonly applied: Applied[]; readonly refused: Refused[] } {
  let text = draft; const applied: Applied[] = []; const refused: Refused[] = [];
  for (const p of pairs) {
    const where = locateOnce(text, p.find);
    if ('refused' in where) { refused.push({ step: p.step, find: p.find, reason: where.refused }); continue; }
    if (inHeadingOrTable(text, where.start, where.end)) { refused.push({ step: p.step, find: p.find, reason: 'the find is in a heading or a table row' }); continue; }
    const figure = newFigure(p.find, p.replace);
    if (figure !== null) { refused.push({ step: p.step, find: p.find, reason: `the replacement adds a figure the find lacks: ${figure}` }); continue; }
    if (cutsMarkup(text.slice(where.start, where.end))) { refused.push({ step: p.step, find: p.find, reason: 'the find cuts through markdown emphasis' }); continue; }
    if (p.replace === text.slice(where.start, where.end)) { refused.push({ step: p.step, find: p.find, reason: 'the replacement is the find' }); continue; }
    text = `${text.slice(0, where.start)}${p.replace}${text.slice(where.end)}`;
    applied.push({ step: p.step, find: p.find, replace: p.replace });
  }
  return { text, applied, refused };
}

/** The judgement steps the pass serves: planned JUDGEMENT, and in the owner's own words. */
export const judgementSteps = (plan: ExecutionPlan): string[] => plan.rules.filter((r) => r.role === 'JUDGEMENT' && r.stated).map((r) => r.statement.replace(/\s+/g, ' ').trim());

export const JUDGEMENT_SYSTEM = `You read a finished draft against the steps of its author's method that no check can read, and you return
the smallest edits that carry each step out in the draft.

  - Work only from the steps listed. Change nothing a listed step does not call for.
  - Each FIND is a passage copied from the draft exactly as written, long enough to occur once. Each REPLACE
    is the passage as it should read, in the draft's own voice and register.
  - Add no figure, date, name, source, quotation or result that is not in the draft or the material shown.
    Where a step asks for something the material does not give, say what is missing in plain words rather
    than inventing it.
  - Never edit a heading or a table row. Never use an em dash (—).
  - Return no pair for a step the draft already carries out; return no pairs at all when none is needed.`;

export const JUDGEMENT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: { pairs: { type: 'array', items: { type: 'object',
    properties: { step: { type: 'string' }, find: { type: 'string' }, replace: { type: 'string' }, why: { type: 'string' } },
    required: ['step', 'find', 'replace', 'why'], additionalProperties: false } } },
  required: ['pairs'], additionalProperties: false,
};

export function judgementPrompt(steps: readonly string[], draft: string, material: string): string {
  return `THE STEPS (the author's words; nothing else is to be served)\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n`
    + (material.trim() ? `THE MATERIAL (what the author supplied; the only source of specifics)\n"""\n${material.trim()}\n"""\n\n` : 'THE MATERIAL\n(none was supplied: add no specific)\n\n')
    + `THE DRAFT\n"""\n${draft}\n"""`;
}

const skipped = (why: string): JudgementPassRecord => ({ applied: 0, refused: 0, reasons: [], costUsd: 0, skipped: why });
const asPairs = (json: unknown): JudgementPair[] => {
  const raw = (json as { pairs?: unknown } | null)?.pairs;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p: unknown) => {
    const x = p as Partial<Record<keyof JudgementPair, unknown>> | null;
    return x && typeof x.find === 'string' && typeof x.replace === 'string'
      ? [{ step: typeof x.step === 'string' ? x.step : '', find: x.find, replace: x.replace, why: typeof x.why === 'string' ? x.why : '' }] : [];
  }).slice(0, MAX_PAIRS);
};

export interface JudgementPassInput {
  readonly plan: ExecutionPlan;
  readonly draft: string;
  /** what the person supplied, if anything */
  readonly material: string;
  /** the check of `draft` as the repair left it */
  readonly before: VerifyReport;
  /** the same check, on a text the pass proposes */
  readonly check: (text: string) => Promise<VerifyReport>;
}

/**
 * The pass: one call, every pair through the code guards, and the result kept only where it breaks no rule that
 * held. Where the whole set makes a rule worse, the pairs are retried one at a time, each kept on the same terms.
 * The report returned is the delivered text's; when the text is unchanged it is the one given.
 */
export async function judgementPass(client: InferenceClient, budget: Budget, c: JudgementPassInput): Promise<{ readonly text: string; readonly report: VerifyReport; readonly record: JudgementPassRecord }> {
  const steps = judgementSteps(c.plan);
  const unchanged = (record: JudgementPassRecord) => ({ text: c.draft, report: c.before, record });
  if (!steps.length) return unchanged(skipped('the method has no judgement step stated in the owner\'s words'));
  const spentBefore = budget.spentUsd;
  let pairs: JudgementPair[];
  try {
    const res = await spend(budget, 0.12, async () => {
      const x = await client.complete({ stableBlock: JUDGEMENT_SYSTEM, variableBlock: '', userMessage: judgementPrompt(steps, c.draft, c.material),
        toolName: 'emit_judgement_edits', toolDescription: 'Return the FIND/REPLACE pairs that carry the listed steps out in the draft.',
        schema: JUDGEMENT_SCHEMA, maxTokens: 4000, temperature: 0 });
      return { value: x, cost: x.cost, usage: x };
    }, 'judgement pass');
    pairs = asPairs(res.json);
  } catch (e) {
    return unchanged(skipped(`the pass could not run (${(e as Error).message.split('\n')[0]})`));
  }
  const costUsd = Math.max(0, budget.spentUsd - spentBefore);
  const guarded = applyPairs(c.draft, pairs);
  const reasons = guarded.refused.map((r) => `"${r.find.slice(0, 60)}" refused: ${r.reason}`);
  const record = (applied: number, refused: number, more: readonly string[] = []): JudgementPassRecord => ({ applied, refused, reasons: [...reasons, ...more], costUsd });
  if (!guarded.applied.length) return unchanged(record(0, guarded.refused.length));
  const after = await c.check(guarded.text);
  const worse = regressions(c.before, after);
  if (!worse.length) return { text: guarded.text, report: after, record: record(guarded.applied.length, guarded.refused.length) };
  // Together the pairs broke something that held: one at a time, each kept only where the text stays no worse.
  let text = c.draft; let report = c.before; const kept: Applied[] = []; const more: string[] = [];
  for (const a of guarded.applied) {
    const one = applyPairs(text, [{ ...a, why: '' }]);
    if (!one.applied.length) { more.push(`"${a.find.slice(0, 60)}" refused: ${one.refused[0]?.reason ?? 'could not be applied'}`); continue; }
    const r = await c.check(one.text);
    const w = regressions(report, r);
    if (w.length) { more.push(`"${a.find.slice(0, 60)}" refused: it made ${w.join(', ')} worse`); continue; }
    text = one.text; report = r; kept.push(a);
  }
  if (!kept.length) return unchanged(record(0, guarded.refused.length + guarded.applied.length, more));
  return { text, report, record: record(kept.length, guarded.refused.length + more.length, more) };
}
