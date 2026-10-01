// atelier/core/loop/cut-authority.ts — WHO MAY DELETE TEXT.
//
// Atelier's rule is that only a measured instrument may cut: an unmeasured one that deletes sentences is
// how a correct answer disappears. It was a convention, kept for the claim reader, and 0.6.0 broke it: a
// small model nobody had measured decided which answer sentences were "the assistant's own work", and
// "17 times 6 is 102." was cut. So every cut now names the instrument that asked for it, and this is the
// one place that says yes. Listing and reporting are always allowed; deleting is not.

export type CutAuthority =
  /** the claim reader, a model on the QUALIFIED_READERS list at the version that ran */
  | 'qualified-reader'
  /** the deterministic patterns: a fact in code, the same answer every time */
  | 'pattern'
  /** an unqualified reader the owner told to gate anyway (ATELIER_CLAIMS_GATE=reader), said on every run */
  | 'owner-override'
  /** a reader nobody has measured at the version that ran */
  | 'unqualified-reader'
  /** the context judge (./context-judge.ts): not measured; it may flag, never cut */
  | 'context-judge';

const MAY_CUT: ReadonlySet<CutAuthority> = new Set<CutAuthority>(['qualified-reader', 'pattern', 'owner-override']);

/** Whether `authority` may delete text. */
export const mayCut = (authority: CutAuthority): boolean => MAY_CUT.has(authority);

/** Refuse a cut asked for by an instrument that may not make one. Thrown, not skipped: it is a defect. */
export function assertMayCut(authority: CutAuthority): void {
  if (!mayCut(authority)) throw new Error(`${authority} is not a measured instrument: it may list what it finds, never cut it`);
}
