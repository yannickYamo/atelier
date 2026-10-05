// tests/atelier-move-carriers.test.ts — A MOVE IS CARRIED NO MORE WIDELY THAN THE CORPUS SUPPORTS.
//
// A skill built from 24 answers, 3 of which ask before delivering, served "ask first" as a trait and as two moves,
// and lost to a hand-written skill by withholding what was asked. Each guard is tried both ways: what must be
// stated and what must only be shown, for a skill that answers; and writing, where nothing measured a failure, is
// left as it was.
import { describe, it, expect } from 'vitest';
import { lowerBound, moveEvidence, readHoldsBack, ownerWrote, HOLDS_BACK } from '../core/compiler/applicability.js';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import type { Voice } from '../core/compiler/voice.js';
import { unmetered, type InferenceClient } from '../core/inference/client.js';
import { aRequirement } from './fixtures.js';

describe('the bound a move must clear', () => {
  it('a perfect record of n pieces has a one-sided 95% lower bound of 0.05^(1/n): three pieces is the fewest that clears 0.3', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => Math.round(lowerBound(n, n) * 100) / 100)).toEqual([0.05, 0.22, 0.37, 0.47, 0.55, 0.61]);
    expect(lowerBound(2, 3)).toBeLessThan(0.3);
    expect(lowerBound(0, 5)).toBe(0);
  });
});

describe('how a move of a skill that answers is carried', () => {
  const answers = { answers: true };
  it('stated as something I do only when its condition holds across the corpus', () => {
    expect(moveEvidence({ present: 23, applicable: 23 }, 24, { ...answers, general: true })).toMatchObject({ carrier: 'general' });
    // well evidenced where it applies, and applying in a small part of the corpus: only with its condition
    expect(moveEvidence({ present: 6, applicable: 6 }, 24, { ...answers, general: false })).toMatchObject({ carrier: 'conditional', presentBound: 0.61 });
    expect(moveEvidence({ present: 6, applicable: 6 }, 24, { ...answers, general: true }).carrier).toBe('conditional');
  });
  it('shown and never stated when one or two pieces show it, or it was seen in too few of the pieces where it could apply', () => {
    expect(moveEvidence({ present: 1, applicable: 1 }, 24, { ...answers, general: true })).toMatchObject({ carrier: 'exemplar' });
    expect(moveEvidence({ present: 2, applicable: 2 }, 24, { ...answers, general: true }).carrier).toBe('exemplar');
    expect(moveEvidence({ present: 1, applicable: 5 }, 24, { ...answers, general: true }).carrier).toBe('exemplar');
    expect(moveEvidence({ present: 3, applicable: 3 }, 24, { ...answers, general: false }).carrier).toBe('conditional');
    // counted, and applicable in none of the pieces checked
    expect(moveEvidence(undefined, 24, { ...answers, general: true })).toMatchObject({ carrier: 'exemplar', why: expect.stringContaining('none of the 24') as string });
  });
  it('a move that holds back what was asked is an example until the owner rules on it', () => {
    expect(moveEvidence({ present: 3, applicable: 3 }, 24, { ...answers, general: false, holdsBack: true })).toMatchObject({ carrier: 'exemplar', why: expect.stringContaining('yours to rule on') as string });
    expect(moveEvidence({ present: 3, applicable: 3 }, 24, { ...answers, general: false, holdsBack: true, ownerRuled: true }).carrier).toBe('conditional');
    expect(ownerWrote({ authority: 'EXPERT_AUTHORED' })).toBe(true);
    expect(ownerWrote({ authority: 'EXPERT_RATIFIED', provenance: 'MACHINE_DISCOVERED' })).toBe(false);
  });
  it('a build that counted nothing states a move with its condition, as before; writing keeps its rate', () => {
    expect(moveEvidence(undefined, null, { ...answers, general: false }).carrier).toBe('conditional');
    expect(moveEvidence({ present: 1, applicable: 4 }, 24, { general: true })).toMatchObject({ carrier: 'general', why: 'stated with its rate: 1 of 4 piece(s) where it could apply' });
  });
  it('the word pattern is the floor for "holds back"', () => {
    for (const s of ['I refuse or ask one specific question first, rather than complying and adding a warning.', 'I won\'t hand over a destructive command.', 'I ask a clarifying question before answering.']) expect(HOLDS_BACK.test(s), s).toBe(true);
    for (const s of ['I lead with the command, then the reason.', 'I name the risk and give the safe path first, then the command.']) expect(HOLDS_BACK.test(s), s).toBe(false);
  });
  it('a reader names the moves that hold back; an id that does not exist is dropped, and a failure is null', async () => {
    const client = (json: unknown): InferenceClient => ({ complete: () => Promise.resolve({ json, termination: { kind: 'COMPLETE' }, cost: unmetered(), costUsd: 0 } as never) });
    const moves = [{ id: 'p1', statement: 'I confirm the branch before any destructive command.' }, { id: 'p2', statement: 'I lead with the command.' }];
    const b = (): { spentUsd: number; capUsd: number; maxCalls: number } => ({ spentUsd: 0, capUsd: 1, maxCalls: 3 });
    expect(await readHoldsBack(client({ ids: ['p1', 'p9', 'p1'] }), b(), moves)).toEqual(['p1']);
    expect(await readHoldsBack(client({ nope: 1 }), b(), moves)).toBeNull();
    expect(await readHoldsBack({ complete: () => Promise.reject(new Error('x')) }, b(), moves)).toBeNull();
  });
});

