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
// GRADED_PER_PASS a step; (5) mechanical errors the GRAMMAR rule confirmed, corrected in place in code (no model call);
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
// THE SEPARATION PRINCIPLE. Enforced rules and taste steering pass through the same steps but never share a gate.
//  (a) ENFORCED rules (the owner's REQUIRED, a REQUIRED FEATURE rule included) are judged for progress and regression
//      by their actual value on the actual text: the verdict, then |error| as measured on the text as it is (never
//      rescaled for a change of length), then the count of spans for a rule that is not a FEATURE rule. Reading an
//      earlier text at a later length (../loop/repair.ts, `readAtLength`) is for graded and SIGNAL checks only.
//  (b) The expected-gain-per-dollar gate (minGainPerUsd, κ) and the release's learned effects (`controller.effects`)
//      are read for STEERING steps only. A step for an enforced rule is taken whenever maxActions and the budget allow
//      it, whatever the learned effects say.
//  (c) maxActions is per RUN, across drafts: the caller hands the steps already taken (the first draft's, and the
//      draft written again, which counts as one step) to the refinement of the next draft as its history.
//  (d) A draft written again for graded misses happens at most as often as the caller's redraft allowance. Once one
//      has been written in a run (`hadRedraft`), a target still over REDRAFT_ERROR steps down on the new draft to a
//      carrier rewrite, then the operators, within the cap; a record never ends on a hand-off with no redraft after it.
//  (e) What a redraft moved is recorded as the real change in |error|, before minus after; the learned effects are
//      summarised from those records.
//  (f) ONE COUNTER. Every step that calls a model or changes the text passes through it, whoever carries it out: the
//      caller's trims (a draft that only runs long, cut) and drafts written again are steps here, recorded as 'trim' and
//      'redraft', asked of `stepGate` before they are taken, counted against maxActions and priced from the ledger.
//
// TWO LOOPS, ONE RULE EACH. The controller's steps run inside the repair loop (./run-repair.ts); the trims and drafts
// written again run around it (cli/commands/invoke.ts, `withRedraft`, and the shape rounds). Neither keeps bookkeeping or
// acceptance of its own:
//  (A) ONE ACCEPTANCE RULE (./repair.ts, `enforcedNeverWorse`, `enforcedNearer`). Every replacement of the working text,
//      whichever loop proposes it (a rewrite, a carrier rewrite, the operators, a fix without a model, a trim, a draft
//      written again for rules, for steering or for both, a shape round), is kept only if no ENFORCED rule is newly
//      broken and none already broken is further from holding BY ITS VALUE (`distanceOf`: a rate past its ceiling or
//      under its floor, a count, a length outside its range, a band distance), each read on the actual text with no
//      length rescaling; only a check that carries no value is read by its count of places. A step made FOR enforced
//      rules must, in addition, move at least one of its own targets nearer holding.
//  (B) ONE LEDGER (`stepLedger`). One step ledger a run (one a shape round), created by the outermost loop and handed to
//      every refinement. Every text-changing or model-calling step is entered on it before it runs; a step the cap or the
//      budget refuses is entered as 'refused' and is no step. The cap, the budget and the controller's history are read
//      from it alone, and a piece refined again after a redraft that was not kept continues the same ledger: nothing is
//      recomputed, so the steps taken on the draft not kept count.
//  (C) THE HAND-OFF CONTRACT. A redraft the controller hands over is sent with exactly the targets it was handed, each
//      named in its note, an enforced rule no span carries included (a floor rate: "your pieces use at least … per 1,000
//      words; this draft has …"). A redraft is never sent with no target, and its outcome line names the handed targets,
//      not other misses.
//
// Pure: the caller reads the report, the ledger and the budget, and executes and records what is decided here.

import type { ControllerAction, ControllerDecisionRecord, ControllerRecord } from '../state/canonical-state.js';
import type { ControllerEffects, ControllerSettings } from '../fidelity/types.js';
import { ownerWords, isSignal, SIGNAL_PREFIX } from './graded.js';

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
  cut: 0, mechanical: 0, operators: 0, rewrite: 0.05, 'carrier-rewrite': 0.05, redraft: 0.4, grammar: 0,
  // a trim returns the whole piece, as a draft does: reserved at a draft's price until the ledger says otherwise
  trim: 0.4,
};
const MODEL_ACTIONS: ReadonlySet<ControllerAction> = new Set(['rewrite', 'carrier-rewrite', 'redraft', 'trim']);
/** Steps counted against maxActions, as against code that always runs (the claim cut, the mechanical fixes). */
const CHOSEN: ReadonlySet<ControllerAction> = new Set(['rewrite', 'operators', 'carrier-rewrite', 'redraft', 'grammar', 'trim']);

