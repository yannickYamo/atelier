// atelier/core/loop/controller.ts — THE BOUNDED CONTROLLER: WHICH REPAIR NEXT, HOW BIG, AND WHEN TO STOP.
//
// The repair loop used to run a fixed number of passes at whatever was off. This module chooses each step instead:
// what matters most first, an action sized to the miss, and a stop as soon as a step is not expected to pay. It
// changes how the standard is carried out, never the standard: every target is a rule of the standard or a SIGNAL
// band of the author's profile, read as the checks read it, and a feature inside its band is never a target.
//
// PRIORITY. (1) an enforced REQUIRED rule broken: a span rule is rewritten, an omission is written again;
// (2) invented claims, cut in code before anything else (ordering only: no model step is ever chosen for them);
// (3) a length out of its band; (4) graded features and far-out signals, the largest |error| first, at most
// GRADED_PER_PASS a step; (5) grammar, where a GRAMMAR observer exists (none does yet: the input is the hook);
// (6) otherwise stop, or one more draft where the release allows it and an enforced rule still fails.
//
// SIZE. A graded miss under 0.5 band widths is moved by the deterministic operators (../fidelity/operators.ts); from
// 0.5 to 1.5 its carrier sentences are rewritten, k = ceil(|error|) of them, at most 3; over 1.5, or three features
// out at once, the piece is written again with the direction and distance of each miss named.
//
// PAYING. Expected gain is Σ min(|error|, effect) over the targets, effect from the operator matrix or the release's
// measured effects (`summariseEffects`, ../fidelity/estimator.ts), moved halfway toward what this run has itself
// observed. Expected cost is this run's own ledger per call of that purpose, or the release's, or a documented
// default. A step is taken while gain / cost ≥ minGainPerUsd and the budget holds it, at most maxActions steps.
//
// FAILURE. A step that kept nothing or moved nothing is never repeated on its target. A redraft that did no better
// gives way to a carrier rewrite, then the operators; an operator step gives way to a carrier rewrite once. When every
// action open to a target has failed, the stop names them.
//
// Pure: the caller reads the report, the ledger and the budget, and executes and records what is decided here.

import type { ControllerAction, ControllerDecisionRecord, ControllerRecord } from '../state/canonical-state.js';
import type { ControllerEffects, ControllerSettings } from '../fidelity/types.js';

export const CONTROLLER_POLICY = 'bounded-v1' as const;

/** The defaults a release's `controller` settings fall back to, field by field. */
export const CONTROLLER_DEFAULTS: Required<Omit<ControllerSettings, 'effects'>> = {
  // Two band widths per dollar: a carrier rewrite ($0.05) must be expected to move a feature 0.1 width, a draft written
  // again ($0.40) 0.8 width. Below that a step costs more than it moves.
  minGainPerUsd: 2,
  maxActions: 4,
  extraDraft: false,
};

/** At or under this |error| (band widths) a graded miss alone never keeps the loop going: no pull to the median. */
export const SETTLED_ERROR = 0.5;
/** Over this |error|, or with REDRAFT_FEATURES features out, the piece is written again. */
export const REDRAFT_ERROR = 1.5;
export const REDRAFT_FEATURES = 3;
/** Carrier sentences rewritten for one feature, at most. */
export const MAX_CARRIERS = 3;
/** Graded features one step is pointed at, at most (the same cap the fixed passes had). */
export const TARGETS_PER_STEP = 3;
/** One enforced rule held is worth this many band widths of a graded feature. */
export const ENFORCED_WEIGHT = 2;

/** Expected movement per target when nothing measured says otherwise: band widths (graded) or share of a rule held (enforced). */
export const DEFAULT_EFFECT: Readonly<Record<'rewrite' | 'operators' | 'carrier-rewrite' | 'redraft', number>> = {
  rewrite: 0.5, operators: 0.25, 'carrier-rewrite': 0.4, redraft: 1,
};
/** Dollars per step when this run's ledger and the release say nothing: the estimates the calls are reserved at. */
export const DEFAULT_COST: Readonly<Record<ControllerAction, number>> = {
  cut: 0, mechanical: 0, operators: 0, rewrite: 0.05, 'carrier-rewrite': 0.05, redraft: 0.4, grammar: 0.05,
};
const MODEL_ACTIONS: ReadonlySet<ControllerAction> = new Set(['rewrite', 'carrier-rewrite', 'redraft', 'grammar']);
/** Steps the controller chose, as against code that always runs (the claim cut, the mechanical fixes). */
const CHOSEN: ReadonlySet<ControllerAction> = new Set(['rewrite', 'operators', 'carrier-rewrite', 'redraft', 'grammar']);

