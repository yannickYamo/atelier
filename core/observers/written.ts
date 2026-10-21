// atelier/core/observers/written.ts — A CHECK WRITTEN FOR ONE STEP, RUN WHERE IT CAN TOUCH NOTHING.
//
// The twenty-two counted observers hold what a house style can measure. A step of a person's method asks for more
// than they count: "every time estimate has a unit", "no colour as a hex value", "groups of at most five items".
// Where no observer holds the step, a model writes the check (core/method/step-check.ts), as a person would write
// an assertion, and this observer runs it. The code is the measurement's own parameter, so the standard's hash
// covers it: a changed check is a changed standard.
//
// WHAT A WRITTEN CHECK MAY DO. Read the text, the request and the material it is handed; return a verdict with the
// spans it read. Nothing else: it runs in a context of its own with no `require`, no `process`, no network, no
// clock, and a time limit. A check that throws, runs past its limit or returns the wrong shape has not run, and says
// so (NOT_APPLICABLE), never a verdict.
//
// WHAT A WRITTEN CHECK MAY NOT DO. Block. It reports until it is qualified (core/method/mutants.ts): it must pass the
// owner's own examples and catch edits of them that break only its step. Until then its measurement carries no
// `qualified` mark, and the plan does not enforce it (core/plan/execution-plan.ts). The owner ratifies it with one
// pass and one fail example on the build screen, like any rule.

import { createContext, Script, type Context } from 'node:vm';
import type { Measurement } from '../state/canonical-state.js';
import type { CheckContext, Observer, ObserverResult, Span } from './registry.js';

/** How long one run of a written check may take, in milliseconds. */
export const CHECK_TIME_LIMIT_MS = 100;
/** The most source a written check may carry. */
export const CHECK_SOURCE_MAX = 4000;

export interface CheckOutcome {
  readonly ok: boolean;
  readonly detail?: string;
  readonly spans?: readonly { readonly start: number; readonly end: number; readonly why?: string }[];
  /** the measured quantity, where the check counts one */
  readonly value?: number;
}

/** The function a written check compiles to: a verdict on a text, given the request and the material. */
export type CompiledCheck = (text: string, context?: CheckContext) => CheckOutcome | null;

const source = (p: Measurement['params']): string => (Array.isArray(p.source) && typeof p.source[0] === 'string' ? p.source.join('\n') : '');
const means = (p: Measurement['params']): string => (Array.isArray(p.means) && typeof p.means[0] === 'string' ? p.means[0] : 'a check written for this step');

/**
 * Compile a check's source into a function, in a context with nothing in it. The source is one function expression
 * `(text, request, material) => ({ ok, detail, spans })`, or a function declaration named `check`. Returns the
 * problem, in words, where it cannot be compiled.
 */
