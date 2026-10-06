// tests/atelier-efficiency.test.ts — HOW BIG A SKILL IS, WHAT A RUN COST AND WHERE, AND THE OWNER'S BUDGET FOR PIECES.
//
// An outside comparison found Atelier's exported skills several times the size of anything they were measured
// against, and nothing in the product said where the words were or where a run's money went. Pinned here: the
// size of a package split by part (core/eval/size.ts), a run's spend by purpose (core/inference/client.ts), the
// owner's word budget for the author's pieces and the excerpt form (core/compiler/voice.ts), the export without
// its reference index (cli/served.ts), and, through the shipped binary, that none of it changes a skill built
// without asking for it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { skillSizeOf, countWords, describeParts, describeSize } from '../core/eval/size.js';
import { spend, spendBetween, processSpendByPurpose, processSpentUsd, metered, type Budget, type SpendLine } from '../core/inference/client.js';
import { selectVoicePieces, selectWithinBudget, excerptOf, isExcerpt, pieceLabel, EXCERPT_GAP, EXCERPT_WORDS, PIECE_BUDGET_WORDS } from '../core/compiler/voice.js';
import { composeServed, withoutReferenceIndex } from '../cli/served.js';
import { costOf } from '../cli/commands/report.js';
import { renderSkillCard, type SkillCard } from '../core/eval/skill-card.js';
import { renderAgentSkill } from '../renderers/agent-skill/render.js';
import { compileArchitecture } from '../core/architecture/compile.js';
import type { StandardVersion } from '../core/state/canonical-state.js';
import type { EvalSummary } from '../core/eval/summary.js';
import { aRequirement } from './fixtures.js';

/** A piece of `paragraphs` distinct paragraphs, each about 45 words, so a passage can be traced to where it came from. */
const piece = (id: number, paragraphs: number): string => Array.from({ length: paragraphs }, (_, k) =>
  `Piece ${id} paragraph ${k} opens here. I think this matters, and I don't say that lightly, because the argument of piece ${id} turns on point ${k}. `
  + `We decided first and explained after, which is how the work of piece ${id} went at step ${k}, and nobody regretted it.`).join('\n\n');
const list = (id: number): string => `# List ${id}\n\n${Array.from({ length: 30 }, (_, k) => `- **Item ${k} of list ${id}.** A short point about step ${k}.`).join('\n')}`;

const standard = (): StandardVersion => ({ standardVersionHash: 's', evidenceId: 'e', workType: 'writing', authorityState: 'RATIFIED', mintedAt: '2026-10-05T00:00:00Z',
  requirements: [
    aRequirement({ requirementId: 'p1', statement: 'I lead with the decision, then the reasoning.', materiality: 'REQUIRED' }),
    aRequirement({ requirementId: 'p2', statement: 'I close on what happens next.', materiality: 'PREFERRED', appliesWhen: 'the piece announces a change', evidence: 'Next week we turn it on for everyone.' }),
  ] } as unknown as StandardVersion);

const packageWith = (pieces: readonly string[], pieceForm?: 'excerpts') => {
  const v = standard();
  return renderAgentSkill(v, compileArchitecture(v), 'x', 'd', null, [], { passages: [], lengthWords: [800, 1200] as const, pieces, ...(pieceForm ? { pieceForm } : {}),
    persona: { points: [{ aspect: 'a', description: 'Talks to the reader directly.', frequency: 'OFTEN' as const, quote: 'you' }], dropped: 0 } });
};

describe('the size of a skill: stored, exported, and where the words are', () => {
  const pkg = packageWith([piece(1, 20), piece(2, 20)]);
  const served = composeServed(pkg.files, '');
  const size = skillSizeOf(pkg.files, served.servedText, served.servedExamples);

  it('the parts of the export sum to the export, whatever the fence around the examples says', () => {
    expect(size.exported.words).toBe(countWords(served.servedText));
    expect(size.parts.reduce((n, l) => n + l.words, 0)).toBe(size.exported.words);
    expect(size.exported.bytes).toBe(Buffer.byteLength(served.servedText, 'utf8'));
  });
  it('the author\'s pieces are their own part, counted from the files, and are the largest here', () => {
    const pieces = size.parts.find((l) => l.part === 'your pieces');
    expect(pieces).toEqual({ part: 'your pieces', files: 2, words: countWords(pkg.files['examples/voice-1.md']) + countWords(pkg.files['examples/voice-2.md']) });
    expect(size.parts[0].part).toBe('your pieces');
  });
  it('the sections the renderer writes are found by their headings: a renamed heading fails here, not in a report', () => {
    const parts = new Set(size.parts.map((l) => l.part));
    for (const p of ['rules and instructions', 'how I sound', 'reference index', 'rule examples', 'framing'] as const) expect(parts.has(p), p).toBe(true);
    expect(pkg.files['SKILL.md']).toContain('## How I sound');
    expect(pkg.files['SKILL.md']).toContain('## Reference material');
  });
  it('stored counts every file of the package, the ones a run never serves included', () => {
    expect(size.stored.files).toBe(Object.keys(pkg.files).length);
    expect(size.stored.words).toBe(Object.values(pkg.files).reduce((n, t) => n + countWords(t), 0));
    expect(size.stored.words).toBeGreaterThanOrEqual(size.exported.words - (size.parts.find((l) => l.part === 'framing')?.words ?? 0));
  });
  it('polarity: a package with no pieces has no such part, and nothing is invented for it', () => {
    const bare = packageWith([]);
    const s = composeServed(bare.files, '');
    const z = skillSizeOf(bare.files, s.servedText, s.servedExamples);
    expect(z.parts.some((l) => l.part === 'your pieces')).toBe(false);
    expect(z.parts.reduce((n, l) => n + l.words, 0)).toBe(z.exported.words);
    expect(z.exported.words).toBeLessThan(size.exported.words);
  });
  it('one line each, with the numbers a person can act on', () => {
    expect(describeSize(size)).toMatch(/^stored [\d,]+ words in \d+ files · exported [\d,]+ words \([\d,]+ bytes\)$/);
    expect(describeParts(size)).toMatch(/^your pieces [\d,]+ \(2 files\) · /);
  });
  it('the skill card shows it, and a card built before sizes existed renders as it did', () => {
    const card = { schema: 1, skill: 'x', skillVersion: 'a'.repeat(16), standardVersion: 'b'.repeat(16), builtAt: null, corpus: null, copying: true,
      rules: { total: 2, required: 1, counted: 0, read: 2, conditional: 1, needsMaterial: 0 }, claims: { instrument: 'pattern check', qualified: false, measured: null, answers: false },
      fidelity: null, release: null, taste: null, notMeasured: ['voice'], next: ['atelier invoke'] } satisfies SkillCard;
    expect(renderSkillCard({ ...card, size })).toMatch(/SIZE {2}stored [\d,]+ words in \d+ files · exported [\d,]+ words/);
    expect(renderSkillCard({ ...card, size })).toMatch(/the export\s+your pieces [\d,]+ \(2 files\)/);
    expect(renderSkillCard(card)).not.toMatch(/SIZE/);
  });
});

describe('the export without its reference index', () => {
  const pkg = packageWith([piece(1, 20)]);
  const md = pkg.files['SKILL.md'];

  it('only the index goes: every other line of SKILL.md is kept, in order', () => {
    const lean = withoutReferenceIndex(md);
    expect(lean).not.toContain('## Reference material');
    expect(lean).not.toContain('`examples/p2.md`');
    const kept = lean.split('\n'); let at = 0;
    for (const line of md.split('\n')) if (kept[at] === line) at++;
    expect(at).toBe(kept.length);
    expect(lean).toContain('## What to do');
    expect(lean).toContain('Atelier materialization');
  });
  it('what the index said of a file is still said by the file the export inlines', () => {
    const full = composeServed(pkg.files, '');
    const lean = composeServed(pkg.files, '', { index: false });
    expect(lean.servedExamples).toEqual(full.servedExamples);
    expect(lean.servedText).toContain('**Applies when:** the piece announces a change');
    expect(countWords(lean.servedText)).toBeLessThan(countWords(full.servedText));
  });
  it('polarity: a SKILL.md with no index is returned unchanged, and the default composition keeps the index', () => {
    const bare = '---\nname: x\n---\n\n# x\n\n## What to do\n\nWrite it.\n';
    expect(withoutReferenceIndex(bare)).toBe(bare);
    expect(composeServed(pkg.files, '').servedText).toContain('## Reference material');
  });
});

