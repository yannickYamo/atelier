// atelier/core/eval/record-build.ts — THE RECORD OF ONE OUTPUT, BUILT FROM WHAT WAS OBSERVED OF IT.
//
// Four dimensions, never merged (./record.ts):
//   STANDARD   the owner's standing rules: each required rule, checked or theirs to judge
//   REQUEST    what this one request set for this one output (its length)
//   EVIDENCE   what every output is read for whoever owns it: specifics traced to what was supplied, and wording
//              lifted from one of the owner's pieces
//   HABIT      what the owner's examples show and they did not make required: reported, and moves nothing
//
// Nothing here decides what a result means: each entry states its facts and `entry` (./record.ts) judges them.

import type { Requirement } from '../state/canonical-state.js';
import { planFor, type PlannedRule } from '../plan/execution-plan.js';
import { entry, recordOf, type Entry, type EvaluationRecord, type Observation } from './record.js';
import { GRAMMAR_NOT_RUN, GRAMMAR_LISTED } from '../observers/grammar.js';
import { MATERIAL_UNREAD } from '../observers/written.js';

export interface CheckedLine { readonly id: string; readonly statement?: string; readonly required: boolean; readonly verdict: 'MET' | 'VIOLATED' | 'NOT_APPLICABLE'; readonly detail: string }

export interface RecordFacts {
  /** the standard's live requirements, in the owner's order */
  readonly requirements: readonly Requirement[];
  /** every line of the check of the delivered text; null when the check could not run */
  readonly checked: readonly CheckedLine[] | null;
  /** rules set aside for this run, each with why */
  readonly waived: ReadonlyMap<string, string>;
  /** the length the request states, as it fared; null when it states none that is counted */
  readonly request: { readonly asked: string; /** null: stated, and not one a run could be held to */ readonly met: boolean | null; readonly detail: string } | null;
  readonly claims: {
    readonly state: 'checked' | 'not-checked' | 'off';
    /** was anything supplied to trace a specific to */
    readonly bound: boolean;
    /** has the reader been measured on this kind of work, and is it the one deciding */
    readonly qualified: boolean; readonly why: string | null;
    readonly delivered: number; readonly open: number; readonly cut: number;
    /** of those left open, the ones the reader could not decide either way: its reading of them did not finish */
    readonly unconfirmed?: number;
  } | null;
  /**
   * The longest run of words shared with one of the owner's pieces, less their standard wording; and whether there
   * were pieces enough to tell standard wording at all (../observers/overlap.ts, `STANDARD_WORDING_PIECES`).
   */
  readonly copying: { readonly longest: number; readonly limit: number; readonly tellable: boolean; /** the shared words themselves */ readonly words?: string } | null;
  /** of the rules set aside, those the request replaced with a constraint of its own, which is itself in the record */
  readonly replaced?: ReadonlySet<string>;
  /** rules read on the draft (broken or held) that the delivered text is too short to read: not measured, never "does not apply" */
  readonly unmeasured?: ReadonlySet<string>;
  /** the taste reader's reading of the delivered text, by requirement id, with whether the reader may act on that rule */
  readonly read?: ReadonlyMap<string, RuleReading>;
  /** how strictly the output was held: the run's level, carried on the record */
  readonly latitude?: EvaluationRecord['latitude'];
  /**
   * Rules the owner accepted as unmeasured (core/state/canonical-state.ts, `acceptedUnmeasured`): a rule no check reads
   * is listed for them, and the run is not sent to review on its account.
   */
  readonly accepted?: ReadonlySet<string>;
}

/**
 * One rule as the taste reader read it on the delivered text (core/taste/reader.ts), and whether the owner's labels have
 * earned the reader VETO on that rule (core/taste/calibration.ts): the one case where a reading is a qualified observation.
 */
export interface RuleReading { readonly verdict: string; readonly quote?: string; readonly why: string; readonly acts: boolean }

