// tests/atelier-prerequisite.test.ts — AN IMPOSSIBLE EPISTEMIC DEMAND NEVER REACHES THE MODEL.
//
// THE CASE, measured on a live provider and reproduced here as a fixture. A compiled standard carried
// this REQUIRED rule:
//
//   "I cite one specific counted observation from our own records — churn notes, percentage of
//    demos — instead of arguing from principle or benchmarks."
//
// The invocation supplied no records. The model satisfied the rule by inventing them: "I pulled our
// last 200 tickets. 63% of them are the billing-portal password reset…" — a fluent, specific,
// entirely fabricated statistic, in the author's voice, indistinguishable from a correct run.
//
// The rule was followed. The condition that makes following it truthful was absent. Asking a model
// not to hallucinate is not a mechanism; knowing beforehand that the source is unbound is.

import { describe, it, expect } from 'vitest';
import { checkSatisfiable, describeSatisfiability, type Prerequisite } from '../core/state/prerequisite.js';
import { defaultPlan, autonomousPromotionAllowed } from '../core/coverage/observation.js';

const RECORDS: Prerequisite = {
  kind: 'RECORDS', name: 'support-ticket-history',
  why: 'the rule asks for a counted observation from the author\'s own records',
};

const rule = (id: string, materiality: string | null, prerequisites?: Prerequisite[]) => ({
  requirementId: id,
  statement: 'I cite one specific counted observation from our own records instead of arguing from principle.',
  materiality, prerequisites,
});

describe('a REQUIRED rule whose evidence is not bound', () => {
  it('refuses before generation rather than asking the model to improvise', () => {
    const v = checkSatisfiable([rule('g2', 'REQUIRED', [RECORDS])], new Set());
    expect(v.kind).toBe('MISSING_REQUIRED_EVIDENCE');
  });

  it('names the rule, the source and the way forward', () => {
    const v = checkSatisfiable([rule('g2', 'REQUIRED', [RECORDS])], new Set());
    const msg = describeSatisfiability(v)!;
    expect(msg).toMatch(/MISSING_REQUIRED_EVIDENCE/);
    expect(msg).toMatch(/g2/);
    expect(msg).toMatch(/support-ticket-history/);
    expect(msg).toMatch(/--with/);
    // and it says WHY, because "missing evidence" without the mechanism reads as a config error
    expect(msg).toMatch(/will produce a plausible one/);
  });

  it('POLARITY: binding the source makes the same standard satisfiable', () => {
    const v = checkSatisfiable([rule('g2', 'REQUIRED', [RECORDS])], new Set(['support-ticket-history']));
    expect(v.kind).toBe('SATISFIABLE');
    expect(describeSatisfiability(v)).toBeNull();
  });

  it('a rule with no prerequisites is unaffected — this must not gate ordinary standards', () => {
    const v = checkSatisfiable([rule('g1', 'REQUIRED'), rule('g3', 'PREFERRED')], new Set());
    expect(v.kind).toBe('SATISFIABLE');
  });
});

describe('a rule the author did not make obligatory', () => {
  it('DEGRADES rather than refusing — the run proceeds and the behaviour is not attempted', () => {
    const v = checkSatisfiable([rule('g5', 'PREFERRED', [RECORDS])], new Set());
    expect(v.kind).toBe('DEGRADED');
    expect(describeSatisfiability(v)).toMatch(/None of these is REQUIRED, so the run proceeds/);
  });

  it('but one REQUIRED among many PREFERRED still refuses the whole run', () => {
    const v = checkSatisfiable(
      [rule('g5', 'PREFERRED', [RECORDS]), rule('g2', 'REQUIRED', [RECORDS])], new Set());
    expect(v.kind).toBe('MISSING_REQUIRED_EVIDENCE');
  });
});

describe('the check is deterministic and costs nothing', () => {
  it('reaches its verdict from the standard and the bound names alone — no model, no I/O', () => {
    // If this ever needs a client, the check has moved from "known beforehand" to "observed
    // afterwards", which is the expensive path this exists to avoid.
    expect(checkSatisfiable.length).toBe(2);
    const v = checkSatisfiable([rule('g2', 'REQUIRED', [RECORDS])], new Set());
    expect(v.kind).toBe('MISSING_REQUIRED_EVIDENCE');
  });

  it('matches a prerequisite by NAME, so a file or a connector can satisfy the same dependency', () => {
    // Deliberately not a taxonomy: what `support-ticket-history` IS stays undecided until something
    // demands it. A CSV today, a query tomorrow, the same rule either way.
    const asTool: Prerequisite = { ...RECORDS, kind: 'TOOL' };
    expect(checkSatisfiable([rule('g2', 'REQUIRED', [asTool])], new Set(['support-ticket-history'])).kind)
      .toBe('SATISFIABLE');
  });
});