export interface EnforcedMiss {
  readonly id: string;
  /** an omission (a section, a table, a deliverable) is written again; a span rule is rewritten */
  readonly kind: 'omission' | 'span';
}
export interface GradedMiss {
  readonly id: string;
  /** signed, in band widths: positive above the band */
  readonly error: number;
  /** expected movement of the best operator here, in band widths, from the effect matrix; null when no operator moves it */
  readonly operatorEffect: number | null;
}

export interface ControllerInput {
  readonly enforced: readonly EnforcedMiss[];
  /** invented claims still flagged: cut in code, never a model step (ordering only) */
  readonly claims: number;
  /** a length out of its band, in band widths, when the caller reads one */
  readonly length: { readonly error: number } | null;
  readonly graded: readonly GradedMiss[];
  /** the rules a GRAMMAR observer finds broken; null where there is no such observer */
  readonly grammar: readonly string[] | null;
  readonly budget: { readonly usdLeft: number; readonly callsLeft: number | null };
  /** this draft's steps so far */
  readonly history: readonly ControllerDecisionRecord[];
  /** dollars per call this run has paid, by action, from its ledger */
  readonly observedUsdPerCall: Readonly<Partial<Record<ControllerAction, number>>>;
  /** which actions this caller can carry out: a redraft only where a draft can be written again */
  readonly can: { readonly redraft: boolean; readonly rewrite: boolean };
  /** targets no action here can reach: nothing to rewrite in them, or a region the guards protect */
  readonly unreachable: ReadonlySet<string>;
}

export interface Decision {
  readonly kind: 'act';
  readonly action: ControllerAction;
  readonly targets: readonly string[];
  readonly why: string;
  readonly expectedGain: number;
  readonly expectedCostUsd: number;
  /** carrier sentences per feature, for a carrier rewrite */
  readonly carriers?: number;
}
export interface Stop { readonly kind: 'stop'; readonly why: string }

/** The release's settings with every absent field at its default. */
export function controllerSettings(s?: ControllerSettings | null): Required<Omit<ControllerSettings, 'effects'>> & { effects: ControllerEffects } {
  return { minGainPerUsd: s?.minGainPerUsd ?? CONTROLLER_DEFAULTS.minGainPerUsd, maxActions: s?.maxActions ?? CONTROLLER_DEFAULTS.maxActions,
    extraDraft: s?.extraDraft ?? CONTROLLER_DEFAULTS.extraDraft, effects: s?.effects ?? {} };
}

/** The action a graded miss of this size calls for, before what is available or has failed is taken into account. */
export function sizedAction(error: number, featuresOut: number): 'operators' | 'carrier-rewrite' | 'redraft' {
  const e = Math.abs(error);
  if (e > REDRAFT_ERROR || featuresOut >= REDRAFT_FEATURES) return 'redraft';
  return e < SETTLED_ERROR ? 'operators' : 'carrier-rewrite';
}

/** Carrier sentences to rewrite for a miss: ceil(|error|), at least one, at most MAX_CARRIERS. */
export const carriersFor = (error: number): number => Math.max(1, Math.min(MAX_CARRIERS, Math.ceil(Math.abs(error))));

/**
 * WHAT A TARGET MAY GET, IN ORDER, from the action its size calls for. A failed step is never repeated on the same
 * target: the next action down is tried instead (a redraft that did no better gives way to a carrier rewrite, that to
 * the operators), and an operator step that failed escalates to a carrier rewrite once. When every action in the
 * sequence has failed on it, nothing is left for that target.
 */
const SEQUENCE: Readonly<Record<'operators' | 'carrier-rewrite' | 'redraft', readonly ('operators' | 'carrier-rewrite' | 'redraft')[]>> = {
  redraft: ['redraft', 'carrier-rewrite', 'operators'],
  'carrier-rewrite': ['carrier-rewrite', 'operators'],
  operators: ['operators', 'carrier-rewrite'],
};