describe('a budget for the author\'s pieces, set by the owner', () => {
  const corpus = [piece(1, 20), piece(2, 20), piece(3, 20), list(1), list(2), piece(4, 20)];

  it('the default is unchanged: the pieces chosen, and their order, are the ones the selection chose before a budget could be set', () => {
    // GOLDEN, computed with the selection as it stood before `spanningOrder` was factored out of it, on this corpus.
    // A change to typicality, to the mode features or to the order pieces are taken in moves one of these lists.
    const q = (id: number): string => Array.from({ length: 12 }, (_, k) => `Why does step ${k} of piece ${id} matter? It doesn't, mostly. But you'd be surprised - really - how often it's the one that breaks.`).join('\n\n');
    const fixed = [piece(1, 20), piece(2, 35), piece(3, 8), list(1), list(2), piece(4, 50), q(5), q(6), piece(7, 120)];
    const chosen = (budget?: number): number[] => (budget === undefined ? selectVoicePieces(fixed) : selectVoicePieces(fixed, budget)).map((t) => fixed.indexOf(t));
    expect(PIECE_BUDGET_WORDS).toBe(9000);
    expect(chosen()).toEqual([0, 3, 6, 2, 5, 1, 4, 7]);
    expect(chosen(9000)).toEqual([0, 3, 6, 2, 5, 1, 4, 7]);
    expect(chosen(5000)).toEqual([0, 3, 6, 2, 5, 4, 7]);
    expect(chosen(3000)).toEqual([0, 3, 6, 2, 4, 7]);
    expect(chosen(1900)).toEqual([2, 3, 6, 4, 7]);
    expect(chosen(1500)).toEqual([2, 3, 6, 4]);
    expect(chosen(400)).toEqual([]);
  });
  it('a budget the owner sets is a ceiling on what the export counts, whole pieces included, and one piece may use it all', () => {
    const exported = (chosen: readonly string[]): number => chosen.reduce((n, t, i) => n + countWords(`${pieceLabel(i + 1, false)}\n\n${t}`), 0);
    for (const budget of [1000, 1500, 1900, 3000, 5000]) {
      const lean = selectWithinBudget(corpus, budget, 'whole');
      expect(exported(lean), `budget ${budget}`).toBeLessThanOrEqual(budget);
      for (const t of lean) expect(corpus).toContain(t);
    }
    // a 900-word piece fits a 1,000-word budget: no rule of half a budget hides it from an owner who asked for 1,000
    expect(selectWithinBudget(corpus, 1000, 'whole')).toHaveLength(1);
    expect(selectWithinBudget(corpus, 300, 'whole')).toEqual([]);
    expect(selectWithinBudget(corpus, 0, 'whole')).toEqual([]);
    expect(selectWithinBudget(corpus, 0, 'excerpts')).toEqual([]);
    expect(selectWithinBudget(corpus.slice(0, 2), 5000, 'whole')).toEqual([]);
  });
  it('the ceiling holds in any script and on code: a budget is not met by counting only English prose', () => {
    // Counted as English prose, a Russian piece is a few digits and a piece of code is nothing: every one of these
    // would "fit" a budget of 1,500 words, and a build would serve many times that and print "within 1500 words".
    const russian = (id: number): string => Array.from({ length: 30 }, (_, k) => `Это абзац ${k} текста ${id}. Мы решили сначала и объяснили потом, и никто об этом не пожалел, потому что работа шла именно так на шаге ${k}.`).join('\n\n');
    const code = (id: number): string => `Piece ${id}.\n\n\`\`\`ts\n${Array.from({ length: 400 }, (_, k) => `const value${k} = compute(${id}, ${k});`).join('\n')}\n\`\`\``;
    for (const c of [[russian(1), russian(2), russian(3), russian(4)], [code(1), code(2), code(3), code(4)]]) {
      const size = countWords(c[0]);
      expect(size).toBeGreaterThan(500);
      expect(selectWithinBudget(c, Math.floor(size / 2), 'whole')).toEqual([]);
      const some = selectWithinBudget(c, size * 2 + 100, 'whole');
      expect(some.length).toBeGreaterThan(0);
      expect(some.reduce((n, t) => n + countWords(t), 0)).toBeLessThanOrEqual(size * 2 + 100);
    }
  });
});

describe('excerpts: an opening and a middle passage, from more pieces', () => {
  const long = piece(7, 40);
  const passagesOf = (ex: string): string[] => ex.split(EXCERPT_GAP).map((x) => x.trim()).filter(Boolean);

  it('each passage is one unbroken stretch of the piece: the opening from the first line, the middle from the midpoint, the cut marked', () => {
    const ex = excerptOf(long);
    const passages = passagesOf(ex);
    expect(passages).toHaveLength(2);
    expect(ex.startsWith('Piece 7 paragraph 0 opens here.')).toBe(true);
    for (const passage of passages) {
      expect(long).toContain(passage);
      expect(countWords(passage)).toBeGreaterThanOrEqual(EXCERPT_WORDS);
      expect(countWords(passage)).toBeLessThan(EXCERPT_WORDS * 2);
    }
    expect(passages[1].startsWith('Piece 7 paragraph 20 opens here.') || passages[1].startsWith('Piece 7 paragraph 19 opens here.')).toBe(true);
    expect(ex.endsWith(EXCERPT_GAP)).toBe(true);
    expect(isExcerpt(ex)).toBe(true);
  });
  it('a piece too short to leave anything out is shown whole, with no mark, and is not called an excerpt', () => {
    const short = piece(8, 6);
    expect(excerptOf(short)).toBe(short);
    expect(isExcerpt(excerptOf(short))).toBe(false);
  });
  it('a passage is the author\'s text byte for byte: runs of blank lines, double spaces and tabs are kept as written', () => {
    const odd = `${piece(12, 5).replace(/\n\n/g, '\n\n\n\n')}\n\n${piece(12, 40).replace(/\. /g, '.  ').replace(/\n\n/g, '\t ')}`;
    const ex = excerptOf(odd);
    expect(isExcerpt(ex)).toBe(true);
    for (const passage of passagesOf(ex)) expect(odd).toContain(passage);
  });
  it('a fenced code block is never cut through, even where a passage would otherwise end inside it', () => {
    // The block straddles the 250-word mark of the opening and holds a blank line: split there, half of it would be shown.
    const fence = `\`\`\`ts\n${Array.from({ length: 30 }, (_, k) => `const value${k} = compute(${k});`).join('\n')}\n\n${Array.from({ length: 30 }, (_, k) => `const other${k} = compute(${k});`).join('\n')}\n\`\`\``;
    const ex = excerptOf(`${piece(9, 5)}\n\n${fence}\n\n${piece(9, 40)}`);
    expect(ex).toContain('const value0 = compute(0);');
    expect(ex).toContain(fence);
  });
  it('only a real fence is code: inline code on a line of its own, and a fence never closed, leave the piece excerptable', () => {
    const inline = `${piece(13, 3)}\n\n\`\`\`npm install\`\`\` is all you need.\n\n${piece(13, 40)}`;
    const unclosed = `${piece(14, 3)}\n\n\`\`\`\nconst a = 1;\n\n${piece(14, 40)}`;
    for (const text of [inline, unclosed]) {
      const ex = excerptOf(text);
      expect(isExcerpt(ex)).toBe(true);
      expect(countWords(ex)).toBeLessThan(countWords(text) / 2);
    }
  });
  it('a piece written as one long paragraph, or with single line breaks, still has an excerpt shorter than itself', () => {
    for (const text of [piece(10, 40).replace(/\n\n/g, ' '), piece(11, 40).replace(/\n\n/g, '\n')]) {
      const ex = excerptOf(text);
      expect(countWords(ex)).toBeLessThan(countWords(text) / 2);
      expect(isExcerpt(ex)).toBe(true);
      for (const passage of passagesOf(ex)) expect(text).toContain(passage);
    }
  });
  it('text in a script with no Latin words is cut too, and one with no spaces between words', () => {
    const russian = Array.from({ length: 40 }, (_, k) => `Это абзац ${k}. Мы решили сначала и объяснили потом, и никто об этом не пожалел, потому что работа шла именно так.`).join('\n\n');
    const chinese = Array.from({ length: 40 }, (_, k) => `这是第${k}段。我们先做了决定，然后才解释原因，没有人为此后悔，因为工作就是这样一步一步进行的，每一步都很清楚。`).join('\n\n');
    for (const text of [russian, chinese]) {
      const ex = excerptOf(text);
      expect(isExcerpt(ex)).toBe(true);
      expect(ex.length).toBeLessThan(text.length * 0.7);
      for (const passage of passagesOf(ex)) expect(text).toContain(passage);
    }
  });
  it('front matter is not the author\'s prose and is left out; a piece that merely opens with a rule keeps what follows it', () => {
    const ex = excerptOf(`---\ntitle: A post\nrequest: write it\n---\n\n${long}`);
    expect(ex.startsWith('Piece 7 paragraph 0 opens here.')).toBe(true);
    expect(ex).not.toContain('title: A post');
    // two horizontal rules are not front matter: the paragraphs between them are the author's opening
    const ruled = excerptOf(`---\n\n${piece(15, 10)}\n\n---\n\n${piece(16, 40)}`);
    expect(ruled).toContain('Piece 15 paragraph 0 opens here.');
  });
  it('one long paragraph of Chinese is cut at its sentence marks, which no space follows', () => {
    const paragraph = Array.from({ length: 80 }, (_, k) => `这是第${k}句话，我们先做了决定，然后才解释原因。`).join('');
    const ex = excerptOf(paragraph);
    expect(isExcerpt(ex)).toBe(true);
    expect(ex.length).toBeLessThan(paragraph.length * 0.7);
    for (const passage of passagesOf(ex)) expect(paragraph).toContain(passage);
  });
  it('a piece of many fence openers that never close is read in one pass, not once per opener', () => {
    const text = `${Array.from({ length: 20000 }, () => '```js').join('\n')}\n\n${piece(17, 40)}`;
    const started = Date.now();
    expect(excerptOf(text)).toContain(EXCERPT_GAP);
    expect(Date.now() - started).toBeLessThan(3000);
  });
  it('the budget is a ceiling on what the export counts, for the first piece chosen as for the last', () => {
    const corpus = [piece(1, 40), piece(2, 40), piece(3, 40), piece(4, 40)];
    const exported = (chosen: readonly string[]): number => chosen.reduce((n, t, i) => n + countWords(`${pieceLabel(i + 1, isExcerpt(t))}\n\n${t}`), 0);
    expect(selectWithinBudget(corpus, 100, 'excerpts')).toEqual([]);
    expect(selectWithinBudget(corpus, 700, 'excerpts')).toHaveLength(1);
    for (const budget of [700, 1000, 1200, 2000, 3000]) expect(exported(selectWithinBudget(corpus, budget, 'excerpts')), `budget ${budget}`).toBeLessThanOrEqual(budget);
  });
  it('for the same words, excerpts reach more pieces than whole ones do', () => {
    const corpus = [piece(1, 40), piece(2, 40), piece(3, 40), piece(4, 40), list(1), piece(5, 40)];
    expect(selectWithinBudget(corpus, 4000, 'excerpts').length).toBeGreaterThan(selectWithinBudget(corpus, 4000, 'whole').length);
    expect(selectWithinBudget(corpus.slice(0, 2), 4000, 'excerpts')).toEqual([]);
  });
  it('the compiled skill says what each file holds: passages where a piece was cut, a whole piece where it was not', () => {
    const cut = packageWith([excerptOf(long), excerptOf(piece(6, 40))], 'excerpts');
    expect(cut.files['SKILL.md']).toContain('each hold passages from one piece of mine');
    expect(cut.files['SKILL.md']).not.toContain('whole piece');
    expect(cut.files['examples/voice-1.md']).toMatch(/^\[voice-1\] Passages from one piece of mine/);
    // a short piece chosen beside a cut one is served whole, and its file says so: a model told to expect a cut looks for one
    const mixed = packageWith([excerptOf(long), piece(8, 6)], 'excerpts');
    expect(mixed.files['SKILL.md']).toContain('each hold one piece, or passages from one, of mine');
    expect(mixed.files['examples/voice-1.md']).toMatch(/^\[voice-1\] Passages from one piece of mine/);
    expect(mixed.files['examples/voice-2.md']).toMatch(/^\[voice-2\] One whole piece of mine/);
    // every piece short: nothing was cut, and the skill reads as it does for whole pieces
    expect(packageWith([piece(8, 6), piece(9, 6)], 'excerpts').files['SKILL.md']).toContain('are whole pieces of mine');
    // polarity: without the form, a piece that happens to carry the mark is still a whole piece
    const own = packageWith([`${piece(6, 6)}\n\n${EXCERPT_GAP}`]);
    expect(own.files['SKILL.md']).toContain('is a whole piece of mine');
    expect(own.files['examples/voice-1.md']).toMatch(/^\[voice-1\] One whole piece of mine/);
  });
  it('two budgets that choose the same pieces are one package: the budget is not part of what a package served', () => {
    const v = standard(); const pieces = [piece(1, 20)];
    const voice = { passages: [], lengthWords: [800, 1200] as const, pieces };
    const a = renderAgentSkill(v, compileArchitecture(v), 'x', 'd', null, [], voice);
    const b = renderAgentSkill(v, compileArchitecture(v), 'x', 'd', null, [], { ...voice, pieceBudget: 5000 });
    expect(b.packageHash).toBe(a.packageHash);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    // the form is written last whichever path of the build set it, so two orders of the same voice are one record
    const formFirst = { passages: [], lengthWords: [800, 1200] as const, pieces, pieceForm: 'excerpts' as const, persona: { points: [], dropped: 0 } };
    const formLast = { passages: [], lengthWords: [800, 1200] as const, pieces, persona: { points: [], dropped: 0 }, pieceForm: 'excerpts' as const };
    expect(JSON.stringify(renderAgentSkill(v, compileArchitecture(v), 'x', 'd', null, [], formFirst))).toBe(JSON.stringify(renderAgentSkill(v, compileArchitecture(v), 'x', 'd', null, [], formLast)));
    // excerpts asked of pieces too short to cut serve the very files whole does: one package, so no form is recorded,
    // and a build that switches the form over such pieces lands on the stored package and is not refused
    const short = { passages: [], lengthWords: [800, 1200] as const, pieces: [piece(2, 6), piece(3, 6)] };
    expect(JSON.stringify(renderAgentSkill(v, compileArchitecture(v), 'x', 'd', null, [], { ...short, pieceForm: 'excerpts' as const }))).toBe(JSON.stringify(renderAgentSkill(v, compileArchitecture(v), 'x', 'd', null, [], short)));
    // and a form with no piece to describe is not recorded either
    const none = renderAgentSkill(v, compileArchitecture(v), 'x', 'd', null, [], { ...voice, pieces: [] });
    expect(JSON.stringify(renderAgentSkill(v, compileArchitecture(v), 'x', 'd', null, [], { ...voice, pieces: [], pieceForm: 'excerpts' as const }))).toBe(JSON.stringify(none));
  });
});

