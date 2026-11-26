// tests/atelier-host-asks-first.test.ts — IN CLAUDE CODE THE PERSON IS THERE, SO THE SKILL ASKS FIRST.
//
// The defect (25 Nov, three headless Claude Code sessions): with facts-only notes and "write a blog post", the host wrote
// straight away with the point and the goal guessed. It asked only when the person said they could answer.
// Expected values are written out by hand.
import { describe, it, expect } from 'vitest';
import { hostSteps } from '../renderers/agent-skill/render.js';

describe('before the host writes', () => {
  const s = hostSteps('blog', 'Blog posts for engineering leaders, to share what one team changed.').replace(/\s+/g, ' ');
  it('asks first by default: the person is present', () => {
    expect(s).toMatch(/The person is here with you, so ask before you write/);
  });
  it('writes without asking only where the request already says the point and the goal, or they say "just write"', () => {
    expect(s).toMatch(/unless the request and its notes already say what they are arguing/);
    expect(s).toMatch(/"just write"/);
  });
  it('one message: what it understood, the questions with suggestions, and "ok" takes the suggestions', () => {
    expect(s).toMatch(/one message/);
    expect(s).toMatch(/what you understood/);
    expect(s).toMatch(/"ok" takes the suggestions/);
  });
  it('keeps its limits: at most three, nothing suggested for the record, no choice among what was given', () => {
    expect(s).toMatch(/at most three/);
    expect(s).toMatch(/Never suggest what they will put on record/);
    expect(s).toMatch(/a choice among what was given/);
  });
});