describe('the compiled skill of a skill that answers', () => {
  const rules = [
    aRequirement({ requirementId: 'p2', statement: 'I give the command first, then one line on why.', materiality: 'PREFERRED', appliesWhen: 'the request asks for a command', observedRate: { present: 6, applicable: 6 }, evidence: 'git reset --soft HEAD~1' }),
    aRequirement({ requirementId: 'p3', statement: 'I lead with the one-sentence mechanism.', materiality: 'PREFERRED', observedRate: { present: 1, applicable: 1 }, evidence: 'The cache never expires, so the old value stays.' }),
    aRequirement({ requirementId: 'p5', statement: 'I refuse or ask one specific question first, rather than complying and adding a warning.', materiality: 'PREFERRED', appliesWhen: 'the action is destructive', observedRate: { present: 3, applicable: 3 }, evidence: 'Before you force-push: is anyone else on this branch? If not, use git push --force-with-lease.' }),
    aRequirement({ requirementId: 'p9', statement: 'I close with the next check.', materiality: 'PREFERRED', evidence: '' }),
  ];
  const std = { standardVersionHash: 's', evidenceId: 'e', workType: 'answers', requirements: rules, authorityState: 'RATIFIED', mintedAt: '2026-10-05T00:00:00Z' } as unknown as StandardVersion;
  const voice: Voice = { passages: [], lengthWords: null, corpusPieces: 24, holdsBack: ['p5'],
    persona: { dropped: 0, points: [
      { aspect: 'directness', description: 'Gives the answer in the first line.', frequency: 'ALWAYS', quote: 'git reset' },
      { aspect: 'risk', description: 'Asks one question first, and nothing else.', frequency: 'SOMETIMES', quote: 'is anyone else on this branch?' }] } };
  const files = renderAgentSkill(std, compileArchitecture(std), 'x', 'd', null, [], voice).files;
  const md = files['SKILL.md'];
  it('states the well-evidenced move with its condition and both branches', () => {
    expect(md).toContain('## Moves I sometimes make');
    expect(md).toMatch(/- When the request asks for a command, I give the command first, then one line on why\. When that does not hold, do not\. \(in 6 of 6 of my pieces where it could apply\)/);
    expect(md).toContain('never in place of giving what was asked');
  });
  it('never states a move read off one piece, one that holds back, or one seen in none of the pieces checked', () => {
    for (const s of ['I lead with the one-sentence mechanism', 'I refuse or ask one specific question first', 'I close with the next check']) expect(md, s).not.toContain(s);
    expect(Object.values(files).join('\n')).not.toContain('I refuse or ask one specific question first');
  });
  it('shows such a move as the author\'s own words in its one situation, and indexes only files that show something', () => {
    expect(files['examples/p5.md']).toMatch(/^\[p5\] One instance from my own work, from when the action is destructive\. Not a habit and not a rule/);
    expect(files['examples/p5.md']).toContain('> Before you force-push: is anyone else on this branch? If not, use git push --force-with-lease.');
    expect(md).toMatch(/`examples\/p5\.md` — one instance, not a habit, from when the action is destructive/);
    expect(md).not.toContain('examples/p9.md');
    expect(files['examples/p9.md']).toContain('Nothing is to be done from this.');
  });
  it('serves every example file of a new package, so a move is never served without its example', () => {
    expect((JSON.parse(files['context-map.json']) as { serveAll?: boolean }).serveAll).toBe(true);
  });
  it('a persona point of "sometimes" is not a trait; the built-in guidance gives what was asked first', () => {
    expect(md).toContain('Gives the answer in the first line.');
    expect(md).not.toContain('and nothing else');
    expect(md).toMatch(/Give what was asked first\./);
  });
  it('the owner\'s ruling states the move that holds back, with their condition', () => {
    const ruled = { ...std, requirements: rules.map((r) => (r.requirementId === 'p5' ? { ...r, authority: 'EXPERT_AUTHORED' as const } : r)) } as unknown as StandardVersion;
    expect(renderAgentSkill(ruled, compileArchitecture(ruled), 'x', 'd', null, [], voice).files['SKILL.md']).toMatch(/When the action is destructive, I refuse or ask one specific question first/);
  });
  it('for writing, a move keeps its rate and its per-piece cap', () => {
    const w = { ...std, workType: 'writing' } as unknown as StandardVersion;
    const m = renderAgentSkill(w, compileArchitecture(w), 'x', 'd', null, [], { ...voice, holdsBack: [] }).files['SKILL.md'];
    expect(m).toContain('I lead with the one-sentence mechanism. (in 1 of 1 of my pieces where it could apply)');
  });
});
