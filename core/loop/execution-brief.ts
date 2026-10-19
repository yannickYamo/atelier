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
import type { MoveUnit } from '../compiler/moves.js';

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
  /** applying steps whose decision needs a specific fact the request and material do not contain, with the fact named, as read; empty by code */
  readonly unsupported: readonly { readonly id: string; readonly missing: string }[];
  /**
   * steps the request asks against ("skip the Risks section"), with the request's words: surfaced, never set aside.
   * An unconditional step the request contradicts stands; the writer is told the method stands and to say so.
   */
  readonly contradicted: readonly { readonly id: string; readonly quote: string }[];
  readonly by: 'code' | 'model' | 'floor';
}

const conditional = (s: BriefStep): boolean => s.unit !== null && (s.unit.condition !== null || s.unit.exception !== null);
/**
 * THE CASE A STEP TURNS ON, AND WHICH WAY. A step's own words name a case; whether the case keeps the step or lifts it is
 * read off the words by code, never by the reader: "when", "only for", "if" keep the step while the case holds; "unless",
 * "except", "other than" lift it while the case holds. An exception field is a lifting case by definition.
 */
export function caseOf(s: BriefStep): { readonly words: string; readonly lifts: boolean } | null {
  const u = s.unit; if (!u) return null;
  if (u.exception !== null) return { words: u.exception, lifts: true };
  if (u.condition === null) return null;
  return { words: u.condition, lifts: /^\s*(?:unless|except|other than|save when|but not)\b/i.test(u.condition) };
}

export const EXECUTION_BRIEF_SYSTEM = `You read one request, the material that came with it, and a numbered list of CASES. Each case is the words of one step of the person's own method that say when it applies or when it does not ("when the change touches billing", "unless the reader asked for sources", "only for enterprise accounts"). You say nothing about the step itself; only whether its case holds for this request:

- HOLDS: this request, or its material, is the case named. Quote the words of the request or material that show it.
- DOES_NOT_HOLD: the request plainly is not the case named. Quote the words of the request that show it; without such words, answer UNRESOLVED.
- UNRESOLVED: the request does not say.

Then, over the steps listed under "Steps that apply always" and any case that holds, name a step only when its decision CANNOT BE MADE AT ALL without a specific fact the request and material do not contain: a number, a date, a name, what happened in the person's case. Say which fact is missing. A judgement a reasonable expert could make from what was given (which defect is worst in this diff, which option to recommend from these notes, what verdict this change deserves) is supported, even where more facts would help: it is the writer's to make, and is never named here. A step whose case you answered UNRESOLVED is never named here either: its open question is its case, already said.

Last, name any step the request asks against in so many words ("skip the summary", "no verdict needed"), with the request's words. Such a step is not set aside: the method stands, and the writer is told.

Quote character for character. Never decide a case on a guess: the person wrote the step to be followed.`;

export const EXECUTION_BRIEF_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    placed: { type: 'array', items: { type: 'object', properties: { n: { type: 'number' }, holds: { type: 'string', enum: ['HOLDS', 'DOES_NOT_HOLD', 'UNRESOLVED'] }, quote: { type: ['string', 'null'] } },
      required: ['n', 'holds', 'quote'], additionalProperties: false } },
    unsupported: { type: 'array', items: { type: 'object', properties: { n: { type: 'number' }, missing: { type: 'string' } }, required: ['n', 'missing'], additionalProperties: false } },
    contradicted: { type: 'array', items: { type: 'object', properties: { n: { type: 'number' }, quote: { type: 'string' } }, required: ['n', 'quote'], additionalProperties: false } },
  },
  required: ['placed', 'unsupported', 'contradicted'], additionalProperties: false,
};

const givenText = (input: BriefInput): string => `${input.request}\n${input.material.map((m) => `${m.name}\n${m.head}`).join('\n')}`;

