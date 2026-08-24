/**
 * Repair memory — the loop remembering what a person already said no to.
 *
 * The witnessed case: the g9 repair was proposed, built, evaluated and REJECTED, and that negative
 * lived only in a session transcript. Nothing would have stopped the identical repair being proposed
 * on the next complaint about the same rule.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  foldRepairs, foldProhibitions, mayPropose, repairKey, describeHistory, strictlyStronger,
  WEAKEST_EVALUATION, type EvidenceBasis, type EvaluationBasis,
} from '../core/architecture/repair-memory.js';
import { initStore, appendEvent, readEvents, type StoreLayout } from '../core/state/store.js';

const ev = (missContexts: number): EvidenceBasis => ({ missContexts, invocationIds: [] });
const evalu = (generations: number, instrument: EvaluationBasis['instrument'] = 'HUMAN_EYE'): EvaluationBasis =>
  ({ generations, instrument, orderInvariant: null });

const proposed = (repairId: string, requirementId: string, from: string, to: string, cand: string, at: string, misses = 1) =>
  ({ kind: 'REPAIR_PROPOSED', repairId, skillName: 'my-voice', requirementId, from, to,
    sourceSkillVersionHash: 'src', candidateSkillVersionHash: cand, evidenceBasis: ev(misses), at });
const settled = (repairId: string, outcome: string, at: string, note: string | null = null, gens = 1) =>
  ({ kind: 'REPAIR_SETTLED', repairId, outcome, evaluationBasis: evalu(gens), at, note });
const forbidden = (requirementId: string, from: string, to: string, reason: string, at: string) =>
  ({ kind: 'TRANSITION_FORBIDDEN', requirementId, from, to, by: 'expert', reason, at });

/** the weakest possible proposal — one observed miss, one generation, no qualified instrument */
const WEAK = { evidence: ev(1), evaluation: WEAKEST_EVALUATION };

describe('foldRepairs', () => {
  it('a proposal with no ruling is PENDING', () => {
    const r = foldRepairs([proposed('r1', 'p1', 'PROSE', 'SELF_CHECK', 'cand1', '2026-01-01')]);
    expect(r).toHaveLength(1);
    expect(r[0].outcome).toBe('PENDING');
    expect(r[0].outcomeAt).toBeNull();
  });

  it('a settlement is applied to its own repair, with the reason', () => {
    const r = foldRepairs([
      proposed('r1', 'p1', 'PROSE', 'SELF_CHECK', 'cand1', '2026-01-01'),
      settled('r1', 'REJECTED', '2026-01-02', 'it started nagging'),
    ]);
    expect(r[0].outcome).toBe('REJECTED');
    expect(r[0].note).toBe('it started nagging');
  });

  it('FIRST settlement wins — a later contradiction cannot erase a rejection', () => {
    // "you rejected this, then something recorded that you promoted it" is a contradiction, and
    // letting the later write decide is exactly how a rejection disappears.
    const r = foldRepairs([
      proposed('r1', 'p1', 'PROSE', 'SELF_CHECK', 'cand1', '2026-01-01'),
      settled('r1', 'REJECTED', '2026-01-02', 'no'),
      settled('r1', 'PROMOTED', '2026-01-03'),
    ]);
    expect(r[0].outcome).toBe('REJECTED');
  });

  it('ignores a settlement for a repair that was never proposed', () => {
    expect(foldRepairs([settled('ghost', 'PROMOTED', '2026-01-02')])).toHaveLength(0);
  });

  it('ignores events that are not repair events — the log is shared', () => {
    const r = foldRepairs([
      { kind: 'PROMOTED', at: '2026-01-01', skillVersionHash: 'x' },
      proposed('r1', 'p1', 'PROSE', 'SELF_CHECK', 'cand1', '2026-01-01'),
    ]);
    expect(r).toHaveLength(1);
  });

  it('is derived, never stored — folding twice gives the same answer', () => {
    const events = [proposed('r1', 'p1', 'PROSE', 'SELF_CHECK', 'c1', '2026-01-01'), settled('r1', 'PROMOTED', '2026-01-02')];
    expect(foldRepairs(events)).toEqual(foldRepairs(events));
  });
});

