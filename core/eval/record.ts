// atelier/core/eval/record.ts — THE EVALUATION OF ONE OUTPUT, ONCE, FOR EVERY SURFACE THAT SHOWS IT.
//
// Atelier's claim is narrow and has to be exactly true: the owner says what good is, and Atelier says what it could
// observe of it. That claim was broken by drift, never by design: a tick shown for a rule whose first half was all
// a check read; a rule the owner stated demoted because their examples ran longer; a request for 400 words answered
// with 187 and called checked; four screens each deciding again what a result meant.
//
// So the meaning of a result is decided in one place (`judge`, `stateOf`) from typed facts, and every surface
// renders this record without deciding anything again. Two axes are kept apart, always:
//
//   AUTHORITY     who says the rule matters, and whether it is required. The owner's. Nothing measured moves it.
//   OBSERVATION   what proposition a check actually read, how much of the rule that covers, and whether the
//                 observer has earned the right to be believed. Atelier's. It decides enforcement, never meaning.
//
// A requirement PASSES only when an observer that is deterministic or qualified read the WHOLE of it and it held.

export type Dimension = 'STANDARD' | 'REQUEST' | 'EVIDENCE' | 'HABIT';
/** where the requirement comes from: the owner's method, this request, their examples, or the system's own guard */
export type Source = 'METHOD' | 'REQUEST' | 'EXAMPLE' | 'SYSTEM';
export type Coverage = 'FULL' | 'PARTIAL' | 'NONE';
export type Qualification = 'DETERMINISTIC' | 'QUALIFIED' | 'UNQUALIFIED' | 'UNAVAILABLE';
export type Result = 'PASS' | 'FAIL' | 'UNVERIFIED' | 'NOT_APPLICABLE';
export type Reason = 'MET' | 'NOT_MET' | 'PARTLY_CHECKED' | 'NOT_MACHINE_CHECKABLE' | 'OBSERVER_UNQUALIFIED' | 'SET_ASIDE' | 'REPLACED_BY_REQUEST' | 'DOES_NOT_APPLY';
export type RunState = 'VERIFIED' | 'NEEDS_REVIEW' | 'BLOCKED';

export interface Observation {
  /** the proposition the check actually read, in plain words; null where nothing read the requirement */
  readonly proposition: string | null;
  readonly coverage: Coverage;
  readonly qualification: Qualification;
  /** what the check found on this output */
  readonly evidence: string | null;
  /** the part of the requirement no check read, in the owner's words, where coverage is PARTIAL */
  readonly unchecked?: string;
}

export interface Entry {
  readonly id: string;
  readonly dimension: Dimension;
  readonly source: Source;
  /** in the owner's words (or the request's), never a paraphrase */
  readonly statement: string;
  /** whether the requirement is required: the owner's call, never changed by what was observed */
  readonly required: boolean;
  readonly observation: Observation;
  readonly result: Result;
  readonly reason: Reason;
}

export interface EvaluationRecord { readonly schema: 1; readonly state: RunState; readonly entries: readonly Entry[] }

export interface Observed {
  /**
   * Does the requirement apply to this output at all. Set aside for the run: not checked, and the owner's to look at.
   * Replaced by the request: the request set a constraint of its own in its place, and that one is in the record.
   */
  readonly applies: boolean | { readonly setAside: string } | { readonly replacedBy: string };
  /** what the check returned on this output; null where no check exists */
  readonly verdict: 'MET' | 'VIOLATED' | null;
  readonly coverage: Coverage;
  readonly qualification: Qualification;
}

/**
 * THE ONE PLACE A RESULT IS DECIDED. Read top to bottom, it is the product's promise:
 * what does not apply is not judged; what nothing read, or an unqualified observer read, is unverified and can
 * never block; a failed check fails the requirement even where it read only part of it (a part that is wrong is
 * wrong); and a met check passes the requirement only where it read all of it.
 */
export function judge(o: Observed): { readonly result: Result; readonly reason: Reason } {
  if (o.applies !== true) return { result: 'NOT_APPLICABLE', reason: o.applies === false ? 'DOES_NOT_APPLY' : 'replacedBy' in o.applies ? 'REPLACED_BY_REQUEST' : 'SET_ASIDE' };
  if (o.verdict === null || o.coverage === 'NONE') return { result: 'UNVERIFIED', reason: 'NOT_MACHINE_CHECKABLE' };
  if (o.qualification !== 'DETERMINISTIC' && o.qualification !== 'QUALIFIED') return { result: 'UNVERIFIED', reason: 'OBSERVER_UNQUALIFIED' };
  if (o.verdict === 'VIOLATED') return { result: 'FAIL', reason: 'NOT_MET' };
  return o.coverage === 'FULL' ? { result: 'PASS', reason: 'MET' } : { result: 'UNVERIFIED', reason: 'PARTLY_CHECKED' };
}

/** Does this entry stop the work being used as it is: a required rule that a believable observer saw fail. */
export const blocks = (e: Entry): boolean => e.required && e.result === 'FAIL';
/** Is this entry left for a person: a required rule nothing believable read in full, or a rule set aside for the run. */
export const needsReview = (e: Entry): boolean => e.required && (e.result === 'UNVERIFIED' || e.reason === 'SET_ASIDE');

/**
 * The state of the whole output. BLOCKED: a required rule was seen to fail. VERIFIED: every required rule was read
 * in full by a believable observer and held. NEEDS_REVIEW: nothing was seen to fail, and something required is
 * still a person's to read. A habit from the examples that was not adopted (`required: false`) moves nothing.
 */
export function stateOf(entries: readonly Entry[]): RunState {
  if (entries.some(blocks)) return 'BLOCKED';
  return entries.some(needsReview) ? 'NEEDS_REVIEW' : 'VERIFIED';
}

/** The rules a check read only part of, each with the part it did not read: for a surface that lists checks by line. */
export const partlyChecked = (r: EvaluationRecord): Map<string, string> => new Map(r.entries.filter((e) => e.reason === 'PARTLY_CHECKED').map((e) => [e.id, e.observation.unchecked ?? 'the rest of it']));

/** An entry, with its result decided here and nowhere else. */
export function entry(e: Omit<Entry, 'result' | 'reason'> & { readonly applies?: Observed['applies']; readonly verdict: Observed['verdict'] }): Entry {
  const { applies, verdict, ...rest } = e;
  return { ...rest, ...judge({ applies: applies ?? true, verdict, coverage: e.observation.coverage, qualification: e.observation.qualification }) };
}

export const recordOf = (entries: readonly Entry[]): EvaluationRecord => ({ schema: 1, state: stateOf(entries), entries });