describe('where a run\'s cost went', () => {
  const call = (usd: number, tokens?: { in: number; cached: number; out: number }) => async () => Promise.resolve({ value: 1, cost: metered(usd),
    ...(tokens ? { usage: { inputTokens: tokens.in, cacheReadTokens: tokens.cached, cacheWriteTokens: 0, outputTokens: tokens.out } } : {}) });

  it('each call is counted under the purpose its call site names, and the lines sum to the total', async () => {
    const budget: Budget = { spentUsd: 0, capUsd: 10 };
    const before = processSpendByPurpose(); const spentBefore = processSpentUsd();
    await spend(budget, 0.1, call(0.2, { in: 100, cached: 900, out: 50 }), 'writing');
    await spend(budget, 0.1, call(0.2, { in: 1000, cached: 0, out: 60 }), 'writing');
    await spend(budget, 0.1, call(0.03), 'claim reader');
    await spend(budget, 0.1, call(0.01));
    const lines = spendBetween(before, processSpendByPurpose());
    expect(lines.map((l) => l.purpose)).toEqual(['writing', 'claim reader', 'other']);
    expect(lines[0]).toEqual({ purpose: 'writing', usd: 0.4, calls: 2, inputTokens: 2000, outputTokens: 110 });
    expect(lines.reduce((n, l) => n + l.usd, 0)).toBeCloseTo(processSpentUsd() - spentBefore, 10);
    expect(budget.spentUsd).toBeCloseTo(0.44, 10);
  });
  it('polarity: a purpose with no call between two snapshots is left out, and a call that reports no usage counts no tokens', async () => {
    const before = processSpendByPurpose();
    await spend({ spentUsd: 0, capUsd: 1 }, 0.1, call(0.05), 'repair');
    const lines = spendBetween(before, processSpendByPurpose());
    expect(lines).toEqual([{ purpose: 'repair', usd: 0.05, calls: 1, inputTokens: 0, outputTokens: 0 }]);
    expect(spendBetween(processSpendByPurpose(), processSpendByPurpose())).toEqual([]);
  });
  it('the report prints one line per purpose and what was sent; a total the lines do not reach is said, never absorbed', () => {
    const spendLines: SpendLine[] = [{ purpose: 'writing', usd: 0.1, calls: 2, inputTokens: 26000, outputTokens: 1800 }, { purpose: 'claim reader', usd: 0.02, calls: 2, inputTokens: 0, outputTokens: 0 }];
    const e = { costUsd: 0.12, spend: spendLines, sent: { skill: 12891, added: 610, request: 14 } } as unknown as EvalSummary;
    const [[title, lines]] = costOf(e);
    expect(title).toBe('cost and size');
    expect(lines[0]).toBe('writing: $0.1000 · 2 calls · 26,000 tokens in, 1,800 out');
    expect(lines[1]).toBe('claim reader: $0.0200 · 2 calls');
    expect(lines[2]).toBe('sent to the writer: 12,891 words of skill · 610 added for this request (your nearest passages, notes) · 14 of request');
    expect(lines.some((l) => l.startsWith('not attributed'))).toBe(false);
    expect(costOf({ ...e, costUsd: 0.15 })[0][1]).toContain('not attributed: $0.0300 against the run\'s $0.1500');
    expect(costOf({ ...e, costUsd: 0.1 })[0][1]).toContain('counted in the lines and not in the total: $0.0200 against the run\'s $0.1000');
    // a run recorded before any of this was kept adds nothing to its report
    expect(costOf({ costUsd: 0.3 } as unknown as EvalSummary)).toEqual([]);
    expect(costOf(null)).toEqual([]);
  });
});