const NOTHING: Observation = { proposition: null, coverage: 'NONE', qualification: 'UNAVAILABLE', evidence: null };
/** Why a rule was held back because the material it needs was not given: the one reason a REQUIRED rule is held back and still counted. */
export const MATERIAL_NOT_BOUND = 'the material it needs is not bound';
/** Why a rule that applies only under a condition, or is not required, was held back for want of material: set aside, as before. */
export const CONDITIONAL_NOT_BOUND = 'the material it needs is not bound, and it applies only under a condition or is not required';

/**
 * A RULE THE CHECK COULD ONLY PARTLY HOLD, READ BY A READER THAT HAS EARNED ITS SAY. VERIFIED is every required rule
 * established by a qualified observer with full coverage (core/eval/record.ts). A method step with a part no count reads
 * ("two or three sentences on what the change does") was always left for the person, so a method with one such step
 * never read VERIFIED, however often it was followed. The taste reader reads that part on every run; once the owner's
 * labels have earned it VETO on the rule (core/taste/calibration.ts), it is the qualified observer of the part: read as
 * followed, the rule is established in full; read as missed, the rule is seen to fail. Without VETO its reading is
 * reported beside the rule, and the entry stands as the check left it. A reading never reaches a rule that is held back
 * for a reason of the owner's (unconfirmed, disputed by their examples, not required), a rule set aside for the request,
 * or a rule held back for material the run was not given.
 */
function standardEntry(p: PlannedRule, f: RecordFacts): Entry {
  return acceptedPart(p, readEntry(p, f), f);
}

/**
 * THE PART THE OWNER ACCEPTED UNREAD. A rule they named as accepted unmeasured that a check reads only in part ("one
 * paragraph" of a Summary step), or whose written check has not qualified, is listed for them where it would otherwise
 * send the run to review: what the check read is kept in the evidence, with the part accepted. A rule seen to fail by a
 * check that may block, a check that did not finish, or a rule set aside, is left as it stands.
 */
function acceptedPart(p: PlannedRule, e: Entry, f: RecordFacts): Entry {
  if (!f.accepted?.has(p.id) || !e.required || e.observation.incomplete) return e;
  if (e.reason !== 'PARTLY_CHECKED' && e.reason !== 'OBSERVER_UNQUALIFIED') return e;
  const part = e.reason === 'PARTLY_CHECKED' ? e.observation.unchecked ?? 'the rest of it' : 'what its check, not qualified on your examples, reads';
  return entry({ id: e.id, dimension: e.dimension, source: e.source, statement: e.statement, required: e.required,
    observation: { ...e.observation, evidence: `${e.observation.evidence ? `${e.observation.evidence}; ` : ''}accepted by you as unmeasured for ${part}`, listed: true }, verdict: null });
}

function readEntry(p: PlannedRule, f: RecordFacts): Entry {
  const e = plannedEntry(p, f);
  const r = f.read?.get(p.id);
  if (!r?.acts || p.notEnforced !== null || e.result !== 'UNVERIFIED') return e;
  const partly = e.reason === 'PARTLY_CHECKED';
  const unchecked = e.reason === 'NOT_MACHINE_CHECKABLE' && !e.observation.incomplete && e.observation.listed !== true;
  if (!partly && !unchecked) return e;
  if (r.verdict !== 'FOLLOWED' && r.verdict !== 'MISSED') return e;
  const part = e.observation.unchecked ?? p.statement;
  const quoted = r.quote ? `: "${r.quote}"` : '';
  const evidence = `${partly ? `${e.observation.evidence ?? ''}; ` : ''}${r.verdict === 'FOLLOWED' ? 'read as followed' : 'read as missed'} by the taste reader on "${part}", which your labels have qualified to act on this rule${quoted}`;
  return entry({ id: e.id, dimension: e.dimension, source: e.source, statement: e.statement, required: e.required,
    observation: { proposition: e.observation.proposition ?? p.statement, coverage: 'FULL', qualification: 'QUALIFIED', evidence },
    verdict: r.verdict === 'FOLLOWED' ? 'MET' : 'VIOLATED' });
}

