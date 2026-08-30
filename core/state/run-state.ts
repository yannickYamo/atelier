// atelier/core/state/run-state.ts — THE RESEARCH-PREVIEW STATE MACHINE.
//
// HOST-INDEPENDENT. No Claude Code types, no filesystem, no network. Claude Code is the first adapter;
// this module is the authority. If a run's identity or legality depended on the host, the artifact would
// not be portable and a second adapter would silently mean a second protocol.
//
// ─── TWO INDEPENDENT STUDIES, NEITHER MANDATORY ───────────────────────────────────────────────
//
// An earlier version had a single RESEARCH mode "offered after BUILD" that also gated the sealed prior
// list. That was incoherent: the sealed list measures discovery recall, so it must exist BEFORE
// discovery, and nothing offered after BUILD can supply it. One flag was doing two jobs at two times.
//
//   DISCOVERY STUDY   opt in BEFORE discovery.  Requires the expert's prior list, sealed.
//   BEHAVIOUR STUDY   opt in AFTER build.       Blind generation comparison, preference before reveal.
//
// Independent, both optional. The product path touches neither:
//
//   CORPUS -> DISCOVERY -> RATIFICATION -> BUILD -> installed skill -> real output -> feedback

export type StudyKind = 'DISCOVERY_STUDY' | 'BEHAVIOUR_STUDY';

export type RunState =
  | 'EMPTY'
  | 'CORPUS_SEALED'
  | 'LIST_SEALED'      // DISCOVERY_STUDY only
  | 'PROPOSED'
  | 'RATIFIED'
  | 'BUILT'
  | 'TEST_PENDING'     // BEHAVIOUR_STUDY only — arms generated, preference not recorded
  | 'TEST_RECORDED'
  | 'REVEALED';

/** Every way an enrolled run can end. LOST_TO_FOLLOWUP is NOT inferred — absence of evidence is not abandonment. */
export type TerminalState = 'COMPLETED' | 'USER_ABORTED' | 'PROTOCOL_FAILURE' | 'MODEL_FAILURE' | 'BUDGET_FAILURE';

export interface Transition { readonly from: RunState; readonly to: RunState; readonly requiresStudy?: StudyKind }

/** The legal graph as data — inspectable before it runs, unlike control flow. */
export const TRANSITIONS: readonly Transition[] = [
  { from: 'EMPTY', to: 'CORPUS_SEALED' },
  // DIRECT AUTHORING: a person went from nothing to a standard by writing it.
  //
  // The rest of this graph assumes a corpus is sealed before anything can be ratified, which is
  // right when the standard is being RECOVERED — sealing is what binds the run to the work it was
  // read from. There is nothing to bind when the author simply states their rules, and requiring a
  // seal there meant `add` could record requirements that no later step would ever compile.
  //
  // This edge cannot be reached by accident on the discovered path: that run leaves EMPTY the moment
  // its corpus is sealed, so this transition is no longer available to it. And it cannot produce an
  // empty standard, because the close refuses when nothing was decided.
  { from: 'EMPTY', to: 'RATIFIED' },
  { from: 'CORPUS_SEALED', to: 'LIST_SEALED', requiresStudy: 'DISCOVERY_STUDY' },
  { from: 'CORPUS_SEALED', to: 'PROPOSED' },          // product path: straight through
  { from: 'LIST_SEALED', to: 'PROPOSED' },
  { from: 'PROPOSED', to: 'RATIFIED' },
  // A RATIFIED STANDARD MAY BE SUPERSEDED BEFORE IT IS BUILT. `add` after `ratify-close` is the
  // ordinary case of remembering one more rule. The close then mints a new version that RECORDS
  // what it supersedes, and the hash guard below admits exactly that and nothing else.
  { from: 'RATIFIED', to: 'RATIFIED' },
  { from: 'RATIFIED', to: 'BUILT' },
  // A PREVIEW MAY BE RATIFIED AFTERWARDS.
  //
  // `create` stands a skill up from unratified discovery so a person can see something before
  // deciding anything — and under the authority rule that preview instructs nothing, every rule is
  // shown. Refusing BUILT -> RATIFIED then locked the user out of the only step that makes the skill
  // bind: they had a preview and no way to promote it. Ratifying after seeing a preview is the
  // ordinary path, not an anomaly.
  { from: 'BUILT', to: 'RATIFIED' },
  { from: 'BUILT', to: 'TEST_PENDING', requiresStudy: 'BEHAVIOUR_STUDY' },
  { from: 'TEST_PENDING', to: 'TEST_RECORDED' },
  { from: 'TEST_RECORDED', to: 'REVEALED' },
];

export interface Enrolment { readonly study: StudyKind; readonly at: string }

export interface Run {
  readonly runId: string;
  readonly state: RunState;
  readonly enrolments: readonly Enrolment[];
  readonly corpusHash: string | null;
  readonly listHash: string | null;
  readonly standardVersionHash: string | null;
  readonly preference: 'A' | 'B' | 'TIE' | 'NONE' | null;
  readonly terminal: TerminalState | null;
}

export const isEnrolled = (r: Run, s: StudyKind): boolean => r.enrolments.some((e) => e.study === s);

export type Refusal =
  | 'ILLEGAL_TRANSITION' | 'STUDY_NOT_ENROLLED' | 'CORPUS_MUTATED' | 'STANDARD_MUTATED'
  | 'PREFERENCE_NOT_RECORDED' | 'RUN_ALREADY_TERMINAL' | 'ENROLMENT_AFTER_OUTCOME' | 'LIST_REQUIRED';

