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
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { skillSizeOf, countWords, describeParts, describeSize } from '../core/eval/size.js';
import { spend, spendBetween, processSpendByPurpose, processSpentUsd, metered, type Budget, type SpendLine } from '../core/inference/client.js';
import { selectVoicePieces, selectVoiceExcerpts, excerptOf, EXCERPT_GAP, EXCERPT_WORDS, PIECE_BUDGET_WORDS } from '../core/compiler/voice.js';
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
  it('a smaller budget serves fewer words, never more than it allows, and still whole pieces of the corpus', () => {
    const lean = selectVoicePieces(corpus, 1900);
    expect(lean.length).toBeGreaterThan(0);
    expect(lean.length).toBeLessThan(selectVoicePieces(corpus).length);
    expect(lean.reduce((n, t) => n + countWords(t), 0)).toBeLessThanOrEqual(1900);
    for (const t of lean) expect(corpus).toContain(t);
  });
  it('a budget of 0 serves none, for whole pieces and for excerpts alike', () => {
    expect(selectVoicePieces(corpus, 0)).toEqual([]);
    expect(selectVoiceExcerpts(corpus, 0)).toEqual([]);
  });
});

describe('excerpts: an opening and a middle passage, from more pieces', () => {
  const long = piece(7, 40);

  it('whole blocks in the author\'s order and words: the opening from the first line, the middle from the midpoint, the cut marked', () => {
    const ex = excerptOf(long);
    const passages = ex.split(`\n\n${EXCERPT_GAP}`).map((x) => x.trim()).filter(Boolean);
    expect(passages).toHaveLength(2);
    expect(ex.startsWith('Piece 7 paragraph 0 opens here.')).toBe(true);
    for (const passage of passages) {
      expect(long).toContain(passage);
      expect(countWords(passage)).toBeGreaterThanOrEqual(EXCERPT_WORDS);
      expect(countWords(passage)).toBeLessThan(EXCERPT_WORDS * 2);
    }
    expect(passages[1].startsWith('Piece 7 paragraph 20 opens here.') || passages[1].startsWith('Piece 7 paragraph 19 opens here.')).toBe(true);
    expect(ex.endsWith(EXCERPT_GAP)).toBe(true);
  });
  it('a piece too short to leave anything out is shown whole, with no mark', () => {
    const short = piece(8, 6);
    expect(excerptOf(short)).toBe(short);
    expect(excerptOf(short)).not.toContain(EXCERPT_GAP);
  });
  it('a fenced code block is never cut through, even where a passage would otherwise end inside it', () => {
    // The block straddles the 250-word mark of the opening and holds a blank line: split there, half of it would be shown.
    const fence = `\`\`\`ts\n${Array.from({ length: 30 }, (_, k) => `const value${k} = compute(${k});`).join('\n')}\n\n${Array.from({ length: 30 }, (_, k) => `const other${k} = compute(${k});`).join('\n')}\n\`\`\``;
    const withCode = `${piece(9, 5)}\n\n${fence}\n\n${piece(9, 40)}`;
    const ex = excerptOf(withCode);
    expect(ex).toContain('const value0 = compute(0);');
    expect(ex).toContain(fence);
  });
  it('a piece written as one long paragraph, or with single line breaks, still has an excerpt shorter than itself', () => {
    const oneParagraph = piece(10, 40).replace(/\n\n/g, ' ');
    const singleBreaks = piece(11, 40).replace(/\n\n/g, '\n');
    for (const text of [oneParagraph, singleBreaks]) {
      const ex = excerptOf(text);
      expect(countWords(ex)).toBeLessThan(countWords(text) / 2);
      expect(ex).toContain(EXCERPT_GAP);
      // every passage is the author's text exactly as it stood, line breaks and all
      for (const passage of ex.split(EXCERPT_GAP).map((x) => x.trim()).filter(Boolean)) expect(text).toContain(passage);
    }
  });
  it('the budget is a ceiling for the first piece chosen as for the last: under one excerpt, none is served', () => {
    const corpus = [piece(1, 40), piece(2, 40), piece(3, 40), piece(4, 40)];
    expect(selectVoiceExcerpts(corpus, 100)).toEqual([]);
    const one = selectVoiceExcerpts(corpus, 700);
    expect(one).toHaveLength(1);
    expect(countWords(one[0])).toBeLessThanOrEqual(700);
    for (const budget of [1200, 2000, 3000]) expect(selectVoiceExcerpts(corpus, budget).reduce((n, t) => n + countWords(t), 0)).toBeLessThanOrEqual(budget);
  });
  it('for the same words, excerpts reach more pieces than whole ones do', () => {
    const corpus = [piece(1, 40), piece(2, 40), piece(3, 40), piece(4, 40), list(1), piece(5, 40)];
    const budget = 4000;
    const whole = selectVoicePieces(corpus, budget);
    const excerpts = selectVoiceExcerpts(corpus, budget);
    expect(excerpts.length).toBeGreaterThan(whole.length);
    expect(excerpts.reduce((n, t) => n + countWords(t), 0)).toBeLessThanOrEqual(budget);
    expect(selectVoiceExcerpts(corpus.slice(0, 2), budget)).toEqual([]);
  });
  it('the compiled skill says what the files are: passages, with the cut marked, never "a whole piece"', () => {
    const pkg = packageWith([excerptOf(long), excerptOf(piece(6, 40))], 'excerpts');
    expect(pkg.files['SKILL.md']).toContain('each hold passages from one piece of mine');
    expect(pkg.files['SKILL.md']).not.toContain('whole piece');
    expect(pkg.files['examples/voice-1.md']).toMatch(/^\[voice-1\] Passages from one piece of mine/);
    // polarity: without the form, the same files are described as whole pieces, as every skill built before is
    expect(packageWith([long, piece(6, 40)]).files['SKILL.md']).toContain('are whole pieces of mine');
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
  interface Standing { arm: string; state: 'stands' | 'rejected' | 'unread'; rejectedIn: string[]; unreadIn: string[] }
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
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ reference: 'full', arms, defaultable: arms, domains, margins: { rules: 0.05, quality: 1 }, minTasks: 20, ceiling: 0.85, ...more }));
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
    expect(r.out).toMatch(/^unread {4}lean .* unread in: blog/m);
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
  it('a task excluded is excluded for every arm, and named', () => {
    const dir = tmp();
    const arms = { full: { ...level, words: 13000 }, lean: { ...level, words: 4500 } };
    const d = domain(dir, 'blog', 30, arms, { excluded: ['t0', 't1'], edit: (f) => { f.rules = f.rules.filter((r) => { const x = r as { condition: string; case_id: string }; return !(x.condition === 'lean' && (x.case_id === 't0' || x.case_id === 't1')); }); } });
    const r = script('efficiency-select.mjs', '--config', config(dir, [d], ['lean']));
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/blog · 2 task\(s\) excluded for every arm: t0, t1/);
    expect(r.out).toMatch(/^stands {4}lean/m);
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

const run = (data: string, proj: string, ...args: string[]): string => {
  try {
    return execFileSync('node', [CLI, ...args, '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'], {
      encoding: 'utf8', cwd: proj, env: { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PRICE_IN: '1', ATELIER_PRICE_OUT: '1' },
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
  const pieceWords = (text: string): number => [...text.matchAll(/\[voice-\d+\][^\n]*\n\n([\s\S]*?)(?=\n\n- - -\n\n|\n\n=== END REFERENCE MATERIAL)/g)].reduce((n, m) => n + countWords(m[1]), 0);
  // A rebuild writes the default description unless it is given again; these tests are about the body.
  const body = (text: string): string => text.replace(/^description: .*$/m, 'description: (not compared)');
  const calls = async (): Promise<number> => ((await (await fetch(`http://127.0.0.1:${port}/__count`)).json()) as { count: number }).count;
  let built = ''; let full = ''; let wholeAt1500 = 0;

  // Three runs of the binary; the default hook budget is blown under full-suite load.
  beforeAll(() => {
    run(data, proj, 'new', dir, 'write me a blog post in the voice and style of these', '--name', 'voice');
    built = run(data, proj, 'new', dir, 'write me a blog post in the voice and style of these', '--name', 'voice', '--accept');
    full = exported('full.md');
  }, 120_000);

  it('the build\'s card states the size, stored and exported, with the export by part', () => {
    expect(built).toMatch(/SIZE {2}stored [\d,]+ words in \d+ files · exported [\d,]+ words \([\d,]+ bytes\)/);
    expect(built).toMatch(/the export\s+your pieces [\d,]+ \(\d+ files?\)/);
    expect(run(data, proj, 'report', '--skill', 'voice', '--json')).toMatch(/"part": "your pieces"/);
  });
  it('the export says where its words are, and --no-index drops only the index', () => {
    const said = run(data, proj, 'export', '--skill', 'voice', '--out', out('again.md'));
    expect(said).toMatch(/your pieces [\d,]+ \(\d+ files?\)/);
    expect(readFileSync(out('again.md'), 'utf8')).toBe(full);
    expect(full).toMatch(/\[voice-1\] One whole piece of mine/);
    const lean = exported('lean.md', '--no-index');
    if (full.includes('## Reference material')) {
      expect(lean).not.toContain('## Reference material');
      expect(countWords(lean)).toBeLessThan(countWords(full));
    } else expect(lean).toBe(full);
    expect(pieceWords(lean)).toBe(pieceWords(full));
  });
  it('--piece-budget chooses again within the budget, keeps how the author sounds and how long they write, and calls no model', async () => {
    const before = await calls();
    const said = run(data, proj, 'build', '--name', 'voice', '--piece-budget', '1500');
    // Choosing pieces again is arithmetic on pieces already read: a persona is never derived for it, so it never spends.
    expect(await calls()).toBe(before);
    expect(said).not.toMatch(/Persona: /);
    expect(said).toMatch(/Voice: \d+ whole piece\(s\) of the author's own served with the skill, within 1500 words/);
    const lean = exported('b1500.md');
    expect(pieceWords(lean)).toBeGreaterThan(0);
    expect(pieceWords(lean)).toBeLessThanOrEqual(1500);
    expect(pieceWords(lean)).toBeLessThan(pieceWords(full));
    expect(lean).toContain('My pieces of this kind run about');
    expect(lean).toContain('Lead with the decision');
    wholeAt1500 = (lean.match(/\[voice-\d+\]/g) ?? []).length;
    expect(wholeAt1500).toBeGreaterThan(0);
  });
  it('the budget is kept by a later rebuild that does not repeat it, like the rest of the voice', () => {
    expect(run(data, proj, 'build', '--name', 'voice')).not.toMatch(/EXIT:|STORE:/);
    const kept = exported('kept.md');
    expect(pieceWords(kept)).toBeLessThanOrEqual(1500);
    expect((kept.match(/\[voice-\d+\]/g) ?? []).length).toBe(wholeAt1500);
  });
  it('--pieces excerpts shows passages from more pieces for the same words, and says so in the skill', () => {
    const said = run(data, proj, 'build', '--name', 'voice', '--piece-budget', '1500', '--pieces', 'excerpts');
    expect(said).toMatch(/Voice: passages from \d+ piece\(s\) of the author's own served with the skill, within 1500 words/);
    const ex = exported('excerpts.md');
    expect(ex).toContain('passages from one piece of mine');
    expect((ex.match(/\[voice-\d+\] Passages from one piece of mine/g) ?? []).length).toBeGreaterThan(wholeAt1500);
    expect(ex).toContain(EXCERPT_GAP);
    expect(pieceWords(ex)).toBeLessThanOrEqual(1500);
    // The same voice chosen afresh lands on the package already stored: one hash, one body, no refusal.
    expect(run(data, proj, 'build', '--name', 'voice', '--voice', 'auto', '--piece-budget', '1500', '--pieces', 'excerpts')).not.toMatch(/EXIT:|STORE:/);
    expect(body(exported('excerpts-again.md'))).toBe(body(ex));
    // and a budget under one excerpt serves none, and says so
    expect(run(data, proj, 'build', '--name', 'voice', '--piece-budget', '100')).toMatch(/Voice: none of the author's pieces is served within 100 words/);
    expect(exported('under.md')).not.toMatch(/\[voice-\d+\]/);
  });
  it('--piece-budget 0 serves none of the pieces and keeps the rest; --pieces whole and the default budget give the first build back', () => {
    expect(run(data, proj, 'build', '--name', 'voice', '--piece-budget', '0')).toMatch(/Voice: none of the author's pieces is served within 0 words; how they sound and how long they write are kept\./);
    const none = exported('none.md');
    expect(none).not.toMatch(/\[voice-\d+\]/);
    expect(none).toContain('My pieces of this kind run about');
    // The same files as the first build, so the same package: a rebuild that lands on a package already stored is not an error.
    expect(run(data, proj, 'build', '--name', 'voice', '--piece-budget', '9000', '--pieces', 'whole')).not.toMatch(/EXIT:|STORE:/);
    expect(body(exported('back.md'))).toBe(body(full));
  });
  it('a budget that is not a number, a form that does not exist, and a budget with --voice none are refused before anything is written', () => {
    expect(run(data, proj, 'build', '--name', 'voice', '--piece-budget', 'small')).toMatch(/--piece-budget takes a whole number of words/);
    expect(run(data, proj, 'build', '--name', 'voice', '--pieces', 'halves')).toMatch(/--pieces takes whole or excerpts/);
    expect(run(data, proj, 'build', '--name', 'voice', '--voice', 'none', '--piece-budget', '100')).toMatch(/--voice none serves none of your pieces/);
    expect(body(exported('still.md'))).toBe(body(full));
  });
  it('a budget with no pieces to choose from is refused, never ignored', () => {
    // The folder the skill was built from is gone: there is nothing to choose again from, and the build says so.
    renameSync(dir, `${dir}-away`);
    try { expect(run(data, proj, 'build', '--name', 'voice', '--piece-budget', '500')).toMatch(/--piece-budget and --pieces choose from the pieces this skill was built from, and fewer than three can be read here/); }
    finally { renameSync(`${dir}-away`, dir); }
    expect(body(exported('unmoved.md'))).toBe(body(full));
  });
  it('from each arm\'s answers to a selection: the rows are built by a sealed script, not by hand', () => {
    // Two arms of this skill as exported above, three tasks, two answers each, written as `run.mjs` writes them: every
    // skill arm labelled "candidate", one file per arm.
    const work = join(proj, 'ablation'); mkdirSync(work, { recursive: true });
    const clean = 'We decided first, and explained after. The reasoning follows the decision, and it is short.';
    const breaks = 'Let us delve into the rich tapestry of this ever-evolving landscape. It\'s not a tool, it\'s a movement. Here\'s the thing: here\'s why. Here\'s how.';
    const answers = (text: (task: number, trial: number) => string): string => jsonl([1, 2].flatMap((trial) => [0, 1, 2].map((t) => ({ case_id: `t${t}`, trial, condition: 'candidate', runner: 'compare', response: text(t, trial), cost_usd: 0.01 }))));
    writeFileSync(join(work, 'tasks.jsonl'), jsonl([0, 1, 2].map((t) => ({ id: `t${t}`, prompt: `Write about decision ${t}.` }))));
    writeFileSync(join(work, 'full.jsonl'), answers(() => clean));
    writeFileSync(join(work, 'lean.jsonl'), answers((t) => (t === 0 ? breaks : clean)));
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
    // an answer missing for one arm stops the run, with what to do
    writeFileSync(join(work, 'lean.jsonl'), answers(() => clean).split('\n').slice(1).join('\n'));
    expect(script('efficiency-rows.mjs', '--plan', plan(), '--stage', 'merge', '--out', join(work, 'out')).out).toMatch(/t0 trial 1 is missing for "lean-1500"\. Run it, or exclude the task for every arm/);
    writeFileSync(join(work, 'lean.jsonl'), answers(() => clean));
    // two arms with one export must be declared, and are then read once, on one set of answers
    const twin = { exports: { full: out('full.md'), 'lean-1500': out('full.md') } };
    expect(script('efficiency-rows.mjs', '--plan', plan({}, twin), '--stage', 'merge', '--out', join(work, 'out')).out).toMatch(/the exports of "full" and "lean-1500" are byte-identical\. Declare it/);
    const declared = script('efficiency-rows.mjs', '--plan', plan({}, { ...twin, sameAs: { 'lean-1500': 'full' }, responses: { full: 'full.jsonl' } }), '--stage', 'merge', '--out', join(work, 'out2'));
    expect(declared.code, declared.out).toBe(0);
    const once = readFileSync(join(work, 'out2', 'blog-responses.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { condition: string; response: string });
    expect(once.filter((r) => r.condition === 'lean-1500').map((r) => r.response)).toEqual(once.filter((r) => r.condition === 'full').map((r) => r.response));
  });
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
  });
});
