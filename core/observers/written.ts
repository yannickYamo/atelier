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
// owner's own examples and catch edits of them that break only its step. What it earned is recorded beside the standard
// (`StandardVersion.qualifications`), never inside the check or the standard's hash: the hash is what the owner
// ratified. Until a check is qualified the plan does not enforce it (core/plan/execution-plan.ts). The owner ratifies
// it with one pass and one fail example on the build screen, like any rule.

import { createContext, Script, type Context } from 'node:vm';
import type { Measurement, StandardVersion } from '../state/canonical-state.js';
import type { CheckContext, Observer, ObserverResult, Span } from './registry.js';

/** How long one run of a written check may take, in milliseconds. */
export const CHECK_TIME_LIMIT_MS = 100;
/** The most source a written check may carry. */
export const CHECK_SOURCE_MAX = 4000;

export interface CheckOutcome {
  readonly ok: boolean;
  readonly detail?: string;
  readonly spans?: readonly { readonly start: number; readonly end: number; readonly why?: string;
    /** the text that corrects the span in place (the value the check computed): applied by code once the check is qualified */
    readonly replacement?: string }[];
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
  // No way out of the sandbox is given: the only names in it are the language's own, and the two this file sets. NOTHING
  // OF THE HOST'S REALM CROSSES IN: the arguments go in as one JSON string and are parsed inside the context, so no
  // object the check can reach carries a host prototype (a host array's `constructor.constructor` is the host's
  // Function, which the context's code-generation ban does not cover, and `("return process")()` from it read the
  // process environment: confirmed against the built module before this line was written).
  const sandbox: { __fn?: unknown; __json?: string } = Object.create(null) as typeof sandbox;
  const context: Context = createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  try {
    const wrapped = /^\s*function\s+check\b/.test(s) ? `${s}; check` : `(${s})`;
    sandbox.__fn = new Script(wrapped, { filename: 'check.js' }).runInContext(context, { timeout: CHECK_TIME_LIMIT_MS });
  } catch (e) { return { problem: `the check does not compile: ${(e as Error).message.split('\n')[0]}` }; }
  if (typeof sandbox.__fn !== 'function') return { problem: 'the check is not a function' };
  // EVERY CALL RUNS INSIDE THE TIMED EVALUATION. A function handed out of the context and called from here would run
  // with no limit; so the call is itself a script of the context, and a loop that never ends is stopped there.
  // THE RESULT CROSSES BACK AS ONE JSON STRING, MADE INSIDE THE TIMED SCRIPT. An object handed out of the context would
  // be read by the host after the time limit ended: a getter or a Proxy trap on `ok` ran context code with no limit and
  // hung the host (confirmed with `get ok() { while (true) {} }` before this line). Serialised inside, every getter runs
  // under the limit, and the host only ever reads plain data.
  const call = new Script('(() => { const __p = JSON.parse(__json); const __r = __fn(__p.text, __p.request, __p.material); return __r === undefined ? "null" : JSON.stringify(__r); })()', { filename: 'check-call.js' });
  const compiled: CompiledCheck = (text, ctx) => {
    sandbox.__json = JSON.stringify({ text, request: ctx?.request ?? '', material: (ctx?.material ?? []).map((m) => ({ name: m.name, text: m.text })) });
    const out: unknown = call.runInContext(context, { timeout: CHECK_TIME_LIMIT_MS });
    const r: unknown = typeof out === 'string' ? JSON.parse(out) : null;
    if (r === null || r === undefined) return null;
    if (typeof r !== 'object' || typeof (r as { ok?: unknown }).ok !== 'boolean') throw new Error('the check returned no { ok } object');
    const x = r as { ok: boolean; detail?: unknown; spans?: unknown; value?: unknown };
    const isSpan = (sp: unknown): sp is { start: number; end: number; why?: string; replacement?: unknown } => typeof sp === 'object' && sp !== null && Number.isInteger((sp as { start?: unknown }).start) && Number.isInteger((sp as { end?: unknown }).end);
    const spans: { start: number; end: number; why?: string; replacement?: unknown }[] = Array.isArray(x.spans) ? (x.spans as unknown[]).filter(isSpan) : [];
    return { ok: x.ok, ...(typeof x.detail === 'string' ? { detail: x.detail.slice(0, 300) } : {}), spans: spans.map((sp) => ({ start: sp.start, end: sp.end, ...(typeof sp.why === 'string' ? { why: sp.why.slice(0, 200) } : {}),
      ...(typeof sp.replacement === 'string' && sp.replacement.length <= 400 ? { replacement: sp.replacement } : {}) })),
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
    .map((sp) => ({ start: sp.start, end: sp.end, text: text.slice(sp.start, sp.end), why: sp.why ?? what, ...(sp.replacement !== undefined ? { replacement: sp.replacement } : {}) }));
  return { verdict: r.ok ? 'MET' : 'VIOLATED', spans: r.ok ? [] : spans, value: r.value ?? null, detail: r.detail ?? (r.ok ? `${what}: held` : `${what}: not held`) };
}

/** What a check that reads the material says where none is bound: not applicable, unverified, named (core/eval/record-build.ts). */
export const MATERIAL_UNREAD = 'reads your material, and none is bound';

/**
 * DOES THE CHECK READ THE MATERIAL. Read off the check's own code, as code: the name of its third parameter in its
 * parameter list (a form, `(text, request, material) =>` or `function check(text, request, files)`), and whether its
 * body uses that name. No meaning is read: a check that never touches the parameter does not read what it holds.
 */
export function checkReadsMaterial(src: string): boolean {
  // FORM: the parameter list of an arrow function or of a function declaration named check.
  const head = /^\s*(?:function\s+check\s*)?\(([^)]*)\)/.exec(src);
  const name = head?.[1].split(',')[2]?.replace(/=.*$/s, '').trim();
  if (!head || !name || !/^[A-Za-z_$][\w$]*$/.test(name)) return false;
  // FORM: the name as a whole identifier in the rest of the code.
  return new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}(?![\\w$])`).test(src.slice(head[0].length));
}

/**
 * The check as a measurement: `source` is its code (one line per array element), `means` says in words what it
 * checks. Whether it is qualified is not in it: that is read beside the standard (`qualifiedIn`).
 */
export const CHECK: Observer = {
  id: 'CHECK',
  describe: (p) => `${means(p)} (a check written for this step)`,
  validate: (p) => {
    const c = compileCheck(source(p));
    if (!c.fn) return c.problem;
    const fn = c.fn;
    // It must run on nothing and on a line without throwing: a check that cannot read an empty text reads no text.
    try { fn(''); fn('One line of text.\n'); } catch (e) { return `the check throws on plain text: ${(e as Error).message.split('\n')[0]}`; }
    return null;
  },
  observe(text, p, context): ObserverResult {
    // A CHECK THAT READS THE MATERIAL CANNOT READ WHAT WAS NOT GIVEN: with none bound it is not applicable, never failed.
    if (!context?.material?.length && checkReadsMaterial(source(p))) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: `${MATERIAL_UNREAD}: ${means(p)} was not checked` };
    const c = compileCheck(source(p));
    if (!c.fn) return { verdict: 'NOT_APPLICABLE', spans: [], value: null, detail: `the check could not run (${c.problem})` };
    return runCheck(c.fn, text, context, means(p));
  },
};

/** Whether this standard's written check for `requirementId` is qualified on the owner's examples and its mutants. */
export const qualifiedIn = (v: Pick<StandardVersion, 'requirements' | 'qualifications'>, requirementId: string): boolean =>
  v.requirements.find((r) => r.requirementId === requirementId)?.measurement?.observer === 'CHECK' && v.qualifications?.[requirementId]?.qualified === true;
