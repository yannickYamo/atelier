// atelier/core/loop/execution-brief.ts — WHICH OF THE METHOD'S DECISIONS THIS REQUEST ASKS FOR, SAID BEFORE THE DRAFT.
//
// The method is served whole on every request, and every stated step was compiled as applying always. A writer given
// seventy steps and one request had to decide alone which applied; it filled the template, and the reader found the
// misses afterwards. The brief is the step before the draft: for each stated step with a condition in its own words
// (core/method/decision-units.ts), whether this request falls under it; the decisions the applying steps ask for, in
// their order; what the request and its material give; and which decisions the material cannot support, named so the
// writer leaves them open rather than inventing them.
//
// Authority: a step with no condition applies by code and is never read. A step a reading could not place applies
// (core/state/contract.ts, `applies`). A step set aside is set aside for the writer and marked so in the evaluation,
// where a required one keeps the run at NEEDS REVIEW: nothing here changes the standard. Concise by construction: step
// numbers and one line each, never the method pasted back. Evaluated in bench/readings/cases/execution-brief.json.

import type { Reading } from '../inference/reading.js';
import type { Applicability } from '../state/contract.js';
import { applies as holds } from '../state/contract.js';
import type { DecisionUnit } from '../state/canonical-state.js';
import { quoteIsReal } from '../taste/reader.js';

export interface BriefStep {
  /** the requirement id */
  readonly id: string;
  /** the step number as the method lists it (1-based, in the standard's order) */
  readonly n: number;
  readonly statement: string;
  readonly required: boolean;
  readonly unit: DecisionUnit | null;
}
export interface BriefInput {
  readonly request: string;
  /** the bound material's names, and a short head of each: what the writer was given beyond the request */
  readonly material: readonly { name: string; head: string }[];
  readonly steps: readonly BriefStep[];
}
export interface Placement { readonly applies: Applicability; readonly why: string | null }
export interface Brief {
  /** every step by id: applies by code (no condition), or as read */
  readonly placed: Readonly<Record<string, Placement>>;
  /** ids of applying steps whose decision the request and material cannot support, as read; empty by code */
  readonly unsupported: readonly string[];
  readonly by: 'code' | 'model' | 'floor';
}

const conditional = (s: BriefStep): boolean => s.unit !== null && (s.unit.condition !== null || s.unit.exception !== null);

export const EXECUTION_BRIEF_SYSTEM = `You read one request, the material that came with it, and the numbered steps of the person's own method that apply only under a condition. For each step say whether this request falls under its condition:

- APPLIES: the request or its material is the case the condition names. Quote the words of the request or material that show it.
- SET_ASIDE: the request is plainly not that case. Quote the words of the request that show it is not; without such words, answer UNRESOLVED.
- UNRESOLVED: the request does not say. The step will be treated as applying.

Then, over the steps that apply (the unconditional ones are listed too), name the steps whose decision the request and material give nothing to make: no figure, no fact, no instruction that the decision would rest on. These are left open by the writer, never invented.

Quote character for character. Never set a step aside on a guess: the person wrote it to be followed.`;

export const EXECUTION_BRIEF_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    placed: { type: 'array', items: { type: 'object', properties: { n: { type: 'number' }, applies: { type: 'string', enum: ['APPLIES', 'SET_ASIDE', 'UNRESOLVED'] }, quote: { type: ['string', 'null'] } },
      required: ['n', 'applies', 'quote'], additionalProperties: false } },
    unsupported: { type: 'array', items: { type: 'number' } },
  },
  required: ['placed', 'unsupported'], additionalProperties: false,
};

const givenText = (input: BriefInput): string => `${input.request}\n${input.material.map((m) => `${m.name}\n${m.head}`).join('\n')}`;

