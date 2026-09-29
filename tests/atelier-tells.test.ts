// tests/atelier-tells.test.ts — MACHINE-WRITTEN SENTENCES: CAUGHT AS MOVES, LEARNED FROM DATA, HELD TO THE AUTHOR'S RATE.
//
// Five blind rounds found the same sentences in every model-written version, at three to seven times
// the rate of the human author ("the part people miss", "that last one deserves emphasis", "the single
// most", "let me be blunt", "that's the whole game", "a staffing problem wearing a monitoring costume").
// Each round the fix was one more hand-written string. This file pins the replacement: a small catalogue
// of the model's moves, held to each author's own rate; a lexicon learned from the skill's own drafts,
// statistically; and a repair that removes a move instead of re-spelling it.
import { describe, it, expect } from 'vitest';
import { findPattern } from '../core/observers/style.js';
import { findTells, TELL_FAMILIES } from '../core/observers/tells.js';
import { deriveTellLexicon } from '../core/observers/tell-lexicon.js';
import { deriveContrastRules } from '../core/observers/contrast.js';
import { checkDraft, refineToStandard } from '../core/loop/run-repair.js';
import { applyRepair, planRepair } from '../core/loop/repair.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import { aRequirement } from './fixtures.js';
import { replaceEmDashes, splitLongParagraphs, mechanicalFixes } from '../core/loop/mechanical-repair.js';
import { sentencesKept } from '../core/observers/overlap.js';

describe('the catalogue: the model\'s moves, not any author\'s', () => {
  const cases: [string, string][] = [
    ['INSIGHT_CLAIM', "Here's the connection people miss about review."],
    ['RETRO_EMPHASIS', 'That last one deserves emphasis, because it compounds.'],
    ['SUPERLATIVE', 'It is the single most important change.'],
    ['CANDOUR', 'Let me be blunt about the cost.'],
    ['TOTALISER', "That's the whole game."],
    ['MIND_READING', 'You know the one: the flaky test.'],
    ['COSTUME', 'It is a staffing problem wearing a monitoring costume.'],
    ['GOES_TO_DIE', 'Slack is where decisions go to die.'],
    ['STACCATO_NOT', 'Not a process. Not a tool. A habit.'],
  ];
  it('each family is found in a sentence that makes its move', () => {
    for (const [family, sentence] of cases) expect(findTells(sentence).map((t) => t.family.id), sentence).toContain(family);
  });
  it('ordinary prose is not a tell', () => {
    expect(findTells('We shipped the change on Tuesday. The single test that failed was flaky, and I fixed it.')).toEqual([]);
    expect(TELL_FAMILIES.length).toBeGreaterThanOrEqual(9);
  });
  it('the contrastive verdict is one move in any spelling', () => {
    for (const t of ["It isn't a tool, it's a habit.", 'The fix is not persuasion. It is coupling.', 'It has little to do with speed.', 'What matters is review.'])
      expect(findPattern(t, 'CONTRAST_VERDICT').length, t).toBeGreaterThan(0);
  });
});

describe('every author gets the machine-tell rule at their own rate; the contrast move only where the model overuses it', () => {
  const author = (i: number, voice: string): { id: string; text: string } => ({ id: `a${i}.md`, text: Array.from({ length: 16 }, (_, k) => `${voice} Point ${k + i} stands on its own. We checked it twice.`).join('\n\n') });
  const model = (i: number): string => Array.from({ length: 16 }, (_, k) => `Here's the connection people miss about point ${k + i}. It isn't speed, it's review. That's the whole game.`).join('\n\n');
  it('the machine-tell cap is proposed and sits at the author\'s own (near-zero) rate', () => {
    const rules = deriveContrastRules([0, 1, 2, 3].map((i) => author(i, 'I write plainly.')), [4, 5].map((i) => author(i, 'I write plainly.')), [model(0), model(1), model(2)], 'MACHINE_DISCOVERED');
    const r = rules.find((x) => (x.requirement.measurement?.params.pattern as string[] | undefined)?.[0] === 'MACHINE_TELL');
    expect(r?.requirement.measurement?.params.maxPer1000).toBe(0.3);   // the floor of 0.25, to one decimal
    expect(r?.conformance.weak).toBeUndefined();
  });
  it('an author who writes formally gets a cap on contractions, and on full forms only at their own rate', () => {
    const formal = (i: number) => author(i, 'It is not the case that we do not check. I am certain that it is done, and we have not skipped it.');
    const rules = deriveContrastRules([0, 1, 2, 3].map(formal), [4, 5].map(formal), [model(0), model(1), model(2)], 'MACHINE_DISCOVERED');
    expect(rules.some((x) => (x.requirement.measurement?.params.pattern as string[] | undefined)?.[0] === 'CONTRACTION')).toBe(true);
    // Two-sided: a repair told to cut contractions must not expand every one beyond what the author writes.
    const whole = rules.find((x) => (x.requirement.measurement?.params.pattern as string[] | undefined)?.[0] === 'FULL_FORM');
    expect(whole?.requirement.statement).toMatch(/^Write out as often as I do, not more/);
  });
});