export type TransitionResult = { readonly ok: true; readonly run: Run } | { readonly ok: false; readonly refusal: Refusal; readonly detail: string };

export function transition(run: Run, to: RunState, ctx: { corpusHash?: string; standardVersionHash?: string; supersedes?: string | null } = {}): TransitionResult {
  if (run.terminal) return { ok: false, refusal: 'RUN_ALREADY_TERMINAL', detail: `run ${run.runId} ended as ${run.terminal}; a terminal run is superseded by a new run, never resumed.` };

  const legal = TRANSITIONS.find((t) => t.from === run.state && t.to === to);
  if (!legal) {
    return { ok: false, refusal: 'ILLEGAL_TRANSITION', detail: `${run.state} -> ${to} is not in the transition table. Legal from ${run.state}: ${TRANSITIONS.filter((t) => t.from === run.state).map((t) => t.to).join(', ') || '(none)'}.` };
  }
  if (legal.requiresStudy && !isEnrolled(run, legal.requiresStudy)) {
    return { ok: false, refusal: 'STUDY_NOT_ENROLLED', detail: `${run.state} -> ${to} belongs to ${legal.requiresStudy}, which this run did not opt into. Ordinary product use never reaches it.` };
  }
  // A DISCOVERY_STUDY run must actually seal the list, not merely enrol.
  if (to === 'PROPOSED' && isEnrolled(run, 'DISCOVERY_STUDY') && run.state !== 'LIST_SEALED') {
    return { ok: false, refusal: 'LIST_REQUIRED', detail: 'this run enrolled in DISCOVERY_STUDY, whose measurement is discovery recall against the expert\'s own prior list. Discovering first would make that list a description of our output.' };
  }
  // IDENTITY, NOT A CHECKSUM.
  if (ctx.corpusHash && run.corpusHash && ctx.corpusHash !== run.corpusHash) {
    return { ok: false, refusal: 'CORPUS_MUTATED', detail: `corpus changed since sealing (${run.corpusHash} -> ${ctx.corpusHash}). Start a new run; this one's identity is bound to the sealed corpus.` };
  }
  // A changed hash is a MUTATION unless the new version says which one it supersedes. That is the
  // difference between editing a ratified standard in place and minting the next one — and the
  // second is the ordinary way a standard grows after it has been built.
  if (ctx.standardVersionHash && run.standardVersionHash && ctx.standardVersionHash !== run.standardVersionHash
    && ctx.supersedes !== run.standardVersionHash) {
    return { ok: false, refusal: 'STANDARD_MUTATED', detail: `StandardVersion changed after ratification (${run.standardVersionHash} -> ${ctx.standardVersionHash}). Editing a ratified standard mints a NEW version; it does not amend this one.` };
  }
  if (to === 'REVEALED' && run.preference === null) {
    return { ok: false, refusal: 'PREFERENCE_NOT_RECORDED', detail: 'cannot reveal arm identity before a preference is recorded — a choice made with the key visible measures the key.' };
  }
  return { ok: true, run: { ...run, state: to, ...(ctx.corpusHash ? { corpusHash: ctx.corpusHash } : {}), ...(ctx.standardVersionHash ? { standardVersionHash: ctx.standardVersionHash } : {}) } };
}

/**
 * Enrol in a study. Each has its own deadline, and both deadlines exist for the same reason:
 * enrolment after the relevant outcome is visible yields a denominator of survivors.
 */
export function enrol(run: Run, study: StudyKind, at: string): TransitionResult {
  if (isEnrolled(run, study)) return { ok: true, run };
  const tooLate: Readonly<Record<StudyKind, readonly RunState[]>> = {
    DISCOVERY_STUDY: ['PROPOSED', 'RATIFIED', 'BUILT', 'TEST_PENDING', 'TEST_RECORDED', 'REVEALED'],
    BEHAVIOUR_STUDY: ['TEST_PENDING', 'TEST_RECORDED', 'REVEALED'],
  };
  if (tooLate[study].includes(run.state)) {
    return { ok: false, refusal: 'ENROLMENT_AFTER_OUTCOME', detail: `cannot enrol in ${study} at ${run.state}: its outcomes already exist. Enrolling after seeing results yields a denominator of survivors.` };
  }
  return { ok: true, run: { ...run, enrolments: [...run.enrolments, { study, at }] } };
}

/** Only a full run for the studies it enrolled in may end COMPLETED. */
export function terminate(run: Run, t: TerminalState): TransitionResult {
  if (run.terminal) return { ok: false, refusal: 'RUN_ALREADY_TERMINAL', detail: `already ${run.terminal}` };
  if (t === 'COMPLETED') {
    const required: RunState = isEnrolled(run, 'BEHAVIOUR_STUDY') ? 'REVEALED' : 'BUILT';
    if (run.state !== required) {
      return { ok: false, refusal: 'ILLEGAL_TRANSITION', detail: `COMPLETED requires ${required}; run is at ${run.state}. A run that stopped early is USER_ABORTED or a failure state — never a completed one.` };
    }
  }
  return { ok: true, run: { ...run, terminal: t } };
}

export const newRun = (runId: string): Run => ({
  runId, state: 'EMPTY', enrolments: [], corpusHash: null, listHash: null,
  standardVersionHash: null, preference: null, terminal: null,
});