/**
 * THE STEPS A RUN HAS TAKEN, the one count every caller reads. A redraft is one step: its hand-off is on the record but
 * is no step of its own. A step that could not run (a call that failed, a hand-off no draft followed) took nothing.
 */
export const stepsTaken = (history: readonly ControllerDecisionRecord[]): number =>
  history.filter((d) => CHOSEN.has(d.action) && d.outcome !== 'handed to a redraft' && d.outcome !== 'could not run' && d.outcome !== 'refused').length;

/** A step said in plain words, as a stop names the one that could not run. */
export const stepWords = (a: ControllerAction): string => ({ cut: 'cut of invented claims', mechanical: 'fix without a model', rewrite: 'rewrite', operators: 're-punctuation',
  'carrier-rewrite': 'carrier rewrite', redraft: 'redraft', grammar: 'grammar fix', trim: 'cut for length' } satisfies Record<ControllerAction, string>)[a];

/** The stop said when the step limit is reached. */
export const capStop = (maxActions: number): string => `the controller took its ${maxActions} steps`;

/** Why the budget cannot hold one step, said as what ran out; null when it can. */
function budgetRefusal(action: ControllerAction, cost: number, budget: ControllerInput['budget']): string | null {
  const noCall = MODEL_ACTIONS.has(action) && budget.callsLeft !== null && budget.callsLeft < 1;
  if (cost <= budget.usdLeft && !noCall) return null;
  // Said as what ran out: the calls, or the dollars, never a cost of "$0.00" beside an empty purse of calls.
  return noCall && cost <= budget.usdLeft ? `the budget: ${action} needs a model call, and no call is left`
    : `the budget: ${action} would cost about ${usd(cost)}${budget.callsLeft !== null ? ` and a call` : ''}, and ${usd(Math.max(0, budget.usdLeft))}${budget.callsLeft !== null ? ` and ${budget.callsLeft} call(s)` : ''} are left`;
}

/**
 * MAY A CALLER TAKE THIS STEP? For a step the controller does not choose itself but that counts all the same (a trim, a
 * draft written again by the caller): null when the step limit and the budget hold it, or the stop, said as which ran
 * out. A redraft the controller handed over was allowed when it was handed over (the hand-off is no step), and is not
 * asked again.
 */
export function stepGate(action: 'trim' | 'redraft', expectedCostUsd: number, history: readonly ControllerDecisionRecord[],
  budget: ControllerInput['budget'] | null, s: ControllerSettings | null = null): string | null {
  const set = controllerSettings(s);
  if (stepsTaken(history) >= set.maxActions) return capStop(set.maxActions);
  return budget ? budgetRefusal(action, expectedCostUsd, budget) : null;
}

/** What a step is, before it runs: what it is for and what it is expected to move and cost. */
export type PlannedStep = Pick<ControllerDecisionRecord, 'action' | 'targets' | 'why' | 'expectedGain' | 'expectedCostUsd'>;

/**
 * THE RUN'S ONE STEP LEDGER (rule B, at the head of this file). Created once per run (once per shape round under
 * `--until-typical`) and handed to every loop that changes the text or calls a model for a repair: the controller's
 * steps (core/loop/run-repair.ts) and the trims and drafts written again (cli/commands/invoke.ts, `withRedraft`). Each
 * step is entered BEFORE it runs (`begin`, read as 'could not run' until it is settled), so a step that throws is on the
 * record as one that could not run; a step the cap or the budget refuses is entered as 'refused' (`gate`). The cap and
 * the budget are read from here alone, and the steps the controller reads as its history are these entries: a piece
 * refined again after a redraft that was not kept continues this ledger, with nothing recomputed.
 */