/** One rule of the standard as the plan's check left it: what it is and whether its check may block come from the plan, never from here. */
function plannedEntry(p: PlannedRule, f: RecordFacts): Entry {
  const required = p.role !== 'HABIT';
  const base = { id: p.id, statement: p.statement, dimension: required ? 'STANDARD' as const : 'HABIT' as const, source: p.stated ? 'METHOD' as const : 'EXAMPLE' as const, required };
  const o = p.check;
  // ACCEPTED UNMEASURED BY THE OWNER: no check reads it, and they said a run need not wait on it. Listed, never a review.
  if (!o && required && f.accepted?.has(p.id)) return entry({ ...base, observation: { ...NOTHING, evidence: 'accepted by you as unmeasured: no check reads it, and the run is not held for it', listed: true }, verdict: null });
  if (!o) return entry({ ...base, observation: NOTHING, verdict: null });
  const line = f.checked?.find((c) => c.id === p.id);
  const why = f.waived.get(p.id);
  // WHETHER A CHECK MAY BLOCK IS THE PLAN'S TO SAY, and the record says the same: a check of the owner's rule that
  // is not enforced (their own work disputes the reading, or they never made the check required) is shown with what
  // it found and blocks nothing. A habit's check is believed as a count; it is not required, so it blocks nothing either.
  // A rule nobody confirmed is held too, whatever its fields say (a REQUIRED written onto it is no one's word): its
  // check is shown with the reason it blocks nothing.
  const held = (required && !p.enforced) || p.notEnforced === 'UNRATIFIED';
  const whyNot = p.notEnforced === 'UNRATIFIED' ? 'Nobody has confirmed this rule yet, so it blocks nothing'
    : p.notEnforced === 'DISPUTED_BY_EXAMPLES' ? 'Your own examples do not do this, so the rule blocks nothing until you confirm it'
    : p.notEnforced === 'RELATED_CHECK' ? 'This check reads something near your rule and not the rule itself, so it blocks nothing'
    : p.notEnforced === 'UNQUALIFIED' ? 'This check has not qualified on your examples, so it blocks nothing and the rule is yours to read' : 'You have not made this check required, so it blocks nothing';
  const seen = (evidence: string | null): Observation => ({ proposition: o.proposition, coverage: o.coverage, qualification: held ? 'UNQUALIFIED' : 'DETERMINISTIC',
    evidence: held && evidence ? `${evidence}. ${whyNot}` : evidence, ...(o.unchecked ? { unchecked: o.unchecked } : {}) });
  // A REQUIRED rule held back for want of material is not set aside: it was not checked, and the work cannot read as
  // VERIFIED on its account (a run is never refused for material it was not given; neither is it excused).
  if (why === MATERIAL_NOT_BOUND && required && p.enforced) return entry({ ...base, observation: { ...seen(why), coverage: 'NONE', incomplete: `not checked: ${p.id} needs material this run was not given` }, verdict: null });
  if (why) return entry({ ...base, observation: seen(why), applies: f.replaced?.has(p.id) ? { replacedBy: why } : { setAside: why }, verdict: null });
  // The check could not run, or had nothing to read the rule against (no material bound): nothing was observed.
  // Only a check of the text that did not run at all is an evaluation that did not finish. A check that ran and has
  // no line for this rule left it out on purpose (it applies under a condition, which is a judgement): the owner's.
  // A written check that reads the material, run with none bound (core/observers/written.ts, `MATERIAL_UNREAD`), is the same.
  if (!line || (line.verdict === 'NOT_APPLICABLE' && (o.reads === 'BOUND_MATERIAL' || line.detail.startsWith(MATERIAL_UNREAD)))) {
    return entry({ ...base, observation: { ...seen(line?.detail ?? 'the check did not run'), coverage: 'NONE', ...(f.checked === null ? { incomplete: `not checked: ${p.id} (the check did not run)` } : {}) }, verdict: null });
  }
  // A check whose engine could not run did not read the text: unverified, with the reason, never "does not apply".
  // THE EDITORIAL GRAMMAR CHECK NEVER MOVES THE VERDICT ON ITS OWN. A checker that could not load, or possible slips it lists for the person,
  // are said on their own line and leave the run's state to the person's standard: a run that holds every rule they
  // set reads VERIFIED with the slips shown beside it. A slip the checker is sure of, under --fix-grammar, still counts.
  // Grammar the OWNER wrote into their own method is their standard: a check that could not run, or that could only
  // list, is not a pass, and the run is left for them to read, as for any rule of theirs.
  const editorial = !p.stated;
  if (line.verdict === 'NOT_APPLICABLE' && line.detail.startsWith(GRAMMAR_NOT_RUN)) {
    return editorial
      ? entry({ ...base, observation: { ...seen(`grammar not checked: ${line.detail.slice(GRAMMAR_NOT_RUN.length).replace(/^:\s*/, '')}`), coverage: 'NONE', listed: true }, verdict: null })
      : entry({ ...base, observation: { ...seen(line.detail), coverage: 'NONE', incomplete: `not checked: ${p.id} (${line.detail})` }, verdict: null });
  }
  if (line.verdict === 'NOT_APPLICABLE' && line.detail.startsWith(GRAMMAR_LISTED)) {
    return entry({ ...base, observation: { ...seen(line.detail), coverage: 'NONE', ...(editorial ? { listed: true as const } : {}) }, verdict: null });
  }
  // UNMEASURABLE IS NOT HELD. A rule the draft was read on, broken or held, that the text delivered is too short to read
  // does apply: it was not measured on what ships, and the evaluation of it did not finish. Unverified, never a pass.
  if (line.verdict === 'NOT_APPLICABLE' && f.unmeasured?.has(p.id)) {
    return entry({ ...base, observation: { ...seen(line.detail), coverage: 'NONE',
      incomplete: `not measured: ${p.id} was read on the draft, and the text delivered is ${line.detail.replace(/^not measured: /, '')}` }, verdict: null });
  }
  if (line.verdict === 'NOT_APPLICABLE') return entry({ ...base, observation: seen(line.detail), applies: false, verdict: null });
  return entry({ ...base, observation: seen(line.detail), verdict: line.verdict });
}