export const EXECUTION_BRIEF: Reading<BriefInput, Brief> = {
  id: 'execution-brief', version: '5',
  system: EXECUTION_BRIEF_SYSTEM, schema: EXECUTION_BRIEF_SCHEMA,
  toolName: 'emit_execution_brief', toolDescription: 'For each conditional step whether this request falls under it, with the words that show it; and the steps whose decision nothing given supports.',
  maxTokens: 1500, estimateUsd: 0.01,
  prompt(input) {
    const cond = input.steps.filter(conditional);
    const plain = input.steps.filter((s) => !conditional(s));
    return `<request>\n${input.request.trim()}\n</request>\n\n${input.material.length ? `<material>\n${input.material.map((m) => `[${m.name}]\n${m.head}`).join('\n\n')}\n</material>\n\n` : '(no material beyond the request)\n\n'}`
      + `Cases (one per step, by the step's number):\n${cond.map((s) => `${s.n}. case: "${caseOf(s)?.words ?? ''}"   (the step: ${s.statement})`).join('\n')}\n\n`
      + `Steps that apply always:\n${plain.map((s) => `${s.n}. ${s.statement}${s.unit?.decision ? `\n   decides: ${s.unit.decision}` : ''}`).join('\n')}`;
  },
  // NOTHING TO READ when no step is conditional and none asks for a decision: every step applies. A decision the
  // request and material cannot support is read, so a method of unconditional decisions is still read for that.
  decide(input) {
    if (input.steps.some(conditional) || input.steps.some((s) => Boolean(s.unit?.decision))) return null;
    return { placed: Object.fromEntries(input.steps.map((s) => [s.id, { applies: 'applies' as const, why: null }])), unsupported: [], contradicted: [], by: 'code' };
  },
  ground(raw, input) {
    const r = raw as { placed?: unknown; unsupported?: unknown } | null;
    if (!r || !Array.isArray(r.placed)) return null;
    const given = givenText(input);
    const byN = new Map(input.steps.map((s) => [s.n, s]));
    const placed: Record<string, Placement> = Object.fromEntries(input.steps.map((s) => [s.id, { applies: 'applies' as const, why: null }]));
    let grounded = 0;
    for (const p of r.placed as { n?: unknown; holds?: unknown; quote?: unknown }[]) {
      const step = typeof p.n === 'number' ? byN.get(p.n) : undefined;
      const c = step ? caseOf(step) : null;
      if (!step || !c) continue;
      const quote = typeof p.quote === 'string' && p.quote.trim() ? p.quote.trim() : null;
      // Which way the case cuts is code's: a holding case keeps a "when" step and lifts an "unless" one.
      const outcome: Applicability | null = p.holds === 'HOLDS' ? (c.lifts ? 'set-aside' : 'applies') : p.holds === 'DOES_NOT_HOLD' ? (c.lifts ? 'applies' : 'set-aside') : p.holds === 'UNRESOLVED' ? 'unresolved' : null;
      if (outcome === null) continue;
      grounded += 1;
      if (outcome === 'set-aside') {
        // A step is set aside only on the request's own words; a quote not in them leaves it unresolved, which applies.
        const inRequest = quote !== null && quoteIsReal(quote, input.request);
        placed[step.id] = inRequest ? { applies: 'set-aside', why: `the request says "${quote.slice(0, 120)}"${c.lifts ? ', which lifts it' : ''}` } : { applies: 'unresolved', why: 'the reading could not quote the request' };
      } else if (outcome === 'applies') placed[step.id] = { applies: 'applies', why: quote && quoteIsReal(quote, given) ? `"${quote.slice(0, 120)}"` : null };
      else placed[step.id] = { applies: 'unresolved', why: 'the request does not say' };
    }
    // A missing specific is named, or it is not missing: an unnamed "unsupported" is a hedge, and once told the writer to
    // decide nothing on five of six steps of a code review whose diff supported every one of them.
    const seen = new Set<string>();
    const unsupported = (Array.isArray(r.unsupported) ? r.unsupported : [] as unknown[]).flatMap((u) => {
      const x = u as { n?: unknown; missing?: unknown }; const step = typeof x.n === 'number' ? byN.get(x.n) : undefined;
      const missing = typeof x.missing === 'string' ? x.missing.trim().slice(0, 120) : '';
      // Only a step that applies outright: an unresolved case is its own open question, already said, not a missing fact.
      if (!step || !missing || seen.has(step.id) || placed[step.id].applies !== 'applies') return [];
      seen.add(step.id); return [{ id: step.id, missing }];
    });
    // A contradiction stands only on the request's words, and never sets the step aside.
    const contradicted = ((r as { contradicted?: unknown }).contradicted as { n?: unknown; quote?: unknown }[] | undefined ?? [])
      .flatMap((c) => { const step = typeof c.n === 'number' ? byN.get(c.n) : undefined; const q = typeof c.quote === 'string' ? c.quote.trim() : '';
        return step && q && quoteIsReal(q, input.request) && holds(placed[step.id].applies) ? [{ id: step.id, quote: q.slice(0, 120) }] : []; });
    // A reading that placed nothing, named nothing unsupported and nothing contradicted said nothing: the floor decides.
    if (!grounded && !unsupported.length && !contradicted.length) return null;
    return { placed, unsupported, contradicted, by: 'model' };
  },
  floor(input) { return { placed: Object.fromEntries(input.steps.map((s) => [s.id, { applies: 'applies' as const, why: null }])), unsupported: [], contradicted: [], by: 'floor' }; },
};