export interface StepLedger {
  readonly settings: ControllerSettings | null;
  /** every step of the run, in the order each was begun */
  readonly entries: readonly ControllerDecisionRecord[];
  /** the budget as it stands, where the run reads one */
  budget(): ControllerInput['budget'] | null;
  /** enter a step before it runs; its place on the ledger */
  begin(step: PlannedStep): number;
  /** what the step at `at` did; may be called again when the step's outcome is known only later (a draft written again) */
  settle(at: number, outcome: ControllerDecisionRecord['outcome'], observed: ControllerDecisionRecord['observed']): ControllerDecisionRecord;
  /** enter a record that is no step of its own (a hand-off to a redraft, the claim cut), settled as it is */
  add(d: ControllerDecisionRecord): void;
  /** may a caller take this step? null when the cap and the budget hold it; otherwise it is entered as refused and the stop is returned */
  gate(step: PlannedStep & { readonly action: 'trim' | 'redraft' }): string | null;
  /** a draft not kept asked for nothing: its hand-offs, entered from `from` on, are taken off (a hand-off is no step) */
  withdrawHandOffs(from: number): void;
}

/** A new ledger for one run, with the steps already taken on it (a caller that refines a piece again) when there are any. */
export function stepLedger(settings: ControllerSettings | null = null, budget: (() => ControllerInput['budget']) | null = null,
  history: readonly ControllerDecisionRecord[] = []): StepLedger {
  const entries: ControllerDecisionRecord[] = [...history];
  const NONE = { movement: 0, calls: 0, usd: 0 };
  return {
    settings, entries,
    budget: () => (budget ? budget() : null),
    begin(step) { entries.push({ action: step.action, targets: [...step.targets], why: step.why, expectedGain: step.expectedGain, expectedCostUsd: step.expectedCostUsd, outcome: 'could not run', observed: { ...NONE } }); return entries.length - 1; },
    settle(at, outcome, observed) { const d = { ...entries[at], outcome, observed: { ...observed } }; entries[at] = d; return d; },
    add(d) { entries.push(d); },
    gate(step) {
      const refused = stepGate(step.action, step.expectedCostUsd, entries, budget ? budget() : null, settings);
      if (refused) entries.push({ action: step.action, targets: [...step.targets], why: step.why, expectedGain: step.expectedGain, expectedCostUsd: step.expectedCostUsd,
        outcome: 'refused', observed: { ...NONE, note: refused } });
      return refused;
    },
    withdrawHandOffs(from) { for (let i = entries.length - 1; i >= from; i--) if (entries[i].outcome === 'handed to a redraft') entries.splice(i, 1); },
  };
}

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
  /** GRAMMAR rules broken by a confirmed error the checker can correct in place; null where no such rule is checked. What it is unsure of is never here */
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
export interface Stop { readonly kind: 'stop'; readonly why: string;
  /** the step the budget could not hold, where that is why the controller stopped: what the stop names as not run */
  readonly refused?: ControllerAction }

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

/**
 * One target, however it is written: a SIGNAL feature is recorded under its plain feature name in what the person may
 * read (`recordTarget`), and read back as the same target here.
 */
const targetKey = (id: string): string => (isSignal(id) ? id.slice(SIGNAL_PREFIX.length) : id);
/** The id a record names a target by: a SIGNAL band's internal prefix never reaches a record the person may read. */
export const recordTarget = targetKey;
const hits = (d: ControllerDecisionRecord, id: string): boolean => d.targets.some((t) => targetKey(t) === targetKey(id));

/** A step failed when it kept nothing or moved nothing. A hand-off to a redraft is no step of its own: its redraft is. */
const failed = (d: ControllerDecisionRecord): boolean => d.outcome !== 'handed to a redraft' && d.outcome !== 'refused' && (d.outcome !== 'kept' || d.observed.movement <= 0);

/** The chosen actions that failed on a target, in the order they failed. */
const failuresOn = (id: string, history: readonly ControllerDecisionRecord[]): ControllerAction[] =>
  history.filter((d) => hits(d, id) && CHOSEN.has(d.action) && failed(d)).map((d) => d.action);

/** The first action in the target's sequence that has not failed on it and that this caller can carry out; null when none is left. */
function actionFor(base: 'operators' | 'carrier-rewrite' | 'redraft', id: string, history: readonly ControllerDecisionRecord[],
  available: (a: 'operators' | 'carrier-rewrite' | 'redraft') => boolean): 'operators' | 'carrier-rewrite' | 'redraft' | null {
  const failedOn = new Set(failuresOn(id, history));
  return SEQUENCE[base].find((a) => !failedOn.has(a) && available(a)) ?? null;
}

