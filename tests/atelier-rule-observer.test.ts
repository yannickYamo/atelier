/**
 * The ported observer, and the self-check that replaces a qualification campaign we do not have.
 *
 * The two assertions that matter: there is NO path to "the rule is satisfied", and a verdict that
 * flips when the two answers swap places is reported as unusable rather than as a preference.
 */
import { describe, it, expect } from 'vitest';
import {
  buildObserverPair, foldObserverPick, rankByObserver, describeRanking, NO_PROXY,
} from '../core/fidelity/rule-observer.js';
import { compareOnRule, describeObservedComparison } from '../core/fidelity/run-observer.js';
import type { InferenceClient, InferenceResult, Budget } from '../core/inference/client.js';

const budget = (): Budget => ({ spentUsd: 0, capUsd: 5 });

/** Answers with the given picks in order, so a flip between orientations can be staged. */
function stub(picks: readonly string[]): InferenceClient {
  let i = 0;
  return {
    async complete(): Promise<InferenceResult> {
      const pick = picks[Math.min(i++, picks.length - 1)];
      return { json: { pick, why: 'because' }, modelId: 'stub', inputTokens: 0,
        cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, cost: { basis: 'API_METERED' as const, billingUsd: 0 }, costUsd: 0 };
    },
  };
}

/** Always names whichever side is physically longer — the confound order-invariance cannot catch. */
function longestWins(): InferenceClient {
  return {
    async complete(req): Promise<InferenceResult> {
      const a = req.stableBlock.split('## A\n\n')[1]?.split('\n\n## B')[0] ?? '';
      const b = req.stableBlock.split('## B\n\n')[1]?.split('\n\nAnswer with')[0] ?? '';
      return { json: { pick: a.length >= b.length ? 'A' : 'B', why: 'longer' }, modelId: 'stub',
        inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, cost: { basis: 'API_METERED' as const, billingUsd: 0 }, costUsd: 0 };
    },
  };
}

describe('the instrument has no path to SATISFIED', () => {
  it('a proxy that finds nothing says UNKNOWN, never satisfied', () => {
    expect(NO_PROXY('anything at all')).toBe('UNKNOWN');
  });

  it('every fold outcome is an ORDERING, never a verdict on the rule', () => {
    const pair = buildObserverPair('c1', 'sit', 'the rule', 'champ', 'cand', true);
    const outcomes = (['A', 'B', 'EQUAL', 'NEITHER'] as const).map((p) => foldObserverPick(pair, p));
    // The closed set is the guarantee: every member is COMPARATIVE ("better than the other") or a
    // refusal. None asserts the rule holds, and there is no fifth member that could.
    expect(new Set(outcomes)).toEqual(new Set(
      ['CANDIDATE_COMPLIES_BETTER', 'CHAMPION_COMPLIES_BETTER', 'EQUAL', 'NEITHER_COMPLIES']));
    for (const o of outcomes) expect(o).not.toContain('SATISFIED');
  });

  it('the two orientations differ ONLY by which text comes first', () => {
    // The property, stated as a property rather than a word search: an observer that could tell
    // which side an optimizer produced would rank provenance. So the FRAMING must be byte-identical
    // and only the order of the two answers may change.
    //
    // (An earlier version of this test grepped the render for "candidate" and failed because the
    // FIXTURE was called "CANDIDATE TEXT" — it was searching the payload, not the framing.)
    const one = buildObserverPair('c1', 'sit', 'the rule', 'alpha', 'beta', true).rendered;
    const two = buildObserverPair('c1', 'sit', 'the rule', 'alpha', 'beta', false).rendered;
    expect(one.replace('## A\n\nbeta', '## A\n\nalpha').replace('## B\n\nalpha', '## B\n\nbeta')).toBe(two);
    for (const r of [one, two]) {
      expect(r).not.toMatch(/isCandidate|which side|produced by/i);
      expect(r).toContain('unlabelled');
    }
  });

  it('asks about the RULE, and says EQUAL and NEITHER are real answers', () => {
    const r = buildObserverPair('c1', 'sit', 'the rule', 'x', 'y', true).rendered;
    expect(r).toContain('not which is better written');
    expect(r).toContain('Those are real answers');
  });
});

