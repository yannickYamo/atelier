// tests/atelier-voice.test.ts — WHAT THE THIRD BLIND ROUND TAUGHT: SOUND LIKE THE AUTHOR, NOT JUST UNLIKE A MODEL.
//
// A skill that met every one of its rules was ranked least like the author of four versions. The skill
// served rules and statistics and no paragraph the author wrote; its rules capped the model's tells and
// left the author's own habits optional; nothing held the first person or the dialect; a repair left a
// stutter at its seam; and a compiled rule read "When , I close…". Each is pinned here.
import { describe, it, expect } from 'vitest';
import { findPattern, patternRate, isProseLine } from '../core/observers/style.js';
import { deriveContrastRules } from '../core/observers/contrast.js';
import { planRepair, applyRepair, seamRepeat } from '../core/loop/repair.js';
import { checkDraft } from '../core/loop/run-repair.js';
import { isGeneralScope, type StandardVersion } from '../core/state/canonical-state.js';
import { selectVoicePassages } from '../core/compiler/voice.js';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import { aRequirement } from './fixtures.js';

describe('P0: a repair leaves no seam', () => {
  it('a span that ends inside the next sentence grows to that sentence\'s end, so the rest is rewritten too', () => {
    const filler = 'Launch licences, spectrum and insurance are where the leverage sits in practice today. '.repeat(20);
    const text = `${filler}Operators shop for the laxest regulator. The fix is not moral suasion. It's coupling: make market access conditional on standards.`;
    const v = { standardVersionHash: 's', requirements: [aRequirement({ requirementId: 'c2', statement: 'Avoid not X, it\'s Y.', kind: 'BOUNDARY', materiality: 'REQUIRED',
      measurement: { observer: 'PATTERN_RATE', params: { pattern: ['NOT_X_ITS_Y'], maxPer1000: 0 } } })] } as unknown as StandardVersion;
    const t = planRepair(text, checkDraft('s', v, text, { guardClaims: false })).at(-1)!;
    expect(t.text).toBe('The fix is not moral suasion. It\'s coupling: make market access conditional on standards.');
  });
  it('a replacement that repeats the words at its join is refused, and the original kept', () => {
    // The real case: the span stopped at "It's", and the rewrite took the next word into itself.
    expect(seamRepeat('The race runs downward. ', 'The fix here is coupling rather than moral suasion:', ' coupling: make market access', 'The fix is not moral suasion. It\'s')).toBe('coupling');
    expect(seamRepeat('The race runs downward. ', 'The fix here is coupling rather than moral suasion: coupling', ' coupling: make market access')).toBe('coupling');
    expect(seamRepeat('Before. ', 'A clean sentence.', ' After it.')).toBeNull();
    expect(seamRepeat('Before. ', 'It ends with the', ' the start')).toBeNull();   // a short word alone is not a stutter
    const text = 'One. The fix is not suasion. It\'s coupling: make access conditional.';
    const target = { id: 1, start: 5, end: 33, text: text.slice(5, 33), reasons: ['x'], requirementIds: ['c2'], drops: ['the fix is not suasion. it\'s'], swaps: [], specifics: false, recase: false };
    const reverted: { id: number; lost: readonly string[] }[] = [];
    expect(text.slice(5, 33)).toBe('The fix is not suasion. It\'s');
    expect(applyRepair(text, [target], [{ id: 1, text: 'The fix here is coupling rather than suasion:' }], reverted)).toBe(text);
    expect(reverted[0].lost[0]).toMatch(/repeated "coupling"/);
  });
});

describe('P0: a rule never reads "When , …"', () => {
  it('a condition with no words in it is no condition', () => {
    for (const c of ['', ' ', ';', ' ; ', ', ;', 'GENERAL']) expect(isGeneralScope(c), JSON.stringify(c)).toBe(true);
    expect(isGeneralScope('when the piece gives advice')).toBe(false);
  });
  it('a statement with its own "when" joins the condition instead of following it', () => {
    const rules = [
      aRequirement({ requirementId: 'p14', statement: 'I close an argument with a short antithetical sentence.', appliesWhen: ';', materiality: 'REQUIRED' }),
      aRequirement({ requirementId: 'p1', statement: 'When I make a general claim, I split the answer by the reader\'s situation.', appliesWhen: 'the piece gives advice', materiality: 'REQUIRED' }),
    ];
    const v = { standardVersionHash: 's', evidenceId: 'e', workType: 'writing', requirements: rules, authorityState: 'RATIFIED', mintedAt: '2026-09-27T00:00:00Z' } as unknown as StandardVersion;
    const md = renderAgentSkill(v, compileArchitecture(v), 'x', 'd').files['SKILL.md'];
    expect(md).not.toMatch(/When ,|when ;/);
    expect(md).toContain('When the piece gives advice and I make a general claim, I split the answer');
  });
});