// ── THE RULE THAT CHOOSES THE DEFAULT, HELD BOTH WAYS ───────────────────────────────────────────
//
// bench/compare/efficiency-select.mjs is sealed with the ablation's pre-registration, so it is tested like product
// code: an arm that is level is selected, one that is worse is not, an arm nobody could read is never chosen by
// default, and rows that are not what the rule expects stop the run instead of thinning it.
const script = (name: string, ...args: string[]): { code: number; out: string } => {
  try { return { code: 0, out: execFileSync('node', [resolve(`bench/compare/${name}`), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { const x = e as { status?: number; stdout?: string; stderr?: string }; return { code: x.status ?? -1, out: `${x.stdout ?? ''}${x.stderr ?? ''}` }; }
};
const jsonl = (rows: readonly object[]): string => `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;

describe('the rule that chooses which size becomes the default', () => {
  interface Arm { words: number; breaks: (task: number, trial: number) => boolean; score: (task: number) => number; chosen?: (task: number) => string }
  interface Standing { arm: string; state: 'stands' | 'rejected' | 'unread' | 'not smaller'; rejectedIn: string[]; unreadIn: string[] }
  interface Selection { selected: string | null; smallestStanding: string | null; sentence: string; standing: Standing[]; domains: { name: string; arms: Record<string, { rejectedBy: string[]; voice: { read: boolean } }> }[] }
  interface Files { rules: object[]; quality: object[]; picks: object[] }
  /** One domain's files: `tasks` tasks, two outputs each, the reference and every arm. `edit` changes the rows before they are written. */
  const domain = (dir: string, name: string, tasks: number, arms: Record<string, Arm>, opts: { voice?: boolean; edit?: (f: Files) => void; excluded?: string[] } = {}): object => {
    const f: Files = { rules: [], quality: [], picks: [] };
    for (let t = 0; t < tasks; t++) for (const [condition, a] of Object.entries(arms)) {
      for (const trial of [1, 2]) { f.rules.push({ case_id: `t${t}`, trial, condition, broken: a.breaks(t, trial) }); f.quality.push({ case_id: `t${t}`, trial, condition, score: a.score(t) }); }
      if (a.chosen) f.picks.push({ case_id: `t${t}`, condition, chose: a.chosen(t) });
    }
    opts.edit?.(f);
    writeFileSync(join(dir, `${name}-sizes.json`), JSON.stringify(Object.fromEntries(Object.entries(arms).map(([k, a]) => [k, a.words]))));
    writeFileSync(join(dir, `${name}-rules.jsonl`), jsonl(f.rules)); writeFileSync(join(dir, `${name}-quality.jsonl`), jsonl(f.quality));
    if (opts.voice) writeFileSync(join(dir, `${name}-voice.jsonl`), jsonl(f.picks));
    return { name, sizes: `${name}-sizes.json`, rules: `${name}-rules.jsonl`, quality: [`${name}-quality.jsonl`], voice: opts.voice ? `${name}-voice.jsonl` : null, ...(opts.excluded ? { excluded: opts.excluded } : {}) };
  };
  const config = (dir: string, domains: object[], arms: string[], more: object = {}): string => {
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ reference: 'full', arms, defaultable: arms, domains, margins: { rules: 0.05, quality: 1 }, minTasks: 20, ceiling: 0.85, trials: 2, ...more }));
    return join(dir, 'config.json');
  };
  const analyse = (dir: string, domains: object[], arms: string[], more: object = {}): Selection => {
    const r = script('efficiency-select.mjs', '--config', config(dir, domains, arms, more), '--out', join(dir, 'result.json'));
    expect(r.code, r.out).toBe(0);
    return JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8')) as Selection;
  };
  const refused = (dir: string, domains: object[], arms: string[], more: object = {}): string => {
    const r = script('efficiency-select.mjs', '--config', config(dir, domains, arms, more));
    expect(r.code, r.out).toBe(2);
    return r.out;
  };
  /** Breaks a rule in `n` of the 60 outputs of 30 tasks: the first `n` outputs, first trials first. */
  const breaking = (n: number) => (t: number, trial: number): boolean => (trial === 1 ? t < Math.min(n, 30) : t < n - 30);
  const level: Omit<Arm, 'words'> = { breaks: breaking(6), score: (t) => 36 + (t % 5) };
  const tmp = (): string => mkdtempSync(join(tmpdir(), 'atelier-eff-select-'));

  it('arms level with the reference: the smallest is selected, and the sentence does not call them equivalent', () => {
    const dir = tmp();
    const arms = { full: { ...level, words: 13000 }, 'lean-3000': { ...level, words: 6000 }, 'no-pieces': { ...level, words: 4500 } };
    const r = analyse(dir, [domain(dir, 'blog', 30, arms), domain(dir, 'contracts', 30, arms)], ['no-pieces', 'lean-3000']);
    expect(r.selected).toBe('no-pieces');
    expect(r.sentence).toMatch(/^SELECTED: "no-pieces", 9,000 exported words over 2 domain\(s\) against 26,000 for "full"/);
    expect(r.sentence).toMatch(/does not show the two are equivalent/);
  });
  it('the rule count is compared in whole outputs: three more in sixty stands at any base rate, four more is rejected', () => {
    // The same measured difference used to be rejected or not by floating point (0.20 − 0.15 is not 0.05 in a double).
    for (const base of [0, 3, 6, 9, 10, 12]) {
      const dir = tmp();
      const arms = { full: { ...level, breaks: breaking(base), words: 13000 }, three: { ...level, breaks: breaking(base + 3), words: 5000 }, four: { ...level, breaks: breaking(base + 4), words: 4000 } };
      const r = analyse(dir, [domain(dir, 'blog', 30, arms)], ['four', 'three']);
      expect(r.standing.find((x) => x.arm === 'three')?.state, `base ${base}`).toBe('stands');
      expect(r.domains[0].arms.four.rejectedBy[0], `base ${base}`).toBe(`rules: breaks a required rule in ${base + 4} of 60 outputs against ${base} for the reference: 4 more, where 3 are allowed`);
      expect(r.selected).toBe('three');
    }
  });
  it('an arm worse in one domain is not saved by the other: domains are never pooled', () => {
    const dir = tmp();
    const blog = domain(dir, 'blog', 30, { full: { ...level, words: 13000 }, 'no-pieces': { ...level, words: 4500 }, 'lean-3000': { ...level, words: 6000 } });
    const contracts = domain(dir, 'contracts', 30, { full: { ...level, words: 5700 }, 'no-pieces': { ...level, breaks: breaking(12), words: 3700 }, 'lean-3000': { ...level, words: 5200 } });
    const r = analyse(dir, [blog, contracts], ['no-pieces', 'lean-3000']);
    expect(r.standing.find((x) => x.arm === 'no-pieces')).toMatchObject({ state: 'rejected', rejectedIn: ['contracts'] });
    expect(r.selected).toBe('lean-3000');
  });
  it('quality: the margin is a tolerance. A small loss on every task stands; more than the margin is rejected', () => {
    const dir = tmp();
    const r = analyse(dir, [domain(dir, 'blog', 30, { full: { ...level, words: 13000 }, low: { ...level, score: (t) => level.score(t) - 2, words: 4000 }, near: { ...level, score: (t) => level.score(t) - 0.25, words: 5000 } })], ['low', 'near']);
    expect(r.domains[0].arms.low.rejectedBy[0]).toBe('quality: scores 2 points lower than the reference, where 1 is allowed');
    expect(r.domains[0].arms.near.rejectedBy).toEqual([]);
    expect(r.selected).toBe('near');
  });
  it('an arm that may not become the default is measured and reported, never selected', () => {
    const dir = tmp();
    const arms = { full: { ...level, words: 13000 }, 'excerpts-1500': { ...level, words: 3000 }, 'lean-3000': { ...level, words: 6000 } };
    const r = analyse(dir, [domain(dir, 'blog', 30, arms)], ['excerpts-1500', 'lean-3000'], { defaultable: ['lean-3000'] });
    expect(r.selected).toBe('lean-3000');
    expect(r.smallestStanding).toBe('excerpts-1500');
    expect(r.sentence).toMatch(/The smallest arm that stood is "excerpts-1500" .* may not become the default in this version\.$/);
    // and when the only standing arm is one that may not: nothing is selected
    const dir2 = tmp();
    const none = analyse(dir2, [domain(dir2, 'blog', 30, { ...arms, 'lean-3000': { ...level, breaks: breaking(20), words: 6000 } })], ['excerpts-1500', 'lean-3000'], { defaultable: ['lean-3000'] });
    expect(none.selected).toBeNull();
    expect(none.sentence).toMatch(/^NONE SELECTED: .*"full" stays the default\. The study did not show that a smaller skill holds; at this size it could not have shown that it does not\./);
  });
  it('where the reference itself breaks a rule in nearly every output, rules are unread: no arm is selected on a reading with no room', () => {
    const dir = tmp();
    const arms = { full: { ...level, breaks: breaking(54), words: 13000 }, lean: { ...level, breaks: breaking(56), words: 4500 } };
    const r = script('efficiency-select.mjs', '--config', config(dir, [domain(dir, 'blog', 30, arms)], ['lean']));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/^unread\s+lean .* unread in: blog/m);
    expect(r.out).toMatch(/blog · rules unread: the reference breaks a required rule in 54 of 60 outputs, over the ceiling of 0\.85/);
    expect(r.out).toMatch(/^NONE SELECTED/m);
    // polarity: at the ceiling exactly (51 of 60) the reading stands
    const dir2 = tmp();
    expect(analyse(dir2, [domain(dir2, 'blog', 30, { full: { ...level, breaks: breaking(51), words: 13000 }, lean: { ...level, breaks: breaking(52), words: 4500 } })], ['lean']).selected).toBe('lean');
  });
  it('equal sizes take the arm listed first, so the sealed order decides and nothing else does', () => {
    const arms = { full: { ...level, words: 13000 }, a: { ...level, words: 5000 }, b: { ...level, words: 5000 } };
    const d1 = tmp(); const d2 = tmp();
    expect(analyse(d1, [domain(d1, 'blog', 30, arms)], ['a', 'b']).selected).toBe('a');
    expect(analyse(d2, [domain(d2, 'blog', 30, arms)], ['b', 'a']).selected).toBe('b');
  });
  it('too few tasks leaves a domain unread, and an unread arm is never selected', () => {
    const dir = tmp();
    const arms = { full: { ...level, words: 13000 }, lean: { ...level, words: 4500 } };
    const r = analyse(dir, [domain(dir, 'blog', 30, arms), domain(dir, 'contracts', 12, arms)], ['lean']);
    expect(r.standing[0]).toMatchObject({ state: 'unread', unreadIn: ['contracts'], rejectedIn: [] });
    expect(r.selected).toBeNull();
  });
  it('voice rejects only where a qualified reader read it; and where it is read, an arm with too few choices is unread', () => {
    const arms = (chosen: Arm['chosen']) => ({ full: { ...level, words: 13000 }, lean: { ...level, words: 4500, chosen } });
    const d1 = tmp();
    const unread = analyse(d1, [domain(d1, 'blog', 30, arms(() => 'reference'))], ['lean']);
    expect(unread.domains[0].arms.lean.voice.read).toBe(false);
    expect(unread.selected).toBe('lean');
    const d2 = tmp();
    const read = analyse(d2, [domain(d2, 'blog', 30, arms(() => 'reference'), { voice: true })], ['lean']);
    expect(read.domains[0].arms.lean.rejectedBy[0]).toMatch(/^voice: the reference was chosen on 30 of the 30 tasks/);
    expect(read.selected).toBeNull();
    const d3 = tmp();
    expect(analyse(d3, [domain(d3, 'blog', 30, arms((t) => (t % 2 ? 'arm' : 'reference')), { voice: true })], ['lean']).selected).toBe('lean');
    // nineteen choices, every one for the reference: too few to read, so the arm is unread, never waved through
    const d4 = tmp();
    const few = analyse(d4, [domain(d4, 'blog', 30, arms(() => 'reference'), { voice: true, edit: (f) => { f.picks = f.picks.slice(0, 19); } })], ['lean']);
    expect(few.standing[0]).toMatchObject({ state: 'unread', unreadIn: ['blog'] });
    expect(few.selected).toBeNull();
  });
  it('rows that are not what the rule expects stop the run: a wrong label, a wrong type, a duplicate, a missing task', () => {
    const arms = { full: { ...level, words: 13000 }, lean: { ...level, breaks: breaking(20), words: 4500 } };
    const bad = (edit: (f: Files) => void, voice = false, withChoice = false): string => {
      const dir = tmp();
      const a = withChoice ? { ...arms, lean: { ...arms.lean, chosen: (): string => 'reference' } } : arms;
      return refused(dir, [domain(dir, 'blog', 30, a, { edit, voice })], ['lean']);
    };
    // every arm labelled as the runner labels a skill arm
    expect(bad((f) => { f.rules = f.rules.map((r) => ({ ...r, condition: 'candidate' })); })).toMatch(/condition is "candidate", which is neither the reference nor a listed arm/);
    // an exit code written where a boolean is expected, and a judge row with no score
    expect(bad((f) => { f.rules = f.rules.map((r) => ({ ...r, broken: 1 })); })).toMatch(/has no usable value/);
    expect(bad((f) => { f.quality = f.quality.map((r) => ({ ...(r as { score: number }), score: undefined, Directness: 7 })); })).toMatch(/blog quality \(session 1\): .* has no usable value/);
    // the same rows appended twice
    expect(bad((f) => { f.rules = [...f.rules, ...f.rules.slice(0, 3)]; })).toMatch(/appears twice for "full"/);
    // the arm's failing tasks missing: the reading must not quietly lose them and select the arm
    expect(bad((f) => { f.rules = f.rules.filter((r) => { const x = r as { condition: string; broken: boolean }; return x.condition !== 'lean' || !x.broken; }); })).toMatch(/"lean" is not on the reference's tasks and trials \(20 missing, 0 extra/);
    // a voice choice labelled with the arm's name
    expect(bad((f) => { f.picks = f.picks.map((r) => ({ ...r, chose: 'full' })); }, true, true)).toMatch(/has chose "full"; it must be "arm" or "reference"/);
  });
  it('a judging session short of tasks, or on other tasks, is refused: a reading must not lose the tasks an arm lost on', () => {
    const arms = { full: { ...level, words: 13000 }, lean: { ...level, score: (t: number) => level.score(t) - (t < 10 ? 4 : 0), words: 4500 } };
    // complete, the arm is rejected on quality (1.33 points lower)
    const d0 = tmp();
    expect(analyse(d0, [domain(d0, 'blog', 30, arms)], ['lean']).domains[0].arms.lean.rejectedBy[0]).toMatch(/^quality: scores 1\.333 points lower/);
    // the ten tasks it lost on missing from the judge's file, for every arm alike
    const d1 = tmp();
    expect(refused(d1, [domain(d1, 'blog', 30, arms, { edit: (f) => { f.quality = f.quality.filter((r) => Number((r as { case_id: string }).case_id.slice(1)) >= 10); } })], ['lean'])).toMatch(/blog quality \(session 1\): it does not cover the same tasks and trials as the rules file/);
    // one output a task where two are sealed
    const d2 = tmp();
    expect(refused(d2, [domain(d2, 'blog', 30, arms, { edit: (f) => { f.quality = f.quality.filter((r) => (r as { trial: number }).trial === 1); f.rules = f.rules.filter((r) => (r as { trial: number }).trial === 1); } })], ['lean'])).toMatch(/has 1 output\(s\) for the reference where 2 are sealed/);
  });
  it('voice is one choice per task, on the tasks of the rules file: a second choice or a stray task is refused', () => {
    const arms = { full: { ...level, words: 13000 }, lean: { ...level, words: 4500, chosen: (): string => 'reference' } };
    const d1 = tmp();
    expect(refused(d1, [domain(d1, 'blog', 30, arms, { voice: true, edit: (f) => { f.picks = [...f.picks, ...f.picks.map((r) => ({ ...r, chose: 'arm' }))]; } })], ['lean'])).toMatch(/t0 has two choices for "lean"/);
    const d2 = tmp();
    expect(refused(d2, [domain(d2, 'blog', 30, arms, { voice: true, edit: (f) => { f.picks = f.picks.map((r, i) => ({ ...r, case_id: `x${i}` })); } })], ['lean'])).toMatch(/x0 \(lean\) is not a task of this domain's rules file/);
  });
  it('an arm that is not smaller than the reference is nothing to select; no domains, or two of one name, are refused', () => {
    const dir = tmp();
    const same = analyse(dir, [domain(dir, 'blog', 30, { full: { ...level, words: 5000 }, lean: { ...level, words: 5000 }, bigger: { ...level, words: 6000 } })], ['lean', 'bigger']);
    expect(same.selected).toBeNull();
    expect(same.smallestStanding).toBeNull();
    // and it is said to be not smaller, never printed as standing beside "none selected"
    expect(same.standing.map((x) => x.state)).toEqual(['not smaller', 'not smaller']);
    expect(same.sentence).toMatch(/^NONE SELECTED: no arm that may become the default stood in every domain and is smaller than the reference/);
    const d2 = tmp();
    const d = domain(d2, 'blog', 30, { full: { ...level, words: 5000 }, lean: { ...level, words: 4000 } });
    expect(refused(d2, [], ['lean'])).toMatch(/domains must list at least one domain/);
    expect(refused(d2, [d, d], ['lean'])).toMatch(/each domain needs a name of its own/);
    expect(refused(d2, [d], ['lean'], { margins: { rules: 5, quality: 1 } })).toMatch(/margins\.rules is a share of outputs/);
    expect(refused(d2, [{ ...d, rules: 'nowhere.jsonl' }], ['lean'])).toMatch(/nowhere\.jsonl: no such file/);
  });
  it('a task excluded is excluded for every arm, and named', () => {
    const dir = tmp();
    const arms = { full: { ...level, words: 13000 }, lean: { ...level, words: 4500 } };
    const d = domain(dir, 'blog', 30, arms, { excluded: ['t0', 't1'], edit: (f) => { f.rules = f.rules.filter((r) => { const x = r as { condition: string; case_id: string }; return !(x.condition === 'lean' && (x.case_id === 't0' || x.case_id === 't1')); }); } });
    const r = script('efficiency-select.mjs', '--config', config(dir, [d], ['lean']));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/blog · 2 task\(s\) excluded for every arm: t0, t1/);
    expect(r.out).toMatch(/^stands\s+lean/m);
  });
  it('a config that lists the reference as an arm, leaves out a margin, or has no whole minTasks is refused', () => {
    const dir = tmp();
    const d = domain(dir, 'blog', 30, { full: { ...level, words: 1 }, lean: { ...level, words: 1 } });
    expect(refused(dir, [d], ['full', 'lean'])).toMatch(/the reference is not one of the arms/);
    expect(refused(dir, [d], ['lean'], { margins: { rules: 0.05 } })).toMatch(/margins needs numbers/);
    expect(refused(dir, [d], ['lean'], { minTasks: null })).toMatch(/config needs "minTasks"/);
    expect(refused(dir, [d], ['lean'], { defaultable: ['other'] })).toMatch(/defaultable must be a list of arms/);
  });
});

// ── THROUGH THE SHIPPED BINARY ──────────────────────────────────────────────────────────────────
const CLI = resolve('dist/cli/atelier.mjs');
let backend: ChildProcess; let port = 0;

beforeAll(async () => {
  if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok, bad) => {
    backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
    backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
  });
  const factor = (description: string) => ({ description, appliesWhen: [{ id: 'w', describe: 'GENERAL' }], readFrom: ['post-0.md'], wouldBeAbsentIf: 'the opposite shows', needsFromUser: '', quote: '' });
  await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: {
    emit_factors: { factors: [factor('Lead with the decision, then the reasoning.')] },
    emit_matches: { matches: [{ leftIndex: 0, matchedRightIndex: 0 }] },
    emit_observation: { applicable: true, present: true, why: 'seen' },
    emit_persona: { points: [] },
    emit_piece: { piece: 'We decided first, and explained after. The reasoning follows the decision, and it is short.' },
  } }) });
});
afterAll(() => { backend.kill(); });

// A developer's own ATELIER_* settings (a reader model, a claims mode) must not decide which calls reach the scripted backend.
const cleanEnv = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ATELIER_')));
/** `last` goes after the provider flags, for a case where what ends the command line is the point. */
const run = (data: string, proj: string, ...args: string[]): string => runWith(data, proj, args, []);
const runWith = (data: string, proj: string, args: readonly string[], last: readonly string[]): string => {
  try {
    return execFileSync('node', [CLI, ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted', ...last], {
      encoding: 'utf8', cwd: proj, env: { ...cleanEnv(), ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1', ATELIER_CLAIMS: 'pattern' },
    });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`;
  }
};

describe('through the binary: a skill built without asking is unchanged, and the owner can make it smaller', () => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-eff-data-'));
  const proj = mkdtempSync(join(tmpdir(), 'atelier-eff-proj-'));
  const dir = join(proj, 'posts');
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < 9; i++) writeFileSync(join(dir, `post-${i}.md`), i % 4 === 3 ? list(i) : piece(i, 30));
  const out = (name: string): string => join(proj, name);
  const exported = (name: string, ...flags: string[]): string => { run(data, proj, 'export', '--skill', 'voice', '--out', out(name), ...flags); return readFileSync(out(name), 'utf8'); };
  const build = (...flags: string[]): string => run(data, proj, 'build', '--name', 'voice', ...flags);
  /** The words the export counts for the author's pieces: each file, its opening line included. */
  const pieceWords = (text: string): number => [...text.matchAll(/(\[voice-\d+\][\s\S]*?)(?=\n\n- - -\n\n|\n\n=== END REFERENCE MATERIAL)/g)].reduce((n, m) => n + countWords(m[1]), 0);
  const files = (text: string): number => (text.match(/\[voice-\d+\]/g) ?? []).length;
  // A rebuild writes the default description unless it is given again; these tests are about the body.
  const body = (text: string): string => text.replace(/^description: .*$/m, 'description: (not compared)');
  const calls = async (): Promise<number> => ((await (await fetch(`http://127.0.0.1:${port}/__count`)).json()) as { count: number }).count;
  const NEW = ['new', dir, 'write me a blog post in the voice and style of these', '--name', 'voice'];
  // EVERY BUILD IS MADE ONCE, HERE, IN ORDER, and each test reads what its build said and exported: no test depends on
  // another having run, and one run alone (`-t`) sees the same state as the whole file.
  const r = { earlyRefusal: '', screen: '', built: '', full: '', afterRun: '', afterRunRebuilt: '', exportSaid: '', noIndex: '', lean: { said: '', text: '', calls: 0 }, kept: { said: '', text: '' },
    excerpts: { said: '', text: '', again: '', againText: '', auto: '' }, under: { said: '', text: '' }, none: { said: '', text: '' }, back: { said: '', text: '' },
    refusals: [] as string[], afterRefusals: '', moved: '', afterMoved: '' };

  beforeAll(async () => {
    r.earlyRefusal = run(data, proj, ...NEW, '--pieces', 'halves');
    r.screen = run(data, proj, ...NEW);
    r.built = run(data, proj, ...NEW, '--accept');
    r.exportSaid = run(data, proj, 'export', '--skill', 'voice', '--out', out('full.md'));
    r.full = readFileSync(out('full.md'), 'utf8');
    r.noIndex = exported('no-index.md', '--no-index');
    const before = await calls();
    r.lean.said = build('--piece-budget', '1500'); r.lean.calls = (await calls()) - before; r.lean.text = exported('b1500.md');
    r.kept.said = build(); r.kept.text = exported('kept.md');
    r.excerpts.said = build('--piece-budget', '1500', '--pieces', 'excerpts'); r.excerpts.text = exported('excerpts.md');
    r.excerpts.again = build('--voice', 'auto', '--piece-budget', '1500', '--pieces', 'excerpts'); r.excerpts.againText = exported('excerpts-again.md');
    build('--voice', 'auto'); r.excerpts.auto = exported('excerpts-auto.md');
    r.under.said = build('--piece-budget', '100'); r.under.text = exported('under.md');
    r.none.said = build('--piece-budget', '0', '--pieces', 'whole'); r.none.text = exported('none.md');
    r.back.said = build('--piece-budget', 'default', '--pieces', 'whole'); r.back.text = exported('back.md');
    r.refusals = [build('--piece-budget', 'small'), build('--pieces', 'halves'), build('--voice', 'none', '--piece-budget', '100'), runWith(data, proj, ['build', '--name', 'voice'], ['--piece-budget']), build('--class', 'blog-post', '--piece-budget', '500'),
      run(data, proj, ...NEW, '--accept', '--piece-budget', '700')];
    r.afterRefusals = exported('still.md');
    renameSync(dir, `${dir}-away`);
    try { r.moved = build('--piece-budget', '500'); } finally { renameSync(`${dir}-away`, dir); }
    r.afterMoved = exported('unmoved.md');
    run(data, proj, 'invoke', '--skill', 'voice', '--json', 'Write a short post about a decision we made.');
    r.afterRun = exported('after-run.md');
    build(); r.afterRunRebuilt = exported('after-run-rebuilt.md');
  }, 300_000);

  it('a mistyped form is refused on the first screen of `atelier new`, before any rule is approved', () => {
    expect(r.earlyRefusal).toMatch(/--pieces takes whole or excerpts, got "halves"/);
  });
  it('a golden corpus passes its own standard: the review and the build say how the author\'s own pieces fare', () => {
    const shown = /Your own pieces: (\d+) of (\d+) meet every counted rule suggested as required\./.exec(r.screen);
    expect(shown, r.screen).not.toBeNull();
    const built = /Your own pieces: (\d+) of (\d+) meet every required rule that is counted\./.exec(r.built);
    expect(built, r.built).not.toBeNull();
    // at least nine of the author's own pieces in ten meet every rule that will fail an output
    for (const m of [shown, built]) expect(Number(m?.[1]) / Number(m?.[2])).toBeGreaterThanOrEqual(0.9);
  });
  it('a rebuild that asks for nothing changes nothing: the description is kept, and runs made since add nothing', () => {
    expect(r.back.text).toBe(r.full);
    expect(r.kept.text).toContain('description: Use when asked to: write me a blog post in the voice and style of these.');
    // an invoke ran in between (below, in `beforeAll`): a plain rebuild after it exports the same bytes
    expect(r.afterRunRebuilt).toBe(r.afterRun);
  });
  it('the build\'s card states the size, stored and exported, with the export by part', () => {
    expect(r.built).toMatch(/SIZE {2}stored [\d,]+ words in \d+ files · exported [\d,]+ words \([\d,]+ bytes\)/);
    expect(r.built).toMatch(/the export\s+your pieces [\d,]+ \(\d+ files?\)/);
    expect(run(data, proj, 'report', '--skill', 'voice', '--json')).toMatch(/"part": "your pieces"/);
  });
  it('the export says where its words are, and --no-index drops the index and nothing else', () => {
    expect(r.exportSaid).toMatch(/your pieces [\d,]+ \(\d+ files?\)/);
    expect(r.full).toMatch(/\[voice-1\] One whole piece of mine/);
    expect(r.full).toContain('## Reference material');
    expect(r.noIndex).not.toContain('## Reference material');
    expect(countWords(r.noIndex)).toBeLessThan(countWords(r.full));
    expect(pieceWords(r.noIndex)).toBe(pieceWords(r.full));
  });
  it('--piece-budget chooses again within the budget as the export counts it, keeps how the author sounds, and calls no model', () => {
    // Choosing pieces again is arithmetic on pieces already read: a persona is never derived for it, so it never spends.
    expect(r.lean.calls).toBe(0);
    expect(r.lean.said).not.toMatch(/Persona: /);
    expect(r.lean.said).toMatch(/Voice: \d+ whole piece\(s\) of the author's own served with the skill, within 1500 words/);
    expect(pieceWords(r.lean.text)).toBeGreaterThan(0);
    expect(pieceWords(r.lean.text)).toBeLessThanOrEqual(1500);
    expect(pieceWords(r.lean.text)).toBeLessThan(pieceWords(r.full));
    expect(r.lean.text).toContain('My pieces of this kind run about');
    expect(r.lean.text).toContain('Lead with the decision');
  });
  it('the budget is kept by a later rebuild that does not repeat it, like the rest of the voice', () => {
    expect(r.kept.said).not.toMatch(/EXIT:|STORE:/);
    expect(files(r.kept.text)).toBe(files(r.lean.text));
    expect(pieceWords(r.kept.text)).toBe(pieceWords(r.lean.text));
  });
  it('--pieces excerpts shows passages from more pieces for the same words, and says so in the skill', () => {
    expect(r.excerpts.said).toMatch(/Voice: passages from \d+ piece\(s\)(?: and \d+ short one\(s\) whole)? of the author's own served with the skill, within 1500 words/);
    expect(r.excerpts.text).toContain('passages from one');
    expect(files(r.excerpts.text)).toBeGreaterThan(files(r.lean.text));
    expect(r.excerpts.text).toContain(EXCERPT_GAP);
    expect(pieceWords(r.excerpts.text)).toBeLessThanOrEqual(1500);
    // The same voice chosen afresh lands on the package already stored: one hash, one body, no refusal.
    expect(r.excerpts.again).not.toMatch(/EXIT:|STORE:/);
    expect(body(r.excerpts.againText)).toBe(body(r.excerpts.text));
    // `--voice auto` chooses the pieces again and does not forget the budget and the form it was given
    expect(body(r.excerpts.auto)).toBe(body(r.excerpts.text));
  });
  it('a budget under one piece serves none and says so; 0 serves none and keeps the rest', () => {
    expect(r.under.said).toMatch(/Voice: none of the author's pieces is served: none fits within 100 words; how they sound and how long they write are kept\./);
    expect(files(r.under.text)).toBe(0);
    expect(files(r.none.text)).toBe(0);
    expect(r.none.text).toContain('My pieces of this kind run about');
  });
  it('--piece-budget default gives the default choice back: the first build, byte for byte', () => {
    // The same files as the first build, so the same package: a rebuild that lands on a package already stored is not an error.
    expect(r.back.said).not.toMatch(/EXIT:|STORE:/);
    expect(body(r.back.text)).toBe(body(r.full));
  });
  it('a value that is not one, a flag with no value, a budget beside --voice none or --class: refused before anything is written', () => {
    expect(r.refusals[0]).toMatch(/--piece-budget takes a whole number of words .* or default; got "small"/);
    expect(r.refusals[1]).toMatch(/--pieces takes whole or excerpts/);
    expect(r.refusals[2]).toMatch(/--voice none serves none of your pieces/);
    expect(r.refusals[3]).toMatch(/--piece-budget needs a value\./);
    expect(r.refusals[4]).toMatch(/--class on a built skill changes its class without rebuilding it, so --piece-budget and --pieces would be ignored/);
    // `atelier new` on a run that already built its skill has nothing left to build: the flags are refused, not dropped
    expect(r.refusals[5]).toMatch(/this run has already built its skill, so --piece-budget and --pieces would be ignored here\. Rebuild it with them: atelier build --name voice/);
    expect(body(r.afterRefusals)).toBe(body(r.full));
  });
  it('a budget with no pieces to choose from is refused, never ignored', () => {
    // The folder the skill was built from is gone: there is nothing to choose again from, and the build says so.
    expect(r.moved).toMatch(/--piece-budget and --pieces choose from the pieces this skill was built from, and fewer than three can be read here/);
    expect(body(r.afterMoved)).toBe(body(r.full));
  });
  it('from each arm\'s answers to a selection: the rows are built by a sealed script, not by hand', () => {
    // Two arms of this skill as exported above, three tasks, two answers each, written as `run.mjs` writes them: every
    // skill arm labelled "candidate", one file per arm.
    const work = join(proj, 'ablation'); mkdirSync(work, { recursive: true });
    const clean = 'We decided first, and explained after. The reasoning follows the decision, and it is short.';
    const breaks = 'Let us delve into the rich tapestry of this ever-evolving landscape. It\'s not a tool, it\'s a movement. Here\'s the thing: here\'s why. Here\'s how.';
    // What the runner records of the skill it sent: the sha256 of the export with its front matter stripped.
    const sent = (file: string): string => createHash('sha256').update(readFileSync(out(file), 'utf8').replace(/^---\n[\s\S]*?\n---\n+/, '')).digest('hex');
    const answers = (skill: string, text: (task: number, trial: number) => string, more: object = {}): string => jsonl([1, 2].flatMap((trial) => [0, 1, 2].map((t) => ({ case_id: `t${t}`, trial, condition: 'candidate', runner: 'compare',
      response: text(t, trial), cost_usd: 0.01, model: 'm', max_tokens: 4000, placement: 'system', tasks_sha256: 'tasks', skill_sha256: sent(skill), ...more }))));
    writeFileSync(join(work, 'tasks.jsonl'), jsonl([0, 1, 2].map((t) => ({ id: `t${t}`, prompt: `Write about decision ${t}.` }))));
    writeFileSync(join(work, 'full.jsonl'), answers('full.md', () => clean));
    writeFileSync(join(work, 'lean.jsonl'), answers('b1500.md', (t) => (t === 0 ? breaks : clean)));
    writeFileSync(join(work, 'rubric.json'), JSON.stringify({ name: 'r', scale: [1, 10], dimensions: [{ name: 'Directness', question: '?' }, { name: 'Rhythm', question: '?' }] }));
    const plan = (more: object = {}, domain: object = {}): string => {
      writeFileSync(join(work, 'plan.json'), JSON.stringify({ reference: 'full', arms: ['lean-1500'], defaultable: ['lean-1500'], margins: { rules: 0.05, quality: 1 }, minTasks: 2, ceiling: 0.85, trials: 2, ...more,
        domains: [{ name: 'blog', skill: 'voice', data, tasks: 'tasks.jsonl', exports: { full: out('full.md'), 'lean-1500': out('b1500.md') }, responses: { full: 'full.jsonl', 'lean-1500': 'lean.jsonl' },
          judged: ['judged-1.jsonl'], rubric: 'rubric.json', voice: null, ...domain }] }));
      return join(work, 'plan.json');
    };
    const merged = script('efficiency-rows.mjs', '--plan', plan(), '--stage', 'merge', '--out', join(work, 'out'));
    expect(merged.code, merged.out).toBe(0);
    const forJudge = readFileSync(join(work, 'out', 'blog-responses.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { case_id: string; trial: number; condition: string });
    // every answer carries its arm's own label, which is what the judge shuffles by and the rule reads
    expect(forJudge).toHaveLength(12);
    expect([...new Set(forJudge.map((r) => r.condition))].sort()).toEqual(['full', 'lean-1500']);
    // the judge's rows, as rubric-judge.mjs writes them: one number per dimension, no total
    writeFileSync(join(work, 'judged-1.jsonl'), jsonl(forJudge.map((r) => ({ case_id: r.case_id, trial: r.trial, condition: r.condition, Directness: 8, Rhythm: r.condition === 'full' ? 7 : 6.5, notes: '', pass: '1' }))));
    const rows = script('efficiency-rows.mjs', '--plan', plan(), '--stage', 'rows', '--out', join(work, 'out'));
    expect(rows.code, rows.out).toBe(0);
    const rules = readFileSync(join(work, 'out', 'blog-rules.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { condition: string; case_id: string; broken: unknown });
    // a boolean per answer, from `atelier verify`: the two answers that break a required rule, and no other
    expect(rules.every((r) => typeof r.broken === 'boolean')).toBe(true);
    expect(rules.filter((r) => r.broken).map((r) => `${r.condition} ${r.case_id}`)).toEqual(['lean-1500 t0', 'lean-1500 t0']);
    const quality = readFileSync(join(work, 'out', 'blog-quality-1.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { condition: string; score: number });
    expect(quality.find((r) => r.condition === 'full')?.score).toBe(15);
    expect(quality.find((r) => r.condition === 'lean-1500')?.score).toBe(14.5);
    const sizes = JSON.parse(readFileSync(join(work, 'out', 'blog-sizes.json'), 'utf8')) as Record<string, number>;
    expect(sizes.full).toBe(countWords(readFileSync(out('full.md'), 'utf8')));
    expect(sizes['lean-1500']).toBeLessThan(sizes.full);
    // and the rule reads what the script wrote, with no step in between: two more broken outputs in six, rejected
    const chosen = script('efficiency-select.mjs', '--config', join(work, 'out', 'ablation.json'));
    expect(chosen.code, chosen.out).toBe(0);
    expect(chosen.out).toMatch(/blog · lean-1500 · rules: breaks a required rule in 2 of 6 outputs against 0 for the reference: 2 more, where 0 are allowed/);
    expect(chosen.out).toMatch(/^NONE SELECTED/m);
    const merge = (p: string, to = 'out'): { code: number; out: string } => script('efficiency-rows.mjs', '--plan', p, '--stage', 'merge', '--out', join(work, to));
    // A JUDGE'S FILE SHORT OF ANSWERS IS REFUSED, AND A RUN THAT STOPS LEAVES NO OLDER RESULT TO READ.
    writeFileSync(join(work, 'judged-1.jsonl'), jsonl(forJudge.filter((x) => x.case_id !== 't0').map((x) => ({ case_id: x.case_id, trial: x.trial, condition: x.condition, Directness: 8, Rhythm: 7, notes: '', pass: '1' }))));
    const short = script('efficiency-rows.mjs', '--plan', plan(), '--stage', 'rows', '--out', join(work, 'out'));
    expect(short.code).toBe(2);
    expect(short.out).toMatch(/blog judged-1\.jsonl: 4 of 12 answers have no score \(first: t0 1 full\)/);
    expect(existsSync(join(work, 'out', 'ablation.json'))).toBe(false);
    expect(script('efficiency-select.mjs', '--config', join(work, 'out', 'ablation.json'))).toMatchObject({ code: 2 });
    // an answer missing for one arm stops the run, with what to do
    writeFileSync(join(work, 'lean.jsonl'), answers('b1500.md', () => clean).split('\n').slice(1).join('\n'));
    expect(merge(plan()).out).toMatch(/t0 trial 1 is missing for "lean-1500"\. Run it, or exclude the task for every arm/);
    // ANSWERS BELONG TO THE SKILL THAT WROTE THEM: two files swapped in the plan, or written with another setting, are refused
    writeFileSync(join(work, 'lean.jsonl'), answers('b1500.md', () => clean));
    expect(merge(plan({}, { responses: { full: 'lean.jsonl', 'lean-1500': 'full.jsonl' } })).out).toMatch(/t0 trial 1 was written with another skill than the export filed under "full"/);
    writeFileSync(join(work, 'lean.jsonl'), answers('b1500.md', () => clean, { max_tokens: 8000 }));
    expect(merge(plan()).out).toMatch(/has max_tokens 8000 where another answer of this domain has 4000/);
    writeFileSync(join(work, 'lean.jsonl'), answers('b1500.md', () => clean));
    // the output directory is the scripts' own: not the plan's, not a parent of it, and holding no file the plan names
    expect(script('efficiency-rows.mjs', '--plan', plan(), '--stage', 'merge', '--out', work).out).toMatch(/--out must be a directory of its own/);
    expect(script('efficiency-rows.mjs', '--plan', plan(), '--stage', 'merge', '--out', proj).out).toMatch(/--out must be a directory of its own/);
    mkdirSync(join(work, 'kept'), { recursive: true });
    writeFileSync(join(work, 'kept', 'blog-quality-1.jsonl'), 'paid for\n');
    expect(script('efficiency-rows.mjs', '--plan', plan({}, { judged: ['kept/blog-quality-1.jsonl'] }), '--stage', 'rows', '--out', join(work, 'kept')).out).toMatch(/kept\/blog-quality-1\.jsonl is inside --out, which this script clears and rewrites/);
    expect(readFileSync(join(work, 'kept', 'blog-quality-1.jsonl'), 'utf8')).toBe('paid for\n');
    // answers merged again leave no rows of the answers they replace
    writeFileSync(join(work, 'out', 'ablation.json'), '{}'); writeFileSync(join(work, 'out', 'blog-rules.jsonl'), '');
    expect(merge(plan()).code).toBe(0);
    expect(existsSync(join(work, 'out', 'ablation.json')) || existsSync(join(work, 'out', 'blog-rules.jsonl'))).toBe(false);
    // two arms that serve one text must be declared, and are then read once, on one set of answers
    const twin = { exports: { full: out('full.md'), 'lean-1500': out('full.md') } };
    expect(merge(plan({}, twin)).out).toMatch(/the exports of "full" and "lean-1500" serve the same text\. Declare it/);
    expect(merge(plan({}, { ...twin, sameAs: { 'lean-1500': 'full', full: 'lean-1500' } })).out).toMatch(/"sameAs" goes round in a circle/);
    const one = plan({}, { ...twin, sameAs: { 'lean-1500': 'full' }, responses: { full: 'full.jsonl' } });
    const declared = merge(one, 'out2');
    expect(declared.code, declared.out).toBe(0);
    // judged once: only the skill actually served goes to the judge, and its verdicts and scores are copied to the other label
    const once = readFileSync(join(work, 'out2', 'blog-responses.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { case_id: string; trial: number; condition: string });
    expect([...new Set(once.map((x) => x.condition))]).toEqual(['full']);
    writeFileSync(join(work, 'judged-1.jsonl'), jsonl(once.map((x) => ({ case_id: x.case_id, trial: x.trial, condition: x.condition, Directness: 8, Rhythm: 7, notes: '', pass: '1' }))));
    expect(script('efficiency-rows.mjs', '--plan', one, '--stage', 'rows', '--out', join(work, 'out2')).code).toBe(0);
    const copied = readFileSync(join(work, 'out2', 'blog-quality-1.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { condition: string; score: number });
    expect(copied.filter((x) => x.condition === 'lean-1500').map((x) => x.score)).toEqual(copied.filter((x) => x.condition === 'full').map((x) => x.score));
    // and a skill that is the reference under another name is not smaller, so it is nothing to select
    expect(script('efficiency-select.mjs', '--config', join(work, 'out2', 'ablation.json')).out).toMatch(/^NONE SELECTED/m);
  }, 300_000);
  it('a run records where its cost went and what it sent: every call the backend served is on a line, the request\'s reading included', async () => {
    // With a context judge on, the request is read before any draft is written. The ledger starts where the run's
    // budget does, so that first call is counted too: the lines' calls are the calls the backend served.
    const before = await calls();
    const ran = JSON.parse(run(data, proj, 'invoke', '--skill', 'voice', '--json', '--claims', 'model', '--claims-model', 'scripted', 'Write a short post about a decision we made.')) as { invocationId: string; costUsd: number; eval: EvalSummary };
    const served = (await calls()) - before;
    const lines = ran.eval.spend ?? [];
    expect(served).toBeGreaterThan(2);
    expect(lines.reduce((n, l) => n + l.calls, 0)).toBe(served);
    const writing = lines.find((l) => l.purpose === 'writing');
    expect(writing?.calls).toBeGreaterThanOrEqual(1);
    expect(writing?.inputTokens).toBeGreaterThan(0);
    expect(lines.map((l) => `${l.purpose}:${l.calls}`).join(' '), 'the reading of the request, made before the first draft').toMatch(/context judge:\d/);
    expect(lines.some((l) => l.purpose === 'other'), 'a call on the run path that names no purpose').toBe(false);
    expect(ran.eval.sent?.skill).toBeGreaterThan(1000);
    expect(ran.eval.sent?.request).toBeGreaterThan(5);
    const report = run(data, proj, 'report', ran.invocationId, '--skill', 'voice');
    expect(report).toMatch(/cost and size\n(?: {4}.*\n)*? {4}writing: \$\d+\.\d{4} · \d+ calls?/);
    expect(report).toMatch(/sent to the writer: [\d,]+ words of skill · [\d,]+ added for this request \(your nearest passages, notes\) · [\d,]+ of request/);
    expect(report).not.toMatch(/not attributed|counted in the lines and not in the total/);
  }, 120_000);
});

describe('through the binary: a rebuild never undoes an amendment', () => {
  // Its own store and project: an amendment changes the skill's standard, which no other test here should see.
  const data = mkdtempSync(join(tmpdir(), 'atelier-amend-data-'));
  const proj = mkdtempSync(join(tmpdir(), 'atelier-amend-proj-'));
  const dir = join(proj, 'posts');
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < 9; i++) writeFileSync(join(dir, `post-${i}.md`), i % 4 === 3 ? list(i) : piece(i, 30));
  const build = (...flags: string[]): string => run(data, proj, 'build', ...flags);
  beforeAll(() => {
    run(data, proj, 'new', dir, 'write me a blog post in the voice and style of these', '--name', 'voice');
    run(data, proj, 'new', dir, 'write me a blog post in the voice and style of these', '--name', 'voice', '--accept');
  }, 300_000);

  it('the standard as the owner amended it is the one compiled, under the skill\'s name and under another', () => {
    const card = (name = 'voice'): { standardVersion: string; rules: { required: number } } => JSON.parse(run(data, proj, 'report', '--skill', name, '--json')) as { standardVersion: string; rules: { required: number } };
    const before = card();
    const amended = run(data, proj, 'amend', '--skill', 'voice', '--rule', 'm1', '--materiality', 'PREFERRED', '--reason', 'a preference, not a requirement');
    const minted = /StandardVersion ([0-9a-f]+) supersedes ([0-9a-f]+)/.exec(amended);
    expect(minted, amended).not.toBeNull();
    expect(minted?.[2]).toBe(before.standardVersion);
    expect(card().rules.required).toBe(before.rules.required - 1);
    // the command an export recommends for a smaller skill, on a run that closed the standard before the amendment
    const rebuilt = build('--name', 'voice', '--piece-budget', '1500');
    expect(rebuilt).toContain(`Compiling the standard as you amended it (${minted?.[1]}), which supersedes the one this run closed (${minted?.[2]}).`);
    expect(card().standardVersion).toBe(minted?.[1]);
    expect(card().rules.required).toBe(before.rules.required - 1);
    // and a plain rebuild keeps it too
    expect(build('--name', 'voice')).not.toMatch(/EXIT:/);
    expect(card().standardVersion).toBe(minted?.[1]);
    // the same run built under a second name is the same owner's standard, amendments included
    expect(build('--name', 'other')).toContain(`Compiling the standard as you amended it (${minted?.[1]})`);
    expect(card('other').standardVersion).toBe(minted?.[1]);
  }, 180_000);
});

describe('through the binary: a project that moved keeps its skill', () => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-moved-data-'));
  const root = mkdtempSync(join(tmpdir(), 'atelier-moved-'));
  const proj = join(root, 'first');
  const dir = join(proj, 'posts');
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < 9; i++) writeFileSync(join(dir, `post-${i}.md`), i % 4 === 3 ? list(i) : piece(i, 30));
  const exported = (p: string, name: string): string => { run(data, p, 'export', '--skill', 'voice', '--out', join(p, name)); return readFileSync(join(p, name), 'utf8'); };
  let before = '';
  beforeAll(() => {
    run(data, proj, 'new', dir, 'write me a blog post in the voice and style of these', '--name', 'voice');
    run(data, proj, 'new', dir, 'write me a blog post in the voice and style of these', '--name', 'voice', '--accept');
    before = exported(proj, 'before.md');
  }, 300_000);

  it('renamed with its pieces inside, a plain build finds the run that built the skill and gives the same skill', () => {
    const moved = join(root, 'renamed');
    renameSync(proj, moved);
    const said = run(data, moved, 'build', '--name', 'voice');
    expect(said).not.toMatch(/there is no standard to build from yet/);
    expect(said).toMatch(/this project has no run of its own; took over the run that built "voice", which was at .*first/);
    expect(exported(moved, 'after.md')).toBe(before);
    // the folder of pieces came with the project, so the pieces can be chosen again from the new place
    expect(run(data, moved, 'build', '--name', 'voice', '--piece-budget', '1500')).toMatch(/within 1500 words/);
    // polarity: a project that never built this skill, and a skill no run built, still get the plain answer
    const stranger = join(root, 'stranger'); mkdirSync(stranger);
    expect(run(data, stranger, 'build', '--name', 'nothing-built')).toMatch(/there is no standard to build from yet/);
  }, 180_000);
});

