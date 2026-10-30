// atelier/core/state/policy.ts — THE RULES LIVE HERE, ONCE.
//
// Hosts enforce; they do not decide. Encoding "cannot reveal before preference" separately in a Claude
// hook and a Codex hook creates two authorities that agree until they don't — and the first divergence
// would surface as a research result rather than as a bug.

import type { Run } from './run-state.js';
import { isEnrolled } from './run-state.js';

export interface ProtocolPolicy {
  readonly canBuild: boolean;
  readonly canReveal: boolean;
  readonly canDiscover: boolean;
  readonly reasonIfBlocked: string | null;
}

/**
 * Decide what is currently permitted, and say why when something is not.
 *
 * Precedence is explicit and ordered most-specific-first. An earlier version derived the reason with a
 * chained ternary whose build clause matched every non-RATIFIED state — so a run sitting at
 * TEST_PENDING was told "build requires ratification", which is both wrong and the kind of wrong that
 * sends a user backwards through a protocol they had already completed.
 */
export function policyFor(run: Run): ProtocolPolicy {
  const listOwed = isEnrolled(run, 'DISCOVERY_STUDY') && run.state === 'CORPUS_SEALED';
  const canDiscover = (run.state === 'CORPUS_SEALED' || run.state === 'LIST_SEALED') && !listOwed && !run.terminal;
  const canBuild = run.state === 'RATIFIED' && !run.terminal;
  const canReveal = run.state === 'TEST_RECORDED' && run.preference !== null && !run.terminal;

  const reasonIfBlocked =
      run.terminal            ? `run ended as ${run.terminal}; start a new run`
    : listOwed                ? 'discovery study enrolled: the prior list must be sealed first'
    : run.state === 'TEST_PENDING'  ? 'reveal requires a recorded preference'
    : run.state === 'TEST_RECORDED' && run.preference === null ? 'reveal requires a recorded preference'
    : run.state === 'BUILT' || run.state === 'REVEALED' || run.state === 'TEST_RECORDED' ? null
    : !canBuild               ? `build requires ratification (run is at ${run.state})`
    : null;

  return { canBuild, canReveal, canDiscover, reasonIfBlocked };
}