// ── OBSERVATION IS NOT CARRIER ───────────────────────────────────────────────────────────────
//
// The shortcut `OUTPUT_CONTRACT -> observable, PROSE -> unobservable` is wrong both ways. A contract
// deterministically observes SHAPE and says nothing about whether a citation is grounded; a PROSE
// requirement may be human-observed, testable, or unobserved. How a behaviour is CAUSED and how it is
// MEASURED are separate decisions and are represented separately.
describe('observation is a separate dimension from carrier', () => {
  const req = (id: string, m: string | null, shape?: Record<string, unknown>, pre?: { name: string }[]) =>
    ({ requirementId: id, materiality: m, outputShape: shape ?? null, prerequisites: pre });

  it('a shape requirement on a contract is deterministically observed — for SHAPE', () => {
    const p = defaultPlan(req('r1', 'REQUIRED', { verdict: { type: 'string' } }), 'OUTPUT_CONTRACT');
    expect(p.mechanism).toBe('DETERMINISTIC');
    expect(p.basis, 'the basis must not overclaim').toMatch(/SHAPE, not whether the content is true/);
  });

  it('the SAME carrier does not make a non-shape requirement observable', () => {
    // no outputShape: the contract carries other fields, and nothing observes THIS rule
    expect(defaultPlan(req('r2', 'REQUIRED'), 'OUTPUT_CONTRACT').mechanism).toBe('HUMAN');
  });

  it('a REQUIRED prose requirement is HUMAN-observed, which is a real sensor', () => {
    expect(defaultPlan(req('r3', 'REQUIRED'), 'PROSE').mechanism).toBe('HUMAN');
  });

  it('SELF_CHECK earns nothing automatic — the model grading itself is not an independent sensor', () => {
    expect(defaultPlan(req('r4', 'REQUIRED'), 'SELF_CHECK').mechanism).not.toBe('DETERMINISTIC');
  });

  it('a requirement blocked on unbound evidence says what would unblock it', () => {
    const p = defaultPlan(req('r5', 'REQUIRED', undefined, [{ name: 'support-ticket-history' }]), 'PROSE');
    expect(p.mechanism).toBe('NONE');
    expect(p.blockedOn).toBe('support-ticket-history');
    expect(p.basis).toMatch(/invented one/);
  });
});

describe('the autonomy boundary, stated precisely', () => {
  const plan = (id: string, mechanism: 'DETERMINISTIC' | 'HUMAN' | 'NONE') =>
    ({ requirementId: id, mechanism, basis: 'b' });

  it('a repair touching only deterministically-checked rules may promote itself', () => {
    expect(autonomousPromotionAllowed([{ requirementId: 'r1', materiality: 'REQUIRED' }],
      [plan('r1', 'DETERMINISTIC')]).autonomous).toBe(true);
  });

  it('a repair touching a REQUIRED rule only a human can check may not', () => {
    const v = autonomousPromotionAllowed([{ requirementId: 'r2', materiality: 'REQUIRED' }], [plan('r2', 'HUMAN')]);
    expect(v.autonomous).toBe(false);
  });

  it('and it says human promotion is still available, rather than implying the loop is dead', () => {
    const v = autonomousPromotionAllowed([{ requirementId: 'r2', materiality: 'REQUIRED' }], [plan('r2', 'NONE')]);
    expect(v.autonomous).toBe(false);
    if (!v.autonomous) {
      expect(v.why).toMatch(/atelier compare/);
      expect(v.why).toMatch(/not because the loop is broken/);
    }
  });

  it('a PREFERRED rule with no sensor does not block autonomy', () => {
    expect(autonomousPromotionAllowed([{ requirementId: 'r3', materiality: 'PREFERRED' }],
      [plan('r3', 'NONE')]).autonomous).toBe(true);
  });
});