describe('order-invariance — the check that stands in for qualification', () => {
  const args = ['c1', 'the task', 'the rule', 'champion answer', 'candidate answer'] as const;

  it('a STABLE preference survives the swap and is reported as usable', async () => {
    // forward: candidate is A, picks A. reverse: candidate is B, picks B. Same conclusion both ways.
    const c = await compareOnRule(stub(['A', 'B']), budget(), ...args);
    expect(c.orderInvariant).toBe(true);
    expect(c.result).toBe('CANDIDATE_COMPLIES_BETTER');
    expect(describeObservedComparison(c, 'the rule')).toContain('swapped places');
  });

  it('POLARITY: a verdict that follows POSITION is reported unusable, not as a preference', async () => {
    // picks A both times — in the reverse orientation "A" is the champion, so it changed its mind.
    const c = await compareOnRule(stub(['A', 'A']), budget(), ...args);
    expect(c.orderInvariant).toBe(false);
    const text = describeObservedComparison(c, 'the rule');
    expect(text).toContain('no usable reading');
    expect(text).toContain('reading position, not the rule');
    expect(text).toContain('Read both outputs yourself');
  });

  it('each orientation folds against its OWN key — raw picks are not comparable across the two', async () => {
    const c = await compareOnRule(stub(['A', 'A']), budget(), ...args);
    expect(c.picks).toEqual(['A', 'A']);     // identical raw picks...
    expect(c.orderInvariant).toBe(false);    // ...and opposite conclusions
  });

  it('the confound it CANNOT catch is surfaced, not hidden', async () => {
    // A judge that always names the longer side is perfectly order-invariant and measures nothing.
    const c = await compareOnRule(longestWins(), budget(), 'c1', 'task', 'rule',
      'short', 'a considerably longer candidate answer than the champion');
    expect(c.orderInvariant).toBe(true);
    expect(c.preferredLonger).toBe(true);
    const text = describeObservedComparison(c, 'rule');
    expect(text).toContain('preferred the longer answer');
    expect(text).toContain('passes it\nevery time');
  });

  it('never claims authority, whatever it found', async () => {
    const c = await compareOnRule(stub(['A', 'B']), budget(), ...args);
    const text = describeObservedComparison(c, 'the rule');
    expect(text).toContain('orders your attention');
    expect(text).toContain('carries no authority');
  });

  it('NEITHER is preserved — "the repair did not land" is a real finding', async () => {
    const c = await compareOnRule(stub(['NEITHER', 'NEITHER']), budget(), ...args);
    expect(c.result).toBe('NEITHER_COMPLIES');
    expect(describeObservedComparison(c, 'the rule')).toContain('repair did not land');
  });
});

describe('rankByObserver', () => {
  it('a positive proxy detection demotes, and the semantic observer may NOT overturn it', () => {
    // The witnessed defect: a candidate the proxy caught still violating was selected because the
    // semantic observer preferred it. The one-sided instrument's positive is the reliable signal.
    const r = rankByObserver([
      { candidateId: 'caught', result: 'CANDIDATE_COMPLIES_BETTER', proxy: 'KNOWN_VIOLATION_PRESENT' },
      { candidateId: 'clean', result: 'EQUAL', proxy: 'UNKNOWN' },
    ]);
    expect(r.ordered[0]).toBe('clean');
  });

  it('ties are REPORTED, never broken by array position', () => {
    const r = rankByObserver([
      { candidateId: 'c1', result: 'CANDIDATE_COMPLIES_BETTER', proxy: 'UNKNOWN' },
      { candidateId: 'c2', result: 'CANDIDATE_COMPLIES_BETTER', proxy: 'UNKNOWN' },
    ]);
    expect(r.topIsTied).toBe(true);
    expect(r.ties[0]).toEqual(['c1', 'c2']);
    expect(describeRanking(r)).toContain('TOP IS TIED');
    expect(describeRanking(r)).toContain('arbitrary');
  });

  it('with no proxy the order is the observer\'s alone — and the tie report still bites', () => {
    // Stating the reduced guarantee: key 1 is constant, so this is the configuration the original
    // ranker was rewritten to stop trusting. The tie half is what survives.
    const r = rankByObserver([
      { candidateId: 'a', result: 'EQUAL', proxy: 'UNKNOWN' },
      { candidateId: 'b', result: 'EQUAL', proxy: 'UNKNOWN' },
    ]);
    expect(r.topIsTied).toBe(true);
  });
});
