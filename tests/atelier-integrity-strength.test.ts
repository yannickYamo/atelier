// tests/atelier-integrity-strength.test.ts — A REWRITE MAY NOT MAKE A CLAIM STRONGER BY ADDING A WORD.
//
// The meaning check guarded what a rewrite could LOSE (figures, negation, qualifiers, names, slots) and
// accepted every tightening that kept them: "reduces" → "eliminates", "we expect to ship" → "we ship",
// "the old link" → "any link". These are the moves tightening a sentence makes. Pinned here, with the
// inflations the check deliberately does not catch, so its claim stays exactly as wide as its code.
import { describe, it, expect } from 'vitest';
import { spanIntegrity } from '../core/loop/integrity.js';

const judge = (a: string, b: string): boolean => spanIntegrity(a, b, new Set(), false).ok;

describe('strength carried by a word the rewrite added, or an intention it dropped', () => {
  it.each([
    ['The design reduces the outage risk.', 'The design eliminates the outage risk.'],
    ['We expect to ship in March.', 'We ship in March.'],
    ['Latency is lower than on the old link.', 'Latency is lower than on any link.'],
    ['The checklist helps reviewers.', 'The checklist ensures reviewers catch it.'],
    ['We plan to migrate the billing service.', 'We migrate the billing service.'],
  ])('refused: "%s" → "%s"', (a, b) => { expect(judge(a, b)).toBe(false); });

  it('an honest tightening is still accepted', () => {
    expect(judge('It is the case that the team decided, after some discussion, to move on.', 'After some discussion, the team decided to move on.')).toBe(true);
  });

  it('a universal the original already carried may stay', () => {
    expect(judge('Every team we asked said the same thing, in all cases.', 'Every team we asked said the same, in all cases.')).toBe(true);
  });

  it('NOT CAUGHT, and said so: a cause spelled as a plain verb, and a dropped scope clause (the list is kept tight on purpose)', () => {
    expect(judge('Churn fell after the change.', 'The change cut churn.')).toBe(true);
    expect(judge('This holds for defense buyers who own their gateway.', 'This holds for buyers.')).toBe(true);
  });
});

// The inflations the audit found getting through: each keeps every figure, name, negation and qualifier
// the old check held, and each claims more than the author did.
describe('inflation by modality, stance, addition, causation, uniqueness and intensity', () => {
  it.each([
    // a modal dropped or strengthened
    ['The cache can reduce load on the database.', 'The cache reduces load on the database.'],
    ['This could slow the rollout.', 'This will slow the rollout.'],
    ['The change should lower costs.', 'The change lowers costs.'],
    // a stance frame dropped
    ['We think the migration is the bottleneck.', 'The migration is the bottleneck.'],
    ['I believe the second design is simpler.', 'The second design is simpler.'],
    ['In my experience, reviews catch this early.', 'Reviews catch this early.'],
    // a figure or a proper name the original never carried
    ['Latency fell after the change.', 'Latency fell by 40% after the change.'],
    ['The team shipped the fix quickly.', 'The team at Stripe shipped the fix quickly.'],
    // correlation turned into cause
    ['Churn is correlated with slow onboarding.', 'Slow onboarding caused churn.'],
    ['Higher usage was associated with the new pricing.', 'The new pricing drove higher usage.'],
    // one of several turned into the one
    ['It is one of the slower paths in the system.', 'It is the slowest path in the system.'],
    // an intensifier added
    ['Error rates fell after the rollout.', 'Error rates fell dramatically after the rollout.'],
    ['The new index improved query times.', 'The new index massively improved query times.'],
    ['Adoption rose in the second quarter.', 'Adoption rose significantly in the second quarter.'],
  ])('refused: "%s" → "%s"', (a, b) => { expect(judge(a, b)).toBe(false); });

  it.each([
    ['It is the case that the team decided, after some discussion, to move on.', 'After some discussion, the team decided to move on.'],
    ['You can see the pattern in the logs.', 'The pattern shows in the logs.'],
    ['The index helps reads.', 'The index will help reads.'],
    ['It failed because the queue filled up.', 'The full queue caused it to fail.'],
    ['Alice said the rollout went well.', 'The rollout went well, Alice said.'],
    ['I think the plan works, broadly speaking, for the team.', 'I think the plan broadly works for the team.'],
  ])('accepted: "%s" → "%s"', (a, b) => { expect(judge(a, b)).toBe(true); });
});