export const EXECUTION_BRIEF: Reading<BriefInput, Brief> = {
  id: 'execution-brief', version: '1',
  system: EXECUTION_BRIEF_SYSTEM, schema: EXECUTION_BRIEF_SCHEMA,
  toolName: 'emit_execution_brief', toolDescription: 'For each conditional step whether this request falls under it, with the words that show it; and the steps whose decision nothing given supports.',
  maxTokens: 1500, estimateUsd: 0.01,
  prompt(input) {
    const cond = input.steps.filter(conditional);
    const plain = input.steps.filter((s) => !conditional(s));
    return `<request>\n${input.request.trim()}\n</request>\n\n${input.material.length ? `<material>\n${input.material.map((m) => `[${m.name}]\n${m.head}`).join('\n\n')}\n</material>\n\n` : '(no material beyond the request)\n\n'}`
      + `Conditional steps:\n${cond.map((s) => `${s.n}. ${s.statement}${s.unit?.condition ? `\n   when: "${s.unit.condition}"` : ''}${s.unit?.exception ? `\n   except: "${s.unit.exception}"` : ''}${s.unit?.decision ? `\n   decides: ${s.unit.decision}` : ''}`).join('\n')}\n\n`
      + `Steps that apply always:\n${plain.map((s) => `${s.n}. ${s.statement}${s.unit?.decision ? `\n   decides: ${s.unit.decision}` : ''}`).join('\n')}`;
  },
  // NO CONDITION, NOTHING TO READ: every step applies and nothing is named unsupported (that reading needs a model).
  decide(input) {
    if (input.steps.some(conditional)) return null;
    return { placed: Object.fromEntries(input.steps.map((s) => [s.id, { applies: 'applies' as const, why: null }])), unsupported: [], by: 'code' };
  },
  ground(raw, input) {
    const r = raw as { placed?: unknown; unsupported?: unknown } | null;
    if (!r || !Array.isArray(r.placed)) return null;
    const given = givenText(input);
    const byN = new Map(input.steps.map((s) => [s.n, s]));
    const placed: Record<string, Placement> = Object.fromEntries(input.steps.map((s) => [s.id, { applies: 'applies' as const, why: null }]));
    let grounded = 0;
    for (const p of r.placed as { n?: unknown; applies?: unknown; quote?: unknown }[]) {
      const step = typeof p.n === 'number' ? byN.get(p.n) : undefined;
      if (!step || !conditional(step)) continue;
      const quote = typeof p.quote === 'string' && p.quote.trim() ? p.quote.trim() : null;
      if (p.applies === 'SET_ASIDE') {
        // A step is set aside only on the request's own words; a quote not in them leaves it unresolved, which applies.
        // A set-aside the reader could not quote from the request is a placement all the same: unresolved, which applies.
        if (quote && quoteIsReal(quote, input.request)) placed[step.id] = { applies: 'set-aside', why: `the request says "${quote.slice(0, 120)}"` };
        else placed[step.id] = { applies: 'unresolved', why: 'the reading could not quote the request' };
        grounded += 1;
      } else if (p.applies === 'APPLIES') {
        placed[step.id] = { applies: 'applies', why: quote && quoteIsReal(quote, given) ? `"${quote.slice(0, 120)}"` : null }; grounded += 1;
      } else if (p.applies === 'UNRESOLVED') { placed[step.id] = { applies: 'unresolved', why: 'the request does not say' }; grounded += 1; }
    }
    if (!grounded) return null;
    const unsupported = (Array.isArray(r.unsupported) ? r.unsupported : []).filter((n): n is number => typeof n === 'number').map((n) => byN.get(n)?.id ?? null)
      .filter((id): id is string => id !== null && holds(placed[id].applies));
    return { placed, unsupported: [...new Set(unsupported)], by: 'model' };
  },
  floor(input) { return { placed: Object.fromEntries(input.steps.map((s) => [s.id, { applies: 'applies' as const, why: null }])), unsupported: [], by: 'floor' }; },
};

/** The steps the brief holds as applying (a step a reading could not place applies). */
export const applyingSteps = (b: Brief, steps: readonly BriefStep[]): BriefStep[] => steps.filter((s) => holds(b.placed[s.id]?.applies ?? 'applies'));
export const setAsideSteps = (b: Brief, steps: readonly BriefStep[]): BriefStep[] => steps.filter((s) => b.placed[s.id]?.applies === 'set-aside');

/**
 * THE BRIEF AS THE WRITER READS IT, after the cached skill (cli/served.ts, `forThisRequest`): step numbers and one line
 * each, in the method's order with what depends on what first; what was given; what to leave open. Empty when every
 * step applies and nothing is open: then the method as served says it all.
 */
export function briefNote(b: Brief, steps: readonly BriefStep[], material: readonly { name: string }[]): string {
  const on = applyingSteps(b, steps); const off = setAsideSteps(b, steps);
  const open = new Set(b.unsupported);
  if (!off.length && !open.size && on.every((s) => !s.unit?.decision)) return '';
  const order = (xs: readonly BriefStep[]): BriefStep[] => {
    const byId = new Map(xs.map((s) => [s.id, s])); const seen = new Set<string>(); const out: BriefStep[] = [];
    const visit = (s: BriefStep): void => { if (seen.has(s.id)) return; seen.add(s.id); for (const d of s.unit?.dependsOn ?? []) { const dep = [...byId.values()].find((x) => String(x.n) === d); if (dep) visit(dep); } out.push(s); };
    for (const s of xs) visit(s);
    return out;
  };
  const decisions = order(on).flatMap((s) => {
    const u = s.unit;
    if (!u?.decision) return [];
    return [`- Step ${s.n}: decide ${u.decision}${u.inputs.length ? ` (from ${u.inputs.join(', ')})` : ''}${open.has(s.id) ? ' — nothing given supports this: say what is missing, decide nothing' : ''}`];
  });
  const lines = [
    `For this request, my method's steps that apply: ${on.map((s) => s.n).join(', ') || 'none'}.${off.length ? ` Set aside, not this case: ${off.map((s) => `${s.n} (${b.placed[s.id].why ?? 'not this case'})`).join('; ')}.` : ''}`,
    ...(decisions.length ? ['Decisions it asks for, in order:', ...decisions] : []),
    `Given: the request${material.length ? ` and ${material.map((m) => m.name).join(', ')}` : ', and nothing else'}.${open.size ? ' A decision nothing given supports is left open and said so, never invented.' : ''}`,
  ];
  return lines.join('\n');
}