/** The check's own required lines that are no rule of the standard: the format's hard limits, phrases learned as a machine's. */
const systemEntries = (f: RecordFacts): Entry[] => (f.checked ?? []).filter((c) => c.required && c.verdict !== 'NOT_APPLICABLE' && !f.waived.has(c.id) && !f.requirements.some((r) => r.requirementId === c.id))
  .map((c) => entry({ id: c.id, dimension: 'STANDARD', source: 'SYSTEM', statement: c.statement ?? c.id, required: true,
    observation: { proposition: c.statement ?? c.id, coverage: 'FULL', qualification: 'DETERMINISTIC', evidence: c.detail }, verdict: c.verdict as 'MET' | 'VIOLATED' }));

function requestEntries(f: RecordFacts): Entry[] {
  if (!f.request) return [];
  return [entry({ id: 'request-length', dimension: 'REQUEST', source: 'REQUEST', statement: `The length the request asks for: ${f.request.asked}`, required: true,
    observation: { proposition: 'the words written, counted', coverage: f.request.met === null ? 'NONE' : 'FULL', qualification: f.request.met === null ? 'UNAVAILABLE' : 'DETERMINISTIC', evidence: f.request.detail },
    verdict: f.request.met === null ? null : f.request.met ? 'MET' : 'VIOLATED' })];
}

