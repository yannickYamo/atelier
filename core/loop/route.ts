// atelier/core/loop/route.ts — THE ROUTE: WHICH PASSES OF THE REPAIR CHAIN A RUN COMPOSES, DECIDED ONCE AND SAID IN WORDS.
//
// Every run with a standard refines its draft through one chain of twelve passes (cli/commands/invoke.ts, `repairChain`
// and the wrappers around it). Each pass used to be switched on or off by a condition written inline at its site, over
// values the run had computed earlier, and nothing on the record said which passes were composed and which were passed
// null: a pass turned off left only an absence. Here the twelve conditions are computed once, from the run's profile
// (./profile.ts), what the run computed before the chain (`RouteSettings`) and the flags it was given, into one row per
// pass: its name, whether it runs, and why in plain words ("voice: off, the pair bank holds 4 pairs, fewer than 12").
// The sites read the rows; the record keeps them (`settings.route`); the certificate and `atelier report --stages` print
// them. The booleans are the ones the sites computed before, in the same order, and nothing else is decided here.
//
// An inner pass runs only where the chain does: with no standard, or under --no-repair, every row is off for that reason.

import { MIN_PAIRS } from '../voice/pairs.js';
import type { Profile } from './profile.js';

/** The twelve passes, in the order the chain composes them (inner to outer). */
export const PASS_NAMES = ['repair', 'redraft', 'edits', 'voice', 'coverage', 'shape', 'echo', 'structure', 'graded', 'graded-record', 'grounding', 'situations'] as const;
export type PassName = (typeof PASS_NAMES)[number];

export interface RoutePass { readonly name: PassName; readonly on: boolean; readonly why: string }
export interface Route { readonly passes: readonly RoutePass[] }

/** What the run computed before the chain is composed (cli/commands/invoke.ts): the values the conditions read beyond the profile. */
export interface RouteSettings {
  /** a reader of what a draft misses exists (`unmetReader`): false under --no-redraft, or where no rule a miss of is written again for */
  readonly redraft: boolean;
  /** the release's sentence-rewrite budget for this run (0 with no release, or under --no-repair) */
  readonly editBudget: number;
  /** the voice pass: its mode, whether it could run (a policy, a bank of MIN_PAIRS pairs, prose, repair on) and whether it runs (in register too) */
  readonly voice: { readonly mode: 'off' | 'incontext'; readonly could: boolean; readonly runs: boolean };
  /** the coverage reading is on: a judge that reads the request's parts, not --no-coverage, and a request that asks for parts or strict delivery */
  readonly coverage: boolean;
  /** how many more drafts the shape pass may write: --until-typical / --until-author rounds, or strict delivery's redraws */
  readonly shapeRounds: number;
  readonly redraws: number;
  readonly shapeAsked: boolean;
  readonly strict: boolean;
  /** the request's notes (what the writer is told after the skill) and the plan: what the echo pass strips from the work */
  readonly notes: boolean;
  readonly plan: boolean;
  /** drafts are written against the author's skeleton (`--structure plan`, on a request that is not short and states no shape) */
  readonly skeleton: boolean;
  /** graded features are repair targets (`--graded`, on by default; off under --graded none and under --no-repair) */
  readonly graded: boolean;
}

export interface RouteFlags {
  readonly noRepair: boolean;
  readonly noRedraft: boolean;
  readonly fidelity: boolean;
  readonly noCoverage: boolean;
  readonly allowUnsourced: boolean;
  readonly structure: boolean;
}