describe('mayPropose — a rejection is a prior, not a prohibition', () => {
  const rejectedOnWeakEvidence = foldRepairs([
    proposed('r1', 'g9', 'PROSE', 'SELF_CHECK', 'cand1', '2026-01-01', 1),
    settled('r1', 'REJECTED', '2026-01-02', 'still produced unsupported numbers', 1),
  ]);

  it('LAUNDERING is refused: the same move on evidence no stronger than what already failed', () => {
    const j = mayPropose(rejectedOnWeakEvidence, [], 'g9', 'PROSE', 'SELF_CHECK', WEAK);
    expect(j.allowed).toBe(false);
    if (!j.allowed) {
      expect(j.reason).toContain('same question');
      expect(j.reason).toContain('still produced unsupported numbers');
    }
  });

  it('THE CORRECTION: materially stronger evidence REOPENS it — one generation is stochastic', () => {
    // The first version banned rule+transition outright, turning "this candidate did not demonstrate
    // improvement" into "SELF_CHECK can never help g9". That converts a single weak observation into
    // a permanent architectural law, and makes the evidence that would justify reconsidering
    // ungatherable — the attempt that would gather it is forbidden.
    const j = mayPropose(rejectedOnWeakEvidence, [], 'g9', 'PROSE', 'SELF_CHECK',
      { evidence: ev(6), evaluation: evalu(1) });
    expect(j.allowed).toBe(true);
  });

  it('and the prior travels with it — visible, never a veto', () => {
    const j = mayPropose(rejectedOnWeakEvidence, [], 'g9', 'PROSE', 'SELF_CHECK',
      { evidence: ev(6), evaluation: evalu(1) });
    expect(j.allowed).toBe(true);
    if (j.allowed) {
      expect(j.priors).toHaveLength(1);
      expect(j.note).toContain('prior, not a verdict');
      expect(j.note).toContain('stochastic');
    }
  });

  it('more generations alone also reopens it — n=1 was the weakness', () => {
    const j = mayPropose(rejectedOnWeakEvidence, [], 'g9', 'PROSE', 'SELF_CHECK',
      { evidence: ev(1), evaluation: evalu(5) });
    expect(j.allowed).toBe(true);
  });

  it('a qualified instrument reopens it — the evaluation was the weak part', () => {
    const j = mayPropose(rejectedOnWeakEvidence, [], 'g9', 'PROSE', 'SELF_CHECK',
      { evidence: ev(1), evaluation: evalu(1, 'QUALIFIED_OBSERVER') });
    expect(j.allowed).toBe(true);
  });

  it('an UNQUALIFIED comparator is NOT stronger than a human eye', () => {
    // Swapping one instrument with no authority for another is not new evidence.
    const j = mayPropose(rejectedOnWeakEvidence, [], 'g9', 'PROSE', 'SELF_CHECK',
      { evidence: ev(1), evaluation: evalu(1, 'UNQUALIFIED_COMPARATOR') });
    expect(j.allowed).toBe(false);
  });

  it('an EXPLICIT prohibition is absolute, and no evidence reopens it', () => {
    // "reject this candidate" and "never use this transition" are different statements. Only the
    // second is absolute, and only because a person said the absolute thing.
    const bans = foldProhibitions([forbidden('g9', 'PROSE', 'SELF_CHECK', 'self-checks make it nag', '2026-01-03')]);
    const j = mayPropose(rejectedOnWeakEvidence, bans, 'g9', 'PROSE', 'SELF_CHECK',
      { evidence: ev(99), evaluation: evalu(99, 'QUALIFIED_OBSERVER') });
    expect(j.allowed).toBe(false);
    if (!j.allowed) {
      expect(j.reason).toContain('about your architecture');
      expect(j.reason).toContain('yours to withdraw');
    }
  });

  it('a prohibition is NEVER inferred from a rejection', () => {
    expect(foldProhibitions([
      proposed('r1', 'g9', 'PROSE', 'SELF_CHECK', 'cand1', '2026-01-01'),
      settled('r1', 'REJECTED', '2026-01-02', 'worse'),
    ])).toHaveLength(0);
  });

  it('a DIFFERENT move on the same rule is unaffected either way', () => {
    expect(mayPropose(rejectedOnWeakEvidence, [], 'g9', 'SELF_CHECK', 'EXAMPLE', WEAK).allowed).toBe(true);
  });

  it('an UNJUDGED candidate still blocks, and says how to judge it', () => {
    const pending = foldRepairs([proposed('r1', 'p1', 'PROSE', 'SELF_CHECK', 'cand1', '2026-01-01')]);
    const j = mayPropose(pending, [], 'p1', 'PROSE', 'SELF_CHECK', WEAK);
    expect(j.allowed).toBe(false);
    if (!j.allowed) expect(j.reason).toContain('atelier compare');
  });

  it('a PROMOTED repair does not block a later attempt at the same move', () => {
    const promoted = foldRepairs([
      proposed('r1', 'p1', 'PROSE', 'SELF_CHECK', 'cand1', '2026-01-01'),
      settled('r1', 'PROMOTED', '2026-01-02'),
    ]);
    expect(mayPropose(promoted, [], 'p1', 'PROSE', 'SELF_CHECK', WEAK).allowed).toBe(true);
  });

  it('an empty history allows anything', () => {
    expect(mayPropose([], [], 'p1', 'PROSE', 'SELF_CHECK', WEAK).allowed).toBe(true);
  });

  it('the key is the transition family, not the candidate hash', () => {
    // A rejected move must not return wearing a new name — that is the laundering this prevents.
    expect(repairKey('p1', 'PROSE', 'SELF_CHECK')).toBe(repairKey('p1', 'PROSE', 'SELF_CHECK'));
    const other = foldRepairs([
      proposed('r2', 'p1', 'PROSE', 'SELF_CHECK', 'A_DIFFERENT_HASH', '2026-01-05'),
      settled('r2', 'REJECTED', '2026-01-06'),
    ]);
    expect(mayPropose(other, [], 'p1', 'PROSE', 'SELF_CHECK', WEAK).allowed).toBe(false);
  });
});