export function compileCheck(src: string): { fn: CompiledCheck; problem?: undefined } | { fn?: undefined; problem: string } {
  const s = src.trim();
  if (!s) return { problem: 'the check has no source' };
  if (s.length > CHECK_SOURCE_MAX) return { problem: `the check's source is longer than ${CHECK_SOURCE_MAX} characters` };
  // No way out of the sandbox is given: the only names in it are the language's own, and the two this file sets.
  const sandbox: { __fn?: unknown; __args?: { text: string; request: string; material: { name: string; text: string }[] } } = Object.create(null) as typeof sandbox;
  const context: Context = createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  try {
    const wrapped = /^\s*function\s+check\b/.test(s) ? `${s}; check` : `(${s})`;
    sandbox.__fn = new Script(wrapped, { filename: 'check.js' }).runInContext(context, { timeout: CHECK_TIME_LIMIT_MS });
  } catch (e) { return { problem: `the check does not compile: ${(e as Error).message.split('\n')[0]}` }; }
  if (typeof sandbox.__fn !== 'function') return { problem: 'the check is not a function' };
  // EVERY CALL RUNS INSIDE THE TIMED EVALUATION. A function handed out of the context and called from here would run
  // with no limit; so the call is itself a script of the context, and a loop that never ends is stopped there.
  const call = new Script('__fn(__args.text, __args.request, __args.material)', { filename: 'check-call.js' });
  const compiled: CompiledCheck = (text, ctx) => {
    sandbox.__args = { text, request: ctx?.request ?? '', material: (ctx?.material ?? []).map((m) => ({ name: m.name, text: m.text })) };
    const r: unknown = call.runInContext(context, { timeout: CHECK_TIME_LIMIT_MS });
    if (r === null || r === undefined) return null;
    if (typeof r !== 'object' || typeof (r as { ok?: unknown }).ok !== 'boolean') throw new Error('the check returned no { ok } object');
    const x = r as { ok: boolean; detail?: unknown; spans?: unknown; value?: unknown };
    const isSpan = (sp: unknown): sp is { start: number; end: number; why?: string } => typeof sp === 'object' && sp !== null && Number.isInteger((sp as { start?: unknown }).start) && Number.isInteger((sp as { end?: unknown }).end);
    const spans: { start: number; end: number; why?: string }[] = Array.isArray(x.spans) ? (x.spans as unknown[]).filter(isSpan) : [];
    return { ok: x.ok, ...(typeof x.detail === 'string' ? { detail: x.detail.slice(0, 300) } : {}), spans: spans.map((sp) => ({ start: sp.start, end: sp.end, ...(typeof sp.why === 'string' ? { why: sp.why.slice(0, 200) } : {}) })),
      ...(typeof x.value === 'number' && Number.isFinite(x.value) ? { value: x.value } : {}) };
  };
  return { fn: compiled };
}

/** Run a compiled check on a text; a check that throws or runs past its limit has not run, and the result says so. */
export function runCheck(fn: CompiledCheck, text: string, context: CheckContext | undefined, what: string): ObserverResult {
  let r: CheckOutcome | null;
  try { r = fn(text, context); } catch (e) {
    return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: `the check could not run (${(e as Error).message.split('\n')[0]})` };
  }
  if (r === null) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: `${what}: nothing in this text to read it on` };
  const spans: Span[] = (r.spans ?? []).filter((sp) => sp.start >= 0 && sp.end > sp.start && sp.end <= text.length)
    .map((sp) => ({ start: sp.start, end: sp.end, text: text.slice(sp.start, sp.end), why: sp.why ?? what }));
  return { verdict: r.ok ? 'MET' : 'VIOLATED', spans: r.ok ? [] : spans, value: r.value ?? null, detail: r.detail ?? (r.ok ? `${what}: held` : `${what}: not held`) };
}

/**
 * The check as a measurement: `source` is its code (one line per array element), `means` says in words what it
 * checks, `qualified` is 1 once it passed the owner's examples and caught its mutants (core/method/mutants.ts).
 */
export const CHECK: Observer = {
  id: 'CHECK',
  describe: (p) => `${means(p)} (a check written for this step${Array.isArray(p.qualified) || p.qualified === 1 ? ', qualified on your examples' : ', not yet qualified: it reports and blocks nothing'})`,
  validate: (p) => {
    const c = compileCheck(source(p));
    if (!c.fn) return c.problem;
    const fn = c.fn;
    // It must run on nothing and on a line without throwing: a check that cannot read an empty text reads no text.
    try { fn(''); fn('One line of text.\n'); } catch (e) { return `the check throws on plain text: ${(e as Error).message.split('\n')[0]}`; }
    return null;
  },
  observe(text, p, context): ObserverResult {
    const c = compileCheck(source(p));
    if (!c.fn) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: `the check could not run (${c.problem})` };
    return runCheck(c.fn, text, context, means(p));
  },
};

/** Whether a written check has been qualified on the owner's examples and its mutants. */
export const checkQualified = (m: Measurement | null | undefined): boolean => m?.observer === 'CHECK' && (m.params.qualified === 1 || (Array.isArray(m.params.qualified) && m.params.qualified[0] === 1));