/** A step failed when it kept nothing or moved nothing. A hand-off to a redraft is no step of its own: its redraft is. */
const failed = (d: ControllerDecisionRecord): boolean => d.outcome !== 'handed to a redraft' && (d.outcome !== 'kept' || d.observed.movement <= 0);

/** The chosen actions that failed on a target, in the order they failed. */
const failuresOn = (id: string, history: readonly ControllerDecisionRecord[]): ControllerAction[] =>
  history.filter((d) => d.targets.includes(id) && CHOSEN.has(d.action) && failed(d)).map((d) => d.action);

/** The first action in the target's sequence that has not failed on it and that this caller can carry out; null when none is left. */
function actionFor(base: 'operators' | 'carrier-rewrite' | 'redraft', id: string, history: readonly ControllerDecisionRecord[],
  available: (a: 'operators' | 'carrier-rewrite' | 'redraft') => boolean): 'operators' | 'carrier-rewrite' | 'redraft' | null {
  const failedOn = new Set(failuresOn(id, history));
  return SEQUENCE[base].find((a) => !failedOn.has(a) && available(a)) ?? null;
}

/** What one action is expected to move per target: the measured prior, moved halfway toward this run's own observations. */
function effectOf(action: 'rewrite' | 'operators' | 'carrier-rewrite' | 'redraft', prior: number, history: readonly ControllerDecisionRecord[]): number {
  const seen = history.filter((d) => d.action === action && d.outcome !== 'could not run' && d.outcome !== 'handed to a redraft');
  if (!seen.length) return prior;
  const observed = seen.reduce((n, d) => n + d.observed.movement / Math.max(1, d.targets.length), 0) / seen.length;
  return Math.max(0, (prior + observed) / 2);
}

const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * THE NEXT STEP, or why there is none. Candidates in priority order; the first the budget holds and that pays at
 * least minGainPerUsd per dollar is taken. When none does, the first one's reason for not being taken is the stop.
 */