function evidenceEntries(f: RecordFacts): Entry[] {
  const out: Entry[] = [];
  const c = f.claims;
  if (c) {
    const base = { id: 'specifics', dimension: 'EVIDENCE' as const, source: 'SYSTEM' as const, statement: 'Every specific in the work is found in what you supplied', required: true };
    const proposition = 'each figure, name, date and quotation, looked for in the request and the material';
    // Specifics the reader could not decide either way: its reading did not finish, wherever else the entry lands.
    const undecided = c.unconfirmed ? { incomplete: `${c.unconfirmed} specific${c.unconfirmed === 1 ? '' : 's'} unconfirmed: confirm them or bind your material` } : {};
    if (c.state === 'off') out.push(entry({ ...base, observation: { proposition, coverage: 'NONE', qualification: 'UNAVAILABLE', evidence: 'turned off for this run', incomplete: 'invented claims not checked: turned off for this run (--allow-unsourced)' }, applies: { setAside: 'turned off for this run' }, verdict: null }));
    else if (c.state === 'not-checked') out.push(entry({ ...base, observation: { proposition, coverage: 'NONE', qualification: 'UNAVAILABLE', evidence: 'the reader could not run', incomplete: 'invented claims not checked: the claim reader could not run' }, verdict: null }));
    else if (!c.bound) out.push(entry({ ...base, observation: { proposition, coverage: 'NONE', qualification: 'UNAVAILABLE', evidence: c.open ? `no material was supplied to look them up in: ${c.open} listed for you` : 'no material was supplied to look them up in', ...undecided }, verdict: null }));
    else {
      const cut = c.cut ? `; ${c.cut} removed before delivery` : '';
      const evidence = c.delivered ? `${c.delivered} not found in it, and still in the text${cut}` : c.open ? `${c.open} could not be found in it: listed for you${cut}` : `all found${cut}`;
      // A specific left open is a part of the text nobody could vouch for: the reading is of the rest.
      out.push(entry({ ...base, observation: { proposition, coverage: c.open && !c.delivered ? 'PARTIAL' : 'FULL', qualification: c.qualified ? 'QUALIFIED' : 'UNQUALIFIED', evidence: c.qualified || !c.why ? evidence : `${evidence} (${c.why})`,
        ...(c.open && !c.delivered ? { unchecked: `${c.open} specific${c.open === 1 ? '' : 's'} listed for you` } : {}), ...undecided }, verdict: c.delivered ? 'VIOLATED' : 'MET' }));
    }
  }
  if (f.copying) {
    // THREE DIFFERENT THINGS, KEPT APART. Wording that recurs across the owner's pieces is their standard wording and
    // is left out of the count (read at build). A run shared with one piece, with that left out, is a lifted passage:
    // this entry. A held-back reference showing up in an output is leakage, and is `atelier reproduce`'s to find.
    // With too few pieces to tell what recurs, a clause every contract of theirs carries cannot be told from a lifted
    // passage: the run is counted and shown, and blocks nothing.
    const k = f.copying;
    out.push(entry({ id: 'lifted', dimension: 'EVIDENCE', source: 'SYSTEM', statement: 'No passage is lifted from one of your examples', required: true,
      observation: { proposition: `the longest run of words shared with one example, less wording that recurs across them (at most ${k.limit - 1}: what your own examples share with one another, and never fewer than 11)`, coverage: 'FULL',
        qualification: k.tellable ? 'DETERMINISTIC' : 'UNQUALIFIED', evidence: `${k.longest >= k.limit ? `a run of ${k.longest} words is shared with one of them (${k.limit - 1} at most)${k.words ? `: "${k.words}"` : ''}` : `the longest shared run is ${k.longest} words`}${k.tellable ? '' : ' (too few examples to tell your standard wording from a lifted passage)'}` }, verdict: k.longest >= k.limit ? 'VIOLATED' : 'MET' }));
  }
  return out;
}

/** The record of one output. */
export function buildRecord(f: RecordFacts): EvaluationRecord {
  // A habit with no check is nothing a run can say anything about: it is the writer's to have been shown.
  const rules = planFor({ requirements: f.requirements }).rules.filter((p) => p.role !== 'HABIT' || p.check);
  return recordOf([...rules.map((p) => standardEntry(p, f)), ...systemEntries(f), ...requestEntries(f), ...evidenceEntries(f)], f.latitude);
}