/** What one action is expected to move per target: the measured prior, moved halfway toward this run's own observations. */
function effectOf(action: 'rewrite' | 'operators' | 'carrier-rewrite' | 'redraft', prior: number, history: readonly ControllerDecisionRecord[]): number {
  const seen = history.filter((d) => d.action === action && d.outcome !== 'could not run' && d.outcome !== 'handed to a redraft' && d.outcome !== 'refused');
  if (!seen.length) return prior;
  const observed = seen.reduce((n, d) => n + d.observed.movement / Math.max(1, d.targets.length), 0) / seen.length;
  return Math.max(0, (prior + observed) / 2);
}

const r3 = (x: number): number => Math.round(x * 1000) / 1000;
/** Dollars as said: to the cent, or to a hundredth of a cent where a cent would read as nothing. */
const usd = (x: number): string => `$${x > 0 && x < 0.01 ? x.toFixed(4) : x.toFixed(2)}`;

/**
 * THE NEXT STEP, or why there is none. Candidates in priority order; the first the budget holds and that pays at
 * least minGainPerUsd per dollar is taken. When none does, the first one's reason for not being taken is the stop.
 */
export function decide(input: ControllerInput, s: ControllerSettings | null = null): Decision | Stop {
  const set = controllerSettings(s);
  // An in-place correction is deterministic: one that failed on a rule fails the same way again, so it is never repeated.
  const grammarFailed = (id: string): boolean => input.history.some((d) => d.action === 'grammar' && hits(d, id) && failed(d));
  // ONE REDRAFT IS ONE STEP. The hand-off and the draft written again are both on the record; only the draft counts. A
  // step that could not run (a call that failed, a hand-off no draft followed) took nothing and is not counted.
  const taken = stepsTaken(input.history);
  const reachable = <T extends { id: string }>(xs: readonly T[]): T[] => xs.filter((x) => !input.unreachable.has(x.id));
  const enforced = reachable(input.enforced);
  const graded = reachable(input.graded).filter((g) => g.error !== 0)
    .sort((a, b) => Math.abs(b.error) - Math.abs(a.error) || a.id.localeCompare(b.id));
  // NOTHING MATERIAL LEFT: every enforced rule holds, no length is out, and no graded miss is over SETTLED_ERROR.
  const grammar = (input.grammar ?? []).filter((id) => !input.unreachable.has(id) && !grammarFailed(id));
  if (!input.enforced.length && !input.length && !grammar.length && input.graded.every((g) => Math.abs(g.error) <= SETTLED_ERROR)) {
    return { kind: 'stop', why: input.graded.length ? `every enforced rule holds and no graded miss is over ${SETTLED_ERROR} band widths` : 'every enforced rule holds and nothing graded is off' };
  }
  if (taken >= set.maxActions) return { kind: 'stop', why: capStop(set.maxActions) };
  // LEARNED EFFECTS STEER, NEVER ENFORCE. The release's measured effects (what an action moved, what it cost) are read for
  // a steering step only; a step for an enforced rule is priced and expected at the documented defaults, or at what this
  // run has itself paid, and is never weighed against minGainPerUsd.
  const usdPerCall = (a: ControllerAction, steering = true): number => input.observedUsdPerCall[a]
    ?? (steering && a !== 'cut' && a !== 'mechanical' && a !== 'grammar' && a !== 'trim' ? set.effects[a]?.usdPerAction : undefined) ?? DEFAULT_COST[a];
  const prior = (a: 'rewrite' | 'operators' | 'carrier-rewrite' | 'redraft', steering = true): number => (steering ? set.effects[a]?.movement : undefined) ?? DEFAULT_EFFECT[a];
  const candidates: Decision[] = [];
  /** the candidates taken for an enforced rule: never gated by expected gain per dollar */
  const forEnforced = new Set<Decision>();
  const enforcedStep = (c: Decision): void => { candidates.push(c); forEnforced.add(c); };
  const failedOnce = (id: string, a: ControllerAction): boolean => failuresOn(id, input.history).includes(a);
  const hadRedraft = input.history.some((d) => d.action === 'redraft' && d.outcome !== 'refused');

  // (1) ENFORCED: span rules rewritten, then omissions written again.
  const spans = enforced.filter((m) => m.kind === 'span' && !failedOnce(m.id, 'rewrite'));
  if (spans.length && input.can.rewrite) {
    const eff = Math.min(1, prior('rewrite', false));
    enforcedStep({ kind: 'act', action: 'rewrite', targets: spans.map((m) => m.id), why: `${spans.length} enforced rule(s) broken in place: their spans are rewritten`,
      expectedGain: r3(ENFORCED_WEIGHT * eff * spans.length), expectedCostUsd: usdPerCall('rewrite', false) });
  }
  const omissions = enforced.filter((m) => m.kind === 'omission');
  if (omissions.length && input.can.redraft && !hadRedraft) {
    enforcedStep({ kind: 'act', action: 'redraft', targets: omissions.map((m) => m.id), why: `${omissions.length} enforced rule(s) need something the draft does not have: it is written again with them named`,
      expectedGain: r3(ENFORCED_WEIGHT * omissions.length), expectedCostUsd: usdPerCall('redraft', false) });
  }
  // (2) CLAIMS: ordering only. They are cut in code before any step; nothing here is chosen for them.
  // (3) LENGTH out of its band: written again (a draft that only runs long is trimmed by the caller's redraft).
  if (input.length && input.can.redraft && !hadRedraft) {
    candidates.push({ kind: 'act', action: 'redraft', targets: ['length'], why: 'the length is outside its band: written again to it',
      expectedGain: r3(Math.min(Math.abs(input.length.error), effectOf('redraft', prior('redraft'), input.history))), expectedCostUsd: usdPerCall('redraft') });
  }
  // (4) GRADED: the furthest out first; the step is the action the furthest calls for, over every miss that calls for it,
  // at most TARGETS_PER_STEP of them whatever the action (a redraft included), and never one at or under SETTLED_ERROR:
  // a miss that near its band is no target of any step.
  const far = graded.filter((g) => Math.abs(g.error) > SETTLED_ERROR);
  const out = far.length;
  const available = (g: GradedMiss) => (a: 'operators' | 'carrier-rewrite' | 'redraft'): boolean =>
    a === 'operators' ? g.operatorEffect !== null && g.operatorEffect > 0 : a === 'redraft' ? input.can.redraft && !hadRedraft : input.can.rewrite;
  type Rung = 'operators' | 'carrier-rewrite' | 'redraft';
  const planned = far.map((g) => ({ g, a: actionFor(sizedAction(g.error, out), g.id, input.history, available(g)) })).filter((x): x is { g: GradedMiss; a: Rung } => x.a !== null);
  if (planned.length) {
    const action = planned[0].a;
    const group = planned.filter((x) => x.a === action).slice(0, TARGETS_PER_STEP).map((x) => x.g);
    const eff = (g: GradedMiss): number => (action === 'operators' ? effectOf('operators', g.operatorEffect ?? prior('operators'), input.history)
      : action === 'carrier-rewrite' ? effectOf('carrier-rewrite', prior('carrier-rewrite'), input.history) * carriersFor(g.error)
        : effectOf('redraft', prior('redraft'), input.history));
    const gain = r3(group.reduce((n, g) => n + Math.min(Math.abs(g.error), eff(g)), 0));
    const k = Math.max(...group.map((g) => carriersFor(g.error)));
    const named = group.map((g) => `${g.id} ${Math.abs(g.error).toFixed(2)}`).join(', ');
    // The range named is the one the action is sized for; a target stepped down to it from a larger action (a redraft
    // that did no better) is said at its own distance, never as inside a range it is not in.
    const sized = group.every((g) => sizedAction(g.error, out) === action);
    const how = action === 'operators' ? 'moved by re-punctuation, no model' : action === 'carrier-rewrite' ? `up to ${k} carrier sentence(s) each rewritten` : 'written again with each one\'s direction and distance';
    // The why names exactly the targets: where more features are out than one step takes, it says so.
    const furthest = out > group.length ? `, the furthest ${group.length} taken` : '';
    const why = !sized ? `graded miss(es) at ${named} band widths: ${how}`
      : action === 'operators' ? `graded miss(es) under ${SETTLED_ERROR} band widths (${named}): ${how}`
        : action === 'carrier-rewrite' ? `graded miss(es) of ${SETTLED_ERROR} to ${REDRAFT_ERROR} band widths (${named}): ${how}`
          : `graded miss(es) ${out >= REDRAFT_FEATURES ? `on ${out} features at once${furthest}` : `over ${REDRAFT_ERROR} band widths`} (${named}): ${how}`;
    // A SWITCH SAYS SO: which action failed on these targets, and what it found.
    const switched = group.flatMap((g) => input.history.filter((d) => hits(d, g.id) && CHOSEN.has(d.action) && failed(d))
      .map((d) => `${d.action} on ${g.id} ${d.outcome === 'kept' ? 'moved nothing' : d.outcome}${d.observed.note ? ` (${d.observed.note})` : ''}`));
    const whyNow = switched.length ? `${why}; switched to it because ${[...new Set(switched)].join('; ')}` : why;
    candidates.push({ kind: 'act', action, targets: group.map((g) => g.id), why: whyNow, expectedGain: gain, expectedCostUsd: usdPerCall(action), ...(action === 'carrier-rewrite' ? { carriers: k } : {}) });
  }
  // (5) MECHANICAL ERRORS the grammar rule confirmed: each corrected in place by the checker's own suggestion, in code.
  // After everything above, so a rewrite of a sentence cannot undo it; free, so it never stops paying.
  if (grammar.length) {
    enforcedStep({ kind: 'act', action: 'grammar', targets: grammar, why: `${grammar.length} rule(s) with a confirmed mechanical error: corrected in place, no model`,
      expectedGain: r3(ENFORCED_WEIGHT * grammar.length), expectedCostUsd: usdPerCall('grammar', false) });
  }
  // (6) ONE MORE DRAFT, where the release allows it and an enforced rule still fails that nothing above can reach.
  if (!candidates.length && set.extraDraft && input.enforced.length && input.can.redraft && !hadRedraft) {
    enforcedStep({ kind: 'act', action: 'redraft', targets: input.enforced.map((m) => m.id), why: 'an enforced rule still fails and nothing else can reach it: one more draft, as the release allows',
      expectedGain: r3(ENFORCED_WEIGHT * input.enforced.length * DEFAULT_EFFECT.rewrite), expectedCostUsd: usdPerCall('redraft', false) });
  }
  if (!candidates.length) {
    // THE REWRITE PASSES ALLOWED WERE USED: something left that a rewrite would take, and no rewrite pass left to take it.
    const wouldRewrite = !input.can.rewrite && (spans.length > 0 || graded.some((g) => actionFor(sizedAction(g.error, out), g.id, input.history, (a) => (a === 'operators' ? available(g)(a) : a === 'carrier-rewrite'))
      === 'carrier-rewrite'));
    if (wouldRewrite) return { kind: 'stop', why: `the rewrite passes allowed were used, with ${[...spans.map((m) => m.id), ...graded.map((g) => g.id)].join(', ')} left` };
    // THE STOP NAMES THE FAILURES: every target left, with each action that failed on it.
    const exhausted = [...input.enforced, ...input.graded].map((m) => ({ id: m.id, fails: [...new Set(failuresOn(m.id, input.history))] })).filter((x) => x.fails.length);
    return { kind: 'stop', why: exhausted.length ? `every action tried failed on what is left: ${exhausted.map((x) => `${x.id} (${x.fails.join(', ')})`).join('; ')}`
      : 'only what no step here can reach is left (nothing to rewrite in it, or a region the guards protect)' };
  }
  let refused: string | null = null; let budgetRefusedGraded = false; let refusedAction: ControllerAction | null = null;
  for (const c of candidates) {
    const short = budgetRefusal(c.action, c.expectedCostUsd, input.budget);
    if (short) {
      if (refused === null) refusedAction = c.action;
      refused ??= short;
      if (!forEnforced.has(c)) budgetRefusedGraded = true;
      continue;
    }
    if (!forEnforced.has(c) && c.expectedCostUsd > 0 && c.expectedGain / c.expectedCostUsd < set.minGainPerUsd) {
      refused ??= `it stopped paying: ${c.action} was expected to move ${c.expectedGain} for ${usd(c.expectedCostUsd)}, under ${set.minGainPerUsd} per dollar`;
      continue;
    }
    return c;
  }
  // A FREE STEP STILL RUNS WHEN THE BUDGET HOLDS NO MODEL CALL: the operators, on the far misses they can move and have
  // not failed on, before the stop.
  if (budgetRefusedGraded) {
    const free = far.filter((g) => g.operatorEffect !== null && g.operatorEffect > 0 && !failuresOn(g.id, input.history).includes('operators')).slice(0, TARGETS_PER_STEP);
    if (free.length) {
      return { kind: 'act', action: 'operators', targets: free.map((g) => g.id),
        why: `${refused}; the operators still run, no model: graded miss(es) at ${free.map((g) => `${g.id} ${Math.abs(g.error).toFixed(2)}`).join(', ')} band widths`,
        expectedGain: r3(free.reduce((n, g) => n + Math.min(Math.abs(g.error), effectOf('operators', g.operatorEffect ?? prior('operators'), input.history)), 0)), expectedCostUsd: 0 };
    }
  }
  return { kind: 'stop', why: refused ?? 'nothing to do', ...(refused !== null && refusedAction !== null && refused.startsWith('the budget') ? { refused: refusedAction } : {}) };
}