export function decide(input: ControllerInput, s: ControllerSettings | null = null): Decision | Stop {
  const set = controllerSettings(s);
  const taken = input.history.filter((d) => CHOSEN.has(d.action)).length;
  const reachable = <T extends { id: string }>(xs: readonly T[]): T[] => xs.filter((x) => !input.unreachable.has(x.id));
  const enforced = reachable(input.enforced);
  const graded = reachable(input.graded).filter((g) => g.error !== 0)
    .sort((a, b) => Math.abs(b.error) - Math.abs(a.error) || a.id.localeCompare(b.id));
  // NOTHING MATERIAL LEFT: every enforced rule holds, no length is out, and no graded miss is over SETTLED_ERROR.
  if (!input.enforced.length && !input.length && input.graded.every((g) => Math.abs(g.error) <= SETTLED_ERROR)) {
    return { kind: 'stop', why: input.graded.length ? `every enforced rule holds and no graded miss is over ${SETTLED_ERROR} band widths` : 'every enforced rule holds and nothing graded is off' };
  }
  if (taken >= set.maxActions) return { kind: 'stop', why: `the controller took its ${set.maxActions} steps` };
  const usdPerCall = (a: ControllerAction): number => input.observedUsdPerCall[a] ?? (a !== 'cut' && a !== 'mechanical' && a !== 'grammar' ? set.effects[a]?.usdPerAction : undefined) ?? DEFAULT_COST[a];
  const prior = (a: 'rewrite' | 'operators' | 'carrier-rewrite' | 'redraft'): number => set.effects[a]?.movement ?? DEFAULT_EFFECT[a];
  const candidates: Decision[] = [];
  const failedOnce = (id: string, a: ControllerAction): boolean => failuresOn(id, input.history).includes(a);
  const hadRedraft = input.history.some((d) => d.action === 'redraft');

  // (1) ENFORCED: span rules rewritten, then omissions written again.
  const spans = enforced.filter((m) => m.kind === 'span' && !failedOnce(m.id, 'rewrite'));
  if (spans.length && input.can.rewrite) {
    const eff = Math.min(1, effectOf('rewrite', prior('rewrite'), input.history));
    candidates.push({ kind: 'act', action: 'rewrite', targets: spans.map((m) => m.id), why: `${spans.length} enforced rule(s) broken in place: their spans are rewritten`,
      expectedGain: r3(ENFORCED_WEIGHT * eff * spans.length), expectedCostUsd: usdPerCall('rewrite') });
  }
  const omissions = enforced.filter((m) => m.kind === 'omission');
  if (omissions.length && input.can.redraft && !hadRedraft) {
    candidates.push({ kind: 'act', action: 'redraft', targets: omissions.map((m) => m.id), why: `${omissions.length} enforced rule(s) need something the draft does not have: it is written again with them named`,
      expectedGain: r3(ENFORCED_WEIGHT * omissions.length), expectedCostUsd: usdPerCall('redraft') });
  }
  // (2) CLAIMS: ordering only. They are cut in code before any step; nothing here is chosen for them.
  // (3) LENGTH out of its band: written again (a draft that only runs long is trimmed by the caller's redraft).
  if (input.length && input.can.redraft && !hadRedraft) {
    candidates.push({ kind: 'act', action: 'redraft', targets: ['length'], why: 'the length is outside its band: written again to it',
      expectedGain: r3(Math.min(Math.abs(input.length.error), effectOf('redraft', prior('redraft'), input.history))), expectedCostUsd: usdPerCall('redraft') });
  }
  // (4) GRADED: the furthest out first; the step is the action the furthest calls for, over every miss that calls for it.
  const out = graded.filter((g) => Math.abs(g.error) > SETTLED_ERROR).length;
  const available = (g: GradedMiss) => (a: 'operators' | 'carrier-rewrite' | 'redraft'): boolean =>
    a === 'operators' ? g.operatorEffect !== null && g.operatorEffect > 0 : a === 'redraft' ? input.can.redraft && !hadRedraft : input.can.rewrite;
  type Rung = 'operators' | 'carrier-rewrite' | 'redraft';
  const planned = graded.map((g) => ({ g, a: actionFor(sizedAction(g.error, out), g.id, input.history, available(g)) })).filter((x): x is { g: GradedMiss; a: Rung } => x.a !== null);
  if (planned.length) {
    const action = planned[0].a;
    const group = planned.filter((x) => x.a === action).slice(0, action === 'redraft' ? undefined : TARGETS_PER_STEP).map((x) => x.g);
    const eff = (g: GradedMiss): number => (action === 'operators' ? effectOf('operators', g.operatorEffect ?? prior('operators'), input.history)
      : action === 'carrier-rewrite' ? effectOf('carrier-rewrite', prior('carrier-rewrite'), input.history) * carriersFor(g.error)
        : effectOf('redraft', prior('redraft'), input.history));
    const gain = r3(group.reduce((n, g) => n + Math.min(Math.abs(g.error), eff(g)), 0));
    const k = Math.max(...group.map((g) => carriersFor(g.error)));
    const far = group.map((g) => `${g.id} ${Math.abs(g.error).toFixed(2)}`).join(', ');
    const why = action === 'operators' ? `graded miss(es) under ${SETTLED_ERROR} band widths (${far}): moved by re-punctuation, no model`
      : action === 'carrier-rewrite' ? `graded miss(es) of ${SETTLED_ERROR} to ${REDRAFT_ERROR} band widths (${far}): up to ${k} carrier sentence(s) each rewritten`
        : `graded miss(es) ${out >= REDRAFT_FEATURES ? `on ${out} features at once` : `over ${REDRAFT_ERROR} band widths`} (${far}): written again with each one's direction and distance`;
    // A SWITCH SAYS SO: which action failed on these targets, and what it found.
    const switched = group.flatMap((g) => input.history.filter((d) => d.targets.includes(g.id) && CHOSEN.has(d.action) && failed(d))
      .map((d) => `${d.action} on ${g.id} ${d.outcome}${d.observed.note ? ` (${d.observed.note})` : ''}`));
    const whyNow = switched.length ? `${why}; switched to it because ${[...new Set(switched)].join('; ')}` : why;
    candidates.push({ kind: 'act', action, targets: group.map((g) => g.id), why: whyNow, expectedGain: gain, expectedCostUsd: usdPerCall(action), ...(action === 'carrier-rewrite' ? { carriers: k } : {}) });
  }
  // (5) GRAMMAR, where an observer reads it.
  if (input.grammar?.length && input.can.rewrite) {
    candidates.push({ kind: 'act', action: 'grammar', targets: [...input.grammar], why: `${input.grammar.length} grammar fault(s): rewritten in place`,
      expectedGain: r3(input.grammar.length * DEFAULT_EFFECT.rewrite), expectedCostUsd: usdPerCall('grammar') });
  }
  // (6) ONE MORE DRAFT, where the release allows it and an enforced rule still fails that nothing above can reach.
  if (!candidates.length && set.extraDraft && input.enforced.length && input.can.redraft && !hadRedraft) {
    candidates.push({ kind: 'act', action: 'redraft', targets: input.enforced.map((m) => m.id), why: 'an enforced rule still fails and nothing else can reach it: one more draft, as the release allows',
      expectedGain: r3(ENFORCED_WEIGHT * input.enforced.length * DEFAULT_EFFECT.rewrite), expectedCostUsd: usdPerCall('redraft') });
  }
  if (!candidates.length) {
    // THE STOP NAMES THE FAILURES: every target left, with each action that failed on it.
    const exhausted = [...input.enforced, ...input.graded].map((m) => ({ id: m.id, fails: [...new Set(failuresOn(m.id, input.history))] })).filter((x) => x.fails.length);
    return { kind: 'stop', why: exhausted.length ? `every action tried failed on what is left: ${exhausted.map((x) => `${x.id} (${x.fails.join(', ')})`).join('; ')}`
      : 'only what no step here can reach is left (nothing to rewrite in it, or a region the guards protect)' };
  }
  let refused: string | null = null;
  for (const c of candidates) {
    const model = MODEL_ACTIONS.has(c.action);
    if (c.expectedCostUsd > input.budget.usdLeft || (model && input.budget.callsLeft !== null && input.budget.callsLeft < 1)) {
      refused ??= `the budget: ${c.action} would cost about $${c.expectedCostUsd.toFixed(2)}${input.budget.callsLeft !== null ? ` and a call` : ''}, and $${Math.max(0, input.budget.usdLeft).toFixed(2)}${input.budget.callsLeft !== null ? ` and ${input.budget.callsLeft} call(s)` : ''} are left`;
      continue;
    }
    if (c.expectedCostUsd > 0 && c.expectedGain / c.expectedCostUsd < set.minGainPerUsd) {
      refused ??= `it stopped paying: ${c.action} was expected to move ${c.expectedGain} for $${c.expectedCostUsd.toFixed(2)}, under ${set.minGainPerUsd} per dollar`;
      continue;
    }
    return c;
  }
  return { kind: 'stop', why: refused ?? 'nothing to do' };
}

