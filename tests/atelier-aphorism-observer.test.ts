// Frozen before the expert's labels existed. These test BEHAVIOUR of the detectors, never their
// accuracy — accuracy is what the probe measures, and asserting it here would be fitting the
// instrument to an answer nobody has given yet.
import { describe, it, expect } from 'vitest';
import {
  detect, detectAll, profileDetector, profileAll, APHORISM_DETECTORS, BREVITY_MAX_WORDS,
  type HumanLabel,
} from '../core/contract/observers/aphorism.js';

describe('each detector keys on the thing it is named for', () => {
  it('BREVITY is compression alone, and says nothing about form', () => {
    expect(detect('BREVITY', 'They want legible driving.')).toBe(true);
    expect(detect('BREVITY', 'a '.repeat(BREVITY_MAX_WORDS + 4))).toBe(false);
    // A short sentence that is not remotely an aphorism still passes — that is the point of
    // measuring it separately rather than assuming brevity implies the move.
    expect(detect('BREVITY', 'We shipped it on Tuesday.')).toBe(true);
  });

  it('CONTRASTIVE catches the author\'s own reversal, and is a word list', () => {
    // A KNOWN BLIND SPOT, RECORDED RATHER THAN HIDDEN. The author's own discovered example makes the
    // reversal across a SENTENCE boundary, and `[^.!?]*` cannot cross one. Whether that matters is
    // exactly what the probe measures; papering over it here would hide the proxy's real shape.
    expect(detect('CONTRASTIVE', "Riders don't actually want perfect driving. They want legible driving."))
      .toBe(false);
    expect(detect('CONTRASTIVE', 'Pricing is an operating system, not a price tag.')).toBe(false);
    expect(detect('CONTRASTIVE', 'This is not a tooling problem, it is a decision problem.')).toBe(true);
    expect(detect('CONTRASTIVE', 'Build for legibility rather than perfection.')).toBe(true);
  });

  it('REDEFINITION catches a copular assertion with no negation at all', () => {
    // The move CAN be made without contrast, so a detector requiring negation would miss these.
    expect(detect('REDEFINITION', 'Pricing is an operating system, not a price tag.')).toBe(true);
    expect(detect('REDEFINITION', 'Trust is a latency problem.')).toBe(true);
  });

  it('COMBINED requires compression AND a form, so it is the strictest', () => {
    expect(detect('COMBINED', 'Pricing is an operating system, not a price tag.')).toBe(true);
    expect(detect('COMBINED', 'We shipped it on Tuesday.')).toBe(false);
  });

  it('detectAll reports every detector, so one pass profiles them all', () => {
    const all = detectAll('Trust is a latency problem.');
    expect(Object.keys(all).sort()).toEqual([...APHORISM_DETECTORS].sort());
  });
});

describe('scoring against a human key', () => {
  const cases: { passage: string; label: HumanLabel }[] = [
    { passage: 'Pricing is an operating system, not a price tag.', label: 'YES' },
    { passage: 'Trust is a latency problem.', label: 'YES' },
    { passage: 'We doubled BI spend over five years while decision latency increased.', label: 'NO' },
    { passage: 'I would advise you to focus on the problem space.', label: 'NO' },
    { passage: 'And this leads somewhere uncomfortable.', label: 'UNSURE' },
  ];

  it('EXCLUDES unsure rather than counting it as a no', () => {
    // Folding abstention into the negative class converts "could not tell" into "did not happen",
    // the same false-negative manufacture that made a truncated observation evidence against a rule.
    const p = profileDetector('COMBINED', cases);
    expect(p.decided).toBe(4);
    expect(p.agree + p.falsePass + p.falseFail).toBe(4);
  });

  it('separates the permissive direction from the conservative one', () => {
    // 17 false passes and zero false fails is a different instrument from the reverse, and a single
    // agreement number cannot tell them apart.
    const p = profileDetector('BREVITY', cases);
    expect(p.falsePass + p.falseFail + p.agree).toBe(p.decided);
    expect(p).toHaveProperty('recall');
    expect(p).toHaveProperty('precision');
  });

  it('profiles every candidate from one key', () => {
    expect(profileAll(cases)).toHaveLength(APHORISM_DETECTORS.length);
  });

  it('a key with no decided cases yields zeroes rather than dividing by zero', () => {
    const p = profileDetector('COMBINED', [{ passage: 'x', label: 'UNSURE' }]);
    expect(p.agreement).toBe(0);
    expect(p.recall).toBe(0);
    expect(p.precision).toBe(0);
  });
});