/** The record of a draft's steps, with the calls and dollars summed from the steps themselves. */
export function controllerRecord(decisions: readonly ControllerDecisionRecord[], stoppedBecause: string, handedToRedraft = false): ControllerRecord {
  return { policy: CONTROLLER_POLICY, decisions: [...decisions], stoppedBecause,
    callsUsed: decisions.reduce((n, d) => n + d.observed.calls, 0), usdUsed: Math.round(decisions.reduce((n, d) => n + d.observed.usd, 0) * 1e6) / 1e6,
    ...(handedToRedraft ? { handedToRedraft: true as const } : {}) };
}

/** Two drafts' records as one run's, with a step between them (a draft written again), in the order they happened. */
export function joinRecords(first: ControllerRecord | undefined, step: ControllerDecisionRecord, second: ControllerRecord | undefined, stoppedBecause?: string): ControllerRecord {
  return controllerRecord([...(first?.decisions ?? []), step, ...(second?.decisions ?? [])], stoppedBecause ?? second?.stoppedBecause ?? first?.stoppedBecause ?? step.why,
    second?.handedToRedraft === true);
}

/**
 * Did the controller hand this draft to be written again? Read from the record's flag, never from its last step: a
 * mechanical fix tried after the hand-off is bookkeeping and does not take the redraft back. A record written before
 * the flag reads as it did, by its last step.
 */