/** The record of a draft's steps, with the calls and dollars summed from the steps themselves. */
export function controllerRecord(decisions: readonly ControllerDecisionRecord[], stoppedBecause: string): ControllerRecord {
  return { policy: CONTROLLER_POLICY, decisions: [...decisions], stoppedBecause,
    callsUsed: decisions.reduce((n, d) => n + d.observed.calls, 0), usdUsed: Math.round(decisions.reduce((n, d) => n + d.observed.usd, 0) * 1e6) / 1e6 };
}

/** Two drafts' records as one run's, with a step between them (a draft written again), in the order they happened. */
export function joinRecords(first: ControllerRecord | undefined, step: ControllerDecisionRecord, second: ControllerRecord | undefined, stoppedBecause?: string): ControllerRecord {
  return controllerRecord([...(first?.decisions ?? []), step, ...(second?.decisions ?? [])], stoppedBecause ?? second?.stoppedBecause ?? first?.stoppedBecause ?? step.why);
}

/** Did the controller hand this draft to be written again? */
export const askedForRedraft = (r: ControllerRecord | undefined): boolean => {
  const last = r?.decisions[r.decisions.length - 1];
  return last?.action === 'redraft' && last.outcome === 'handed to a redraft';
};

/** One plain line per step, for `atelier report`. */
export function describeController(r: ControllerRecord): string[] {
  return [...r.decisions.map((d, i) => `${i + 1}. ${d.action} on ${d.targets.join(', ') || '-'}: ${d.why}; expected ${d.expectedGain} for $${d.expectedCostUsd.toFixed(2)}; `
    + `${d.outcome}${d.observed.movement ? `, moved ${d.observed.movement}` : ''}, ${d.observed.calls} call(s), $${d.observed.usd.toFixed(4)}${d.observed.note ? ` (${d.observed.note})` : ''}`),
  `stopped: ${r.stoppedBecause} · ${r.callsUsed} call(s), $${r.usdUsed.toFixed(4)} on its steps`];
}