describe('P0: counting what the author does, not what their platform adds', () => {
  it('a caption, a link line or a bold label is not a one-sentence paragraph', () => {
    const t = 'A real sentence of prose stands here.\n\n![A chart](x.png)\n\nFigure 2: the loop\n\n**Key takeaway**\n\n[Read more](https://x.y)\n\nAnother short line, also real.';
    expect(findPattern(t, 'ONE_LINE_PARAGRAPH').map((s) => s.text)).toEqual(['A real sentence of prose stands here.', 'Another short line, also real.']);
    expect(isProseLine('Caption with no end')).toBe(false);
  });
  it('the dash aside is counted as a move, whatever the mark', () => {
    expect(findPattern('One — two. Three - four. Five – six. Pages 2 - 3.', 'DASH_ASIDE')).toHaveLength(3);
  });
  it('dialect and point of view are counted', () => {
    const t = 'I think my team organised the behaviour of the centre. We organized the behavior of the center. I\'d hold this loosely.';
    expect(findPattern(t, 'BRITISH_SPELLING').map((s) => s.text.toLowerCase())).toEqual(['organised', 'behaviour', 'centre']);
    expect(findPattern(t, 'AMERICAN_SPELLING').map((s) => s.text.toLowerCase())).toEqual(['organized', 'behavior', 'center']);
    expect(findPattern(t, 'FIRST_PERSON').map((s) => s.text)).toEqual(['I', 'my', 'I\'d']);
    // "program" and "license" are the same in both dialects' common use, so neither counts.
    expect(findPattern('The program needs a license.', 'AMERICAN_SPELLING')).toEqual([]);
  });
});

describe('P1: rules for the author\'s positive signature and voice, not only caps on the model', () => {
  // An American, first-person author with bold phrases and questions; a model with neither, in British spelling.
  const author = (i: number): { id: string; text: string } => ({ id: `a${i}.md`, text: Array.from({ length: 12 }, (_, k) =>
    `I think the **review ${k + i}** matters more than the code. Why would we skip it? My team organized the behavior of the loop around it, and I would do it again. `
    + 'We moved the center of gravity toward the reviewer, which I recommend to anyone who ships weekly and keeps a small team.').join('\n\n') });
  const model = (i: number): string => Array.from({ length: 12 }, (_, k) =>
    `The review process ${k + i} is organised around the behaviour of the centre. Teams should prioritise it, since the programme depends on the licence and the defence of quality over time.`).join('\n\n');
  const rules = deriveContrastRules([0, 1, 2, 3].map(author), [4, 5].map(author), [model(0), model(1), model(2)], 'MACHINE_DISCOVERED');
  const byPattern = (p: string) => rules.find((r) => (r.requirement.measurement?.params.pattern as string[] | undefined)?.[0] === p);
  it('the first person gets a band, and the rule separates a view (no source needed) from a story (source needed)', () => {
    const r = byPattern('FIRST_PERSON')!;
    expect(r.requirement.measurement?.params.minPer1000).toBeGreaterThan(0);
    expect(r.requirement.measurement?.params.maxPer1000).toBeGreaterThan(r.requirement.measurement?.params.minPer1000 as number);
    expect(r.requirement.statement).toMatch(/needs no source; a first-hand story or figure does/);
  });
  it('an American author gets a cap on British spellings', () => {
    const r = byPattern('BRITISH_SPELLING')!;
    expect(r.requirement.statement).toMatch(/Spell the American way/);
    expect(patternRate(model(0), 'BRITISH_SPELLING')).toBeGreaterThan(r.requirement.measurement?.params.maxPer1000 as number);
  });
  it('the author\'s own habits are two-sided bands, not floors left optional', () => {
    for (const p of ['BOLD_SPAN', 'RHETORICAL_QUESTION']) {
      const m = byPattern(p)?.requirement.measurement?.params;
      expect(m?.minPer1000, p).toBeGreaterThan(0);
      expect(m?.maxPer1000, p).toBeGreaterThan(m?.minPer1000 as number);
    }
  });
});