export const askedForRedraft = (r: ControllerRecord | undefined): boolean => {
  if (r?.handedToRedraft) return true;
  const last = r?.decisions[r.decisions.length - 1];
  return last?.action === 'redraft' && last.outcome === 'handed to a redraft';
};

/** The step that handed the draft to a redraft, when it did: what the draft written again is recorded under. */
export const redraftHandOff = (r: ControllerRecord | undefined): ControllerDecisionRecord | undefined =>
  (askedForRedraft(r) ? [...(r?.decisions ?? [])].reverse().find((d) => d.action === 'redraft' && d.outcome === 'handed to a redraft') : undefined);

/** One plain line per step, for `atelier report`. */
export function describeController(r: ControllerRecord): string[] {
  return [...r.decisions.map((d, i) => ownerWords(`${i + 1}. ${d.action} on ${d.targets.join(', ') || '-'}: ${d.why}; expected ${d.expectedGain} for ${usd(d.expectedCostUsd)}; `
    + `${d.outcome}${d.observed.movement ? `, moved ${d.observed.movement}` : ''}, ${d.observed.calls} call(s), $${d.observed.usd.toFixed(4)}${d.observed.note ? ` (${d.observed.note})` : ''}`)),
  `stopped: ${ownerWords(r.stoppedBecause)} · ${r.callsUsed} call(s), $${r.usdUsed.toFixed(4)} on its steps`,
  // every shape round's steps, each round with a step limit of its own
  ...(r.rounds ?? []).filter((x) => !x.kept).map((x) => `shape round ${x.round} (not kept): ${x.decisions.length ? x.decisions.map((d) => `${d.action} on ${d.targets.join(', ') || '-'} ${d.outcome}`).join('; ') : 'no step'}; stopped: ${ownerWords(x.stoppedBecause)} · ${x.callsUsed} call(s), $${x.usdUsed.toFixed(4)}`)];
}