describe('the learned lexicon: from the skill\'s own drafts, statistically', () => {
  const topics = ['review', 'hiring', 'pricing', 'onboarding', 'testing'];
  const draft = (topic: string): { task: string; text: string } => ({ task: `Write about ${topic}`,
    text: Array.from({ length: 30 }, (_, k) => `The honest answer is that ${topic} ${k} needs care. It turns out to be simpler than it looks.`).join(' ') });
  const corpus = [Array.from({ length: 400 }, (_, k) => `We looked at item ${k} and it was fine.`).join(' ')];
  const lex = deriveTellLexicon(topics.map(draft), corpus);
  it('a phrase the drafts repeat across topics and the corpus never uses is learned; topic words never are', () => {
    expect(lex.terms.some((t) => t.startsWith('the honest answer is'))).toBe(true);
    expect(lex.terms.some((t) => /review|hiring|pricing/.test(t))).toBe(false);
    expect(lex.topics).toBe(5);
  });
  it('a phrase the author uses is never learned', () => {
    const own = deriveTellLexicon(topics.map(draft), [...corpus, 'The honest answer is that I do not know.']);
    expect(own.terms.some((t) => t.includes('the honest answer is'))).toBe(false);
  });
  it('a phrase on too few topics is not a habit', () => {
    expect(deriveTellLexicon(topics.slice(0, 2).map(draft), corpus).terms).toEqual([]);
  });
  it('learned phrases are checked only where the standard holds the ratified machine-tell rule', () => {
    const rule = aRequirement({ requirementId: 'c1', statement: 'No machine moves.', kind: 'BOUNDARY', materiality: 'REQUIRED',
      measurement: { observer: 'PATTERN_RATE', params: { pattern: ['MACHINE_TELL'], maxPer1000: 0.25 } } });
    const text = 'The honest answer is that we should wait. Nothing else here.';
    const withRule = checkDraft('x', { standardVersionHash: 's', requirements: [rule] } as unknown as StandardVersion, text, { guardClaims: false, learnedTells: ['the honest answer is'] });
    expect(withRule.checked.find((c) => c.requirementId === 'c1·learned')?.result.verdict).toBe('VIOLATED');
    expect(withRule.failed).toBe(true);
    const without = checkDraft('x', { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion, text, { guardClaims: false, learnedTells: ['the honest answer is'] });
    expect(without.checked.some((c) => c.requirementId.endsWith('·learned'))).toBe(false);
  });
});

describe('repair removes the move, one sentence at a time', () => {
  const filler = 'We shipped the change on a Tuesday and watched the dashboards through the afternoon. '.repeat(30);
  const std = { standardVersionHash: 's', requirements: [aRequirement({ requirementId: 'c3', statement: 'Contrast verdicts at my rate.', kind: 'BOUNDARY', materiality: 'REQUIRED',
    measurement: { observer: 'PATTERN_RATE', params: { pattern: ['CONTRAST_VERDICT'], maxPer1000: 0 } } })] } as unknown as StandardVersion;
  it('the reason names the forms the move may not take, and the negation it carries may go', () => {
    const text = `${filler}The fix is not persuasion. It's coupling.`;
    const [t] = planRepair(text, checkDraft('x', std, text, { guardClaims: false })).slice(-1);
    expect(t.reasons[0]).toMatch(/do not recast it as another contrast/);
    expect(t.drops?.length).toBeGreaterThan(0);
  });
  it('one sentence that moves the move is refused; the others in the same pass are kept', async () => {
    const text = `${filler}The fix is not persuasion. It's coupling. ${filler}Speed isn't the goal, it's review.`;
    const client = { complete: async (r: { userMessage: string }) => {
      const ids = [...r.userMessage.matchAll(/SPAN (\d+)/g)].map((m) => Number(m[1]));
      return { json: { replacements: ids.map((id, k) => ({ id, text: k === 0 ? 'Coupling is the fix.' : 'The goal is review rather than speed.' })) }, cost: { basis: 'API_METERED', billingUsd: 0 } };
    } } as never;
    const r = await refineToStandard(client, { spentUsd: 0, capUsd: 1 }, 'x', std, text, 2, { guardClaims: false });
    expect(r.output).toContain('Coupling is the fix.');
    expect(r.output).not.toContain('rather than speed');
  });
  it('a replacement that leaves a slot for the person is refused unless slots were asked for', () => {
    const text = 'One. Two years ago I shipped a migration that broke billing. Three.';
    const t = { id: 1, start: 5, end: 60, text: text.slice(5, 60), reasons: ['x'], requirementIds: ['UNSOURCED'], drops: [], swaps: [], specifics: true, recase: false };
    const reverted: { id: number; lost: readonly string[] }[] = [];
    expect(applyRepair(text, [t], [{ id: 1, text: '[your story: a migration that broke]' }], reverted)).toBe(text);
    expect(reverted[0].lost[0]).toMatch(/bracketed slot/);
    expect(applyRepair(text, [t], [{ id: 1, text: '[your story: a migration that broke]' }], [], [], true)).toContain('[your story');
  });
});

describe('round 6 findings: a move the author never makes is never allowed, and nothing invented survives a failed rewrite', () => {
  const filler = 'We shipped the change on a Tuesday and watched the dashboards through the afternoon. '.repeat(250);
  const rule = (never: string[]) => aRequirement({ requirementId: 'c6', statement: 'No machine moves.', kind: 'BOUNDARY', materiality: 'REQUIRED',
    measurement: { observer: 'PATTERN_RATE', params: { pattern: ['MACHINE_TELL'], maxPer1000: 0.5, never } } });
  it('one instance of a family the author never uses breaks the rule, however long the piece', () => {
    const text = `${filler}That last one matters more than it looks.`;
    const std = (never: string[]) => ({ standardVersionHash: 's', requirements: [rule(never)] } as unknown as StandardVersion);
    expect(checkDraft('x', std(['RETRO_EMPHASIS']), text, { guardClaims: false }).failed).toBe(true);
    expect(checkDraft('x', std([]), text, { guardClaims: false }).failed).toBe(false);   // pooled, it slipped under the rate
  });
  it('the proposal bans every family absent from the author\'s pieces', () => {
    const author = (i: number) => ({ id: `a${i}`, text: Array.from({ length: 16 }, (_, k) => `It is the single most useful check ${k + i}. We ran it twice.`).join('\n\n') });
    const rules = deriveContrastRules([0, 1, 2, 3].map(author), [4, 5].map(author), ['Plain text. '.repeat(300), 'Plain text. '.repeat(300)], 'MACHINE_DISCOVERED');
    const never = rules.find((x) => (x.requirement.measurement?.params.pattern as string[] | undefined)?.[0] === 'MACHINE_TELL')?.requirement.measurement?.params.never as string[];
    expect(never).toContain('RETRO_EMPHASIS');
    expect(never).not.toContain('SUPERLATIVE');   // this author does write "the single most"
  });
  it('a sentence that is only a move may be cut, even with a "not" in it; one with a name or figure may not', () => {
    const text = 'Review matters. I want to be careful not to be cynical about this. Ship it.';
    const t = { id: 1, start: 16, end: 66, text: text.slice(16, 66), reasons: ['x'], requirementIds: ['c6'], drops: [], swaps: [], specifics: false, recase: false, cuttable: true };
    expect(applyRepair(text, [t], [{ id: 1, text: '' }])).toBe('Review matters. Ship it.');
    const named = 'Review matters. Let me be blunt about Kubernetes in 2024. Ship it.';
    const t2 = { ...t, start: 16, end: 57, text: named.slice(16, 57) };
    const reverted: { id: number; lost: readonly string[] }[] = [];
    expect(applyRepair(named, [t2], [{ id: 1, text: '' }], reverted)).toBe(named);
    expect(reverted[0].lost[0]).toMatch(/no figure or name/);
  });
  it('when every rewrite of an invented story fails, the story is cut outright and listed', async () => {
    const std = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;
    const draft = 'Review matters. Two years ago I shipped a migration that broke billing for a week. Tests would have caught it.';
    const slots = { complete: async () => ({ json: { replacements: [{ id: 1, text: '[your story: a migration]' }] }, cost: { basis: 'API_METERED', billingUsd: 0 } }) } as never;
    const r = await refineToStandard(slots, { spentUsd: 0, capUsd: 1 }, 'x', std, draft, 2, {});
    expect(r.output).toBe('Review matters. Tests would have caught it.');
    expect(r.repair?.storiesCut?.[0]).toMatch(/Two years ago/);
  });
});

describe('held to the author\'s typical piece; their occasional move does not disqualify the rule', () => {
  it('a family used in fewer than half the author\'s pieces is banned in ours, and one occasional use in their unread work is tolerated', () => {
    const plain = (i: number) => ({ id: `a${i}`, text: Array.from({ length: 16 }, (_, k) => `We ran check ${k + i} twice and kept the result.`).join('\n\n') });
    const held = [{ id: 'h1', text: `${plain(9).text}\n\nIt is the single most useful habit I have.` }, plain(10)];
    const rules = deriveContrastRules([0, 1, 2, 3].map(plain), held, ['Plain text. '.repeat(300), 'Plain text. '.repeat(300)], 'MACHINE_DISCOVERED');
    const r = rules.find((x) => (x.requirement.measurement?.params.pattern as string[] | undefined)?.[0] === 'MACHINE_TELL');
    expect(r).toBeDefined();                                                          // the rule survives
    expect(r?.requirement.measurement?.params.never).toContain('SUPERLATIVE');        // used in 1 of 6 pieces
    expect(r?.requirement.measurement?.params.never).toContain('VERDICT_OPENER');
  });
  it('a contrastive verdict as the opening line is found by position', () => {
    const t = "Ownership isn't about authorship. It's about who answers the pager.\n\nThe rest of the piece argues it at length, and says nothing of the kind again.";
    expect(findPattern(t, 'MACHINE_TELL').map((x) => x.why)).toContain('a contrastive verdict as the opening line');
    expect(findPattern(`A plain opening line about pagers. A second plain line.\n\nIt isn't speed, it's review.`, 'MACHINE_TELL').map((x) => x.why)).not.toContain('a contrastive verdict as the opening line');
  });
});

describe('invented material, in the shapes readers caught', () => {
  it('an anecdote without a date, a second-hand story and an unnamed authority are claims; an opinion is not', async () => {
    const { unsourcedClaims } = await import('../core/loop/claims.js');
    const kinds = (t: string) => unsourcedClaims(t, '').map((c) => c.kind);
    expect(kinds('I had an agent consolidate three date helpers into one.')).toEqual(['EXPERIENCE']);
    expect(kinds('A team I worked with shipped a retry wrapper that hid outages.')).toEqual(['EXPERIENCE']);
    expect(kinds('Teams I have talked to flipped CODEOWNERS overnight.')).toEqual(['EXPERIENCE']);
    expect(kinds('A legal scholar put it well: the treaty is a spec for a different runtime.')).toEqual(['SOURCE']);
    expect(kinds('I think review matters more now.')).toEqual([]);
    expect(kinds('Teams that ship weekly need this.')).toEqual([]);
    expect(unsourcedClaims('I had an agent consolidate three date helpers into one.', 'Last spring I had an agent consolidate three date helpers into one utility.')).toEqual([]);
  });
});

describe('a move the author never makes is banned at any length', () => {
  it('a short reply that makes one breaks the rule; a short plain one is not measured', () => {
    const rule = aRequirement({ requirementId: 'c6', statement: 'No machine moves.', kind: 'BOUNDARY', materiality: 'REQUIRED',
      measurement: { observer: 'PATTERN_RATE', params: { pattern: ['MACHINE_TELL'], maxPer1000: 0.5, never: ['CANDOUR'] } } });
    const std = { standardVersionHash: 's', requirements: [rule] } as unknown as StandardVersion;
    expect(checkDraft('x', std, 'Let me be blunt: the refund is on its way.', { guardClaims: false }).failed).toBe(true);
    expect(checkDraft('x', std, 'The refund is on its way.', { guardClaims: false }).checked[0].result.verdict).toBe('NOT_APPLICABLE');
  });
});

describe('em dashes and staccato runs are tells for every author, held to their own rate', () => {
  it('the catalogue finds an em dash, and a run of three short sentences but not two', () => {
    const ids = (t: string): string[] => findTells(t).map((m) => m.family.id);
    expect(ids('The chart runs — every morning.')).toContain('EM_DASH');
    expect(ids('The bots run on time. The plan gets made. The drafts arrive.')).toContain('STACCATO_RUN');
    expect(ids('The founder rules. The agents report.')).not.toContain('STACCATO_RUN');
    expect(ids('He came back. It was late, and the long day had worn everybody down to the bone. We slept.')).not.toContain('STACCATO_RUN');
  });
  it('an author who never uses an em dash gets it banned outright, with no plain drafts needed to show it', () => {
    const piece = (i: number): { id: string; text: string } => ({ id: `a${i}.md`, text: `This is piece ${i}, and it runs long enough to count, with commas, colons: and full stops. `.repeat(20) });
    const rule = deriveContrastRules([0, 1, 2, 3].map(piece), [4, 5].map(piece), ['draft one.', 'draft two.'], 'MACHINE_DISCOVERED')
      .find((r) => (r.requirement.measurement?.params.pattern as string[] | undefined)?.includes('MACHINE_TELL'));
    expect(rule?.requirement.measurement?.params.never).toEqual(expect.arrayContaining(['EM_DASH', 'STACCATO_RUN']));
    expect(rule?.requirement.statement).toMatch(/an em dash, a run of three or more very short sentences/);
  });
});

describe('an author who does use em dashes keeps them, and they do not loosen the cap on other moves', () => {
  it('dashes stay out of the pooled rate, both when the cap is set and when a draft is checked', () => {
    const dashy = (i: number): { id: string; text: string } => ({ id: `d${i}.md`, text: `Piece ${i} holds a view \u2014 and a reason for it, with room to breathe. `.repeat(30) });
    const rule = deriveContrastRules([0, 1, 2, 3].map(dashy), [4, 5].map(dashy), ['draft one.', 'draft two.'], 'MACHINE_DISCOVERED')
      .find((r) => (r.requirement.measurement?.params.pattern as string[] | undefined)?.includes('MACHINE_TELL'));
    const p = rule?.requirement.measurement?.params as { never: string[]; maxPer1000: number };
    expect(p.never).not.toContain('EM_DASH');
    expect(p.maxPer1000).toBe(0.3);   // the floor: the author's dashes did not raise it
    const draft = `A plain sentence here \u2014 with a dash, as the author writes. `.repeat(20);
    const std = { requirements: [{ ...rule!.requirement, materiality: 'REQUIRED' }] } as unknown as StandardVersion;
    expect(checkDraft('s', std, draft).checked.find((c) => c.requirementId === rule!.requirement.requirementId)?.result.verdict).not.toBe('VIOLATED');
  });
});

describe('the fixes that need no model', () => {
  it('replaces em dashes with the punctuation a writer who never uses them would reach for, leaving code alone', () => {
    expect(replaceEmDashes('The chart runs — every morning — at 08:00.')).toBe('The chart runs, every morning, at 08:00.');
    expect(replaceEmDashes('It holds hands — not the judgment that decides what they are for.')).toBe('It holds hands: not the judgment that decides what they are for.');
    expect(replaceEmDashes('Done — really.')).toBe('Done, really.');
    expect(replaceEmDashes('Keep `a—b` as code.')).toBe('Keep `a—b` as code.');
    expect(replaceEmDashes('```\nx — y\n```')).toBe('```\nx — y\n```');
  });
  it('splits a paragraph longer than the author writes at sentence boundaries, and leaves headings and lists alone', () => {
    expect(splitLongParagraphs('One. Two. Three. Four. Five. Six. Seven. Eight.', 6)).toBe('One. Two. Three. Four.\n\nFive. Six. Seven. Eight.');
    expect(splitLongParagraphs('- One. Two. Three. Four. Five. Six. Seven.', 6)).toBe('- One. Two. Three. Four. Five. Six. Seven.');
    expect(splitLongParagraphs('One. Two.', 6)).toBe('One. Two.');
  });
  it('applies only what a broken REQUIRED rule calls for: a dash the author uses in most pieces is theirs', () => {
    const tell = aRequirement({ requirementId: 'c6', materiality: 'REQUIRED', kind: 'BOUNDARY',
      measurement: { observer: 'PATTERN_RATE', params: { pattern: ['MACHINE_TELL'], maxPer1000: 1, never: ['EM_DASH'] } } });
    const theirs = { ...tell, measurement: { observer: 'PATTERN_RATE' as const, params: { pattern: ['MACHINE_TELL'], maxPer1000: 1, never: [] } } };
    const std = (r: typeof tell) => ({ requirements: [r] }) as unknown as StandardVersion;
    const broken = { checked: [{ requirementId: 'c6', materiality: 'REQUIRED', result: { verdict: 'VIOLATED', spans: [] } }] } as never;
    expect(mechanicalFixes(std(tell), broken, 'It runs — daily.').text).toBe('It runs, daily.');
    expect(mechanicalFixes(std(theirs), broken, 'It runs — daily.').text).toBe('It runs — daily.');
  });
});

describe('the contrastive verdict is held for every author, at their own rate', () => {
  it('an author who uses it gets a cap at their rate, and it instructs, even when plain drafts do not overuse it', () => {
    const contrasty = (i: number): { id: string; text: string } => ({ id: `v${i}.md`, text: `The work in piece ${i} is not a checklist, it is a practice we keep up with care every single week. `.repeat(12) + 'We wrote the rest of it plainly, with ordinary sentences that carry the point without turning on a contrast. '.repeat(12) });
    const rule = deriveContrastRules([0, 1, 2, 3].map(contrasty), [4, 5].map(contrasty),
      ['A plain draft that states things directly and moves on. '.repeat(40), 'Another plain draft, direct and calm, with nothing turned on a contrast. '.repeat(40)], 'MACHINE_DISCOVERED')
      .find((r) => (r.requirement.measurement?.params.pattern as string[] | undefined)?.[0] === 'CONTRAST_VERDICT');
    expect(rule?.requirement.statement).toMatch(/to my rate: at most [\d.]+ per 1,000 words/);
    expect(rule?.conformance.weak).toBeUndefined();
  });
});

describe('a rewrite that keeps its source is reported as a restyle', () => {
  it('measures the share of sentences kept nearly as written', () => {
    const source = 'We built the chart to run every morning at eight. It drafts the plan and sends it to the founder for review. Nothing goes out without a yes from him.';
    expect(sentencesKept(source, source)).toBe(1);
    expect(sentencesKept('We built the chart to run every single morning at eight. A different sentence with other words entirely here now.', source)).toBe(0.5);
    expect(sentencesKept('Completely new prose about something else, written from notes and nothing more than that.', source)).toBe(0);
  });
});