/** The steps the brief holds as applying (a step a reading could not place applies). */
export const applyingSteps = (b: Brief, steps: readonly BriefStep[]): BriefStep[] => steps.filter((s) => holds(b.placed[s.id]?.applies ?? 'applies'));
export const setAsideSteps = (b: Brief, steps: readonly BriefStep[]): BriefStep[] => steps.filter((s) => b.placed[s.id]?.applies === 'set-aside');
/** The steps a reading could not place: held as applying, and said so, so an unknown is never a silent yes. */
export const unresolvedSteps = (b: Brief, steps: readonly BriefStep[]): BriefStep[] => steps.filter((s) => b.placed[s.id]?.applies === 'unresolved');

export interface MoveSelection {
  /** conditional moves whose situation the request shows, within the author's own rate, in the order served */
  readonly placed: readonly MoveUnit[];
  /** general moves: how the author always is, already served as description; recorded for the reader, never in the note */
  readonly standing: readonly MoveUnit[];
  readonly notPlaced: readonly { readonly id: string; readonly why: string }[];
  /** conditional moves the reading could not place: never served, said in the record */
  readonly unresolved: readonly string[];
  /** the most conditional moves one piece gets: about as many as the author's own pieces carry */
  readonly budget: number;
}
/**
 * WHICH MOVES THIS REQUEST GETS, decided by code from what the reading grounded, in this order: the situation holds (a
 * standing move stands by itself and is not served again); not at a step set aside for this request; no second move of
 * the same scope at the same step; within the author's own rate, the better-evidenced first by posterior rate. Zero is
 * an ordinary result. A rare move the request calls for outranks a frequent one it does not: only a holding situation
 * makes a candidate.
 */
export function selectMoves(placement: Readonly<Record<string, Placement>>, b: Brief, units: readonly MoveUnit[], steps: readonly BriefStep[]): MoveSelection {
  const placedOf = (u: MoveUnit): Placement => placement[u.id] ?? (u.kind === 'standing' ? { applies: 'applies', why: null } : { applies: 'unresolved', why: 'not read' });
  const standing = units.filter((u) => u.kind === 'standing' && placedOf(u).applies === 'applies');
  const conditional = units.filter((u) => u.kind === 'situational');
  const unresolved = conditional.filter((u) => placedOf(u).applies === 'unresolved').map((u) => u.id);
  const notPlaced: { id: string; why: string }[] = conditional.filter((u) => placedOf(u).applies === 'set-aside').map((u) => ({ id: u.id, why: placedOf(u).why ?? 'not this case' }));
  const setAside = new Set(setAsideSteps(b, steps).map((s) => String(s.n)));
  const candidates = conditional.filter((u) => placedOf(u).applies === 'applies').filter((u) => {
    if (u.link && setAside.has(u.link.step)) { notPlaced.push({ id: u.id, why: `at step ${u.link.step}, set aside for this request` }); return false; }
    return true;
  // the better-evidenced first: the posterior rate of the move in its situation, then overall
  }).sort((a, c) => (c.situation?.in.mean ?? c.rate.mean) - (a.situation?.in.mean ?? a.rate.mean) || c.rate.mean - a.rate.mean || a.aspect.localeCompare(c.aspect));
  // THE AUTHOR'S OWN RATE: the expected number of situational moves in one piece of theirs is the sum of the posterior
  // means; the nearest whole number is how many a piece of this request gets, at most.
  const budget = Math.max(1, Math.round(conditional.reduce((n, u) => n + u.rate.mean, 0)));
  const placed: MoveUnit[] = []; const at = new Set<string>();
  for (const u of candidates) {
    const key = u.link ? `${u.scope}@${u.link.step}` : null;
    if (key && u.link && at.has(key)) { notPlaced.push({ id: u.id, why: `another move of the same scope at step ${u.link.step}` }); continue; }
    if (placed.length >= budget) { notPlaced.push({ id: u.id, why: `past the ${budget} such move(s) a piece of the author's carries` }); continue; }
    placed.push(u); if (key) at.add(key);
  }
  return { placed, standing, notPlaced, unresolved, budget };
}

