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
  } | null;
  /**
   * The longest run of words shared with one of the owner's pieces, less their standard wording; and whether there
   * were pieces enough to tell standard wording at all (../observers/overlap.ts, `STANDARD_WORDING_PIECES`).
   */
  readonly copying: { readonly longest: number; readonly limit: number; readonly tellable: boolean; /** the shared words themselves */ readonly words?: string } | null;
  /** of the rules set aside, those the request replaced with a constraint of its own, which is itself in the record */
  readonly replaced?: ReadonlySet<string>;
}

const NOTHING: Observation = { proposition: null, coverage: 'NONE', qualification: 'UNAVAILABLE', evidence: null };

/** One rule of the standard as it fared: what it is and whether its check may block come from the plan, never from here. */
function standardEntry(p: PlannedRule, f: RecordFacts): Entry {
  const required = p.role !== 'HABIT';
  const base = { id: p.id, statement: p.statement, dimension: required ? 'STANDARD' as const : 'HABIT' as const, source: p.stated ? 'METHOD' as const : 'EXAMPLE' as const, required };
  const o = p.check;
  if (!o) return entry({ ...base, observation: NOTHING, verdict: null });
  const line = f.checked?.find((c) => c.id === p.id);
  const why = f.waived.get(p.id);
  // WHETHER A CHECK MAY BLOCK IS THE PLAN'S TO SAY, and the record says the same: a check of the owner's rule that
  // is not enforced (their own work disputes the reading, or they never made the check required) is shown with what
  // it found and blocks nothing. A habit's check is believed as a count; it is not required, so it blocks nothing either.
  const held = required && !p.enforced;
  const whyNot = p.notEnforced === 'DISPUTED_BY_EXAMPLES' ? 'Your own examples do not do this, so the rule blocks nothing until you confirm it' : 'You have not made this check required, so it blocks nothing';
  const seen = (evidence: string | null): Observation => ({ proposition: o.proposition, coverage: o.coverage, qualification: held ? 'UNQUALIFIED' : 'DETERMINISTIC',
    evidence: held && evidence ? `${evidence}. ${whyNot}` : evidence, ...(o.unchecked ? { unchecked: o.unchecked } : {}) });
  if (why) return entry({ ...base, observation: seen(why), applies: f.replaced?.has(p.id) ? { replacedBy: why } : { setAside: why }, verdict: null });
  // The check could not run, or had nothing to read the rule against (no material bound): nothing was observed.
  if (!line || (line.verdict === 'NOT_APPLICABLE' && o.reads === 'BOUND_MATERIAL')) {
    return entry({ ...base, observation: { ...seen(line?.detail ?? 'the check did not run'), coverage: 'NONE' }, verdict: null });
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
    if (c.state === 'off') out.push(entry({ ...base, observation: { proposition, coverage: 'NONE', qualification: 'UNAVAILABLE', evidence: 'turned off for this run' }, applies: { setAside: 'turned off for this run' }, verdict: null }));
    else if (c.state === 'not-checked') out.push(entry({ ...base, observation: { proposition, coverage: 'NONE', qualification: 'UNAVAILABLE', evidence: 'the reader could not run' }, verdict: null }));
    else if (!c.bound) out.push(entry({ ...base, observation: { proposition, coverage: 'NONE', qualification: 'UNAVAILABLE', evidence: c.open ? `no material was supplied to look them up in: ${c.open} listed for you` : 'no material was supplied to look them up in' }, verdict: null }));
    else {
      const cut = c.cut ? `; ${c.cut} removed before delivery` : '';
      const evidence = c.delivered ? `${c.delivered} not found in it, and still in the text${cut}` : c.open ? `${c.open} could not be found in it: listed for you${cut}` : `all found${cut}`;
      // A specific left open is a part of the text nobody could vouch for: the reading is of the rest.
      out.push(entry({ ...base, observation: { proposition, coverage: c.open && !c.delivered ? 'PARTIAL' : 'FULL', qualification: c.qualified ? 'QUALIFIED' : 'UNQUALIFIED', evidence: c.qualified || !c.why ? evidence : `${evidence} (${c.why})`,
        ...(c.open && !c.delivered ? { unchecked: `${c.open} specific${c.open === 1 ? '' : 's'} listed for you` } : {}) }, verdict: c.delivered ? 'VIOLATED' : 'MET' }));
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
  return recordOf([...rules.map((p) => standardEntry(p, f)), ...systemEntries(f), ...requestEntries(f), ...evidenceEntries(f)]);
}
