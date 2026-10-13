// tests/atelier-fix-router.test.ts — WHERE A COMPLAINT GOES: THIS OUTPUT, UNLESS THE PERSON SAYS OTHERWISE.
//
// One complaint about one piece is not a rule. By default only the piece is written again; the skill changes when
// the person says it should for every run, and a complaint that the evaluation was wrong changes neither.
import { describe, it, expect } from 'vitest';
import { routeOf } from '../cli/commands/fix.js';
import { correctionFor } from '../cli/commands/invoke.js';
import { statedLength } from '../core/intake/length.js';

describe('the four ways, and the default', () => {
  const ran = { asked: 'Review this change.' };
  it('a complaint about a run made with `atelier run` is about that output', () => {
    expect(routeOf(['fix', 'it missed the migration cost'], ran)).toBe('THIS_OUTPUT');
  });
  it('the skill changes only when the person says every run should do this, or answers a question an earlier fix asked', () => {
    for (const f of ['--always', '--add', '--pick', '--skip', '--invocation']) expect(routeOf(['fix', 'x', f, 'v'], ran), f).toBe('EVERY_RUN');
    expect(routeOf(['fix', 'x', '--add=required'], ran)).toBe('EVERY_RUN');
  });
  it('a complaint about the evaluation changes neither the piece nor the skill', () => {
    expect(routeOf(['fix', 'it blocked a clause I always use', '--evaluation'], ran)).toBe('EVALUATION');
    expect(routeOf(['fix', 'x', '--evaluation', '--always'], ran)).toBe('EVALUATION');
  });
  it('a run that cannot be written again from here (made in a host, or before runs kept what was asked) goes to the skill', () => {
    expect(routeOf(['fix', 'x'], {})).toBe('EVERY_RUN');
    expect(routeOf(['fix', 'x'], null)).toBe('EVERY_RUN');
  });
});

describe('what the writer is told when a piece is written again', () => {
  it('the person\'s words, beside the task and no part of it', () => {
    const note = correctionFor('it missed the "migration" cost');
    expect(note).toContain('The person who asked for it said, in their words: "it missed the \'migration\' cost".');
    expect(note).toContain('change nothing else about what was asked');
    expect(correctionFor(undefined)).toBe('');
    expect(correctionFor('   ')).toBe('');
  });
  it('the complaint goes to the writer through its own option, never joined to what was asked', async () => {
    // What was asked is read for a length, a format and material; a complaint is none of those. The run takes it as
    // --correcting, and writes what was asked, unchanged, to the record the next fix reads.
    const { VALUED_OPTIONS } = await import('../cli/runtime.js');
    expect(VALUED_OPTIONS).toContain('correcting');
    expect(statedLength('Review this change.')).toBeNull();
  });
});