/**
 * THE BRIEF AS THE WRITER READS IT, after the cached skill (cli/served.ts, `forThisRequest`): step numbers and one line
 * each, in the method's order with what depends on what first; what was given; what to leave open. Empty when every
 * step applies and nothing is open: then the method as served says it all.
 */
export function briefNote(b: Brief, steps: readonly BriefStep[], material: readonly { name: string }[], served: MoveSelection | null = null): string {
  const on = applyingSteps(b, steps); const off = setAsideSteps(b, steps); const unresolved = unresolvedSteps(b, steps);
  const open = new Map(b.unsupported.map((u) => [u.id, u.missing]));
  const moves = served?.placed ?? [];
  if (!off.length && !unresolved.length && !open.size && !b.contradicted.length && on.every((s) => !s.unit?.decision) && !moves.length) return '';
  const order = (xs: readonly BriefStep[]): BriefStep[] => {
    const byId = new Map(xs.map((s) => [s.id, s])); const seen = new Set<string>(); const out: BriefStep[] = [];
    const visit = (s: BriefStep): void => { if (seen.has(s.id)) return; seen.add(s.id); for (const d of s.unit?.dependsOn ?? []) { const dep = [...byId.values()].find((x) => String(x.n) === d); if (dep) visit(dep); } out.push(s); };
    for (const s of xs) visit(s);
    return out;
  };
  const decisions = order(on).flatMap((s) => {
    const u = s.unit;
    if (!u?.decision) return [];
    return [`- Step ${s.n}: decide ${u.decision}${u.inputs.length ? ` (from ${u.inputs.join(', ')})` : ''}${open.has(s.id) ? ` — a specific this needs is not given (${open.get(s.id)}): say so in one line, and decide on what is given` : ''}`];
  });
  const lines = [
    `For this request, my method's steps that apply: ${on.map((s) => s.n).join(', ') || 'none'}.${off.length ? ` Set aside, not this case: ${off.map((s) => `${s.n} (${b.placed[s.id].why ?? 'not this case'})`).join('; ')}.` : ''}${unresolved.length ? ` Not decided by the request, so held as applying: ${unresolved.map((s) => s.n).join(', ')}.` : ''}`,
    ...(decisions.length ? ['Decisions it asks for, in order:', ...decisions] : []),
    // THE MOVES, AS MYSELF: only the conditional moves this request calls for, each with its situation, how it may show, the
    // author's own words as one instance, and what it is not. Never a rate to hit, never the general traits again.
    ...(moves.length ? ['How I would make this, as myself:', ...moves.map((u) => { const link = u.link; const step = link ? steps.find((s) => String(s.n) === link.step) : undefined;
      const where = u.situation ? `${u.situation.in.k} of the ${u.situation.in.n} of my pieces in this situation` : `${u.pieces} of ${u.corpus} of my pieces`;
      return `- ${step ? `at step ${step.n}: ` : ''}${u.trigger.text}: ${u.realisation}, as in "${u.evidence[0]?.quote ?? u.observed}" (${where}).${u.forbidden ? ` Not: ${u.forbidden}.` : ''}`; })] : []),
    ...b.contradicted.map((c) => { const s = steps.find((x) => x.id === c.id); return `The request says "${c.quote}", which is against step ${s?.n ?? '?'}: my method stands; follow it, and say in one line that the request asked otherwise.`; }),
    `Given: the request${material.length ? ` and ${material.map((m) => m.name).join(', ')}` : ', and nothing else'}.${open.size ? ' A specific not given is said to be missing, never invented; every decision is still made, on what is given, in the shape my method asks for.' : ''}`,
  ];
  return lines.join('\n');
}