describe('P1: the skill carries passages the author wrote', () => {
  const topics = ['review', 'testing', 'hiring', 'pricing', 'onboarding'];
  const piece = (topic: string, i: number): string => [`# On ${topic}`, '- a list item that is not prose', ...Array.from({ length: 6 }, (_, k) =>
    `I have thought about ${topic} for a long time, and paragraph ${k} of piece ${i} says so plainly. My view is that ${topic} rewards patience, and I would rather be slow and right than quick and sorry about it later. `
    + `It is not glamorous. But ${topic} is where the work is, and I keep coming back to it.`), `[a link](https://example.com/${topic})`].join('\n\n');
  const pieces = topics.map(piece);
  const v = selectVoicePassages(pieces);
  it('chooses up to three prose passages, each from a different piece, without headings, lists or links', () => {
    expect(v.passages).toHaveLength(3);
    for (const p of v.passages) {
      expect(p).not.toMatch(/^#|^- |\]\(/m);
      expect(p.split(/\s+/).length).toBeGreaterThanOrEqual(120);
    }
    const from = v.passages.map((p) => topics.find((t) => p.includes(`about ${t}`)));
    expect(new Set(from).size).toBe(3);
    expect(v.lengthWords?.[0]).toBeGreaterThanOrEqual(100);
  });
  it('fewer than three pieces is too few to tell a typical passage from an odd one', () => {
    expect(selectVoicePassages(pieces.slice(0, 2)).passages).toEqual([]);
  });
  it('the compiled skill serves them inline, says what to take and what never to take, and keeps them for rebuilds', () => {
    const r = aRequirement({ requirementId: 'p1', statement: 'I split the answer by situation.', materiality: 'REQUIRED' });
    const std = { standardVersionHash: 's', evidenceId: 'e', workType: 'writing', requirements: [r], authorityState: 'RATIFIED', mintedAt: '2026-09-27T00:00:00Z' } as unknown as StandardVersion;
    const pkg = renderAgentSkill(std, compileArchitecture(std), 'x', 'd', null, [], v);
    const md = pkg.files['SKILL.md'];
    expect(md).toContain('## How I sound');
    expect(md).toMatch(/Never take their topic, facts, names, figures, sentences or turns of phrase/);
    expect(md).toContain(`> ${v.passages[0].split('\n')[0]}`);
    expect(md).toMatch(/run about \d+ to \d+ words/);
    expect(JSON.parse(pkg.assurance['voice.json'])).toEqual(JSON.parse(JSON.stringify(v)));
    expect(renderAgentSkill(std, compileArchitecture(std), 'x', 'd').files['SKILL.md']).not.toContain('How I sound');
  });
});

describe('the eval\'s own measures live in the product, not in a study script', () => {
  it('overlap counts lifted six-word runs and the longest shared run', async () => {
    const { overlapIndex } = await import('../core/observers/overlap.js');
    const o = overlapIndex(['We moved the speed of generation faster than we moved the speed of control, and paid for it.']);
    expect(o('Nothing here is shared with anything at all in that corpus.')).toEqual({ shared6: 0, longestShared: 0 });
    const lifted = o('Honestly, we moved the speed of generation faster than we moved the speed of review.');
    expect(lifted.longestShared).toBe(13);   // "we moved the speed of generation faster than we moved the speed of"
    expect(lifted.shared6).toBeGreaterThan(0);
  });
  it('blinding is a seeded permutation: the same seed gives the same letters', async () => {
    const { seededShuffle } = await import('../core/contract/analysis.js');
    const xs = ['RAW', 'CONTEXT', 'GUIDE', 'ATELIER'];
    expect(seededShuffle(xs, 3)).toEqual(seededShuffle(xs, 3));
    expect([...seededShuffle(xs, 3)].sort()).toEqual([...xs].sort());
  });
});
