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
    expect(applyRepair(text, [target], [{ id: 1, text: 'Coupling is the fix, which suasion never was:' }], reverted)).toBe(text);
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
    expect(md).toMatch(/Never take my topics, facts,\s+names, figures, sentences, coined terms or stories/);
    expect(md).toContain(`> ${v.passages[0].split('\n')[0]}`);
    // a range when the pieces vary, one number when they do not ("about 200 to 200" read as a defect)
    expect(md).toMatch(/run about \d+( to \d+)? words/);
    expect(md).not.toMatch(/run about (\d+) to \1 words/);
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

describe('round 5 design: describe the voice, guard the edges, never displace', () => {
  it('register is counted as contractions against forms left whole, not as pronouns', () => {
    const memo = 'I do not think it is ready. You are right that we have not tested it. I am not sure.';
    const talk = "I don't think it's ready. You're right that we haven't tested it. I'm not sure.";
    expect(findPattern(memo, 'FULL_FORM').length).toBeGreaterThanOrEqual(5);
    expect(findPattern(memo, 'CONTRACTION')).toEqual([]);
    expect(findPattern(talk, 'CONTRACTION').length).toBeGreaterThanOrEqual(5);
    expect(findPattern(talk, 'FULL_FORM')).toEqual([]);
    expect(findPattern(memo, 'FIRST_PERSON').length).toBe(findPattern(talk, 'FIRST_PERSON').length);   // same pronouns, different register
  });
  it('the contrast move is one family, whatever its spelling, and a repair that swaps spellings has displaced it', async () => {
    const { displacedFamilies } = await import('../core/observers/style.js');
    const before = "The fix is not moral suasion, it's coupling. The problem is not speed, it's review.";
    const after = 'The fix is coupling rather than moral suasion. The problem has little to do with speed; what matters is review.';
    expect(findPattern(after, 'RATHER_THAN')).toHaveLength(1);
    expect(findPattern(after, 'REFRAME').length).toBeGreaterThanOrEqual(1);
    expect(displacedFamilies(before, after)[0]).toMatch(/^contrast: NOT_X_ITS_Y down/);
    expect(displacedFamilies(before, 'The fix is coupling. The problem is review.')).toEqual([]);
    expect(findPattern('Hero absorption is the first one. Alert laundering is the next one. Pager fatalism is the one that hides best.', 'ORDINAL_CATALOGUE')).toHaveLength(3);
  });
  it('the repair loop refuses a pass that displaces a banned move, and keeps the draft', async () => {
    const { refineToStandard } = await import('../core/loop/run-repair.js');
    const filler = 'We shipped the change on a Tuesday and watched the dashboards through the afternoon. '.repeat(30);
    const draft = `${filler}The fix is not moral suasion, it's coupling.`;
    const std = { standardVersionHash: 's', requirements: [aRequirement({ requirementId: 'c2', statement: 'No not X, it\'s Y.', kind: 'BOUNDARY', materiality: 'REQUIRED',
      measurement: { observer: 'PATTERN_RATE', params: { pattern: ['NOT_X_ITS_Y'], maxPer1000: 0 } } })] } as unknown as StandardVersion;
    const client = { complete: async () => ({ json: { replacements: [{ id: 1, text: 'The fix is coupling rather than moral suasion.' }] }, cost: { basis: 'API_METERED', billingUsd: 0 } }) } as never;
    const r = await refineToStandard(client, { spentUsd: 0, capUsd: 1 }, 'x', std, draft, 2, { guardClaims: false });
    expect(r.output).toBe(draft);
    expect(r.repair?.why).toMatch(/every rewrite was refused \(the move, recast as its sibling \(contrast/);
  });
  it('an invented story is cut by default, not left as a slot, and what was cut is recorded', async () => {
    const { refineToStandard, checkDraft: check } = await import('../core/loop/run-repair.js');
    const std = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
    const draft = 'Review matters. Two years ago I shipped a migration that broke billing for a week. Tests would have caught it.';
    expect(check('x', std, draft).checked.find((c) => c.requirementId === 'UNSOURCED')?.result.spans[0].why).toMatch(/rewrite the span without it/);
    expect(check('x', std, draft, { placeholders: true }).checked.find((c) => c.requirementId === 'UNSOURCED')?.result.spans[0].why).toMatch(/placeholder/);
    const client = { complete: async () => ({ json: { replacements: [{ id: 1, text: 'Migrations are where this bites.' }] }, cost: { basis: 'API_METERED', billingUsd: 0 } }) } as never;
    const r = await refineToStandard(client, { spentUsd: 0, capUsd: 1 }, 'x', std, draft, 2, {});
    expect(r.output).not.toMatch(/\[your story/);
    expect(r.repair?.storiesCut?.[0]).toMatch(/Two years ago I shipped/);
  });
  it('for new writing, a reading rule is required only when the author nearly always does it', async () => {
    const { suggest } = await import('../core/ratification/suggest.js');
    const rule = aRequirement({ requirementId: 'p1', statement: 'I state the case against my own position.' });
    const meta = (present: number, applicable: number) => ({ framings: ['a', 'b'], alsoPhrasedAs: [], heldOut: { present, applicable }, needs: null });
    expect(suggest(rule, meta(3, 5), 'GENERATE').materiality).toBe('PREFERRED');
    expect(suggest(rule, meta(4, 5), 'GENERATE').materiality).toBe('REQUIRED');
    expect(suggest(rule, meta(2, 2), 'GENERATE').materiality).toBe('PREFERRED');   // too few pieces to say "nearly always"
  });
  it('a move the author sometimes makes is compiled with its rate and a per-piece cap, not as an instruction', () => {
    const rules = [
      aRequirement({ requirementId: 'p1', statement: 'I state the case against my own position.', materiality: 'PREFERRED', observedRate: { present: 2, applicable: 5 } }),
      aRequirement({ requirementId: 'p2', statement: 'I name what would change my mind.', materiality: 'PREFERRED', observedRate: { present: 3, applicable: 5 } }),
      aRequirement({ requirementId: 'p3', statement: 'I tier advice by blast radius.', materiality: 'PREFERRED', observedRate: { present: 1, applicable: 4 } }),
    ];
    const std = { standardVersionHash: 's', evidenceId: 'e', workType: 'writing', requirements: rules, authorityState: 'RATIFIED', mintedAt: '2026-09-27T00:00:00Z' } as unknown as StandardVersion;
    const md = renderAgentSkill(std, compileArchitecture(std), 'x', 'd').files['SKILL.md'];
    expect(md).toContain('## Moves I sometimes make');
    expect(md).toContain('I state the case against my own position. (in 2 of 5 of my pieces where it could apply)');
    expect(md).toMatch(/Use about 1 of them in one piece/);   // 0.4 + 0.6 + 0.25 moves per piece, on the author's own rates
  });
  it('the persona keeps only points proven by a verbatim quote, with how often', async () => {
    const { groundPersona, describePersona } = await import('../core/compiler/persona.js');
    const corpus = ["I'll be honest: I don't know yet. My 2c is that you should start small."];
    const p = groundPersona([
      { aspect: 'hedging', description: 'Admits uncertainty plainly.', frequency: 'OFTEN', quote: "I don't know yet" },
      { aspect: 'invented', description: 'Quotes Shakespeare.', frequency: 'ALWAYS', quote: 'To be or not to be' },
      { aspect: 'bad', description: 'No frequency.', frequency: 'NEVER' as never, quote: 'start small' },
    ], corpus);
    expect(p.points.map((x) => x.aspect)).toEqual(['hedging']);
    expect(p.dropped).toBe(2);
    expect(describePersona(p)).toBe('- (often) Admits uncertainty plainly. e.g. "I don\'t know yet"');
  });
  it('whole pieces are chosen to span the author\'s modes, within a word budget', async () => {
    const { selectVoicePieces } = await import('../core/compiler/voice.js');
    const essay = (i: number): string => Array.from({ length: 8 }, () => `I think this matters, and I don't say that lightly. Piece ${i} makes one long argument in plain paragraphs that run on for a while.`).join('\n\n');
    const list = (i: number): string => `# List ${i}\n\n${Array.from({ length: 20 }, (_, k) => `- **Item ${k}.** A short point.`).join('\n')}`;
    const chosen = selectVoicePieces([essay(1), essay(2), essay(3), list(1), list(2)], 5000);
    expect(chosen.some((t) => t.startsWith('# List'))).toBe(true);
    expect(chosen.some((t) => !t.startsWith('# List'))).toBe(true);
    expect(selectVoicePieces([essay(1), essay(2)], 5000)).toEqual([]);
  });
  it('the persona and whole pieces are served, and the pieces are reference files that never ask to be reused', () => {
    const r = aRequirement({ requirementId: 'p1', statement: 'I split the answer by situation.', materiality: 'REQUIRED' });
    const std = { standardVersionHash: 's', evidenceId: 'e', workType: 'writing', requirements: [r], authorityState: 'RATIFIED', mintedAt: '2026-09-27T00:00:00Z' } as unknown as StandardVersion;
    const voice = { passages: [], lengthWords: [2000, 3000] as const, pieces: ['A whole piece.'],
      persona: { points: [{ aspect: 'a', description: 'Talks to the reader directly.', frequency: 'OFTEN' as const, quote: 'you' }], dropped: 0 } };
    const pkg = renderAgentSkill(std, compileArchitecture(std), 'x', 'd', null, [], voice);
    expect(pkg.files['SKILL.md']).toContain('- (often) Talks to the reader directly.');
    expect(pkg.files['SKILL.md']).toContain('`examples/voice-1.md` is a whole piece');
    expect(pkg.files['examples/voice-1.md']).toMatch(/never reuse its topic, facts, names, figures, sentences or coined terms/);
  });
});

describe('the voice layer: register, and bands that choose rather than steer', () => {
  const author = (i: number): { id: string; text: string } => ({ id: `a${i}.md`, text: Array.from({ length: 14 }, (_, k) =>
    `I don't think review ${k + i} is optional. It's where we catch what we'd otherwise ship, and you'll thank yourself later. We've seen it pay off, haven't we? That's the point.`).join('\n\n') });
  const model = (i: number): string => Array.from({ length: 14 }, (_, k) =>
    `It is important to note that review ${k + i} is not optional. We do not ship without it, and you will not regret it. It is the process that we have.`).join('\n\n');
  const rules = deriveContrastRules([0, 1, 2, 3].map(author), [4, 5].map(author), [model(0), model(1), model(2)], 'MACHINE_DISCOVERED');
  it('an author who contracts gets a cap on forms left whole', () => {
    const r = rules.find((x) => (x.requirement.measurement?.params.pattern as string[] | undefined)?.[0] === 'FULL_FORM');
    expect(r?.requirement.statement).toMatch(/^Contract as I do/);
    expect(r?.conformance.weak).toBeUndefined();
  });
  it('first-person and signature bands are weak: checked and used to choose, never instructed', () => {
    const fp = rules.find((x) => (x.requirement.measurement?.params.pattern as string[] | undefined)?.[0] === 'FIRST_PERSON');
    expect(fp?.conformance.weak).toBe(true);
  });
});

describe('the standard wins over the persona', () => {
  it('a persona point that describes a move a REQUIRED boundary forbids is dropped', async () => {
    const { reconcilePersona } = await import('../core/compiler/persona.js');
    const p = { points: [
      { aspect: 'a', description: 'Compresses the argument into a "not X, it\'s Y" line.', frequency: 'ALWAYS' as const, quote: "It's not speed, it's review." },
      { aspect: 'b', description: 'Talks to the reader directly.', frequency: 'OFTEN' as const, quote: 'you should' },
    ], dropped: 0 };
    const r = reconcilePersona(p, (t) => findPattern(t, 'NOT_X_ITS_Y').length > 0);
    expect(r.points.map((x) => x.aspect)).toEqual(['b']);
    expect(r.conflicting).toBe(1);
  });
});

describe('a rejected habit does not come back through the persona', () => {
  // `build` composes exactly this: reconcilePersona(derivePersona(...), standardForbids(v)).
  const persona = { points: [
    { aspect: 'q', description: 'Turns to the reader with a question.', frequency: 'OFTEN' as const, quote: 'So why does this keep happening?' },
    { aspect: 'd', description: 'Uses rhetorical questions to open a section.', frequency: 'SOMETIMES' as const, quote: 'It starts in March.' },
    { aspect: 'r', description: 'Talks to the reader directly.', frequency: 'OFTEN' as const, quote: 'you should' },
  ], dropped: 0 };
  const stdWith = (authority: 'EXPERT_REJECTED' | 'EXPERT_RATIFIED', kind: 'GENERATIVE' | 'BOUNDARY'): StandardVersion => ({
    standardVersionHash: 'h', evidenceId: null, workType: 'w', authorityState: 'RATIFIED', mintedAt: 't', supersedes: null, reason: null,
    requirements: [aRequirement({ requirementId: 'rq', statement: 'Use rhetorical questions.', kind, authority, materiality: 'REQUIRED',
      measurement: { observer: 'PATTERN_RATE', params: { pattern: ['RHETORICAL_QUESTION'], min: 1 } } })],
  });
  it('a REJECTED "use rhetorical questions" drops the point that exhibits one and the point that describes one', async () => {
    const { reconcilePersona, standardForbids } = await import('../core/compiler/persona.js');
    const r = reconcilePersona(persona, standardForbids(stdWith('EXPERT_REJECTED', 'GENERATIVE')));
    expect(r.points.map((x) => x.aspect)).toEqual(['r']);
    expect(r.conflicting).toBe(2);
  });
  it('POLARITY — the same rule KEPT leaves the persona alone', async () => {
    const { reconcilePersona, standardForbids } = await import('../core/compiler/persona.js');
    expect(reconcilePersona(persona, standardForbids(stdWith('EXPERT_RATIFIED', 'GENERATIVE'))).points).toHaveLength(3);
  });
  it('a rejected BOUNDARY drops only the point that restates it, not the quote that uses the move', async () => {
    const { reconcilePersona, standardForbids } = await import('../core/compiler/persona.js');
    expect(reconcilePersona(persona, standardForbids(stdWith('EXPERT_REJECTED', 'BOUNDARY'))).points.map((x) => x.aspect)).toEqual(['q', 'r']);
  });
  it('a rejected LEXICON rule drops a point naming its words', async () => {
    const { reconcilePersona, standardForbids } = await import('../core/compiler/persona.js');
    const v: StandardVersion = { ...stdWith('EXPERT_REJECTED', 'BOUNDARY'),
      requirements: [aRequirement({ requirementId: 'lx', authority: 'EXPERT_REJECTED', kind: 'BOUNDARY', measurement: { observer: 'LEXICON', params: { terms: ['leverage'] } } })] };
    const p = { points: [{ aspect: 'l', description: 'Avoids "leverage".', frequency: 'ALWAYS' as const, quote: 'we used it' }, persona.points[2]], dropped: 0 };
    expect(reconcilePersona(p, standardForbids(v)).points.map((x) => x.aspect)).toEqual(['r']);
  });
});