describe('strictlyStronger — dominance, never a score', () => {
  it('needs at least one dimension better and none worse', () => {
    const base = { evidence: ev(2), evaluation: evalu(2) };
    expect(strictlyStronger({ evidence: ev(3), evaluation: evalu(2) }, base)).toBe(true);
    expect(strictlyStronger({ evidence: ev(2), evaluation: evalu(2) }, base)).toBe(false);
  });

  it('a gain on one dimension cannot BUY a loss on another', () => {
    // A scalar would let an optimizer run the same weak candidate many times to "outweigh" a
    // single-context miss — a threshold becoming a target.
    expect(strictlyStronger({ evidence: ev(1), evaluation: evalu(99) },
      { evidence: ev(5), evaluation: evalu(1) })).toBe(false);
  });
});

describe('describeHistory', () => {
  it('says plainly when nothing has been tried', () => {
    expect(describeHistory([], [], 'p1')).toContain('No repair has been attempted');
  });

  it('puts rejections first — they are the finding', () => {
    const h = foldRepairs([
      proposed('r1', 'p1', 'PROSE', 'SELF_CHECK', 'cand1', '2026-01-01'),
      settled('r1', 'REJECTED', '2026-01-02', 'nagging'),
      proposed('r2', 'p1', 'SELF_CHECK', 'EXAMPLE', 'cand2', '2026-01-03'),
    ]);
    const text = describeHistory(h, [], 'p1');
    expect(text.indexOf('rejected')).toBeLessThan(text.indexOf('pending'));
    expect(text).toContain('nagging');
  });

  it('scopes to the rule asked about', () => {
    const h = foldRepairs([
      proposed('r1', 'p1', 'PROSE', 'SELF_CHECK', 'cand1', '2026-01-01'),
      proposed('r2', 'p2', 'PROSE', 'SELF_CHECK', 'cand2', '2026-01-02'),
    ]);
    expect(describeHistory(h, [], 'p1')).toContain('1 repair attempt');
  });
});

describe('PROPAGATION — the events survive the real store, not just the fold', () => {
  it('appendEvent -> readEvents -> foldRepairs carries a rejection end to end', () => {
    // The fold tests above are pure. This asserts the EDGE: that what the CLI writes is what the
    // CLI reads back. A memory that works in memory and loses the rejection on disk is the same
    // defect it exists to prevent, one layer down.
    const L: StoreLayout = { root: mkdtempSync(join(tmpdir(), 'atelier-repair-')), skillName: 'my-voice' };
    initStore(L);

    appendEvent(L, proposed('r1', 'p1', 'PROSE', 'SELF_CHECK', 'cand1', '2026-01-01'));
    appendEvent(L, settled('r1', 'REJECTED', '2026-01-02', 'it started nagging'));
    appendEvent(L, { kind: 'PROMOTED', at: '2026-01-03', skillVersionHash: 'unrelated' });

    const folded = foldRepairs(readEvents(L));
    expect(folded).toHaveLength(1);
    expect(folded[0].outcome).toBe('REJECTED');
    expect(folded[0].note).toBe('it started nagging');

    // and the refusal fires off what came back from disk
    const j = mayPropose(folded, [], 'p1', 'PROSE', 'SELF_CHECK', WEAK);
    expect(j.allowed).toBe(false);
  });
});
