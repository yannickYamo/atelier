// EVERY FREQUENCY THE PERSONA READ IS SERVED, EACH WORDED AS WHAT IT IS (renderers/agent-skill/render.ts,
// core/compiler/persona.ts). A point of some pieces was dropped from the skill on the claim that the moves section
// carried it; that section is built from the standard's rated requirements and never read the persona, so a quarter
// of what was read of the author (their conditional moves) reached no writer. Now: what holds in most or all pieces
// is served under "How I sound"; what the author does in some pieces, or rarely, is served as a repertoire index,
// one descriptive line each, with no instruction and no quote. The build's stage says how many of each were read.
import { describe, it, expect } from 'vitest';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import type { Voice } from '../core/compiler/voice.js';
import { describePersona, describeRepertoire, describeCounts, countByFrequency, standingPoints, conditionalPoints, type Persona } from '../core/compiler/persona.js';
import { posterior } from '../core/stats/habit.js';
import { aRequirement } from './fixtures.js';

const persona: Persona = { dropped: 0, points: [
  { aspect: 'Impersonal point of view', description: 'The author never says I or you; findings are stated as facts about the artifact.', frequency: 'ALWAYS', quote: 'Use `>=` so the state is correct' },
  { aspect: 'Concession before critique', description: 'Grants what is defensible before pressing the point.', frequency: 'OFTEN', quote: 'which is safe but' },
  { aspect: 'Adversarial framing on risky surfaces', description: 'Where input is untrusted, reasons from the caller who abuses it.', frequency: 'SOMETIMES', quote: 'A caller can refund more than' },
  { aspect: 'Quiet naming judgements', description: 'Calls a choice awkward in one flat adjective, then proposes a clearer name.', frequency: 'SOMETIMES', quote: 'is awkward: rename it' },
  { aspect: 'Side benefits in passing', description: 'Tacks a secondary payoff on with "which also".', frequency: 'RARELY', quote: 'which also removes the retry' },
] };
const rules = [aRequirement({ requirementId: 'p1', statement: 'Open with a Summary section.', materiality: 'REQUIRED' })];
const stdOf = (workType: string): StandardVersion => ({ standardVersionHash: 's', evidenceId: 'e', workType, requirements: rules, authorityState: 'RATIFIED', mintedAt: '2026-10-05T00:00:00Z' } as unknown as StandardVersion);
const voice: Voice = { passages: [], lengthWords: null, corpusPieces: 12, persona };
const render = (workType = 'code reviews'): string => renderAgentSkill(stdOf(workType), compileArchitecture(stdOf(workType)), 'x', 'd', null, [], voice).files['SKILL.md'];

describe('the persona, split by what holds and what is conditional', () => {
  it('with no measured rate, counts and splits by the reading\'s word; with one, by the rate alone', () => {
    expect(countByFrequency(persona)).toEqual({ ALWAYS: 1, OFTEN: 1, SOMETIMES: 2, RARELY: 1 });
    expect(standingPoints(persona).map((p) => p.frequency)).toEqual(['ALWAYS', 'OFTEN']);
    expect(conditionalPoints(persona).map((p) => p.frequency)).toEqual(['SOMETIMES', 'SOMETIMES', 'RARELY']);
    // the rate decides against the word: an "always" seen in 2 of 12 is conditional; a "rarely" seen in 11 of 12 stands; a situational habit is never served as how I sound
    const rated: Persona = { dropped: 0, points: [
      { ...persona.points[0], rate: posterior(2, 12), kind: 'occasional' }, { ...persona.points[4], rate: posterior(11, 12), kind: 'standing' }, { ...persona.points[2], rate: posterior(10, 12), kind: 'situational' }] };
    expect(standingPoints(rated).map((p) => p.aspect)).toEqual(['Side benefits in passing']);
    expect(conditionalPoints(rated).map((p) => p.aspect)).toEqual(['Impersonal point of view', 'Adversarial framing on risky surfaces']);
    expect(describePersona({ ...rated, points: standingPoints(rated) })).toMatch(/^- \(in 11 of 12 pieces \[0\.\d\d, 0\.\d\d\]\) Tacks a secondary payoff/);
    expect(describeRepertoire(conditionalPoints(rated))).toMatch(/^- \(in 2 of 12 pieces \[0\.\d\d, 0\.\d\d\]\) Impersonal point of view: the author never says I or you/);
    expect(describeCounts(rated)).toBe('3 points (1 standing, 1 situational, 1 occasional)');
  });
  it('a standing point is described with its quote; a conditional one as a repertoire line, its aspect first, no quote, no imperative', () => {
    expect(describePersona({ ...persona, points: standingPoints(persona) })).toContain('- (always) The author never says I or you; findings are stated as facts about the artifact. e.g. "Use `>=` so the state is correct"');
    const index = describeRepertoire(conditionalPoints(persona));
    expect(index).toBe([
      '- (in some pieces) Adversarial framing on risky surfaces: where input is untrusted, reasons from the caller who abuses it.',
      '- (in some pieces) Quiet naming judgements: calls a choice awkward in one flat adjective, then proposes a clearer name.',
      '- (rarely) Side benefits in passing: tacks a secondary payoff on with "which also".',
    ].join('\n'));
    expect(index).not.toMatch(/e\.g\./);
    expect(describeRepertoire([])).toBe('');
  });
});

describe('the compiled skill serves every frequency', () => {
  const md = render();
  it('what holds across the pieces is under "How I sound", and nothing conditional is', () => {
    const sound = md.slice(md.indexOf('How I sound (each point'), md.indexOf('Moves I make in some pieces'));
    expect(sound).toContain('(always) The author never says I or you');
    expect(sound).toContain('(often) Grants what is defensible');
    expect(sound).not.toContain('Adversarial framing'); expect(sound).not.toContain('(sometimes)'); expect(sound).not.toContain('(rarely)');
  });
  it('what the author does in some pieces is served as a repertoire: every point, descriptive, no instruction, no quote', () => {
    const start = md.indexOf('Moves I make in some pieces'); expect(start).toBeGreaterThan(0);
    const block = md.slice(start, md.indexOf('\n\n', md.indexOf('- (rarely)', start)));
    expect(block).toContain('- (in some pieces) Adversarial framing on risky surfaces: where input is untrusted');
    expect(block).toContain('- (in some pieces) Quiet naming judgements: calls a choice awkward');
    expect(block).toContain('- (rarely) Side benefits in passing: tacks a secondary payoff on with "which also".');
    expect(block).not.toContain('A caller can refund more than');
    // what the author does, never what the writer must: no imperative, no rate to use, no "use about"
    expect(block).not.toMatch(/\buse about\b|\bUse one\b|\bYou must\b|\bAlways\b|\bNever\b/);
    expect(block).toMatch(/none of these is a rule/);
  });
  it('the split holds for work that answers, and a persona with no conditional point serves no repertoire', () => {
    expect(render('answers')).toContain('- (in some pieces) Adversarial framing');
    const only = { ...voice, persona: { dropped: 0, points: standingPoints(persona) } };
    const md2 = renderAgentSkill(stdOf('w'), compileArchitecture(stdOf('w')), 'x', 'd', null, [], only).files['SKILL.md'];
    expect(md2).not.toContain('Moves I make in some pieces');
    expect(md2).toContain('(often) Grants what is defensible');
  });
});