export function routeOf(p: Profile, s: RouteSettings, f: RouteFlags): Route {
  const chainOff = !p.standard ? 'no standard to hold the work to' : f.noRepair ? '--no-repair' : null;
  const guarded = !f.allowUnsourced;
  // Each pass: its condition, as the site computed it, and the reason in words for the side it fell on.
  const rows: readonly { name: PassName; on: boolean; onWhy: string; offWhy: () => string }[] = [
    { name: 'repair', on: true, onWhy: 'the standard\'s measured rules are checked on the draft and the spans that break one rewritten', offWhy: () => chainOff ?? '' },
    { name: 'redraft', on: s.redraft, onWhy: 'a draft that misses what the request or the method asks is written again',
      offWhy: () => (f.noRedraft ? '--no-redraft' : 'no rule a miss of is written again for') },
    { name: 'edits', on: p.pieces.range && (s.editBudget > 0 || f.fidelity), onWhy: f.fidelity && s.editBudget === 0 ? '--fidelity' : `${s.editBudget} sentence rewrite(s) toward the author's range`,
      offWhy: () => (!p.pieces.range ? 'no range read from the pieces (no fidelity profile)' : 'the release\'s edit budget is 0 (--fidelity runs the loop)') },
    { name: 'voice', on: s.voice.runs && p.pieces.pairs !== null && p.pieces.range, onWhy: `a pair bank of ${p.pieces.pairs ?? 0} pairs, in register`,
      offWhy: () => (s.voice.mode !== 'incontext' ? 'voice mode off (--voice incontext, or the release)' : !p.pieces.range ? 'no range read from the pieces (no fidelity profile)'
        : p.pieces.pairs === null ? 'no pair bank (atelier voice pairs)' : p.pieces.pairs < MIN_PAIRS ? `the pair bank holds ${p.pieces.pairs} pair(s), fewer than ${MIN_PAIRS}`
          : p.structured ? 'the output is structured' : !s.voice.could ? 'no voice policy' : p.register === 'out' ? 'out of register: pairs carry the whole voice of the register they were written in' : 'not run on this kind of output') },
    { name: 'coverage', on: s.coverage && p.judge === 'covers', onWhy: s.strict ? 'strict delivery: a reply that leaves a part out is written again' : 'the request asks for parts (eight words or more): the reply is read against them',
      offWhy: () => (p.judge !== 'covers' ? 'no context judge to read the request (offline, or --claims pattern)' : f.noCoverage ? '--no-coverage' : 'the request is one ask (under eight words)') },
    { name: 'shape', on: s.shapeRounds > 0, onWhy: s.shapeAsked ? `${s.shapeRounds} round(s) toward the author's shape (--until-typical, --until-author)` : `${s.redraws} redraw(s) under strict delivery`,
      offWhy: () => 'no --until-typical, no --until-author, no strict delivery' },
    { name: 'echo', on: s.notes || s.plan, onWhy: `${s.notes && s.plan ? 'the request\'s notes and the plan' : s.notes ? 'the request\'s notes' : 'the plan'} are stripped from the work where the writer printed them`,
      offWhy: () => 'no notes for this request and no plan' },
    { name: 'structure', on: s.skeleton, onWhy: 'the delivered text is read against the skeleton it was written from',
      offWhy: () => (!f.structure ? 'no --structure plan' : p.structured ? 'the output is structured' : p.stated.length === 'SHORT' ? 'the request asks for something short' : p.stated.shape === 'SHAPE' ? 'the request states its own format' : 'no skeleton read from the pieces') },
    { name: 'graded', on: s.graded, onWhy: 'graded features (the standard\'s FEATURE rules, the profile\'s far-out signals) are repair targets, never failures', offWhy: () => '--graded none' },
    { name: 'graded-record', on: s.graded, onWhy: 'what the run did for graded features is completed on the record', offWhy: () => '--graded none' },
    { name: 'grounding', on: guarded && p.pieces.examples, onWhy: 'a fact only an example\'s case holds is corrected where it stands',
      offWhy: () => (!guarded ? '--allow-unsourced' : 'the skill serves no examples') },
    { name: 'situations', on: p.judge !== null && guarded, onWhy: 'what the reply states of the person\'s situation is listed for them to check',
      offWhy: () => (p.judge === null ? 'no context judge (offline, or --claims pattern)' : '--allow-unsourced') },
  ];
  return { passes: rows.map((r) => {
    const on = chainOff === null && r.on;
    return { name: r.name, on, why: chainOff !== null ? (r.name === 'repair' ? chainOff : `${chainOff}: the chain is not composed`) : on ? r.onWhy : r.offWhy() };
  }) };
}

/** The route's answer for one pass, by name. */
export const routeOn = (route: Route): ((name: PassName) => boolean) => {
  const on = new Map(route.passes.map((p) => [p.name, p.on]));
  return (name) => on.get(name) ?? false;
};

/** One line per pass for the screen: the name, on or off, and why. */
export const renderRoute = (route: Route): string[] => route.passes.map((p) => `${p.name.padEnd(14)} ${p.on ? 'on ' : 'off'}  ${p.why}`);
